import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FiPrinter, FiDownload } from "react-icons/fi";
import SectionCard from "../../../components/SectionCard.jsx";
import FormField from "../../../components/FormField.jsx";
import SearchSelect from "../../../components/SearchSelect.jsx";
import { api } from "../../../api/client.js";
import { normalizeDateInput, toDisplay } from "../../../utils/date.js";

const defaultFilters = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    companyId: "",
    companyLabel: "",
    startDate: toDisplay(start),
    endDate: toDisplay(now)
  };
};

const formatCurrency = (value) =>
  `Rs ${Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const formatQty = (value) =>
  `${Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const CompanyWiseItemSalesSummaryPage = () => {
  const [filters, setFilters] = useState(defaultFilters);
  const [companySearch, setCompanySearch] = useState("");

  const companyLookup = useQuery({
    queryKey: ["company-wise-item-sales-companies", companySearch],
    queryFn: async () => {
      const response = await api.get("/companies", { params: { search: companySearch } });
      return response.data || [];
    }
  });

  const companyOptions = useMemo(() => {
    return (
      companyLookup.data?.map((c) => ({
        value: c.id,
        label: c.name,
      })) ?? []
    );
  }, [companyLookup.data]);

  const reportQuery = useQuery({
    queryKey: ["sales/company-wise-item-summary", filters],
    enabled: Boolean(filters.companyId),
    queryFn: async ({ queryKey }) => {
      const [, params] = queryKey;
      const response = await api.get("/reports/sales/company-wise-item-summary", {
        params: {
          companyId: params.companyId,
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

  const company = reportQuery.data?.company;
  const totals = useMemo(() => {
    return {
      totalQty: items.reduce((sum, row) => sum + Number(row.total_qty || 0), 0),
      totalAmount: items.reduce((sum, row) => sum + Number(row.total_amount || 0), 0),
      itemCount: items.length
    };
  }, [items]);

  const exportCsv = () => {
    if (items.length === 0) return;
    const csvRows = [
      ["Sr.#", "Item Name", "QTY.", "AMOUNT"]
    ];
    items.forEach((row, index) => {
      csvRows.push([
        index + 1,
        row.item_name || "",
        Number(row.total_qty || 0).toFixed(2),
        Number(row.total_amount || 0).toFixed(2)
      ]);
    });
    csvRows.push(["", "", "", ""]);
    csvRows.push(["TOTAL", "", Number(totals.totalQty).toFixed(2), Number(totals.totalAmount).toFixed(2)]);

    const csv = csvRows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `company-item-summary-${company?.name || "export"}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const printReport = () => {
    let html = `<!doctype html>
      <html>
      <head>
        <title>Company Wise Item Summary</title>
        <style>
          @page { size: A4; margin: 12mm; }
          body { font-family: 'Courier New', monospace; padding: 15px; color: #0f172a; font-size: 12px; }
          h1 { text-align: center; font-size: 14px; margin-bottom: 5px; text-transform: uppercase; font-weight: bold; }
          h2 { text-align: center; font-size: 11px; color: #64748b; margin-bottom: 15px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 11px; font-family: 'Courier New', monospace; }
          th, td { border: 1px solid #000; padding: 6px 8px; text-align: left; }
          th { background: #e2e8f0; font-weight: bold; text-transform: uppercase; font-size: 10px; }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          tfoot td { font-weight: bold; background: #f1f5f9; }
          .divider { border-top: 2px solid #000; margin: 5px 0; }
          .info { text-align: center; margin-top: 20px; font-size: 10px; color: #64748b; }
        </style>
      </head>
      <body>
        <h1>Company Wise Item Summary</h1>
        <h2>Company Name: ${company?.name || ""}</h2>
        <h2>From ${filters.startDate} To ${filters.endDate}</h2>
        <table>
          <thead>
            <tr>
              <th style="width: 10%;">Sr.#</th>
              <th style="width: 60%;">Item Name</th>
              <th style="width: 15%; text-align: right;">QTY.</th>
              <th style="width: 15%; text-align: right;">AMOUNT</th>
            </tr>
          </thead>
          <tbody>`;

    items.forEach((row, index) => {
      html += `
            <tr>
              <td style="text-align: center;">${index + 1}</td>
              <td>${row.item_name || ""}</td>
              <td class="text-right">${Number(row.total_qty || 0).toFixed(2)}</td>
              <td class="text-right">${Number(row.total_amount || 0).toFixed(2)}</td>
            </tr>`;
    });

    html += `
          </tbody>
          <tfoot>
            <tr>
              <td colspan="2" style="border: 2px solid #000;">TOTAL</td>
              <td class="text-right" style="border: 2px solid #000;">${Number(totals.totalQty).toFixed(2)}</td>
              <td class="text-right" style="border: 2px solid #000;">${Number(totals.totalAmount).toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
        <div class="info">
          Generated on ${new Date().toLocaleString()}
        </div>
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

  return (
    <SectionCard
      title="Company Wise Item Summary"
      description="Select a company and date range to view summary of items sold from that company."
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
          <div className="flex-1 min-w-[200px]">
            <SearchSelect
              label="Company"
              placeholder="Search company"
              value={
                filters.companyId
                  ? { value: filters.companyId, label: filters.companyLabel || filters.companyId }
                  : null
              }
              onSelect={(option) => {
                setFilters((prev) => ({
                  ...prev,
                  companyId: option?.value || "",
                  companyLabel: option?.label || ""
                }));
              }}
              onSearch={setCompanySearch}
              results={companyOptions}
              required
            />
          </div>
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
          <div>
            <span className="font-semibold text-slate-800">Company:</span> {company?.name ? `${company.name}` : "Select a company"}
          </div>
          <div className="px-3 py-1 rounded-full bg-slate-100 text-slate-700">
            Total Qty: <span className="font-semibold">{formatQty(totals.totalQty)}</span>
          </div>
          <div className="px-3 py-1 rounded-full bg-slate-100 text-slate-700">
            Total Amount: <span className="font-semibold">{formatCurrency(totals.totalAmount)}</span>
          </div>
          <div className="px-3 py-1 rounded-full bg-slate-100 text-slate-700">
            Items: <span className="font-semibold">{totals.itemCount}</span>
          </div>
        </div>

        <div className="space-y-6">
          {!filters.companyId ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center text-slate-500">
              Select a company to view sales summary.
            </div>
          ) : reportQuery.isFetching ? (
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
                    <th className="px-4 py-3 text-left">Item Name</th>
                    <th className="px-4 py-3 text-right w-24">QTY.</th>
                    <th className="px-4 py-3 text-right w-32">AMOUNT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((row, index) => (
                    <tr key={row.item_code} className="even:bg-slate-50/60 hover:bg-slate-100/60 transition">
                      <td className="px-4 py-3 text-center font-medium text-slate-700">{index + 1}</td>
                      <td className="px-4 py-3 align-middle text-slate-700">{row.item_name || "-"}</td>
                      <td className="px-4 py-3 text-right align-middle text-slate-900">
                        {Number(row.total_qty || 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right align-middle font-semibold text-slate-900">
                        {formatCurrency(row.total_amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-100 text-slate-800 font-semibold text-sm">
                  <tr>
                    <td className="px-4 py-3" colSpan={2}>TOTAL</td>
                    <td className="px-4 py-3 text-right">{Number(totals.totalQty).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(totals.totalAmount)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center text-slate-500">
              No sales found for the selected range.
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  );
};

export default CompanyWiseItemSalesSummaryPage;
