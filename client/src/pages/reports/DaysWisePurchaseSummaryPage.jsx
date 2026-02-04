import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FiPrinter, FiDownload } from "react-icons/fi";
import SectionCard from "../../components/SectionCard.jsx";
import FormField from "../../components/FormField.jsx";
import { api } from "../../api/client.js";
import { normalizeDateInput, toDisplay } from "../../utils/date.js";

const defaultFilters = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    startDate: toDisplay(start),
    endDate: toDisplay(now)
  };
};

const formatCurrency = (value) =>
  `Rs ${Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const DaysWisePurchaseSummaryPage = () => {
  const [filters, setFilters] = useState(defaultFilters);

  const query = useQuery({
    queryKey: ["purchase/days-wise-summary", filters],
    queryFn: async ({ queryKey }) => {
      const [, params] = queryKey;
      const response = await api.get("/reports/purchase/days-wise-summary", {
        params: {
          startDate: params.startDate || undefined,
          endDate: params.endDate || undefined
        }
      });
      return response.data;
    }
  });

  const rows = query.data?.rows ?? [];
  const totals = query.data?.totals ?? { invoiceCount: 0, totalAmount: 0 };

  const exportCsv = () => {
    if (rows.length === 0) return;
    const csvRows = [
      ["Sr. No.", "Date", "Total Amount"]
    ];
    rows.forEach((row, index) => {
      csvRows.push([
        index + 1,
        row.invoice_date || "",
        Number(row.total_amount || 0).toFixed(2)
      ]);
    });
    csvRows.push(["", "TOTAL", Number(totals.totalAmount).toFixed(2)]);

    const csv = csvRows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "days-wise-purchase-summary.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const printReport = () => {
    let html = `<!doctype html>
      <html>
      <head>
        <title>Days Wise Purchase Summary</title>
        <style>
          @page { size: A4 portrait; margin: 16mm; }
          body { font-family: Arial, sans-serif; padding: 20px; color: #0f172a; }
          h1 { text-align: center; font-size: 24px; margin-bottom: 20px; text-transform: uppercase; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: left; }
          th { background: #e2e8f0; font-weight: bold; text-transform: uppercase; font-size: 12px; }
          td { font-size: 13px; }
          .text-right { text-align: right; }
          tfoot td { font-weight: bold; background: #f1f5f9; }
        </style>
      </head>
      <body>
        <h1>Days Wise Purchase Summary</h1>
        <table>
          <thead>
            <tr>
              <th>Sr. No.</th>
              <th>Date</th>
              <th class="text-right">Total Amount</th>
            </tr>
          </thead>
          <tbody>`;

    rows.forEach((row, index) => {
      html += `
            <tr>
              <td>${index + 1}</td>
              <td>${row.invoice_date || ""}</td>
              <td class="text-right">${formatCurrency(row.total_amount)}</td>
            </tr>`;
    });

    html += `
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td></td>
              <td class="text-right">${formatCurrency(totals.totalAmount)}</td>
            </tr>
          </tfoot>
        </table>
        <p style="text-align: center; color: #64748b; font-size: 12px; margin-top: 20px;">
          Generated on ${new Date().toLocaleString()}
        </p>
      </body>
      </html>`;

    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    setTimeout(() => {
      w.print();
    }, 250);
  };

  const subtitle = useMemo(() => {
    const start = filters.startDate || "";
    const end = filters.endDate || "";
    if (!start && !end) return "All dates";
    if (start && end) return `${start} to ${end}`;
    if (start) return `From ${start}`;
    return `Up to ${end}`;
  }, [filters.startDate, filters.endDate]);

  return (
    <SectionCard
      title="Days Wise Purchase Summary"
      description="View total purchase amount grouped by invoice date."
      actions={
        <div className="flex items-center gap-3 text-xs text-slate-500">
          {query.isFetching ? <span>Loading…</span> : null}
          <button
            type="button"
            onClick={() => query.refetch()}
            className="underline hover:text-slate-700"
            disabled={query.isFetching}
          >
            Refresh
          </button>
          {query.error ? (
            <button type="button" className="underline" onClick={() => query.refetch()}>
              Retry
            </button>
          ) : null}
        </div>
      }
    >
      <div className="space-y-6">
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={printReport}
            disabled={query.isFetching || rows.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-lg font-medium transition-colors"
          >
            <FiPrinter className="text-lg" />
            Print
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={query.isFetching || rows.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-lg font-medium transition-colors"
          >
            <FiDownload className="text-lg" />
            Export CSV
          </button>
        </div>
        <div className="grid md:grid-cols-3 gap-4 mb-6">
          <FormField label="Start Date">
            <input
              type="text"
              value={filters.startDate}
              onChange={(event) => {
                const value = normalizeDateInput(event.target.value);
                setFilters((prev) => ({ ...prev, startDate: value }));
              }}
              placeholder="DD-MM-YYYY"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </FormField>
          <FormField label="End Date">
            <input
              type="text"
              value={filters.endDate}
              onChange={(event) => {
                const value = normalizeDateInput(event.target.value);
                setFilters((prev) => ({ ...prev, endDate: value }));
              }}
              placeholder="DD-MM-YYYY"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </FormField>
          <div className="flex items-end gap-2">
            <button
              type="button"
              className="px-4 py-2 w-full bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-medium transition-colors"
              onClick={() => setFilters(defaultFilters())}
            >
              Reset
            </button>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3 text-sm text-slate-600">
          <div className="px-3 py-1 rounded-full bg-slate-100 text-slate-700">Range: {subtitle}</div>
          <div className="px-3 py-1 rounded-full bg-slate-100 text-slate-700">
            Total Amount: <span className="font-semibold">{formatCurrency(totals.totalAmount)}</span>
          </div>
          <div className="px-3 py-1 rounded-full bg-slate-100 text-slate-700">
            Invoices: <span className="font-semibold">{totals.invoiceCount}</span>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm text-slate-700">
          <thead className="bg-slate-100 text-slate-500 uppercase tracking-wide text-xs">
            <tr>
              <th className="px-5 py-3 text-left">Sr. No.</th>
              <th className="px-5 py-3 text-left">Date</th>
              <th className="px-5 py-3 text-right">Total Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {query.isFetching ? (
              <tr>
                <td colSpan={3} className="px-5 py-6 text-center text-slate-500">Loading summary…</td>
              </tr>
            ) : rows.length ? (
              rows.map((row, index) => (
                <tr key={`${row.invoice_date || index}`} className="even:bg-slate-50/60 hover:bg-slate-100/60 transition">
                  <td className="px-5 py-3 align-middle font-semibold text-slate-800">{index + 1}</td>
                  <td className="px-5 py-3 align-middle text-slate-700">{row.invoice_date || "-"}</td>
                  <td className="px-5 py-3 align-middle text-right font-semibold text-slate-900">{formatCurrency(row.total_amount)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={3} className="px-5 py-6 text-center text-slate-500">No purchases found for the selected range.</td>
              </tr>
            )}
          </tbody>
          {rows.length ? (
            <tfoot className="bg-slate-100 text-slate-600 text-sm">
              <tr>
                <td className="px-5 py-3" colSpan={2}>Total</td>
                <td className="px-5 py-3 text-right font-bold text-slate-900">{formatCurrency(totals.totalAmount)}</td>
              </tr>
            </tfoot>
          ) : null}
        </table>
        </div>
      </div>
    </SectionCard>
  );
};

export default DaysWisePurchaseSummaryPage;
