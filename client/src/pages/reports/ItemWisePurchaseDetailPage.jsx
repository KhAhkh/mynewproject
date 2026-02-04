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
    itemCode: "",
    itemLabel: "",
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

const ItemWisePurchaseDetailPage = () => {
  const [filters, setFilters] = useState(defaultFilters);
  const [itemSearch, setItemSearch] = useState("");

  const itemLookup = useQuery({
    queryKey: ["item-wise-purchase-items", itemSearch],
    queryFn: async () => {
      const response = await api.get("/items", { params: { search: itemSearch } });
      return response.data || [];
    }
  });

  const itemOptions = useMemo(() => {
    return (
      itemLookup.data?.map((i) => ({
        value: i.id,
        code: i.code,
        label: `${i.code} — ${i.name}`,
        baseUnit: i.base_unit
      })) ?? []
    );
  }, [itemLookup.data]);

  const reportQuery = useQuery({
    queryKey: ["purchase/item-wise-detail", filters],
    enabled: Boolean(filters.itemCode),
    queryFn: async ({ queryKey }) => {
      const [, params] = queryKey;
      const response = await api.get("/reports/purchase/item-wise-detail", {
        params: {
          itemCode: params.itemCode,
          startDate: params.startDate || undefined,
          endDate: params.endDate || undefined
        }
      });
      return response.data;
    }
  });

  const rows = reportQuery.data?.rows ?? [];
  const item = reportQuery.data?.item;
  const totals = reportQuery.data?.totals ?? { totalQty: 0, totalValue: 0, invoiceCount: 0 };

  const exportCsv = () => {
    if (rows.length === 0) return;
    const csvRows = [
      ["Sr. No.", "Invoice", "Date", "Supplier", "Rate", "Qty", "Bonus", "Dis%", "Tax", "Value"]
    ];
    rows.forEach((row, index) => {
      csvRows.push([
        index + 1,
        row.invoice_no || "",
        row.invoice_date || "",
        row.supplier_code || "",
        Number(row.purchase_rate || 0).toFixed(2),
        Number(row.quantity || 0).toFixed(2),
        Number(row.bonus || 0) > 0 ? Number(row.bonus).toFixed(2) : "",
        Number(row.discount_percent || 0) > 0 ? Number(row.discount_percent).toFixed(2) : "",
        row.tax_percent ? Number(row.tax_percent).toFixed(2) : "",
        Number(row.net_amount || 0).toFixed(2)
      ]);
    });
    csvRows.push(["", "", "", "", "", "", "", "", "TOTAL", Number(totals.totalValue).toFixed(2)]);

    const csv = csvRows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `item-wise-purchase-detail-${item?.code || "export"}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const printReport = () => {
    let html = `<!doctype html>
      <html>
      <head>
        <title>Item Wise Purchase Detail</title>
        <style>
          @page { size: A4 landscape; margin: 12mm; }
          body { font-family: Arial, sans-serif; padding: 15px; color: #0f172a; font-size: 12px; }
          h1 { text-align: center; font-size: 18px; margin-bottom: 5px; text-transform: uppercase; }
          h2 { text-align: center; font-size: 12px; color: #64748b; margin-bottom: 15px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
          th, td { border: 1px solid #cbd5e1; padding: 6px; text-align: left; }
          th { background: #e2e8f0; font-weight: bold; text-transform: uppercase; }
          td { font-size: 11px; }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          tfoot td { font-weight: bold; background: #f1f5f9; }
        </style>
      </head>
      <body>
        <h1>Item Wise Purchase Detail</h1>
        <h2>Item: ${item?.code || ""} - ${item?.name || ""}</h2>
        <table>
          <thead>
            <tr>
              <th>Sr. No.</th>
              <th>Invoice</th>
              <th>Date</th>
              <th>Supplier</th>
              <th class="text-right">Rate</th>
              <th class="text-right">Qty</th>
              <th class="text-right">Bonus</th>
              <th class="text-center">Dis%</th>
              <th class="text-center">Tax</th>
              <th class="text-right">Value</th>
            </tr>
          </thead>
          <tbody>`;

    rows.forEach((row, index) => {
      html += `
            <tr>
              <td>${index + 1}</td>
              <td>${row.invoice_no || ""}</td>
              <td>${row.invoice_date || ""}</td>
              <td>${row.supplier_code}</td>
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
              <td colspan="9">TOTAL</td>
              <td class="text-right">${formatCurrency(totals.totalValue)}</td>
            </tr>
          </tfoot>
        </table>
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
      title="Item Wise Purchase Detail"
      description="Select an item and date range to view all purchases of that item."
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
            disabled={reportQuery.isFetching || rows.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-lg font-medium transition-colors"
          >
            <FiPrinter className="text-lg" />
            Print
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={reportQuery.isFetching || rows.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-lg font-medium transition-colors"
          >
            <FiDownload className="text-lg" />
            Export CSV
          </button>
        </div>

        <div className="grid md:grid-cols-4 gap-4 mb-6">
          <SearchSelect
            label="Item"
            placeholder="Search item"
            value={
              filters.itemCode
                ? { value: filters.itemCode, label: filters.itemLabel || filters.itemCode }
                : null
            }
            onSelect={(option) => {
              setFilters((prev) => ({
                ...prev,
                itemCode: option?.code || "",
                itemLabel: option?.label || ""
              }));
            }}
            onSearch={setItemSearch}
            results={itemOptions}
            required
          />
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
              className="w-full px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-medium transition-colors"
              onClick={() => setFilters(defaultFilters())}
            >
              Reset
            </button>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-4 text-sm text-slate-600">
          <div>
            <span className="font-semibold text-slate-800">Item:</span> {item?.name ? `${item.code} - ${item.name}` : "Select an item"}
          </div>
          <div className="px-3 py-1 rounded-full bg-slate-100 text-slate-700">
            Total Qty: <span className="font-semibold">{formatQty(totals.totalQty, item?.base_unit || "")}</span>
          </div>
          <div className="px-3 py-1 rounded-full bg-slate-100 text-slate-700">
            Total Value: <span className="font-semibold">{formatCurrency(totals.totalValue)}</span>
          </div>
          <div className="px-3 py-1 rounded-full bg-slate-100 text-slate-700">
            Invoices: <span className="font-semibold">{totals.invoiceCount}</span>
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm text-slate-700">
            <thead className="bg-slate-100 text-slate-500 uppercase tracking-wide text-xs">
              <tr>
                <th className="px-4 py-3 text-left">Sr. No.</th>
                <th className="px-4 py-3 text-left">Invoice</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Supplier</th>
                <th className="px-4 py-3 text-right">Rate</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">Bonus</th>
                <th className="px-4 py-3 text-center">Dis%</th>
                <th className="px-4 py-3 text-center">Tax</th>
                <th className="px-4 py-3 text-right">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!filters.itemCode ? (
                <tr>
                  <td colSpan={10} className="px-4 py-6 text-center text-slate-500">
                    Select an item to view purchase details.
                  </td>
                </tr>
              ) : reportQuery.isFetching ? (
                <tr>
                  <td colSpan={10} className="px-4 py-6 text-center text-slate-500">
                    Loading details…
                  </td>
                </tr>
              ) : rows.length ? (
                rows.map((row, index) => (
                  <tr key={`${row.invoice_no}-${index}`} className="even:bg-slate-50/60 hover:bg-slate-100/60 transition">
                    <td className="px-4 py-3 align-middle font-semibold text-slate-800">{index + 1}</td>
                    <td className="px-4 py-3 align-middle text-slate-700 font-medium">{row.invoice_no || "-"}</td>
                    <td className="px-4 py-3 align-middle text-slate-700">{row.invoice_date || "-"}</td>
                    <td className="px-4 py-3 align-middle text-slate-700">
                      <div className="font-medium text-slate-900">{row.supplier_code}</div>
                      <div className="text-xs text-slate-500">{row.supplier_name}</div>
                    </td>
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
                      {row.tax_percent !== null && row.tax_percent !== undefined ? `${Number(row.tax_percent).toFixed(2)}%` : "-"}
                    </td>
                    <td className="px-4 py-3 align-middle text-right font-semibold text-slate-900">
                      {formatCurrency(row.net_amount)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={10} className="px-4 py-6 text-center text-slate-500">
                    No purchases found for the selected range.
                  </td>
                </tr>
              )}
            </tbody>
            {rows.length ? (
              <tfoot className="bg-slate-100 text-slate-600 text-sm">
                <tr>
                  <td className="px-4 py-3" colSpan={6}>Total</td>
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3 text-right font-bold text-slate-900">{formatCurrency(totals.totalValue)}</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </div>
    </SectionCard>
  );
};

export default ItemWisePurchaseDetailPage;
