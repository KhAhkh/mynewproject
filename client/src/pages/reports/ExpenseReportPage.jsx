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
    mode: "date-wise",
    expenseCode: "",
    expenseLabel: ""
  };
};

const formatCurrency = (value) =>
  `Rs ${Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const ExpenseReportPage = () => {
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

  const isExpenseWise = filters.mode === "expense-wise";
  const hasExpense = Boolean(filters.expenseCode);

  const query = useQuery({
    queryKey: ["/reports/expense-report", filters],
    enabled: !isExpenseWise || hasExpense,
    queryFn: async ({ queryKey }) => {
      const [, params] = queryKey;
      const endpoint = params.mode === "expense-wise" ? "/reports/expense-wise-payments" : "/reports/expense-date-wise";
      const response = await api.get(endpoint, {
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

  const groupedRows = useMemo(() => {
    if (!query.data?.length) return [];
    if (isExpenseWise) {
      const groups = new Map();
      for (const row of query.data) {
        const key = row.expense_code || "";
        const label = `${row.expense_code || ""}${row.expense_description ? " - " + row.expense_description : ""}`;
        if (!groups.has(key)) groups.set(key, { label, rows: [], total: 0 });
        const g = groups.get(key);
        g.rows.push(row);
        g.total += Number(row.cash_amount || 0);
      }
      return Array.from(groups.values()).map((g) => ({
        header: g.label,
        rows: g.rows,
        total: g.total
      }));
    }

    const groups = new Map();
    for (const row of query.data) {
      const key = row.voucher_date || "";
      if (!groups.has(key)) groups.set(key, { label: key, rows: [], total: 0 });
      const g = groups.get(key);
      g.rows.push(row);
      g.total += Number(row.cash_amount || 0);
    }
    return Array.from(groups.values()).map((g) => ({
      header: g.label || "-",
      rows: g.rows,
      total: g.total
    }));
  }, [query.data, isExpenseWise]);

  return (
    <SectionCard
      title="Expense Report"
      description="Run date-wise or expense-wise expense reports."
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
              const header = ["Particular", "V.NO", "V.DATE", "EXPENSE", "CASH"];
              const rows = query.data.map((r) => [
                (r.details || "").replaceAll(",", " "),
                r.voucher_no || "",
                r.voucher_date || "",
                `${r.expense_code || ""}${r.expense_description ? " - " + r.expense_description : ""}`.replaceAll(",", " "),
                Number(r.cash_amount || 0).toFixed(2)
              ]);
              const csv = [header, ...rows].map((a) => a.join(",")).join("\n");
              const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `expense-report-${Date.now()}.csv`;
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
      {isExpenseWise && !hasExpense ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 text-sm text-amber-700 px-4 py-3 mb-4">
          Select an expense to view the report.
        </div>
      ) : null}

      <div className="print-only mb-4">
        <h2 className="text-lg font-semibold">Expense Report</h2>
        <p className="text-sm">From {filters.startDate || "-"} to {filters.endDate || "-"}</p>
        {isExpenseWise && filters.expenseCode ? (
          <p className="text-sm">Expense: {filters.expenseLabel || filters.expenseCode}</p>
        ) : null}
      </div>

      <div className="grid gap-4 mb-6 print:hidden md:grid-cols-6">
        <FormField label="Report Type" className="md:col-span-1">
          <select
            value={filters.mode}
            onChange={(event) => {
              const nextMode = event.target.value;
              setFilters((prev) => ({
                ...prev,
                mode: nextMode,
                expenseCode: nextMode === "expense-wise" ? prev.expenseCode : "",
                expenseLabel: nextMode === "expense-wise" ? prev.expenseLabel : ""
              }));
            }}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="date-wise">Date Wise</option>
            <option value="expense-wise">Expense Wise</option>
          </select>
        </FormField>
        <FormField label="From Date" className="md:col-span-1">
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
        <FormField label="To Date" className="md:col-span-1">
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
        <div className="md:col-span-2">
          <SearchSelect
            label="Expense"
            placeholder={isExpenseWise ? "Select expense" : "All expenses"}
            disabled={!isExpenseWise}
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
        </div>
        <FormField label="Actions" className="md:col-span-1">
          <button
            type="button"
            className="w-full px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-medium transition-colors"
            onClick={() => setFilters(defaultFilters())}
          >
            Reset Filters
          </button>
        </FormField>
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
              <th className="px-5 py-3 text-left">Particular</th>
              <th className="px-5 py-3 text-left">V.NO</th>
              <th className="px-5 py-3 text-left">V.DATE</th>
              <th className="px-5 py-3 text-left">Expense</th>
              <th className="px-5 py-3 text-right">Cash</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {query.isFetching ? (
              <tr>
                <td colSpan={5} className="px-5 py-6 text-center text-slate-500">Loading expenses…</td>
              </tr>
            ) : groupedRows.length ? (
              (() => {
                const out = [];
                let idx = 0;
                for (const group of groupedRows) {
                  out.push(
                    <tr key={`grp-${idx++}`} className="bg-slate-50">
                      <td className="px-5 py-3 font-semibold text-slate-800" colSpan={5}>{group.header}</td>
                    </tr>
                  );
                  for (const row of group.rows) {
                    const cashAmount = Number(row.cash_amount || 0);
                    const particular = (row.details || "");
                    const expenseLabel = `${row.expense_code || ""}${row.expense_description ? " - " + row.expense_description : ""}`;
                    out.push(
                      <tr key={`row-${row.voucher_no}-${Math.random()}`} className="hover:bg-slate-100/60 transition">
                        <td className="px-5 py-4 align-middle text-slate-600">{particular}</td>
                        <td className="px-5 py-4 align-middle text-slate-600">{row.voucher_no || "-"}</td>
                        <td className="px-5 py-4 align-middle text-slate-600">{row.voucher_date || "-"}</td>
                        <td className="px-5 py-4 align-middle text-slate-600">{expenseLabel}</td>
                        <td className="px-5 py-4 align-middle text-right font-semibold text-slate-900">
                          {cashAmount ? formatCurrency(cashAmount) : "-"}
                        </td>
                      </tr>
                    );
                  }
                  out.push(
                    <tr key={`grp-total-${idx}`} className="bg-slate-100/70">
                      <td className="px-5 py-3" colSpan={4}>Subtotal</td>
                      <td className="px-5 py-3 text-right font-semibold text-slate-900">{formatCurrency(group.total)}</td>
                    </tr>
                  );
                }
                return out;
              })()
            ) : (
              <tr>
                <td colSpan={5} className="px-5 py-6 text-center text-slate-500">
                  {isExpenseWise && !hasExpense
                    ? "Select an expense to view results."
                    : "No expense entries found in selected date range."}
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

export default ExpenseReportPage;
