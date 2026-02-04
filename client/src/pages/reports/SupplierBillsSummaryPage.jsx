import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FiPrinter, FiDownload } from "react-icons/fi";
import SectionCard from "../../components/SectionCard.jsx";
import FormField from "../../components/FormField.jsx";
import SearchSelect from "../../components/SearchSelect.jsx";
import { api } from "../../api/client.js";
import { normalizeDateInput, toDisplay } from "../../utils/date.js";

const defaultFilters = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    supplierCode: "",
    supplierLabel: "",
    startDate: toDisplay(start),
    endDate: toDisplay(now)
  };
};

const formatCurrency = (value) =>
  `Rs ${Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const SupplierBillsSummaryPage = () => {
  const [filters, setFilters] = useState(defaultFilters);
  const [supplierSearch, setSupplierSearch] = useState("");

  const supplierLookup = useQuery({
    queryKey: ["supplier-bills-suppliers", supplierSearch],
    queryFn: async () => {
      const response = await api.get("/suppliers", { params: { search: supplierSearch } });
      return response.data || [];
    }
  });

  const supplierOptions = useMemo(() => {
    return (
      supplierLookup.data?.map((s) => ({
        value: s.id,
        code: s.code,
        label: `${s.code} — ${s.name}`
      })) ?? []
    );
  }, [supplierLookup.data]);

  // Load all suppliers data by default
  const reportQuery = useQuery({
    queryKey: ["purchase/supplier-bills-summary", filters],
    queryFn: async ({ queryKey }) => {
      const [, params] = queryKey;
      const response = await api.get("/reports/purchase/all-supplier-bills-summary", {
        params: {
          supplierCode: params.supplierCode || undefined,
          startDate: params.startDate || undefined,
          endDate: params.endDate || undefined
        }
      });
      return response.data;
    }
  });


  const exportCsv = () => {
    if (!reportQuery.data?.suppliers || reportQuery.data.suppliers.length === 0) return;
    
    const rows = [
      ["SUPPLIER WISE BILLS SUMMARY"],
      ["From", filters.startDate, "To", filters.endDate],
      []
    ];

    reportQuery.data.suppliers.forEach((supplier) => {
      rows.push([supplier.name, "", "", ""]);
      rows.push(["Sr. No.", "Date", "Invoice No", "Amount (Total)"]);
      
      supplier.invoices.forEach((row, index) => {
        rows.push([
          index + 1,
          row.invoice_date || "",
          row.invoice_no || "",
          Number(row.total_amount || 0).toFixed(2)
        ]);
      });
      
      rows.push(["", "", "TOTAL", Number(supplier.totalAmount || 0).toFixed(2)]);
      rows.push([]);
    });

    const csv = rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "supplier-bills-summary.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const printReport = () => {
    const suppliers = reportQuery.data?.suppliers || [];
    
    let html = `<!doctype html>
      <html>
      <head>
        <title>Supplier Wise Bills Summary</title>
        <style>
          @page { size: A4 portrait; margin: 16mm; }
          body { font-family: Arial, sans-serif; padding: 20px; color: #0f172a; }
          h1 { text-align: center; font-size: 24px; margin-bottom: 10px; text-transform: uppercase; }
          h2 { text-align: center; font-size: 14px; color: #64748b; margin-bottom: 5px; }
          h3 { font-size: 14px; margin-top: 20px; margin-bottom: 10px; color: #1e293b; font-weight: bold; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
          th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: left; }
          th { background: #e2e8f0; font-weight: bold; text-transform: uppercase; font-size: 12px; }
          td { font-size: 13px; }
          .text-right { text-align: right; }
          tfoot td { font-weight: bold; background: #f1f5f9; }
        </style>
      </head>
      <body>
        <h1>Supplier Wise Bills Summary</h1>
        <h2>From ${filters.startDate} To ${filters.endDate}</h2>`;

    suppliers.forEach((supplier) => {
      html += `
        <h3>${supplier.name}</h3>
        <table>
          <thead>
            <tr>
              <th>Sr. No.</th>
              <th>Date</th>
              <th>Invoice No</th>
              <th class="text-right">Amount (Total)</th>
            </tr>
          </thead>
          <tbody>`;

      supplier.invoices.forEach((row, index) => {
        html += `
            <tr>
              <td>${index + 1}</td>
              <td>${row.invoice_date || ""}</td>
              <td>${row.invoice_no || ""}</td>
              <td class="text-right">${formatCurrency(row.total_amount)}</td>
            </tr>`;
      });

      html += `
          </tbody>
          <tfoot>
            <tr>
              <td colspan="3">SUBTOTAL</td>
              <td class="text-right">${formatCurrency(supplier.totalAmount)}</td>
            </tr>
          </tfoot>
        </table>`;
    });

    html += `
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

  const suppliers = reportQuery.data?.suppliers ?? [];
  const grandTotal = reportQuery.data?.totals?.grandTotal ?? 0;

  return (
    <SectionCard
      title="Supplier Wise Bills Summary"
      description="View all suppliers' purchase invoices with optional filters."
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
            disabled={reportQuery.isFetching || suppliers.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-lg font-medium transition-colors"
          >
            <FiPrinter className="text-lg" />
            Print
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={reportQuery.isFetching || suppliers.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-lg font-medium transition-colors"
          >
            <FiDownload className="text-lg" />
            Export CSV
          </button>
        </div>
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <SearchSelect
              label="Filter by Supplier (Optional)"
              placeholder="Search supplier to filter"
              value={
                filters.supplierCode
                  ? { value: filters.supplierCode, label: filters.supplierLabel || filters.supplierCode }
                  : null
              }
              onSelect={(option) => {
                setFilters((prev) => ({
                  ...prev,
                  supplierCode: option?.code || "",
                  supplierLabel: option?.label || ""
                }));
              }}
              onSearch={setSupplierSearch}
              results={supplierOptions}
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
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-4 text-sm text-slate-600">
        <div className="px-3 py-1 rounded-full bg-slate-100 text-slate-700">
          Suppliers: <span className="font-semibold">{suppliers.length}</span>
        </div>
        <div className="px-3 py-1 rounded-full bg-slate-100 text-slate-700">
          Total Invoices: <span className="font-semibold">{suppliers.reduce((sum, s) => sum + s.invoices.length, 0)}</span>
        </div>
        <div className="px-3 py-1 rounded-full bg-slate-100 text-slate-700">
          Grand Total: <span className="font-semibold">{formatCurrency(grandTotal)}</span>
        </div>
      </div>

      <div className="space-y-8">
        {reportQuery.isFetching ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center text-slate-500">
            Loading supplier bills…
          </div>
        ) : reportQuery.error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center text-red-600">
            <div className="font-semibold">Error loading report</div>
            <div className="text-sm">{reportQuery.error.message}</div>
          </div>
        ) : suppliers.length ? (
          suppliers.map((supplier, supplierIndex) => (
            <div key={supplier.supplierId || supplierIndex} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <div className="bg-slate-50 px-5 py-3 border-b border-slate-200">
                <h3 className="text-lg font-semibold text-slate-800">{supplier.name}</h3>
                <div className="flex gap-4 mt-2 text-sm text-slate-600">
                  <div>Code: <span className="font-medium text-slate-800">{supplier.code || "-"}</span></div>
                  <div>Invoices: <span className="font-medium text-slate-800">{supplier.invoices.length}</span></div>
                  <div>Amount: <span className="font-medium text-slate-800">{formatCurrency(supplier.totalAmount)}</span></div>
                </div>
              </div>
              <table className="min-w-full divide-y divide-slate-200 text-sm text-slate-700">
                <thead className="bg-slate-100 text-slate-500 uppercase tracking-wide text-xs">
                  <tr>
                    <th className="px-5 py-3 text-left w-12">Sr. No.</th>
                    <th className="px-5 py-3 text-left">Date</th>
                    <th className="px-5 py-3 text-left">Invoice No</th>
                    <th className="px-5 py-3 text-right">Amount (Total)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {supplier.invoices.length ? (
                    supplier.invoices.map((row, index) => (
                      <tr key={`${row.invoice_no || index}-${row.invoice_date || index}`} className="even:bg-slate-50/60 hover:bg-slate-100/60 transition">
                        <td className="px-5 py-3 align-middle font-semibold text-slate-800">{index + 1}</td>
                        <td className="px-5 py-3 align-middle text-slate-700">{row.invoice_date || "-"}</td>
                        <td className="px-5 py-3 align-middle text-slate-700">{row.invoice_no || "-"}</td>
                        <td className="px-5 py-3 align-middle text-right font-semibold text-slate-900">{formatCurrency(row.total_amount)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-5 py-6 text-center text-slate-500">
                        No invoices found for this supplier in the selected range.
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot className="bg-slate-100 text-slate-600 text-sm">
                  <tr>
                    <td className="px-5 py-3" colSpan={3}>Subtotal</td>
                    <td className="px-5 py-3 text-right font-bold text-slate-900">{formatCurrency(supplier.totalAmount)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ))
        ) : (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center text-slate-500">
            No suppliers or invoices found.
          </div>
        )}
      </div>
    </SectionCard>
  );
};

export default SupplierBillsSummaryPage;
