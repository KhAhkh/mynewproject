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
    "salesman-receipt": "Salesman Receipt",
    "customer-receipt": "Customer Receipt",
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
    salesmanCode: "",
    salesmanLabel: "Select salesman",
    customerCode: "",
    customerLabel: "Select customer"
  };
};

const SalesmanCustomerLedgerPage = () => {
  const defaultFilters = useMemo(() => createDefaultFilters(), []);
  const [filters, setFilters] = useState(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState(defaultFilters);
  const [salesmanSearch, setSalesmanSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const printContainerRef = useRef(null);

  const canQuery = Boolean(
    appliedFilters.startDate && appliedFilters.endDate && appliedFilters.salesmanCode && appliedFilters.customerCode
  );

  const ledgerQuery = useQuery({
    queryKey: [
      "salesman-customer-ledger",
      appliedFilters.startDate,
      appliedFilters.endDate,
      appliedFilters.salesmanCode || "",
      appliedFilters.customerCode || ""
    ],
    enabled: canQuery,
    queryFn: async () => {
      const params = {
        startDate: appliedFilters.startDate,
        endDate: appliedFilters.endDate,
        salesmanCode: appliedFilters.salesmanCode,
        customerCode: appliedFilters.customerCode
      };
      const response = await api.get("/reports/receivables/salesman-customer-ledger", { params });
      return response.data;
    }
  });

  const salesmanLookup = useQuery({
    queryKey: ["salesmen", { search: salesmanSearch }],
    queryFn: async () => {
      const response = await api.get("/salesmen", { params: { search: salesmanSearch } });
      return Array.isArray(response.data) ? response.data : [];
    }
  });

  const customerLookup = useQuery({
    queryKey: ["customers", { search: customerSearch }],
    queryFn: async () => {
      const response = await api.get("/customers", { params: { search: customerSearch } });
      return Array.isArray(response.data) ? response.data : [];
    }
  });

  const salesmanOptions = useMemo(() => {
    return (salesmanLookup.data ?? []).map((s) => ({ value: s.id, code: s.code, label: `${s.code} — ${s.name}` }));
  }, [salesmanLookup.data]);

  const customerOptions = useMemo(() => {
    return (customerLookup.data ?? []).map((c) => ({ value: c.id, code: c.code, label: `${c.code} — ${c.name}` }));
  }, [customerLookup.data]);

  const entries = ledgerQuery.data?.entries ?? [];
  const openingBalance = Number(ledgerQuery.data?.openingBalance ?? 0);
  const closingBalance = Number(ledgerQuery.data?.closingBalance ?? openingBalance);
  const openingDate = ledgerQuery.data?.startDate || appliedFilters.startDate || "";

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!filters.startDate || !filters.endDate || !filters.salesmanCode || !filters.customerCode) return;
    setAppliedFilters((prev) => {
      if (
        prev.startDate === filters.startDate &&
        prev.endDate === filters.endDate &&
        prev.salesmanCode === filters.salesmanCode &&
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
    setSalesmanSearch("");
    setCustomerSearch("");
  };

  const ledgerRows = useMemo(() => {
    const rows = [];
    let previousBalance = openingBalance;
    rows.push({
      kind: "opening",
      key: `opening-row`,
      date: openingDate,
      reference: "—",
      description: "Opening Balance",
      debit: previousBalance >= 0 ? previousBalance : 0,
      credit: previousBalance < 0 ? Math.abs(previousBalance) : 0,
      balance: previousBalance
    });
    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i];
      const entryBalance = Number(entry.balanceAfter ?? previousBalance);
      const delta = entryBalance - previousBalance;
      rows.push({
        kind: "transaction",
        key: `${entry.reference || "row"}-${i}`,
        date: entry.date || "—",
        reference: entry.reference || "—",
        description: formatEntryDescription(entry),
        debit: delta >= 0 ? delta : 0,
        credit: delta < 0 ? Math.abs(delta) : 0,
        balance: entryBalance
      });
      previousBalance = entryBalance;
    }
    return rows;
  }, [entries, openingBalance, openingDate]);

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
    if (!printContainerRef.current || !ledgerRows.length) return;
    const clone = printContainerRef.current.cloneNode(true);
    const printWindow = window.open("", "_blank", "width=1024,height=768");
    if (!printWindow) return;

    const { document: printDocument } = printWindow;
    printDocument.open();
    printDocument.write(
      `<!doctype html><html><head><meta charset="utf-8" /><title>Receivable · Salesman + Customer Ledger</title>${printStyles}</head><body><h1>Receivable · Salesman + Customer Ledger</h1></body></html>`
    );
    printDocument.close();

    const mountContent = () => {
      const body = printDocument.body;
      if (!body) return;
      const meta = printDocument.createElement("p");
      const salesmanLabel = filters.salesmanLabel || appliedFilters.salesmanLabel || filters.salesmanCode;
      const customerLabel = filters.customerLabel || appliedFilters.customerLabel || filters.customerCode;
      meta.textContent = `Range ${appliedFilters.startDate} – ${appliedFilters.endDate} · Salesman ${salesmanLabel} · Customer ${customerLabel}`;
      meta.style.fontSize = "11px";
      meta.style.marginBottom = "12px";
      body.insertBefore(meta, body.children[1] || null);
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
        title="Receivable · Salesman + Customer Ledger"
        description="View receivable ledger scoped to a salesman and customer."
        actions={
          ledgerQuery.isFetching ? (
            <span className="text-xs text-slate-500">Updating…</span>
          ) : ledgerQuery.data ? (
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span>
                Range {ledgerQuery.data.startDate} – {ledgerQuery.data.endDate}
                {ledgerQuery.data.salesman ? ` · Salesman ${ledgerQuery.data.salesman.name}` : ""}
                {ledgerQuery.data.customer ? ` · Customer ${ledgerQuery.data.customer.name}` : ""}
              </span>
              {ledgerRows.length ? (
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
              onChange={(e) => setFilters((prev) => ({ ...prev, startDate: e.target.value }))}
              placeholder="DD-MM-YYYY"
            />
          </label>
          <label className="text-sm text-slate-600 font-semibold md:col-span-2">
            <span className="block mb-1">End Date</span>
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
              value={filters.endDate}
              onChange={(e) => setFilters((prev) => ({ ...prev, endDate: e.target.value }))}
              placeholder="DD-MM-YYYY"
            />
          </label>
          <div className="md:col-span-3">
            <SearchSelect
              label="Salesman"
              placeholder="Search salesman"
              dataTestId="salesman-customer-ledger-salesman"
              value={{ label: filters.salesmanLabel || "Select salesman" }}
              onSelect={(option) => {
                const next = { ...filters, salesmanCode: option.code || "", salesmanLabel: option.label };
                setSalesmanSearch("");
                setFilters(next);
              }}
              onSearch={setSalesmanSearch}
              results={salesmanOptions}
            />
          </div>
          <div className="md:col-span-3">
            <SearchSelect
              label="Customer"
              placeholder="Search customer"
              dataTestId="salesman-customer-ledger-customer"
              value={{ label: filters.customerLabel || "Select customer" }}
              onSelect={(option) => {
                const next = { ...filters, customerCode: option.code || "", customerLabel: option.label };
                setCustomerSearch("");
                setFilters(next);
              }}
              onSearch={setCustomerSearch}
              results={customerOptions}
            />
          </div>
          <div className="flex items-end gap-2 md:col-span-2 lg:col-span-1">
            <button type="submit" className="primary text-xs px-4 py-2">
              {ledgerQuery.isFetching &&
              appliedFilters.startDate === filters.startDate &&
              appliedFilters.endDate === filters.endDate &&
              appliedFilters.salesmanCode === filters.salesmanCode &&
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
          <div className="rounded-3xl border border-slate-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div>
                <div className="text-sm font-semibold text-slate-800">
                  {ledgerQuery.data?.salesman?.name || filters.salesmanLabel} · {ledgerQuery.data?.customer?.name || filters.customerLabel}
                </div>
                <div className="text-xs text-slate-500">
                  Opening {formatCurrency(openingBalance)} · Closing {formatCurrency(closingBalance)}
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
                  {ledgerRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                        No activity found within range.
                      </td>
                    </tr>
                  ) : (
                    ledgerRows.map((row) => (
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
        </div>
      </SectionCard>
    </div>
  );
};

export default SalesmanCustomerLedgerPage;
