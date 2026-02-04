import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import SectionCard from "../../components/SectionCard.jsx";
import FormField from "../../components/FormField.jsx";
import SearchSelect from "../../components/SearchSelect.jsx";
import { api } from "../../api/client.js";
import { normalizeDateInput, toDisplay } from "../../utils/date.js";

const defaultFilters = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    startDate: toDisplay(start),
    endDate: toDisplay(now),
    supplierCode: "",
    supplierLabel: ""
  };
};

const formatCurrency = (value) =>
  `Rs ${Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const SupplierPaymentDateWiseReport = () => {
  const [filters, setFilters] = useState(defaultFilters);
  const [supplierQuery, setSupplierQuery] = useState("");

  const supplierLookup = useQuery({
    queryKey: ["supplier-payment-report-suppliers", { search: supplierQuery }],
    queryFn: async () => {
      const response = await api.get("/suppliers", { params: { search: supplierQuery } });
      return response.data;
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

  const query = useQuery({
    queryKey: ["reports/supplier-payments-date-wise", filters],
    queryFn: async ({ queryKey }) => {
      const [, params] = queryKey;
      const response = await api.get("/reports/supplier-payments-date-wise", {
        params: {
          startDate: params.startDate || undefined,
          endDate: params.endDate || undefined,
          supplierCode: params.supplierCode || undefined
        }
      });
      return response.data;
    }
  });

  const totals = useMemo(() => {
    if (!query.data?.length) {
      return { totalCash: 0, totalCheque: 0, grandTotal: 0 };
    }
    return query.data.reduce(
      (acc, row) => {
        const cash = Number(row.cash_amount || 0);
        const cheque = Number(row.cheque_amount || 0);
        acc.totalCash += cash;
        acc.totalCheque += cheque;
        acc.grandTotal += (cash + cheque);
        return acc;
      },
      { totalCash: 0, totalCheque: 0, grandTotal: 0 }
    );
  }, [query.data]);

  const handlePrint = () => {
    if (!query.data?.length) return;

    const rowsHtml = query.data
      .map((row) => {
        const cashAmount = Number(row.cash_amount || 0);
        const chequeAmount = Number(row.cheque_amount || 0);
        const invoiceBalance = row.supplier_balance !== null && row.supplier_balance !== undefined
          ? Number(row.supplier_balance || 0)
          : row.invoice_balance !== null && row.invoice_balance !== undefined
            ? Number(row.invoice_balance || 0)
            : null;
        const invoiceTotal = row.invoice_total !== null && row.invoice_total !== undefined
          ? Number(row.invoice_total || 0)
          : null;

        return `
          <tr>
            <td>${row.supplier_name || row.supplier_code || "-"}</td>
            <td>${row.voucher_no || "-"}</td>
            <td>${row.voucher_date || "-"}</td>
            <td class="num">${invoiceTotal !== null ? formatCurrency(invoiceTotal) : "-"}</td>
            <td class="num">${cashAmount ? formatCurrency(cashAmount) : "-"}</td>
            <td class="num">${chequeAmount ? formatCurrency(chequeAmount) : "-"}</td>
            <td class="num">${invoiceBalance !== null ? formatCurrency(invoiceBalance) : "-"}</td>
          </tr>
        `;
      })
      .join("");

    const html = `<!doctype html>
      <html>
      <head>
        <title>Supplier Payment Date Wise Report</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; color: #0f172a; }
          h1 { text-align: center; margin-bottom: 6px; }
          p.meta { text-align: center; color: #64748b; font-size: 12px; margin: 0 0 16px 0; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; white-space: nowrap; }
          th { background: #f1f5f9; text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em; }
          td.num { text-align: right; }
          tfoot td { font-weight: bold; background: #f8fafc; }
        </style>
      </head>
      <body>
        <h1>Supplier Payment Date Wise Report</h1>
        <p class="meta">${filters.startDate} to ${filters.endDate}${filters.supplierLabel ? ` • ${filters.supplierLabel}` : ""}</p>
        <table>
          <thead>
            <tr>
              <th>Supplier</th>
              <th>V.NO</th>
              <th>V.DAT</th>
              <th>Invoice Total</th>
              <th>Cash</th>
              <th>Cheque/Online</th>
              <th>Invoice Balance</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="3">Totals</td>
              <td class="num">-</td>
              <td class="num">${formatCurrency(totals.totalCash)}</td>
              <td class="num">${formatCurrency(totals.totalCheque)}</td>
              <td class="num">-</td>
            </tr>
          </tfoot>
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

  return (
    <SectionCard
      title="Supplier Payment Date Wise Report"
      description="View all payments made to suppliers within a date range."
      actions={
        <div className="flex gap-2 items-center">
          {query.isFetching ? <span className="text-xs text-slate-500">Loading…</span> : null}
          <button
            type="button"
            className="secondary text-xs px-3 py-1"
            disabled={!query.data?.length}
            onClick={() => {
              if (!query.data?.length) return;
              const header = ["Supplier","V.NO","V.DAT","Invoice Total","Cash","Cheque/Online","Invoice Balance"]; 
              const rows = query.data.map(r => [
                (r.supplier_name || r.supplier_code || "").replaceAll(","," "),
                r.voucher_no || "",
                r.voucher_date || "",
                r.invoice_total !== null && r.invoice_total !== undefined
                  ? Number(r.invoice_total || 0).toFixed(2)
                  : "",
                Number(r.cash_amount||0).toFixed(2),
                Number(r.cheque_amount||0).toFixed(2),
                r.supplier_balance !== null && r.supplier_balance !== undefined
                  ? Number(r.supplier_balance || 0).toFixed(2)
                  : r.invoice_balance !== null && r.invoice_balance !== undefined
                    ? Number(r.invoice_balance || 0).toFixed(2)
                  : ""
              ]);
              const csv = [header, ...rows].map(a => a.join(",")).join("\n");
              const blob = new Blob([csv], { type: "text/csv;charset=utf-8;"});
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `supplier-payments-${Date.now()}.csv`;
              document.body.appendChild(a);
              a.click();
              a.remove();
              URL.revokeObjectURL(url);
            }}
          >
            Export CSV
          </button>
          <button
            type="button"
            className="secondary text-xs px-3 py-1"
            disabled={!query.data?.length}
            onClick={handlePrint}
          >
            Print
          </button>
        </div>
      }
    >
      {query.error ? (
        <div className="rounded-2xl border border-rose-200 bg-white text-sm text-rose-700 px-4 py-3 shadow-[0_8px_20px_rgba(244,63,94,0.08)] mb-4">
          {query.error?.message || "Failed to load report."}
        </div>
      ) : null}
      <div className="grid md:grid-cols-4 gap-4 mb-6">
        <FormField label="From Date">
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
        <FormField label="To Date">
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
        <SearchSelect
          label="Supplier"
          placeholder="All suppliers"
          value={filters.supplierCode ? { label: filters.supplierLabel || filters.supplierCode } : null}
          onSelect={(option) => {
            setFilters((prev) => ({
              ...prev,
              supplierCode: option?.code || "",
              supplierLabel: option?.label || ""
            }));
          }}
          onSearch={setSupplierQuery}
          results={supplierOptions}
        />
        <div className="flex items-end">
          <button
            type="button"
            className="w-full px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-medium transition-colors"
            onClick={() => setFilters(defaultFilters())}
          >
            Reset Filters
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <p className="text-xs text-slate-500 uppercase">Total Cash</p>
          <p className="text-2xl font-semibold text-emerald-600">{totals.totalCash.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <p className="text-xs text-slate-500 uppercase">Total Cheque/Online</p>
          <p className="text-2xl font-semibold text-blue-600">{totals.totalCheque.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <p className="text-xs text-slate-500 uppercase">Grand Total</p>
          <p className="text-2xl font-semibold text-slate-700">{totals.grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
      </div>

      {/* Payment Table - consistent with other reports */}
      <div className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
        <table className="min-w-full divide-y divide-slate-200 text-sm text-slate-700">
          <thead className="bg-slate-100/80 text-slate-500 uppercase tracking-wide text-xs">
            <tr>
              <th className="px-5 py-3 text-left">Supplier</th>
              <th className="px-5 py-3 text-left">V.NO</th>
              <th className="px-5 py-3 text-left">V.DAT</th>
              <th className="px-5 py-3 text-right">Invoice Total</th>
              <th className="px-5 py-3 text-right">Cash</th>
              <th className="px-5 py-3 text-right">Cheque/Online</th>
              <th className="px-5 py-3 text-right">Invoice Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {query.isFetching ? (
              <tr>
                <td colSpan={7} className="px-5 py-6 text-center text-slate-500">Loading payments…</td>
              </tr>
            ) : query.data?.length ? (
              query.data.map((row, index) => {
                const cashAmount = Number(row.cash_amount || 0);
                const chequeAmount = Number(row.cheque_amount || 0);
                const invoiceBalance = row.supplier_balance !== null && row.supplier_balance !== undefined
                  ? Number(row.supplier_balance || 0)
                  : row.invoice_balance !== null && row.invoice_balance !== undefined
                    ? Number(row.invoice_balance || 0)
                    : null;
                const invoiceTotal = row.invoice_total !== null && row.invoice_total !== undefined
                  ? Number(row.invoice_total || 0)
                  : null;
                return (
                  <tr key={`${row.voucher_no || index}`} className="even:bg-slate-50/60 hover:bg-slate-100/60 transition">
                    <td className="px-5 py-4 align-middle">
                      <div className="font-semibold text-slate-800">{row.supplier_name || row.supplier_code}</div>
                      <div className="text-xs text-slate-500">
                        {row.details ? row.details : row.source === 'purchase' ? 'PURCHASE' : ''}
                      </div>
                    </td>
                    <td className="px-5 py-4 align-middle text-slate-600">{row.voucher_no || '-'}</td>
                    <td className="px-5 py-4 align-middle text-slate-600">{row.voucher_date || '-'}</td>
                    <td className="px-5 py-4 align-middle text-right font-semibold text-slate-900">
                      {invoiceTotal !== null ? formatCurrency(invoiceTotal) : "-"}
                    </td>
                    <td className="px-5 py-4 align-middle text-right font-semibold text-slate-900">{cashAmount ? formatCurrency(cashAmount) : '-'}</td>
                    <td className="px-5 py-4 align-middle text-right font-semibold text-slate-900">{chequeAmount ? formatCurrency(chequeAmount) : '-'}</td>
                    <td className="px-5 py-4 align-middle text-right font-semibold text-slate-900">
                      {invoiceBalance !== null ? formatCurrency(invoiceBalance) : "-"}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={7} className="px-5 py-6 text-center text-slate-500">No payments found in selected date range.</td>
              </tr>
            )}
          </tbody>
          <tfoot className="bg-slate-100/70 text-slate-600 text-sm">
            <tr>
              <td className="px-5 py-3" colSpan={3}>Totals</td>
              <td className="px-5 py-3 text-right text-slate-500">-</td>
              <td className="px-5 py-3 text-right font-semibold text-slate-900">{formatCurrency(totals.totalCash)}</td>
              <td className="px-5 py-3 text-right font-semibold text-slate-900">{formatCurrency(totals.totalCheque)}</td>
              <td className="px-5 py-3 text-right text-slate-500">-</td>
            </tr>
          </tfoot>
        </table>
      </div>
      
        </SectionCard>
      );
    };

    export default SupplierPaymentDateWiseReport;
