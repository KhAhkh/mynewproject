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
    expenseCode: "",
    expenseLabel: ""
  };
};

const formatCurrency = (value) =>
  `Rs ${Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const ExpenseWisePaymentReport = () => {
  const [filters, setFilters] = useState(defaultFilters);
  const [expenseQuery, setExpenseQuery] = useState("");

  const expensesLookup = useQuery({
    queryKey: ["report-expense-options", { search: expenseQuery }],
    queryFn: async () => {
      const response = await api.get("/expenses", { params: { search: expenseQuery } });
      return response.data;
    }
  });

  const expenseOptions = useMemo(() => {
    return (
      expensesLookup.data?.map((e) => ({
        value: e.code,
        code: e.code,
        label: `${e.code} — ${e.description}`
      })) ?? []
    );
  }, [expensesLookup.data]);

  const hasExpense = Boolean(filters.expenseCode);
  const query = useQuery({
    queryKey: ["/reports/expense-wise-payments", filters],
    enabled: hasExpense,
    queryFn: async ({ queryKey }) => {
      const [, params] = queryKey;
      const response = await api.get("/reports/expense-wise-payments", {
        params: {
          startDate: params.startDate || undefined,
          endDate: params.endDate || undefined,
          expenseCode: params.expenseCode || undefined
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
      title="Expense Wise Report"
      description="View expenses for a selected expense head within a date range."
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
              const header = ["Particular","V.NO","V.DATE","DETAIL","CASH"]; 
              const rows = query.data.map(r => [
                `${r.expense_code || ""}${r.expense_description ? " - " + r.expense_description : ""}`.replaceAll(","," "),
                r.voucher_no || "",
                r.voucher_date || "",
                (r.details || "").replaceAll(","," "),
                Number(r.cash_amount||0).toFixed(2)
              ]);
              const csv = [header, ...rows].map(a => a.join(",")).join("\n");
              const blob = new Blob([csv], { type: "text/csv;charset=utf-8;"});
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `expense-wise-payments-${Date.now()}.csv`;
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
      {!hasExpense ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 text-sm text-amber-700 px-4 py-3 mb-4">
          Select an expense to view the report.
        </div>
      ) : null}

      {/* Print header */}
      <div className="print-only mb-4">
        <h2 className="text-lg font-semibold">Expense Wise Payment</h2>
        <p className="text-sm">From {filters.startDate || '-'} to {filters.endDate || '-'}</p>
        {filters.expenseCode ? (
          <p className="text-sm">Expense: {filters.expenseLabel || filters.expenseCode}</p>
        ) : null}
      </div>

      <div className="grid md:grid-cols-4 gap-4 mb-6 print:hidden">
        <FormField label="From Date">
          <input
            type="text"
            value={filters.startDate}
            onChange={(e) => {
              const value = normalizeDateInput(e.target.value);
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
            onChange={(e) => {
              const value = normalizeDateInput(e.target.value);
              setFilters((prev) => ({ ...prev, endDate: value }));
            }}
            placeholder="DD-MM-YYYY"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </FormField>
        <SearchSelect
          label="Expense"
          placeholder="All expenses"
          value={filters.expenseCode ? { label: filters.expenseLabel || filters.expenseCode } : null}
          onSelect={(option) => {
            setFilters((prev) => ({
              ...prev,
              expenseCode: option?.code || "",
              expenseLabel: option?.label || ""
            }));
          }}
          onSearch={setExpenseQuery}
          results={expenseOptions}
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

      <div className="grid md:grid-cols-3 gap-4 mb-6 print:hidden">
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <p className="text-xs text-slate-500 uppercase">Total Cash</p>
          <p className="text-2xl font-semibold text-emerald-600">{totals.totalCash.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.08)] print:shadow-none print:no-bg">
        <table className="min-w-full divide-y divide-slate-200 text-sm text-slate-700">
          <thead className="bg-slate-100/80 text-slate-500 uppercase tracking-wide text-xs">
            <tr>
              <th className="px-5 py-3 text-left">Particular</th>
              <th className="px-5 py-3 text-left">V.NO</th>
              <th className="px-5 py-3 text-left">V.DATE</th>
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
                // Group by expense_code
                const groups = new Map();
                for (const row of query.data) {
                  const key = row.expense_code || "";
                  const label = `${row.expense_code || ''}${row.expense_description ? ' - ' + row.expense_description : ''}`;
                  if (!groups.has(key)) groups.set(key, { label, rows: [], total: 0 });
                  const g = groups.get(key);
                  g.rows.push(row);
                  g.total += Number(row.cash_amount || 0);
                }
                const out = [];
                let idx = 0;
                for (const [, g] of groups) {
                  out.push(
                    <tr key={`grp-${idx++}`} className="bg-slate-50">
                      <td className="px-5 py-3 font-semibold text-slate-800" colSpan={5}>{g.label}</td>
                    </tr>
                  );
                  for (const row of g.rows) {
                    const cashAmount = Number(row.cash_amount || 0);
                    out.push(
                      <tr key={`row-${row.voucher_no}-${Math.random()}`} className="hover:bg-slate-100/60 transition">
                        <td className="px-5 py-4 align-middle text-slate-600"></td>
                        <td className="px-5 py-4 align-middle text-slate-600">{row.voucher_no || '-'}</td>
                        <td className="px-5 py-4 align-middle text-slate-600">{row.voucher_date || '-'}</td>
                        <td className="px-5 py-4 align-middle text-slate-600">{row.details || ''}</td>
                        <td className="px-5 py-4 align-middle text-right font-semibold text-slate-900">{cashAmount ? formatCurrency(cashAmount) : '-'}</td>
                      </tr>
                    );
                  }
                  out.push(
                    <tr key={`grp-total-${idx}`} className="bg-slate-100/70">
                      <td className="px-5 py-3" colSpan={4}>Subtotal</td>
                      <td className="px-5 py-3 text-right font-semibold text-slate-900">{formatCurrency(g.total)}</td>
                    </tr>
                  );
                }
                return out;
              })()
            ) : (
              <tr>
                <td colSpan={5} className="px-5 py-6 text-center text-slate-500">
                  {hasExpense ? "No expense payments found in selected date range." : "Select an expense to view results."}
                </td>
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

export default ExpenseWisePaymentReport;
