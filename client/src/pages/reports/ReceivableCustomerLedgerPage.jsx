import { useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import { useQuery } from "@tanstack/react-query";
import SectionCard from "../../components/SectionCard.jsx";
import { api } from "../../api/client.js";
import SearchSelect from "../../components/SearchSelect.jsx";

const formatCurrency = (value) =>
  `Rs ${Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const formatAmountOrDash = (value) => {
  const numeric = Number(value ?? 0);
  return Math.abs(numeric) > 0.0001 ? formatCurrency(Math.abs(numeric)) : "—";
};

const formatLedgerBalance = (value) => {
  const numeric = Number(value ?? 0);
  if (Math.abs(numeric) < 0.0001) return formatCurrency(0);
  return `${formatCurrency(Math.abs(numeric))} ${numeric >= 0 ? "Dr" : "Cr"}`;
};

const formatEntryDescription = (entry) => {
  if (!entry) return "";
  if (entry.description) return entry.description;
  const mapping = {
    sale: "Sale Invoice",
    receipt: "Cash Received",
    "immediate-payment": "Payment (at Invoice)",
    "sale-return": "Sale Return",
    adjustment: "Adjustment",
    credit: "Credit Note"
  };
  if (mapping[entry.type]) return mapping[entry.type];
  const normalized = (entry.type || "").replace(/[-_]/g, " ").trim();
  if (!normalized) return "Entry";
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
};

const createDefaultFilters = () => {
  const today = dayjs();
  return {
    startDate: today.startOf("month").format("DD-MM-YYYY"),
    endDate: today.format("DD-MM-YYYY"),
    customerCode: "",
    customerLabel: "All customers"
  };
};

const ReceivableCustomerLedgerPage = () => {
  const defaultFilters = useMemo(() => createDefaultFilters(), []);
  const [filters, setFilters] = useState(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState(defaultFilters);
  const [customerSearch, setCustomerSearch] = useState("");
  const printContainerRef = useRef(null);

  const ledgerQuery = useQuery({
    queryKey: [
      "receivable-customer-ledger",
      appliedFilters.startDate,
      appliedFilters.endDate,
      appliedFilters.customerCode || ""
    ],
    enabled: Boolean(appliedFilters.startDate && appliedFilters.endDate),
    queryFn: async () => {
      const params = {
        startDate: appliedFilters.startDate,
        endDate: appliedFilters.endDate,
        mode: "detail"
      };
      if (appliedFilters.customerCode) {
        params.customerCode = appliedFilters.customerCode;
      }
      const response = await api.get("/reports/receivables/customer-ledger", {
        params
      });
      return response.data;
    }
  });

  const customerLookup = useQuery({
    queryKey: ["customers", { search: customerSearch }],
    queryFn: async () => {
      const response = await api.get("/customers", { params: { search: customerSearch } });
      return Array.isArray(response.data) ? response.data : [];
    }
  });

  const rows = ledgerQuery.data?.rows ?? [];
  const totals = ledgerQuery.data?.totals ?? { opening: 0, sales: 0, returns: 0, receipts: 0, closing: 0 };
  const detailedBreakdown = ledgerQuery.data?.details ?? [];
  const totalDebit = (totals.opening ?? 0) + (totals.sales ?? 0);
  const totalCredit = (totals.returns ?? 0) + (totals.receipts ?? 0);
  const allCustomerLabel = "All customers";
  const customerOptions = useMemo(() => {
    const list = (customerLookup.data ?? []).map((customer) => ({
      value: customer.id,
      code: customer.code,
      label: `${customer.code} — ${customer.name}`
    }));
    return [{ value: "__all__", code: "", label: allCustomerLabel }, ...list];
  }, [customerLookup.data]);

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!filters.startDate || !filters.endDate) return;
    setAppliedFilters((prev) => {
      if (
        prev.startDate === filters.startDate &&
        prev.endDate === filters.endDate &&
        prev.customerCode === filters.customerCode
      ) {
        return prev;
      }
      return { ...filters };
    });
  };

  const handleReset = () => {
    const next = createDefaultFilters();
    setFilters(next);
    setAppliedFilters(next);
    setCustomerSearch("");
  };

  const hasData = rows.length > 0;
  const hasDetailedData = detailedBreakdown.length > 0;
  const canPrint = hasData || hasDetailedData;

  const ledgerDetails = useMemo(() => {
    if (!hasDetailedData) return [];
    const openingDate = ledgerQuery.data?.startDate || appliedFilters.startDate || "";
    return detailedBreakdown.map((detail) => {
      const entries = Array.isArray(detail.entries) ? detail.entries : [];
      const ledgerRows = [];
      let previousBalance = Number(detail.openingBalance ?? 0);

      ledgerRows.push({
        kind: "opening",
        key: `${detail.customerCode}-opening`,
        date: openingDate,
        reference: "—",
        description: "Opening Balance",
        debit: previousBalance >= 0 ? previousBalance : 0,
        credit: previousBalance < 0 ? Math.abs(previousBalance) : 0,
        balance: previousBalance
      });

      for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        const entryBalance = Number(entry.balanceAfter ?? previousBalance);
        const delta = entryBalance - previousBalance;
        ledgerRows.push({
          kind: "transaction",
          key: `${detail.customerCode}-${entry.reference || "row"}-${index}`,
          date: entry.date || "—",
          reference: entry.reference || "—",
          description: formatEntryDescription(entry),
          debit: delta >= 0 ? delta : 0,
          credit: delta < 0 ? Math.abs(delta) : 0,
          balance: entryBalance
        });
        previousBalance = entryBalance;
      }

      return {
        ...detail,
        ledgerRows,
        closingBalance: ledgerRows.length ? ledgerRows[ledgerRows.length - 1].balance : detail.openingBalance
      };
    });
  }, [appliedFilters.startDate, detailedBreakdown, hasDetailedData, ledgerQuery.data?.startDate]);

  const printStyles = `
    <style>
      @page { size: A4 portrait; margin: 16mm 14mm 18mm 14mm; }
      body { font-family: Arial, sans-serif; color: #0f172a; margin: 0; padding: 18px; }
      h1 { font-size: 20px; margin-bottom: 12px; text-align: center; }
      h2 { font-size: 14px; margin-top: 18px; margin-bottom: 8px; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
      th, td { border: 1px solid #e2e8f0; padding: 6px 8px; text-align: left; }
      th { background: #eff6ff; text-transform: uppercase; font-size: 10px; letter-spacing: 0.05em; }
      tfoot td { font-weight: 600; background: #f1f5f9; }
      .subheading { font-size: 12px; font-weight: 600; margin-top: 16px; color: #475569; }
    </style>
  `;

  const handlePrint = () => {
    if (!printContainerRef.current || !canPrint) return;
    const clone = printContainerRef.current.cloneNode(true);
    const printWindow = window.open("", "_blank", "width=1024,height=768");
    if (!printWindow) return;

    const { document: printDocument } = printWindow;
    printDocument.open();
    printDocument.write(
      `<!doctype html><html><head><meta charset="utf-8" /><title>Receivable · Customer Ledger</title>${printStyles}</head><body><h1>Receivable · Customer Ledger</h1></body></html>`
    );
    printDocument.close();

    const mountContent = () => {
      const body = printDocument.body;
      if (!body) return;
      const metadata = printDocument.createElement("p");
      metadata.textContent = `Range ${appliedFilters.startDate} – ${appliedFilters.endDate}${
        appliedFilters.customerCode ? ` · Customer ${appliedFilters.customerLabel || appliedFilters.customerCode}` : ""
      }`;
      metadata.style.fontSize = "11px";
      metadata.style.marginBottom = "12px";
      body.insertBefore(metadata, body.children[1] || null);
      body.appendChild(clone);
      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
      }, 80);
    };

    if (printDocument.readyState === "complete") {
      mountContent();
    } else {
      printWindow.addEventListener("load", mountContent, { once: true });
    }
  };

  return (
    <div className="space-y-6">
      <SectionCard
        title="Receivable · Customer Ledger"
        description="Summarize outstanding receivables over a date range."
        actions={
          ledgerQuery.isFetching ? (
            <span className="text-xs text-slate-500">Updating…</span>
          ) : ledgerQuery.data ? (
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span>
                Range {ledgerQuery.data.startDate} – {ledgerQuery.data.endDate}
                {appliedFilters.customerCode
                  ? ` · Customer ${appliedFilters.customerLabel || appliedFilters.customerCode}`
                  : ""}
              </span>
              {canPrint ? (
                <button
                  type="button"
                  onClick={handlePrint}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:border-emerald-200 hover:text-emerald-600 hover:ring-2 hover:ring-emerald-100"
                >
                  Print ledger
                </button>
              ) : null}
            </div>
          ) : null
        }
      >
        <form className="grid gap-4 md:grid-cols-6" onSubmit={handleSubmit}>
          <label className="text-sm text-slate-600 font-semibold md:col-span-2">
            <span className="block mb-1">Start Date</span>
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
              value={filters.startDate}
              onChange={(event) => setFilters((prev) => ({ ...prev, startDate: event.target.value }))}
              placeholder="DD-MM-YYYY"
            />
          </label>
          <label className="text-sm text-slate-600 font-semibold md:col-span-2">
            <span className="block mb-1">End Date</span>
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
              value={filters.endDate}
              onChange={(event) => setFilters((prev) => ({ ...prev, endDate: event.target.value }))}
              placeholder="DD-MM-YYYY"
            />
          </label>
          <div className="md:col-span-2">
            <SearchSelect
              label="Customer (optional)"
              placeholder="Search customer"
              dataTestId="customer-ledger-customer"
              value={{ label: filters.customerLabel || allCustomerLabel }}
              onSelect={(option) => {
                const nextFilters = {
                  ...filters,
                  customerCode: option.code || "",
                  customerLabel: option.code ? option.label : allCustomerLabel
                };
                setCustomerSearch("");
                setFilters(nextFilters);
                if (nextFilters.startDate && nextFilters.endDate) {
                  setAppliedFilters(nextFilters);
                }
              }}
              onSearch={setCustomerSearch}
              results={customerOptions}
            />
            {filters.customerCode ? (
              <button
                type="button"
                className="mt-2 text-xs text-emerald-600 underline"
                onClick={() => {
                  const nextFilters = {
                    ...filters,
                    customerCode: "",
                    customerLabel: allCustomerLabel
                  };
                  setFilters(nextFilters);
                  if (nextFilters.startDate && nextFilters.endDate) {
                    setAppliedFilters(nextFilters);
                  }
                }}
              >
                Clear customer filter
              </button>
            ) : null}
          </div>
          <div className="flex items-end gap-2 md:col-span-2 lg:col-span-1">
            <button type="submit" className="primary text-xs px-4 py-2">
              {ledgerQuery.isFetching &&
              appliedFilters.startDate === filters.startDate &&
              appliedFilters.endDate === filters.endDate &&
              appliedFilters.customerCode === filters.customerCode
                ? "Generating…"
                : "Generate"}
            </button>
            <button type="button" className="secondary text-xs px-4 py-2" onClick={handleReset}>
              Reset
            </button>
          </div>
        </form>
        {ledgerQuery.isError ? (
          <div className="rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm text-rose-700 shadow-[0_8px_20px_rgba(244,63,94,0.08)]">
            {ledgerQuery.error?.message || "Unable to generate ledger."}
          </div>
        ) : null}
        <div ref={printContainerRef} className="space-y-6">
          <div className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
            <table className="min-w-full divide-y divide-slate-200 text-sm text-slate-700">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wide text-xs">
                <tr>
                  <th className="px-5 py-3 text-left">Customer</th>
                  <th className="px-5 py-3 text-right">Opening</th>
                  <th className="px-5 py-3 text-right">Sales</th>
                  <th className="px-5 py-3 text-right">Returns</th>
                  <th className="px-5 py-3 text-right">Receipts</th>
                  <th className="px-5 py-3 text-right">Closing</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ledgerQuery.isLoading ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-6 text-center text-slate-500">
                      Generating ledger…
                    </td>
                  </tr>
                ) : !hasData ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-6 text-center text-slate-500">
                      No receivable activity for the selected range.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.customerCode} className="even:bg-slate-50/60 hover:bg-slate-100/60 transition">
                      <td className="px-5 py-4 align-middle">
                        <div className="font-semibold text-slate-800">{row.customerName || row.customerCode}</div>
                        <div className="text-xs text-slate-500">{row.customerCode}</div>
                      </td>
                      <td className="px-5 py-4 align-middle text-right text-slate-800">{formatCurrency(row.openingBalance)}</td>
                      <td className="px-5 py-4 align-middle text-right text-slate-800">{formatCurrency(row.salesAmount)}</td>
                      <td className="px-5 py-4 align-middle text-right text-slate-800">{formatCurrency(row.returnsAmount)}</td>
                      <td className="px-5 py-4 align-middle text-right text-slate-800">{formatCurrency(row.receiptsAmount)}</td>
                      <td className="px-5 py-4 align-middle text-right font-semibold text-slate-900">
                        {formatCurrency(row.closingBalance)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {hasData ? (
                <tfoot className="bg-slate-50 text-slate-600 text-sm">
                  <tr>
                    <td className="px-5 py-3 font-semibold text-slate-700">Totals</td>
                    <td className="px-5 py-3 text-right font-semibold text-slate-900">{formatCurrency(totals.opening)}</td>
                    <td className="px-5 py-3 text-right font-semibold text-slate-900">{formatCurrency(totals.sales)}</td>
                    <td className="px-5 py-3 text-right font-semibold text-slate-900">{formatCurrency(totals.returns)}</td>
                    <td className="px-5 py-3 text-right font-semibold text-slate-900">{formatCurrency(totals.receipts)}</td>
                    <td className="px-5 py-3 text-right font-semibold text-slate-900">{formatCurrency(totals.closing)}</td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
          {hasDetailedData ? (
            <div className="space-y-6 pt-6">
              {ledgerDetails.map((detail) => (
                <div
                  key={detail.customerCode || detail.customerName}
                  className="rounded-3xl border border-slate-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.06)]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                    <div>
                      <div className="text-sm font-semibold text-slate-800">
                        {detail.customerName} ({detail.customerCode})
                      </div>
                      <div className="text-xs text-slate-500">
                        Opening {formatCurrency(detail.openingBalance)} · Closing {formatCurrency(detail.closingBalance)}
                      </div>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-xs text-slate-700">
                      <thead className="bg-slate-50 text-slate-500 uppercase tracking-wide">
                        <tr>
                          <th className="px-4 py-3 text-left">Date</th>
                          <th className="px-4 py-3 text-left">Ref No</th>
                          <th className="px-4 py-3 text-left">Description</th>
                          <th className="px-4 py-3 text-right">Debit (Dr)</th>
                          <th className="px-4 py-3 text-right">Credit (Cr)</th>
                          <th className="px-4 py-3 text-right">Running Balance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {detail.ledgerRows.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                              No activity found within range.
                            </td>
                          </tr>
                        ) : (
                          detail.ledgerRows.map((row) => (
                            <tr key={row.key} className={row.kind === "opening" ? "bg-slate-50/60" : "bg-white"}>
                              <td className="px-4 py-3 text-slate-600">{row.date || "—"}</td>
                              <td className="px-4 py-3 font-medium text-slate-700">{row.reference}</td>
                              <td className="px-4 py-3 text-slate-600">{row.description}</td>
                              <td className="px-4 py-3 text-right text-slate-700">{formatAmountOrDash(row.debit)}</td>
                              <td className="px-4 py-3 text-right text-slate-700">{formatAmountOrDash(row.credit)}</td>
                              <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatLedgerBalance(row.balance)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          {hasData ? (
            <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)] sm:grid-cols-3">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                <div className="text-sm font-semibold text-slate-600">
                  Total Debit
                  <span className="ml-2 text-xs font-normal text-slate-500">(Opening + Sales)</span>
                </div>
                <div className="text-sm font-semibold text-slate-900">{formatCurrency(totalDebit)}</div>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                <div className="text-sm font-semibold text-slate-600">
                  Total Credit
                  <span className="ml-2 text-xs font-normal text-slate-500">(Returns + Receipts)</span>
                </div>
                <div className="text-sm font-semibold text-slate-900">{formatCurrency(totalCredit)}</div>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 sm:col-span-1">
                <div className="text-sm font-semibold text-slate-600">
                  Closing Balance
                  <span className="ml-2 text-xs font-normal text-slate-500">(Dr if +ve · Cr if -ve)</span>
                </div>
                <div className="text-sm font-semibold text-slate-900">{formatLedgerBalance(totals.closing)}</div>
              </div>
            </div>
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
};

export default ReceivableCustomerLedgerPage;
