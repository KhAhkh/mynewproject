import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import SectionCard from "../../components/SectionCard.jsx";
import FormField from "../../components/FormField.jsx";
import SearchSelect from "../../components/SearchSelect.jsx";
import { api } from "../../api/client.js";

const formatCurrency = (value) =>
  `Rs ${Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const describePaymentSource = (detail) => {
  if (!detail) return "Customer receipt";
  if (detail.bankTransactionEntry) {
    return `Linked bank entry ${detail.bankTransactionEntry}`;
  }
  if (detail.paymentMode === "cash") {
    return "Cash receipt";
  }
  return "Receipt with bank transaction";
};

const createInitialForm = () => ({
  receiptDate: "",
  amount: "",
  details: "",
  paymentMode: "cash",
  bankCode: "",
  bankLabel: "",
  slipNo: "",
  slipDate: ""
});

const EditCustomerReceiptPage = () => {
  const queryClient = useQueryClient();
  const [receiptSearch, setReceiptSearch] = useState("");
  const [receiptNo, setReceiptNo] = useState("");
  const [receiptLocked, setReceiptLocked] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [receiptDetail, setReceiptDetail] = useState(null);
  const [formState, setFormState] = useState(createInitialForm);
  const [status, setStatus] = useState(null);
  const [isLoadingReceipt, setIsLoadingReceipt] = useState(false);
  const [bankQuery, setBankQuery] = useState("");

  const receiptLookup = useQuery({
    queryKey: ["customer-receipts", { search: receiptSearch }],
    queryFn: async () => {
      const response = await api.get("/customer-receipts", { params: { search: receiptSearch } });
      return response.data;
    }
  });

  useEffect(() => {
    if (receiptLookup.error) {
      setStatus({ type: "error", message: receiptLookup.error.message });
    }
  }, [receiptLookup.error]);

  const receiptOptions = useMemo(
    () =>
      receiptLookup.data?.map((receipt) => {
        const labelParts = [];
        labelParts.push(receipt.receipt_no || `Receipt ${receipt.id}`);
        labelParts.push(receipt.receipt_date || "—");
        labelParts.push(`Rs ${Number(receipt.amount ?? 0).toFixed(2)}`);
        return {
          value: receipt.receipt_no || String(receipt.id),
          receiptNo: receipt.receipt_no || "",
          label: labelParts.join(" • "),
          meta: receipt
        };
      }) ?? [],
    [receiptLookup.data]
  );

  const bankSearchTerm = bankQuery.trim();
  const bankQueryReady = bankSearchTerm.length >= 2;

  const bankLookup = useQuery({
    queryKey: ["banks", { search: bankSearchTerm }],
    enabled: bankQueryReady,
    queryFn: async () => {
      const response = await api.get("/banks", { params: { search: bankSearchTerm } });
      return response.data;
    }
  });

  const isOnline = formState.paymentMode === "online";
  const isBankTransaction = formState.paymentMode === "bank";

  useEffect(() => {
    if (!isBankTransaction || formState.slipDate) {
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    setFormState((prev) => {
      if (prev.paymentMode !== "bank" || prev.slipDate) {
        return prev;
      }
      return { ...prev, slipDate: today };
    });
  }, [formState.paymentMode, formState.slipDate, isBankTransaction]);

  const resetForm = () => {
    setReceiptLocked(false);
    setReceiptDetail(null);
    setSelectedReceipt(null);
    setFormState(createInitialForm);
    setReceiptNo("");
    setReceiptSearch("");
    setStatus(null);
    setBankQuery("");
  };

  const populateForm = (detail) => {
    setFormState({
      receiptDate: detail.receiptDateRaw || detail.receiptDate || "",
      amount: detail.amount != null ? Number(detail.amount).toFixed(2) : "",
      details: detail.details || "",
      paymentMode: detail.paymentMode || "cash",
      bankCode: detail.bank?.code || "",
      bankLabel: detail.bank?.code ? `${detail.bank.code} — ${detail.bank.name || detail.bank.code}` : "",
      slipNo: detail.slipNo || "",
      slipDate: detail.slipDate || ""
    });
  };

  const loadReceipt = async (value) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setStatus({ type: "error", message: "Enter the receipt number to load." });
      return;
    }
    setIsLoadingReceipt(true);
    setStatus({ type: "info", message: "Loading receipt…" });
    try {
      const response = await api.get(`/customer-receipts/${encodeURIComponent(trimmed)}`);
      const detail = response.data;
      setReceiptDetail(detail);
      setReceiptNo(detail.receiptNo || trimmed);
      setReceiptLocked(true);
      setSelectedReceipt({
        value: detail.receiptNo || trimmed,
        receiptNo: detail.receiptNo || trimmed,
        label: detail.receiptNo || trimmed
      });
      setBankQuery("");
      populateForm(detail);
      setStatus({ type: "success", message: "Receipt loaded. You can now edit and save changes." });
    } catch (error) {
      const message = error?.response?.data?.message || error?.message || "Failed to load receipt.";
      resetForm();
      setStatus({ type: "error", message });
    } finally {
      setIsLoadingReceipt(false);
    }
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!receiptLocked || !receiptDetail) {
        throw new Error("Load a receipt before saving changes.");
      }
      if (!formState.receiptDate) {
        throw new Error("Select the receipt date before saving changes.");
      }
      const amountNumber = Number(formState.amount);
      if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
        throw new Error("Enter a valid amount before saving changes.");
      }
      if (formState.paymentMode !== "cash" && !formState.bankCode) {
        throw new Error("Select a bank for this payment mode.");
      }
      if (formState.paymentMode === "online" && !formState.slipNo.trim()) {
        throw new Error("Enter the transaction reference for online receipts.");
      }
      if (formState.paymentMode === "bank" && !formState.slipDate) {
        throw new Error("Select the slip date for bank receipts.");
      }

      const payload = {
        receiptDate: formState.receiptDate,
        amount: amountNumber,
        details: formState.details,
        paymentMode: formState.paymentMode,
        bankCode: formState.paymentMode === "cash" ? null : formState.bankCode,
        slipNo: formState.paymentMode === "cash" ? null : formState.slipNo,
        slipDate: formState.paymentMode === "bank" ? formState.slipDate : null
      };

      const response = await api.put(
        `/customer-receipts/${encodeURIComponent(receiptDetail.receiptNo || receiptNo)}`,
        payload
      );
      return response.data;
    },
    onMutate: () => setStatus(null),
    onSuccess: (data) => {
      const detail = data.receipt;
      setReceiptDetail(detail);
      populateForm(detail);
      setStatus({ type: "success", message: "Receipt updated successfully." });
      setSelectedReceipt((prev) => {
        if (!detail?.receiptNo) return prev;
        return {
          value: detail.receiptNo,
          receiptNo: detail.receiptNo,
          label: detail.receiptNo
        };
      });
      queryClient.invalidateQueries({ queryKey: ["customer-receipts"] });
      queryClient.invalidateQueries({ queryKey: ["transaction-history"] });
      queryClient.invalidateQueries({ queryKey: ["bank-deposit-report"] });
    },
    onError: (error) => {
      const message = error?.response?.data?.message || error?.message || "Failed to update receipt.";
      setStatus({ type: "error", message });
    }
  });

  const isSaving = updateMutation.isPending;

  return (
    <div className="space-y-6">
      <SectionCard
        title="Edit Customer Receipt"
        description="Locate a saved customer receipt, adjust its details, and resave. Bank transactions stay in sync automatically."
      >
        <form
          className="grid gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (!receiptLocked) {
              setStatus({ type: "error", message: "Load a receipt before saving changes." });
              return;
            }
            updateMutation.mutate();
          }}
        >
          <div className="grid gap-4 md:grid-cols-[minmax(0,2fr),minmax(0,1fr)] items-end">
            <SearchSelect
              label="Search Receipts"
              placeholder="Search by receipt, customer, or slip"
              value={selectedReceipt}
              onSelect={(option) => {
                setSelectedReceipt(option);
                setReceiptNo(option.receiptNo || option.value || "");
                setReceiptLocked(false);
                setReceiptDetail(null);
                setFormState(createInitialForm);
                setStatus(null);
              }}
              onSearch={setReceiptSearch}
              results={receiptOptions}
              emptyMessage={
                receiptSearch.trim()
                  ? "No receipts match your search."
                  : "Enter a receipt number, customer, or slip reference to search."
              }
            />
            <FormField label="Receipt No.">
              <input
                value={receiptNo}
                readOnly={receiptLocked}
                placeholder="Enter receipt number"
                onChange={(event) => {
                  setReceiptNo(event.target.value);
                  setReceiptLocked(false);
                  setReceiptDetail(null);
                  setFormState(createInitialForm);
                  setStatus(null);
                  setSelectedReceipt(null);
                  setBankQuery("");
                }}
              />
            </FormField>
          </div>
          <div className="flex gap-3">
            <button type="button" className="secondary text-sm" onClick={() => loadReceipt(receiptNo)} disabled={isLoadingReceipt}>
              {isLoadingReceipt ? "Loading…" : "Load Receipt"}
            </button>
            <button type="button" className="secondary text-sm" onClick={resetForm}>
              Reset
            </button>
          </div>
          {status ? (
            <p
              className={`text-xs ${
                status.type === "error"
                  ? "text-rose-500"
                  : status.type === "success"
                  ? "text-emerald-500"
                  : "text-slate-500"
              }`}
            >
              {status.message}
            </p>
          ) : null}

          {receiptDetail ? (
            <div className="grid gap-4">
              <div className="border border-slate-200 bg-slate-50 rounded-2xl px-4 py-3 text-xs text-slate-600">
                <p className="font-semibold text-slate-700 mb-2">Receipt snapshot</p>
                <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4">
                  <div>
                    <p className="uppercase tracking-wide text-slate-500">Receipt</p>
                    <p className="text-slate-800">{receiptDetail.receiptNo || "—"}</p>
                  </div>
                  <div>
                    <p className="uppercase tracking-wide text-slate-500">Customer</p>
                    <p className="text-slate-800">{receiptDetail.customer?.code ? `${receiptDetail.customer.code} — ${receiptDetail.customer.name}` : "—"}</p>
                  </div>
                  <div>
                    <p className="uppercase tracking-wide text-slate-500">Amount</p>
                    <p className="text-slate-800">{formatCurrency(receiptDetail.amount)}</p>
                  </div>
                  <div>
                    <p className="uppercase tracking-wide text-slate-500">Mode</p>
                    <p className="text-slate-800">{(receiptDetail.paymentMode || "cash").toUpperCase()}</p>
                  </div>
                  <div>
                    <p className="uppercase tracking-wide text-slate-500">Bank Info</p>
                    <p className="text-slate-800">
                      {receiptDetail.bank?.code ? `${receiptDetail.bank.code} — ${receiptDetail.bank.name}` : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="uppercase tracking-wide text-slate-500">Slip / Ref</p>
                    <p className="text-slate-800">{receiptDetail.slipNo || "—"}</p>
                  </div>
                  <div>
                    <p className="uppercase tracking-wide text-slate-500">Slip Date</p>
                    <p className="text-slate-800">{receiptDetail.slipDateDisplay || receiptDetail.slipDate || "—"}</p>
                  </div>
                  <div>
                    <p className="uppercase tracking-wide text-slate-500">Source</p>
                    <p className="text-slate-800">{describePaymentSource(receiptDetail)}</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <FormField label="Receipt Date" required>
                  <input
                    type="date"
                    value={formState.receiptDate}
                    onChange={(event) =>
                      setFormState((prev) => ({ ...prev, receiptDate: event.target.value }))
                    }
                  />
                </FormField>
                <FormField label="Payment Mode" required>
                  <select
                    value={formState.paymentMode}
                    onChange={(event) => {
                      const nextMode = event.target.value;
                      const defaultSlipDate = new Date().toISOString().slice(0, 10);
                      setStatus(null);
                      setFormState((prev) => {
                        const next = { ...prev, paymentMode: nextMode };
                        if (nextMode === "cash") {
                          next.bankCode = "";
                          next.bankLabel = "";
                          next.slipNo = "";
                          next.slipDate = "";
                        } else if (nextMode === "online") {
                          next.slipDate = prev.paymentMode === "bank" ? prev.slipDate : "";
                        } else if (nextMode === "bank") {
                          next.slipDate = prev.slipDate || defaultSlipDate;
                        }
                        return next;
                      });
                      if (nextMode === "cash") {
                        setBankQuery("");
                      }
                    }}
                  >
                    <option value="cash">Cash</option>
                    <option value="online">Online</option>
                    <option value="bank">Bank Transaction</option>
                  </select>
                </FormField>
                {(isOnline || isBankTransaction) ? (
                  <SearchSelect
                    label="Bank"
                    placeholder="Type at least two characters"
                    value={
                      formState.bankCode ? { label: formState.bankLabel || formState.bankCode } : null
                    }
                    onSelect={(option) => {
                      if (!option) return;
                      setFormState((prev) => ({
                        ...prev,
                        bankCode: option.code,
                        bankLabel: `${option.code} — ${option.name}`
                      }));
                      setStatus(null);
                    }}
                    onSearch={setBankQuery}
                    results={
                      bankQueryReady
                        ? bankLookup.data?.map((bank) => ({
                            value: bank.id,
                            code: bank.code,
                            name: bank.name,
                            label: `${bank.code} — ${bank.name}`
                          })) ?? []
                        : []
                    }
                    emptyMessage={
                      bankQueryReady
                        ? "No matching banks found."
                        : "Type at least two characters to search banks."
                    }
                  />
                ) : null}
                {(isOnline || isBankTransaction) ? (
                  <FormField label={isOnline ? "Transaction Reference" : "Slip No."}>
                    <input
                      value={formState.slipNo}
                      onChange={(event) =>
                        setFormState((prev) => ({ ...prev, slipNo: event.target.value }))
                      }
                      placeholder={isOnline ? "Enter transaction reference" : "Enter slip number"}
                    />
                  </FormField>
                ) : null}
                {isBankTransaction ? (
                  <FormField label="Slip Date" required>
                    <input
                      type="date"
                      value={formState.slipDate}
                      onChange={(event) =>
                        setFormState((prev) => ({ ...prev, slipDate: event.target.value }))
                      }
                    />
                  </FormField>
                ) : null}
                <FormField label="Amount" required>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={formState.amount}
                    onChange={(event) =>
                      setFormState((prev) => ({ ...prev, amount: event.target.value }))
                    }
                  />
                </FormField>
                <FormField label="Details" className="md:col-span-3">
                  <textarea
                    rows={3}
                    value={formState.details}
                    onChange={(event) =>
                      setFormState((prev) => ({ ...prev, details: event.target.value }))
                    }
                    placeholder="Optional remarks"
                  />
                </FormField>
              </div>
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-3">
            <button type="submit" className="primary" disabled={isSaving || !receiptDetail}>
              {isSaving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </SectionCard>
    </div>
  );
};

export default EditCustomerReceiptPage;
