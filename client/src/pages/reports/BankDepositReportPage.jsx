import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import SectionCard from "../../components/SectionCard.jsx";
import { api } from "../../api/client.js";

const formatCurrency = (value) =>
  `Rs ${Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const BankDepositReportPage = () => {
  const [bankFilter, setBankFilter] = useState("");
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["bank-deposit-report"],
    queryFn: async () => {
      const response = await api.get("/reports/bank-deposits");
      return Array.isArray(response.data) ? response.data : [];
    }
  });

  const rows = data ?? [];

  const [bankMetrics, setBankMetrics] = useState({});
  const [balancesById, setBalancesById] = useState({});
  const [closingByBank, setClosingByBank] = useState({});

  const bankOptions = useMemo(() => {
    const map = new Map();
    for (const row of rows) {
      const code = row.bank_code || "";
      const name = row.bank_name || code;
      if (code && !map.has(code)) {
        map.set(code, name ? `${code} — ${name}` : code);
      }
    }
    return Array.from(map.entries())
      .map(([code, label]) => ({ code, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);

  // Fetch metrics (opening balances) for banks present in the rows
  useEffect(() => {
    let mounted = true;
    const codes = Array.from(new Set(rows.map((r) => r.bank_code).filter(Boolean)));
    if (codes.length === 0) return;
    (async () => {
      try {
        const results = await Promise.all(
          codes.map((code) => api.get(`/banks/${encodeURIComponent(code)}/metrics`).then((r) => ({ code, totals: r.data.totals })).catch(() => ({ code, totals: null })))
        );
        if (!mounted) return;
        const map = {};
        for (const r of results) {
          if (r.totals) map[r.code] = r.totals;
        }
        setBankMetrics(map);
      } catch (err) {
        // ignore; metrics are optional
      }
    })();
    return () => (mounted = false);
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (!bankFilter) return rows;
    return rows.filter((row) => row.bank_code === bankFilter);
  }, [rows, bankFilter]);

  // Compute running balances (cash before / after) per bank using opening totals when available
  useEffect(() => {
    const map = {};
    const closing = {};
    const byBank = {};
    for (const row of filteredRows) {
      const code = row.bank_code || "__NA__";
      byBank[code] = byBank[code] || [];
      byBank[code].push(row);
    }

    for (const [code, items] of Object.entries(byBank)) {
      // sort ascending by effective date then id to compute running balance chronologically
      items.sort((a, b) => {
        const da = a.transaction_date ? new Date(a.transaction_date) : a.slip_date ? new Date(a.slip_date) : new Date(0);
        const db = b.transaction_date ? new Date(b.transaction_date) : b.slip_date ? new Date(b.slip_date) : new Date(0);
        if (da.getTime() !== db.getTime()) return da - db;
        return (a.id || 0) - (b.id || 0);
      });

      const opening = (bankMetrics[code]?.opening ?? 0) || 0;
      let running = opening;
      for (const row of items) {
        const amount = Number(row.cash_amount || 0);
        map[row.id] = {
          before: running,
          after: row.transaction_type === "drawing" ? running - amount : running + amount
        };
        running = map[row.id].after;
      }
      closing[code] = running;
    }

    setBalancesById(map);
    setClosingByBank(closing);
  }, [filteredRows, bankMetrics]);

  const totalAmount = useMemo(() => {
    return filteredRows.reduce((sum, row) => sum + Number(row.cash_amount || 0), 0);
  }, [filteredRows]);

  const cashInBank = useMemo(() => {
    if (!Object.keys(closingByBank).length) return 0;
    if (bankFilter) return closingByBank[bankFilter] ?? 0;
    return Object.values(closingByBank).reduce((sum, value) => sum + Number(value || 0), 0);
  }, [closingByBank, bankFilter]);

  const exportCsv = () => {
    const headers = [
      "Bank",
      "Entry No",
      "Type",
      "REF",
      "Slip No",
      "Date",
      "Cash Before",
      "Amount",
      "Cash After",
      "Created"
    ];

    const lines = filteredRows.map((row) => {
      const amount = Number(row.cash_amount || 0);
      const before = balancesById[row.id]?.before ?? 0;
      const after = balancesById[row.id]?.after ?? (row.transaction_type === "drawing" ? before - amount : before + amount);
      const date = row.transaction_date || row.slip_date || "";
      const created = row.created_at ? new Date(row.created_at).toLocaleString() : "";
      const reference = row.customer_receipt_no ? `Receipt ${row.customer_receipt_no}` : "Manual Entry";
      const bankLabel = row.bank_code ? `${row.bank_name || row.bank_code} (${row.bank_code})` : (row.bank_name || "");
      const values = [
        bankLabel,
        row.entry_no || "",
        row.transaction_type === "drawing" ? "DRW" : "DEPO",
        reference,
        row.slip_no || "",
        date,
        formatCurrency(before),
        formatCurrency(Number(row.cash_amount || 0)),
        formatCurrency(after),
        created
      ];
      return values.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");
    });

    const csv = [headers.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "bank-statements.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const printTable = () => {
    const rowsHtml = filteredRows
      .map((row) => {
        const amount = Number(row.cash_amount || 0);
        const before = balancesById[row.id]?.before ?? 0;
        const after = balancesById[row.id]?.after ?? (row.transaction_type === "drawing" ? before - amount : before + amount);
        const date = row.transaction_date || row.slip_date || "";
        const created = row.created_at ? new Date(row.created_at).toLocaleString() : "";
        const reference = row.customer_receipt_no ? `Receipt ${row.customer_receipt_no}` : "Manual Entry";
        const bankLabel = row.bank_code ? `${row.bank_name || row.bank_code} (${row.bank_code})` : (row.bank_name || "");
        return `<tr>
          <td>${bankLabel}</td>
          <td>${row.entry_no || ""}</td>
          <td>${row.transaction_type === "drawing" ? "DRW" : "DEPO"}</td>
          <td>${reference}</td>
          <td>${row.slip_no || ""}</td>
          <td>${date}</td>
          <td>${formatCurrency(before)}</td>
          <td>${formatCurrency(Number(row.cash_amount || 0))}</td>
          <td>${formatCurrency(after)}</td>
          <td>${created}</td>
        </tr>`;
      })
      .join("");

    const html = `<!doctype html>
      <html>
      <head>
        <title>Bank Statements</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 16px; font-size: 10px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #d5d7dd; padding: 6px; text-align: left; }
          th { background: #f3f4f6; font-weight: bold; }
          td:nth-child(4) { max-width: 60px; overflow: hidden; text-overflow: ellipsis; }
          td:nth-child(5), td:nth-child(6) { white-space: nowrap; }
        </style>
      </head>
      <body>
        <h2>Bank Statements</h2>
        <table>
          <thead>
            <tr>
              <th>Bank</th>
              <th>Entry No</th>
              <th>Type</th>
              <th>REF</th>
              <th>Slip No</th>
              <th>Date</th>
              <th>Cash Before</th>
              <th>Amount</th>
              <th>Cash After</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </body>
      </html>`;

    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  };

  const hasFilters = Boolean(bankFilter);

  return (
    <div className="space-y-6">
      <SectionCard
        title="Bank Statements"
        description="View bank statements showing deposits and drawings recorded against bank accounts."
        actions={
          <div className="flex flex-wrap gap-2">
            <button type="button" className="secondary text-xs px-3 py-1" onClick={printTable}>
              Print
            </button>
            <button type="button" className="secondary text-xs px-3 py-1" onClick={exportCsv}>
              Export CSV
            </button>
            {hasFilters ? (
              <button
                type="button"
                className="secondary text-xs px-3 py-1"
                onClick={() => setBankFilter("")}
              >
                Clear Filter
              </button>
            ) : null}
            {error ? (
              <button type="button" className="secondary text-xs px-3 py-1" onClick={() => refetch()}>
                Retry
              </button>
            ) : null}
          </div>
        }
      >
        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-white text-sm text-rose-700 px-4 py-3 shadow-[0_8px_20px_rgba(244,63,94,0.08)]">
            Unable to load bank statements.
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-3">
          <label className="text-sm text-slate-600 font-semibold">
            <span className="block mb-1">Bank</span>
            <select
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              value={bankFilter}
              onChange={(event) => setBankFilter(event.target.value)}
            >
              <option value="">All Banks</option>
              {bankOptions.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
          <table className="min-w-full divide-y divide-slate-200 text-sm text-slate-700">
            <thead className="bg-slate-100/80 text-slate-500 uppercase tracking-wide text-xs">
              <tr>
                <th className="px-5 py-3 text-left whitespace-nowrap">Bank</th>
                <th className="px-5 py-3 text-left whitespace-nowrap">Entry No.</th>
                <th className="px-5 py-3 text-left whitespace-nowrap">Type</th>
                <th className="px-5 py-3 text-left whitespace-nowrap">REF</th>
                <th className="px-5 py-3 text-left whitespace-nowrap">Slip No.</th>
                <th className="px-5 py-3 text-left whitespace-nowrap">Date</th>
                <th className="px-5 py-3 text-right whitespace-nowrap">Cash Before</th>
                <th className="px-5 py-3 text-right whitespace-nowrap">Amount</th>
                <th className="px-5 py-3 text-right whitespace-nowrap">Cash After</th>
                <th className="px-5 py-3 text-left whitespace-nowrap">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-5 py-6 text-center text-slate-500">
                    Loading deposits…
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-6 text-center text-slate-500">
                    {hasFilters ? "No statements match the selected bank." : "No bank statements recorded yet."}
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.id} className="even:bg-slate-50/60 hover:bg-slate-100/60 transition">
                    <td className="px-5 py-4 align-middle">
                      <div className="font-semibold text-slate-800 text-xs">
                        {row.bank_name || row.bank_code || "Unspecified"}
                      </div>
                      <div className="text-[10px] text-slate-500">{row.bank_code || "-"}</div>
                    </td>
                    <td className="px-5 py-4 align-middle text-slate-600 whitespace-nowrap">{row.entry_no || "-"}</td>
                    <td className="px-5 py-4 align-middle text-slate-600 whitespace-nowrap">
                      {row.transaction_type === "drawing" ? "DRW" : "DEPO"}
                    </td>
                    <td className="px-5 py-4 align-middle text-slate-600 whitespace-nowrap">
                      {row.customer_receipt_no ? `Receipt ${row.customer_receipt_no}` : "Manual Entry"}
                    </td>
                    <td className="px-5 py-4 align-middle text-slate-600 whitespace-nowrap">{row.slip_no || "-"}</td>
                    <td className="px-5 py-4 align-middle text-slate-600 whitespace-nowrap">{row.transaction_date || row.slip_date || "-"}</td>
                    <td className="px-5 py-4 align-middle text-right text-slate-700 whitespace-nowrap">
                      {formatCurrency(balancesById[row.id]?.before ?? 0)}
                    </td>
                    <td className="px-5 py-4 align-middle text-right font-semibold text-slate-900 whitespace-nowrap">
                      {formatCurrency(row.cash_amount)}
                    </td>
                    <td className="px-5 py-4 align-middle text-right font-semibold text-slate-900 whitespace-nowrap">
                      {formatCurrency(balancesById[row.id]?.after ?? (Number(row.cash_amount || 0)))}
                    </td>
                    <td className="px-5 py-4 align-middle text-slate-500 text-xs">
                      {row.created_at ? new Date(row.created_at).toLocaleString() : "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot className="bg-slate-100/70 text-slate-600 text-sm">
              <tr>
                <td className="px-5 py-3" colSpan={6}>
                  Total Amount
                </td>
                <td className="px-5 py-3 text-right font-semibold text-slate-900">
                  {formatCurrency(totalAmount)}
                </td>
                <td className="px-5 py-3" />
              </tr>
              <tr>
                <td className="px-5 py-3" colSpan={6}>
                  Cash in Bank
                </td>
                <td className="px-5 py-3 text-right font-semibold text-slate-900">
                  {formatCurrency(cashInBank)}
                </td>
                <td className="px-5 py-3" />
              </tr>
            </tfoot>
          </table>
        </div>
      </SectionCard>
    </div>
  );
};

export default BankDepositReportPage;
