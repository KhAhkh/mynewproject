import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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

const DateWiseExpenseReport = () => {
  const [filters, setFilters] = useState(defaultFilters);

  const query = useQuery({
    queryKey: ["/reports/expense-date-wise", filters],
    queryFn: async ({ queryKey }) => {
      const [, params] = queryKey;
      const response = await api.get("/reports/expense-date-wise", {
        params: {
          startDate: params.startDate || undefined,
          endDate: params.endDate || undefined
        }
      });
      return response.data;
    }
  });

  const totals = useMemo(() => {
    if (!query.data?.length) {
      return { totalCash: 0 };
    }
    return query.data.reduce(
      (acc, row) => {
        acc.totalCash += Number(row.cash_amount || 0);
        return acc;
      },
      { totalCash: 0 }
    );
  }, [query.data]);

  return (
    <SectionCard
      title="Date Wise Expense Report"
      description="View all expense entries within the selected date range."
      actions={
        <div className="flex gap-2 items-center">
          {query.isFetching ? <span className="text-xs text-slate-500">Loading…</span> : null}
          <button
            type="button"
            className="secondary text-xs px-3 py-1 print:hidden"
            onClick={() => window.print()}
          >
            Print
          </button>
          <button
            type="button"
            className="secondary text-xs px-3 py-1 print:hidden"
            disabled={!query.data?.length}
            onClick={() => {
              if (!query.data?.length) return;
              const header = ["Date", "Particular", "V.NO", "Detail", "Cash"];
              const rows = query.data.map((r) => [
                r.voucher_date || "",
                `${r.expense_code || ""}${r.expense_description ? " - " + r.expense_description : ""}`.replaceAll(",", " "),
                r.voucher_no || "",
                (r.details || "").replaceAll(",", " "),
                Number(r.cash_amount || 0).toFixed(2)
              ]);
              const csv = [header, ...rows].map((a) => a.join(",")).join("\n");
              const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `date-wise-expenses-${Date.now()}.csv`;
              document.body.appendChild(a);
              a.click();
              a.remove();
              URL.revokeObjectURL(url);
            }}
          >
            Export CSV
          </button>
        </div>
      }
    >
      {query.error ? (
        <div className="rounded-2xl border border-rose-200 bg-white text-sm text-rose-700 px-4 py-3 shadow-[0_8px_20px_rgba(244,63,94,0.08)] mb-4">
          {query.error?.message || "Failed to load report."}
        </div>
      ) : null}

      <div className="print-only mb-4">
        <h2 className="text-lg font-semibold">Date Wise Expense Report</h2>
        <p className="text-sm">From {filters.startDate || "-"} to {filters.endDate || "-"}</p>
      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-6 print:hidden">
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

      <div className="grid md:grid-cols-3 gap-4 mb-6 print:hidden">
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <p className="text-xs text-slate-500 uppercase">Total Cash</p>
          <p className="text-2xl font-semibold text-emerald-600">
            {totals.totalCash.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.08)] print:shadow-none print:no-bg">
        <table className="min-w-full divide-y divide-slate-200 text-sm text-slate-700">
          <thead className="bg-slate-100/80 text-slate-500 uppercase tracking-wide text-xs">
            <tr>
              <th className="px-5 py-3 text-left">Date</th>
              <th className="px-5 py-3 text-left">Particular</th>
              <th className="px-5 py-3 text-left">V.NO</th>
              <th className="px-5 py-3 text-left">Detail</th>
              <th className="px-5 py-3 text-right">Cash</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {query.isFetching ? (
              <tr>
                <td colSpan={5} className="px-5 py-6 text-center text-slate-500">Loading expenses…</td>
              </tr>
            ) : query.data?.length ? (
              (() => {
                const groups = new Map();
                for (const row of query.data) {
                  const dateKey = row.voucher_date || "";
                  if (!groups.has(dateKey)) groups.set(dateKey, { rows: [], total: 0 });
                  const g = groups.get(dateKey);
                  g.rows.push(row);
                  g.total += Number(row.cash_amount || 0);
                }
                const out = [];
                let idx = 0;
                for (const [dateKey, g] of groups) {
                  out.push(
                    <tr key={`date-${idx++}`} className="bg-slate-50">
                      <td className="px-5 py-3 font-semibold text-slate-800" colSpan={5}>{dateKey || "-"}</td>
                    </tr>
                  );
                  for (const row of g.rows) {
                    const cashAmount = Number(row.cash_amount || 0);
                    out.push(
                      <tr key={`row-${row.voucher_no}-${Math.random()}`} className="hover:bg-slate-100/60 transition">
                        <td className="px-5 py-4 align-middle text-slate-600"></td>
                        <td className="px-5 py-4 align-middle text-slate-600">
                          {`${row.expense_code || ""}${row.expense_description ? " - " + row.expense_description : ""}`}
                        </td>
                        <td className="px-5 py-4 align-middle text-slate-600">{row.voucher_no || "-"}</td>
                        <td className="px-5 py-4 align-middle text-slate-600">{row.details || ""}</td>
                        <td className="px-5 py-4 align-middle text-right font-semibold text-slate-900">
                          {cashAmount ? formatCurrency(cashAmount) : "-"}
                        </td>
                      </tr>
                    );
                  }
                  out.push(
                    <tr key={`date-total-${idx}`} className="bg-slate-100/70">
                      <td className="px-5 py-3" colSpan={4}>Subtotal</td>
                      <td className="px-5 py-3 text-right font-semibold text-slate-900">{formatCurrency(g.total)}</td>
                    </tr>
                  );
                }
                return out;
              })()
            ) : (
              <tr>
                <td colSpan={5} className="px-5 py-6 text-center text-slate-500">No expense entries found in selected date range.</td>
              </tr>
            )}
          </tbody>
          <tfoot className="bg-slate-100/70 text-slate-600 text-sm">
            <tr>
              <td className="px-5 py-3" colSpan={4}>Totals</td>
              <td className="px-5 py-3 text-right font-semibold text-slate-900">{formatCurrency(totals.totalCash)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </SectionCard>
  );
};

export default DateWiseExpenseReport;
