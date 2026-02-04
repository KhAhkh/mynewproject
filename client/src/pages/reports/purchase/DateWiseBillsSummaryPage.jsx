import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FiPrinter, FiDownload } from "react-icons/fi";
import SectionCard from "../../../components/SectionCard.jsx";
import FormField from "../../../components/FormField.jsx";
import { api } from "../../../api/client.js";
import { normalizeDateInput, toDisplay } from "../../../utils/date.js";

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

const DateWiseBillsSummaryPage = () => {
  const [filters, setFilters] = useState(defaultFilters);

  const reportQuery = useQuery({
    queryKey: ["purchase/date-wise-bills-summary", filters],
    queryFn: async ({ queryKey }) => {
      const [, params] = queryKey;
      const response = await api.get("/reports/purchase/date-wise-bills-summary", {
        params: {
          startDate: params.startDate || undefined,
          endDate: params.endDate || undefined
        }
      });
      return response.data;
    }
  });

  const items = useMemo(() => {
    return reportQuery.data?.rows ?? [];
  }, [reportQuery.data?.rows]);

  const totals = useMemo(() => {
    return reportQuery.data?.totals ?? { billCount: 0, totalAmount: 0 };
  }, [reportQuery.data?.totals]);

  const exportCsv = () => {
    if (items.length === 0) return;
    const csvRows = [
      ["Sr.#", "INV.#", "DATE", "SUPPLIER NAME", "AMOUNT"]
    ];
    items.forEach((row, index) => {
      csvRows.push([
        index + 1,
        row.invoice_no || "",
        row.invoice_date || "",
        row.supplier_name || "",
        Number(row.total_amount || 0).toFixed(2)
      ]);
    });
    csvRows.push(["", "", "", "TOTAL", Number(totals.totalAmount).toFixed(2)]);

    const csv = csvRows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "date-wise-bills-summary.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const printReport = () => {
    const htmlContent = generatePrintHTML();
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(htmlContent);
    w.document.close();
    setTimeout(() => {
      w.print();
    }, 250);
  };

  const generatePrintHTML = () => {
    let html = `<!doctype html>
      <html>
      <head>
        <title>Date Wise Purchase Summary</title>
        <style>
          @page { size: A4 landscape; margin: 12mm; }
          body { font-family: 'Courier New', monospace; padding: 15px; color: #0f172a; font-size: 11px; }
          h1 { text-align: center; font-size: 16px; margin-bottom: 3px; text-transform: uppercase; font-weight: bold; letter-spacing: 1px; }
          h2 { text-align: center; font-size: 10px; color: #64748b; margin-bottom: 15px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 15px; font-family: 'Courier New', monospace; }
          th, td { border: 1px solid #000; padding: 6px 8px; text-align: left; }
          th { background: #e2e8f0; font-weight: bold; text-transform: uppercase; font-size: 10px; }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          tfoot td { font-weight: bold; background: #f1f5f9; border-top: 2px solid #000; border-bottom: 2px solid #000; }
          .info { text-align: center; margin-top: 15px; font-size: 9px; color: #64748b; }
        </style>
      </head>
      <body>
        <h1>Date Wise Purchase Summary</h1>
        <h2>From ${filters.startDate} To ${filters.endDate}</h2>
        <table>
          <thead>
            <tr>
              <th style="width: 8%; text-align: center;">S. #</th>
              <th style="width: 12%; text-align: center;">INV. #</th>
              <th style="width: 15%; text-align: center;">DATE</th>
              <th style="width: 50%;">SUPPLIER NAME</th>
              <th style="width: 15%; text-align: right;">AMOUNT</th>
            </tr>
          </thead>
          <tbody>`;

    items.forEach((row, index) => {
      html += `
            <tr>
              <td style="text-align: center;">${index + 1}</td>
              <td style="text-align: center;">${row.invoice_no || ""}</td>
              <td style="text-align: center;">${row.invoice_date || ""}</td>
              <td>${row.supplier_name || ""}</td>
              <td style="text-align: right;">${Number(row.total_amount || 0).toFixed(2)}</td>
            </tr>`;
    });

    html += `
          </tbody>
          <tfoot>
            <tr>
              <td colspan="4" style="text-align: right;">TOTAL</td>
              <td style="text-align: right;">${Number(totals.totalAmount).toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
        <div class="info">
          Generated on ${new Date().toLocaleString()}
        </div>
      </body>
      </html>`;

    return html;
  };

  return (
    <SectionCard
      title="Date Wise Bills Summary"
      description="View all purchase bills grouped by date with supplier and amount details."
      actions={
        <div className="flex items-center gap-3 text-xs text-slate-500">
          {reportQuery.isFetching ? <span>Loading…</span> : null}
          <button
            type="button"
            onClick={() => reportQuery.refetch()}
            className="underline hover:text-slate-700"
            disabled={reportQuery.isFetching}
          >
            Refresh
          </button>
          {reportQuery.error ? (
            <button type="button" className="underline" onClick={() => reportQuery.refetch()}>
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
            disabled={reportQuery.isFetching || items.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-lg font-medium transition-colors"
          >
            <FiPrinter className="text-lg" />
            Print
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={reportQuery.isFetching || items.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-lg font-medium transition-colors"
          >
            <FiDownload className="text-lg" />
            Export CSV
          </button>
        </div>

        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex-1 min-w-[140px]">
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
          </div>
          <div className="flex-1 min-w-[140px]">
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
          </div>
          <button
            type="button"
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-medium transition-colors whitespace-nowrap"
            onClick={() => setFilters(defaultFilters())}
          >
            Reset
          </button>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-4 text-sm text-slate-600">
          <div className="px-3 py-1 rounded-full bg-slate-100 text-slate-700">
            Bills: <span className="font-semibold">{totals.billCount}</span>
          </div>
          <div className="px-3 py-1 rounded-full bg-slate-100 text-slate-700">
            Total Amount: <span className="font-semibold">{formatCurrency(totals.totalAmount)}</span>
          </div>
        </div>

        <div className="space-y-6">
          {reportQuery.isFetching ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center text-slate-500">
              Loading details…
            </div>
          ) : reportQuery.error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center text-red-600">
              <div className="font-semibold">Error loading report</div>
              <div className="text-sm">{reportQuery.error.message}</div>
            </div>
          ) : items.length ? (
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <table className="min-w-full divide-y divide-slate-200 text-sm text-slate-700">
                <thead className="bg-slate-100 text-slate-600 uppercase tracking-wide text-xs font-semibold">
                  <tr>
                    <th className="px-4 py-3 text-center w-12">Sr.#</th>
                    <th className="px-4 py-3 text-center w-20">INV.#</th>
                    <th className="px-4 py-3 text-center w-24">DATE</th>
                    <th className="px-4 py-3 text-left">SUPPLIER NAME</th>
                    <th className="px-4 py-3 text-right w-32">AMOUNT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((row, index) => (
                    <tr key={`${row.invoice_no}-${index}`} className="even:bg-slate-50/60 hover:bg-slate-100/60 transition">
                      <td className="px-4 py-3 text-center font-medium text-slate-700">{index + 1}</td>
                      <td className="px-4 py-3 text-center font-medium text-slate-700">{row.invoice_no || "-"}</td>
                      <td className="px-4 py-3 text-center align-middle text-slate-700 whitespace-nowrap">{row.invoice_date || "-"}</td>
                      <td className="px-4 py-3 align-middle text-slate-700">{row.supplier_name || "-"}</td>
                      <td className="px-4 py-3 text-right align-middle font-semibold text-slate-900">
                        {formatCurrency(row.total_amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-100 text-slate-800 font-semibold text-sm">
                  <tr>
                    <td className="px-4 py-3" colSpan="4" style={{ textAlign: "right" }}>TOTAL</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(totals.totalAmount)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center text-slate-500">
              No bills found for the selected date range.
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  );
};

export default DateWiseBillsSummaryPage;
