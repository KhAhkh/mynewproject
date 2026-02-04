import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useParams } from "react-router-dom";
import SectionCard from "../../components/SectionCard.jsx";
import FormField from "../../components/FormField.jsx";
import SearchSelect from "../../components/SearchSelect.jsx";
import { api } from "../../api/client.js";
import { toDisplay } from "../../utils/date.js";

const formatCurrency = (value) =>
  `Rs ${Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const incrementEntryCode = (value) => {
  if (!value) return value;
  const match = String(value).match(/^([A-Za-z]*)(\d+)$/);
  if (!match) return value;
  const [, prefix = "", numeric = "0"] = match;
  const nextNumeric = (parseInt(numeric, 10) + 1).toString().padStart(numeric.length, "0");
  return `${prefix}${nextNumeric}`;
};

const createInitialForm = () => ({
  bankCode: "",
  bankName: "",
  slipNo: "",
  slipDate: new Date().toISOString().slice(0, 10),
  amount: ""
});

const BankTransactionPage = () => {
  const { mode } = useParams();
  const normalizedMode = mode === "deposit" || mode === "drawing" ? mode : null;
  const transactionType = normalizedMode ?? "deposit";
  const shouldRedirect = normalizedMode === null;
  const isDrawing = transactionType === "drawing";
  const transactionLabel = isDrawing ? "Drawing" : "Deposit";
  const queryClient = useQueryClient();
  const [bankQuery, setBankQuery] = useState("");
  const [depositForm, setDepositForm] = useState(createInitialForm);
  const [status, setStatus] = useState(null);
  const [bankTotals, setBankTotals] = useState(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState(null);
  const [metricsVersion, setMetricsVersion] = useState(0);
  const [entryMeta, setEntryMeta] = useState({ nextEntry: "BT000001" });

  const bankLookup = useQuery({
    queryKey: ["banks", { search: bankQuery }],
    queryFn: async () => {
      const response = await api.get("/banks", { params: { search: bankQuery } });
      return response.data;
    }
  });

  useEffect(() => {
    api
      .get("/metadata/next/bank-transaction")
      .then((response) => {
        if (response?.data?.nextEntry) {
          setEntryMeta({ nextEntry: response.data.nextEntry });
        }
      })
      .catch(() => null);
  }, []);

  useEffect(() => {
    if (!depositForm.bankCode) {
      setBankTotals(null);
      setMetricsError(null);
      setMetricsLoading(false);
      return;
    }

    let active = true;
    setMetricsLoading(true);
    setMetricsError(null);

    api
      .get(`/banks/${encodeURIComponent(depositForm.bankCode)}/metrics`)
      .then((response) => {
        if (!active) return;
        const totals = response.data?.totals;
        if (totals) {
          setBankTotals({
            opening: Number(totals.opening ?? 0),
            deposits: Number(totals.deposits ?? 0),
            drawings: Number(totals.drawings ?? 0),
            cashInBank: Number(totals.cashInBank ?? 0)
          });
        } else {
          setBankTotals(null);
        }
      })
      .catch((error) => {
        if (!active) return;
        setBankTotals(null);
        setMetricsError(error.message);
      })
      .finally(() => {
        if (!active) return;
        setMetricsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [depositForm.bankCode, metricsVersion]);

  const mutation = useMutation({
    mutationFn: async (payload) => {
      const response = await api.post("/bank-transactions", payload);
      return response.data;
    },
    onMutate: () => setStatus(null),
    onSuccess: (data, variables) => {
      const entryNo = data?.transaction?.entry_no || data?.transaction?.entryNo || null;
      setStatus({ type: "success", message: entryNo ? `Transaction ${entryNo} saved.` : "Bank transaction saved." });
      setDepositForm((prev) => {
        const next = createInitialForm();
        if (variables?.bankCode) {
          next.bankCode = variables.bankCode;
          next.bankName = variables?.bankName || prev.bankName || "";
        }
        return next;
      });
      setBankQuery("");
      setMetricsError(null);
      if (data?.totals) {
        setBankTotals({
          opening: Number(data.totals.opening ?? 0),
          deposits: Number(data.totals.deposits ?? 0),
          drawings: Number(data.totals.drawings ?? 0),
          cashInBank: Number(data.totals.cashInBank ?? 0)
        });
      } else if (variables?.bankCode) {
        setMetricsVersion((value) => value + 1);
      } else {
        setBankTotals(null);
      }
      queryClient.invalidateQueries({ queryKey: ["bank-deposit-report"] });
      queryClient.invalidateQueries({ queryKey: ["transaction-history"] });
      api
        .get("/metadata/next/bank-transaction")
        .then((response) => {
          if (response?.data?.nextEntry) {
            setEntryMeta({ nextEntry: response.data.nextEntry });
          }
        })
        .catch(() => {
          if (entryNo) {
            setEntryMeta({ nextEntry: incrementEntryCode(entryNo) || entryNo });
          }
        });
    },
    onError: (error) => {
      setStatus({ type: "error", message: error.message });
    }
  });

  const amountNumber = Number(depositForm.amount) || 0;
  const projectedCashInBank = bankTotals
    ? bankTotals.cashInBank + (isDrawing ? -amountNumber : amountNumber)
    : null;

  const canSaveTransaction =
    depositForm.bankCode &&
    depositForm.slipDate &&
    amountNumber > 0 &&
    !mutation.isPending;

  const cashBalanceDisplay = useMemo(() => {
    if (!depositForm.bankCode) return "Select a bank";
    if (metricsLoading) return "Calculating…";
    if (metricsError) return "Balance unavailable";
    if (!bankTotals) return "Rs 0.00";
    const current = formatCurrency(bankTotals.cashInBank);
    if (!amountNumber) return current;
    const projectedBase = projectedCashInBank ?? bankTotals.cashInBank;
    const projected = formatCurrency(Math.max(projectedBase, 0));
    return `${current} → ${projected} (${transactionLabel})`;
  }, [
    depositForm.bankCode,
    metricsLoading,
    metricsError,
    bankTotals,
    amountNumber,
    projectedCashInBank,
    transactionLabel
  ]);

  const bankSummary = useMemo(() => {
    if (!depositForm.bankCode) return null;
    if (metricsLoading) {
      return <p className="text-xs text-slate-500">Calculating bank balance…</p>;
    }
    if (metricsError) {
      return <p className="text-xs text-rose-500">Unable to load bank balance.</p>;
    }
    if (!bankTotals) {
      return <p className="text-xs text-slate-500">No bank totals recorded yet.</p>;
    }
    const projectedBaseline = projectedCashInBank ?? bankTotals.cashInBank;
    const projectedValue = Math.max(projectedBaseline, 0);
    const outcomeLabel = `After ${transactionLabel}`;
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
        <div className="flex flex-wrap gap-4">
          <span>
            Opening:
            <strong className="ml-1 text-slate-800">{formatCurrency(bankTotals.opening)}</strong>
          </span>
          <span>
            Deposits:
            <strong className="ml-1 text-slate-800">{formatCurrency(bankTotals.deposits)}</strong>
          </span>
          <span>
            Drawings:
            <strong className="ml-1 text-slate-800">{formatCurrency(bankTotals.drawings)}</strong>
          </span>
          <span>
            Current Cash:
            <strong className="ml-1 text-slate-800">{formatCurrency(bankTotals.cashInBank)}</strong>
          </span>
          {amountNumber > 0 ? (
            <span>
              {outcomeLabel}:
              <strong className="ml-1 text-slate-800">{formatCurrency(projectedValue)}</strong>
            </span>
          ) : null}
        </div>
      </div>
    );
  }, [
    depositForm.bankCode,
    metricsLoading,
    metricsError,
    bankTotals,
    projectedCashInBank,
    amountNumber,
    transactionLabel
  ]);

  const handleSave = () => {
    if (!canSaveTransaction) return;
    mutation.mutate({
      type: transactionType,
      transactionType,
      bankCode: depositForm.bankCode,
      bankName: depositForm.bankName,
      slipNo: depositForm.slipNo || null,
      slipDate: depositForm.slipDate,
      amount: amountNumber
    });
  };

  const handleReset = () => {
    setDepositForm(createInitialForm());
    setBankQuery("");
    setStatus(null);
    setBankTotals(null);
    setMetricsError(null);
    setMetricsLoading(false);
    api
      .get("/metadata/next/bank-transaction")
      .then((response) => {
        if (response?.data?.nextEntry) {
          setEntryMeta({ nextEntry: response.data.nextEntry });
        }
      })
      .catch(() => null);
  };

  const handlePrint = useCallback(() => {
    if (!depositForm.bankCode || !depositForm.slipDate) {
      setStatus({ type: "error", message: "Select a bank and slip date before printing." });
      return;
    }

    const formattedDate = depositForm.slipDate ? toDisplay(depositForm.slipDate) : "-";
    const formattedAmount = Number(depositForm.amount || 0).toFixed(2);
    const formattedCashBalance = projectedCashInBank !== null
      ? Number(Math.max(projectedCashInBank, 0)).toFixed(2)
      : formattedAmount;
    const entryNumber = entryMeta.nextEntry || "-";
    const printable = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Bank Transaction</title>
    <style>
      @page { size: A4 portrait; margin: 0; }
      body { margin: 0; }
      .sheet {
        width: 210mm;
        height: 148.5mm;
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 8mm;
        box-sizing: border-box;
        font-family: 'Inter', 'Segoe UI', sans-serif;
      }
      .card {
        width: 100%;
        height: 100%;
        border: 1px solid #cbd5f5;
        border-radius: 16px;
        padding: 22px 26px;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        background: #ffffff;
        color: #0f172a;
      }
      .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
      }
      .header h2 {
        margin: 0;
        font-size: 20px;
        letter-spacing: 0.02em;
      }
      .meta {
        width: 100%;
        border-collapse: collapse;
        font-size: 14px;
      }
      .meta th, .meta td {
        padding: 8px 12px;
        border-bottom: 1px solid #e2e8f0;
        text-align: left;
      }
      .meta th {
        width: 40%;
        font-weight: 600;
        color: #475569;
      }
      .footer {
        margin-top: 24px;
        font-size: 12px;
        color: #64748b;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
    </style>
  </head>
  <body>
    <div class="sheet">
      <div class="card">
        <div class="header">
          <h2>Bank Transaction</h2>
          <span>${new Date().toLocaleString()}</span>
        </div>
        <table class="meta">
          <tbody>
            <tr><th>Entry No.</th><td>${entryNumber}</td></tr>
            <tr><th>Transaction Type</th><td>${transactionLabel}</td></tr>
            <tr><th>Bank Code</th><td>${depositForm.bankCode || "-"}</td></tr>
            <tr><th>Bank Name</th><td>${depositForm.bankName || "-"}</td></tr>
            <tr><th>Slip No.</th><td>${depositForm.slipNo || "-"}</td></tr>
            <tr><th>Slip Date</th><td>${formattedDate}</td></tr>
            <tr><th>Amount</th><td>${formattedAmount}</td></tr>
            <tr><th>Cash in Bank After ${transactionLabel}</th><td>${formattedCashBalance}</td></tr>
          </tbody>
        </table>
        <div class="footer">
          <span>Generated from DIGITAL ZONE NEXUS</span>
          <span>${window.location.origin}</span>
        </div>
      </div>
    </div>
  </body>
</html>`;

    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.top = "-10000px";
    iframe.style.left = "-10000px";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.setAttribute("aria-hidden", "true");
    document.body.appendChild(iframe);

    const frameDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!frameDoc) {
      document.body.removeChild(iframe);
      setStatus({ type: "error", message: "Unable to prepare print layout." });
      return;
    }

    frameDoc.open();
    frameDoc.write(printable);
    frameDoc.close();

    const handlePrintReady = () => {
      if (!iframe.contentWindow) return;
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 500);
    };

    if (iframe.contentWindow?.document?.readyState === "complete") {
      handlePrintReady();
    } else {
      iframe.onload = handlePrintReady;
    }
  }, [depositForm, projectedCashInBank, setStatus, transactionLabel, entryMeta.nextEntry]);

  const transactionFields = (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <FormField label="Entry No.">
          <input value={entryMeta.nextEntry || ""} disabled placeholder="Loading…" />
        </FormField>
        <FormField label="Transaction Type">
          <input value={transactionLabel} disabled />
        </FormField>
        <SearchSelect
          label="Bank Name"
          placeholder="Search bank"
          value={
            depositForm.bankCode
              ? { label: `${depositForm.bankCode} — ${depositForm.bankName}` }
              : null
          }
          onSelect={(option) => {
            if (!option) {
              setDepositForm((prev) => ({
                ...prev,
                bankCode: "",
                bankName: ""
              }));
              setBankTotals(null);
              setMetricsError(null);
              setMetricsLoading(false);
              return;
            }
            setBankTotals(null);
            setMetricsError(null);
            setDepositForm((prev) => ({
              ...prev,
              bankCode: option.code,
              bankName: option.name
            }));
            setMetricsVersion((value) => value + 1);
          }}
          onSearch={setBankQuery}
          results={
            bankLookup.data?.map((bank) => ({
              value: bank.id,
              code: bank.code,
              name: bank.name,
              label: `${bank.code} — ${bank.name}`
            })) ?? []
          }
        />
        <FormField label="Bank Code">
          <input value={depositForm.bankCode} disabled placeholder="Select a bank" />
        </FormField>
        <FormField label="Selected Bank">
          <input value={depositForm.bankName} disabled placeholder="Select a bank" />
        </FormField>
        <FormField label="Amount" required>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={depositForm.amount}
            onChange={(event) =>
              setDepositForm((prev) => ({ ...prev, amount: event.target.value }))
            }
            placeholder="0.00"
          />
        </FormField>
        <FormField label="Slip No.">
          <input
            value={depositForm.slipNo}
            onChange={(event) =>
              setDepositForm((prev) => ({ ...prev, slipNo: event.target.value }))
            }
            placeholder="Enter slip number"
          />
        </FormField>
        <FormField label="Slip Date" required>
          <input
            type="date"
            value={depositForm.slipDate}
            onChange={(event) =>
              setDepositForm((prev) => ({ ...prev, slipDate: event.target.value }))
            }
          />
        </FormField>
        <FormField label="Cash in Bank" className="md:col-span-2">
          <input value={cashBalanceDisplay} disabled readOnly placeholder="Select a bank" />
        </FormField>
      </div>
      {bankSummary ? <div className="mt-3">{bankSummary}</div> : null}
    </>
  );

  if (shouldRedirect) {
    return <Navigate to="/transactions/bank" replace />;
  }

  return (
    <div className="space-y-6">
      <SectionCard
        title="Bank Transaction"
        description="Capture bank deposits or drawings with running balances."
        actions={
          <div className="flex items-center gap-3">
            {status ? (
              <span
                className={`text-xs ${status.type === "success" ? "text-emerald-400" : "text-rose-400"}`}
              >
                {status.message}
              </span>
            ) : null}
            <Link
              to={`/transactions/bank/${transactionType === "deposit" ? "drawing" : "deposit"}`}
              className="secondary text-xs px-3 py-1"
            >
              {transactionType === "deposit" ? "Switch to bank drawing" : "Switch to bank deposit"}
            </Link>
            <Link to="/transactions/bank" className="secondary text-xs px-3 py-1">
              Bank transaction menu
            </Link>
            <Link to="/history/transactions?type=bank-deposit" className="secondary text-xs px-3 py-1">
              View saved transactions
            </Link>
          </div>
        }
      >
        <div className="mt-6 bg-white border border-slate-200 rounded-3xl shadow-[0_18px_45px_rgba(15,23,42,0.12)]">
          <header className="px-6 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-700">{transactionLabel} Setup</h3>
            <p className="text-xs text-slate-500 mt-1">Provide the {transactionLabel.toLowerCase()} details below.</p>
          </header>
          <div className="px-6 py-8 text-sm text-slate-500 space-y-6">
            {transactionFields}
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
              <button type="button" className="secondary" onClick={handleReset}>
                Reset
              </button>
              <button
                type="button"
                className="secondary"
                onClick={handlePrint}
                disabled={mutation.isPending}
              >
                Print
              </button>
              <button
                type="button"
                className="primary"
                disabled={!canSaveTransaction}
                onClick={handleSave}
              >
                {mutation.isPending ? "Saving..." : "Save Transaction"}
              </button>
            </div>
          </div>
        </div>
      </SectionCard>
    </div>
  );
};

export default BankTransactionPage;
