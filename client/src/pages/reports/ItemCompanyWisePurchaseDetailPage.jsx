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

const formatQty = (value, unit = "") =>
  `${Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${unit}`;

const ItemCompanyWisePurchaseDetailPage = () => {
  const [filters, setFilters] = useState(defaultFilters);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [companySearch, setCompanySearch] = useState("");

  const supplierLookup = useQuery({
    queryKey: ["company-wise-suppliers", supplierSearch],
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
        label: `${s.code} — ${s.name}`,
      })) ?? []
    );
  }, [supplierLookup.data]);

  const companyLookup = useQuery({
    queryKey: ["company-wise-companies", companySearch],
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
    queryKey: ["purchase/company-wise-detail", filters],
    enabled: Boolean(filters.supplierCode),
    queryFn: async ({ queryKey }) => {
      const [, params] = queryKey;
      const response = await api.get("/reports/purchase/company-wise-detail", {
        params: {
          supplierCode: params.supplierCode,
          companyId: params.companyId || undefined,
          startDate: params.startDate || undefined,
          endDate: params.endDate || undefined
        }
      });
      return response.data;
    }
  });

  const groupedData = useMemo(() => {
    const rows = reportQuery.data?.rows ?? [];
    const grouped = {};
    rows.forEach((row) => {
      const itemCode = row.item_code || "Unknown";
      if (!grouped[itemCode]) {
        grouped[itemCode] = {
          item_code: itemCode,
          item_name: row.item_name,
          base_unit: row.base_unit,
          items: [],
          totalQty: 0,
          totalValue: 0
        };
      }
      grouped[itemCode].items.push(row);
      grouped[itemCode].totalQty += Number(row.quantity || 0);
      grouped[itemCode].totalValue += Number(row.net_amount || 0);
    });
    return Object.values(grouped);
  }, [reportQuery.data?.rows]);

  const supplier = reportQuery.data?.supplier;
  const totals = useMemo(() => {
    return {
      totalQty: groupedData.reduce((sum, g) => sum + g.totalQty, 0),
      totalValue: groupedData.reduce((sum, g) => sum + g.totalValue, 0),
      itemCount: groupedData.length
    };
  }, [groupedData]);

  const exportCsv = () => {
    if (groupedData.length === 0) return;
    const csvRows = [
      ["Item", "Invoice", "Date", "Rate", "Qty", "Bonus", "Dis%", "Tax", "Value"]
    ];
    groupedData.forEach((group) => {
      let isFirstRow = true;
      group.items.forEach((row, index) => {
        csvRows.push([
          isFirstRow ? group.item_code : "",
          row.invoice_no || "",
          row.invoice_date || "",
          Number(row.purchase_rate || 0).toFixed(2),
          Number(row.quantity || 0).toFixed(2),
          Number(row.bonus || 0) > 0 ? Number(row.bonus).toFixed(2) : "",
          Number(row.discount_percent || 0) > 0 ? Number(row.discount_percent).toFixed(2) : "",
          row.tax_percent ? Number(row.tax_percent).toFixed(2) : "",
          Number(row.net_amount || 0).toFixed(2)
        ]);
        isFirstRow = false;
      });
      csvRows.push([
        `${group.item_code} Total`,
        "",
        "",
        "",
        Number(group.totalQty).toFixed(2),
        "",
        "",
        "",
        Number(group.totalValue).toFixed(2)
      ]);
      csvRows.push([]);
    });
    csvRows.push(["", "", "", "", "TOTAL", "", "", "", Number(totals.totalValue).toFixed(2)]);

    const csv = csvRows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `company-wise-detail-${supplier?.code || "export"}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const printReport = () => {
    let html = `<!doctype html>
      <html>
      <head>
        <title>Company Wise Purchase Detail</title>
        <style>
          @page { size: A4 landscape; margin: 12mm; }
          body { font-family: Arial, sans-serif; padding: 15px; color: #0f172a; font-size: 12px; }
          h1 { text-align: center; font-size: 18px; margin-bottom: 5px; text-transform: uppercase; }
          h2 { text-align: center; font-size: 12px; color: #64748b; margin-bottom: 15px; }
          h3 { font-size: 11px; margin: 10px 0 5px 0; color: #1e293b; background: #e2e8f0; padding: 5px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 10px; }
          th, td { border: 1px solid #cbd5e1; padding: 5px; text-align: left; }
          th { background: #e2e8f0; font-weight: bold; text-transform: uppercase; font-size: 9px; }
          td { font-size: 10px; }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          tfoot td { font-weight: bold; background: #f1f5f9; }
        </style>
      </head>
      <body>
        <h1>Company Wise Purchase Detail</h1>
        <h2>Supplier: ${supplier?.code || ""} - ${supplier?.name || ""}</h2>`;

    groupedData.forEach((group) => {
      html += `
        <h3>${group.item_code} - ${group.item_name}</h3>
        <table>
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Date</th>
              <th class="text-right">Rate</th>
              <th class="text-right">Qty</th>
              <th class="text-right">Bonus</th>
              <th class="text-center">Dis%</th>
              <th class="text-center">Tax</th>
              <th class="text-right">Value</th>
            </tr>
          </thead>
          <tbody>`;

      group.items.forEach((row) => {
        html += `
            <tr>
              <td>${row.invoice_no || ""}</td>
              <td>${row.invoice_date || ""}</td>
              <td class="text-right">${Number(row.purchase_rate || 0).toFixed(2)}</td>
              <td class="text-right">${Number(row.quantity || 0).toFixed(2)}</td>
              <td class="text-right">${Number(row.bonus || 0) > 0 ? Number(row.bonus).toFixed(2) : "-"}</td>
              <td class="text-center">${Number(row.discount_percent || 0) > 0 ? Number(row.discount_percent).toFixed(2) + "%" : "-"}</td>
              <td class="text-center">${row.tax_percent ? Number(row.tax_percent).toFixed(2) + "%" : "-"}</td>
              <td class="text-right">${formatCurrency(row.net_amount)}</td>
            </tr>`;
      });

      html += `
          </tbody>
          <tfoot>
            <tr>
              <td colspan="3">Item Total</td>
              <td class="text-right">${Number(group.totalQty).toFixed(2)}</td>
              <td></td>
              <td></td>
              <td></td>
              <td class="text-right">${formatCurrency(group.totalValue)}</td>
            </tr>
          </tfoot>
        </table>`;
    });

    html += `
        <p style="margin-top: 15px; font-size: 11px; font-weight: bold;">
          Total Quantity: ${Number(totals.totalQty).toFixed(2)} | Total Value: ${formatCurrency(totals.totalValue)} | Items: ${totals.itemCount}
        </p>
        <p style="text-align: center; color: #64748b; font-size: 10px; margin-top: 15px;">
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

  return (
    <SectionCard
      title="Company Wise Purchase Detail"
      description="Select a supplier/company and date range to view all items purchased from that company."
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
            disabled={reportQuery.isFetching || groupedData.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-lg font-medium transition-colors"
          >
            <FiPrinter className="text-lg" />
            Print
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={reportQuery.isFetching || groupedData.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-lg font-medium transition-colors"
          >
            <FiDownload className="text-lg" />
            Export CSV
          </button>
        </div>

        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <SearchSelect
              label="Supplier/Company"
              placeholder="Search supplier"
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
              required
            />
          </div>
          <div className="flex-1 min-w-[180px]">
            <SearchSelect
              label="Item Company (Optional)"
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
            <span className="font-semibold text-slate-800">Supplier:</span> {supplier?.name ? `${supplier.code} - ${supplier.name}` : "Select a supplier"}
          </div>
          {filters.companyLabel && (
            <div>
              <span className="font-semibold text-slate-800">Item Company:</span> {filters.companyLabel}
            </div>
          )}
          <div className="px-3 py-1 rounded-full bg-slate-100 text-slate-700">
            Total Qty: <span className="font-semibold">{formatQty(totals.totalQty, "")}</span>
          </div>
          <div className="px-3 py-1 rounded-full bg-slate-100 text-slate-700">
            Total Value: <span className="font-semibold">{formatCurrency(totals.totalValue)}</span>
          </div>
          <div className="px-3 py-1 rounded-full bg-slate-100 text-slate-700">
            Items: <span className="font-semibold">{totals.itemCount}</span>
          </div>
        </div>

        <div className="space-y-6">
          {!filters.supplierCode ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center text-slate-500">
              Select a supplier to view purchase details.
            </div>
          ) : reportQuery.isFetching ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center text-slate-500">
              Loading details…
            </div>
          ) : groupedData.length ? (
            groupedData.map((group) => (
              <div key={group.item_code} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <div className="bg-slate-100 px-4 py-3">
                  <h3 className="font-semibold text-slate-900">
                    {group.item_code} — {group.item_name}
                  </h3>
                </div>
                <table className="min-w-full divide-y divide-slate-200 text-sm text-slate-700">
                  <thead className="bg-slate-50 text-slate-500 uppercase tracking-wide text-xs">
                    <tr>
                      <th className="px-4 py-3 text-left">Invoice</th>
                      <th className="px-4 py-3 text-left">Date</th>
                      <th className="px-4 py-3 text-right">Rate</th>
                      <th className="px-4 py-3 text-right">Qty</th>
                      <th className="px-4 py-3 text-right">Bonus</th>
                      <th className="px-4 py-3 text-center">Dis%</th>
                      <th className="px-4 py-3 text-center">Tax</th>
                      <th className="px-4 py-3 text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {group.items.map((row, index) => (
                      <tr key={`${row.invoice_no}-${index}`} className="even:bg-slate-50/60 hover:bg-slate-100/60 transition">
                        <td className="px-4 py-3 align-middle font-medium text-slate-700">{row.invoice_no || "-"}</td>
                        <td className="px-4 py-3 align-middle text-slate-700">{row.invoice_date || "-"}</td>
                        <td className="px-4 py-3 align-middle text-right text-slate-900 font-semibold">
                          {Number(row.purchase_rate || 0).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 align-middle text-right text-slate-900">
                          {Number(row.quantity || 0).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 align-middle text-right text-slate-700">
                          {Number(row.bonus || 0) > 0 ? Number(row.bonus).toFixed(2) : "-"}
                        </td>
                        <td className="px-4 py-3 align-middle text-center text-slate-900">
                          {Number(row.discount_percent || 0) > 0 ? `${Number(row.discount_percent).toFixed(2)}%` : "-"}
                        </td>
                        <td className="px-4 py-3 align-middle text-center text-slate-900">
                          {row.tax_percent ? `${Number(row.tax_percent).toFixed(2)}%` : "-"}
                        </td>
                        <td className="px-4 py-3 align-middle text-right font-semibold text-slate-900">
                          {formatCurrency(row.net_amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-100 text-slate-600 text-sm">
                    <tr>
                      <td className="px-4 py-3" colSpan={3}>Item Total</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900">{Number(group.totalQty).toFixed(2)}</td>
                      <td colSpan={3}></td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900">{formatCurrency(group.totalValue)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ))
          ) : (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center text-slate-500">
              No purchases found for the selected range.
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  );
};

export default ItemCompanyWisePurchaseDetailPage;
