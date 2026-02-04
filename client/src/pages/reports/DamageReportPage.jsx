import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import SectionCard from "../../components/SectionCard.jsx";
import SearchSelect from "../../components/SearchSelect.jsx";
import FormField from "../../components/FormField.jsx";
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

const DamageReportPage = () => {
  const [supplierQuery, setSupplierQuery] = useState("");
  const [filters, setFilters] = useState(defaultFilters);

  const supplierLookup = useQuery({
    queryKey: ["damage-report-suppliers", { search: supplierQuery }],
    queryFn: async () => {
      const response = await api.get("/suppliers", { params: { search: supplierQuery } });
      return response.data;
    }
  });

  const supplierOptions = useMemo(() => {
    return supplierLookup.data?.map((supplier) => ({
      value: supplier.id,
      code: supplier.code,
      label: `${supplier.code} — ${supplier.name}`
    })) ?? [];
  }, [supplierLookup.data]);

  const query = useQuery({
    queryKey: ["reports/damage", filters],
    queryFn: async ({ queryKey }) => {
      const [, params] = queryKey;
      const response = await api.get("/reports/damage-transactions", {
        params: {
          supplierCode: params.supplierCode || undefined,
          startDate: params.startDate || undefined,
          endDate: params.endDate || undefined
        }
      });
      return response.data;
    }
  });

  const totals = useMemo(() => {
    if (!query.data?.length) {
      return { totalOut: 0, totalIn: 0 };
    }
    return query.data.reduce(
      (acc, row) => {
        acc.totalOut += Number(row.total_out || 0);
        acc.totalIn += Number(row.total_in || 0);
        return acc;
      },
      { totalOut: 0, totalIn: 0 }
    );
  }, [query.data]);

  return (
    <SectionCard
      title="Damage-IN/Out Report"
      description="Track damaged stock activity aggregated by supplier and month."
      actions={
        query.isFetching ? <span className="text-xs text-slate-500">Loading…</span> : null
      }
    >
      <div className="grid md:grid-cols-4 gap-4">
        <FormField label="From Date">
          <input
            value={filters.startDate}
            onChange={(event) => {
              const value = normalizeDateInput(event.target.value);
              setFilters((prev) => ({ ...prev, startDate: value }));
            }}
            placeholder="DD-MM-YYYY"
          />
        </FormField>
        <FormField label="To Date">
          <input
            value={filters.endDate}
            onChange={(event) => {
              const value = normalizeDateInput(event.target.value);
              setFilters((prev) => ({ ...prev, endDate: value }));
            }}
            placeholder="DD-MM-YYYY"
          />
        </FormField>
        <SearchSelect
          label="Supplier"
          placeholder="All suppliers"
          value={
            filters.supplierCode
              ? { label: filters.supplierLabel || filters.supplierCode }
              : null
          }
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
            className="secondary px-4 py-2"
            onClick={() => setFilters(defaultFilters())}
          >
            Reset Filters
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <p className="text-xs text-slate-500 uppercase">Total Damage-Out</p>
          <p className="text-2xl font-semibold text-rose-500">{totals.totalOut.toFixed(2)}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <p className="text-xs text-slate-500 uppercase">Total Damage-In</p>
          <p className="text-2xl font-semibold text-emerald-500">{totals.totalIn.toFixed(2)}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <p className="text-xs text-slate-500 uppercase">Net Damage</p>
          <p className="text-2xl font-semibold text-slate-700">
            {(totals.totalOut - totals.totalIn).toFixed(2)}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 uppercase">
              <th className="py-2 pr-4">Month</th>
              <th className="py-2 pr-4">Supplier</th>
              <th className="py-2 pr-4">Item</th>
              <th className="py-2 pr-4 text-right">Damage-Out</th>
              <th className="py-2 pr-4 text-right">Damage-In</th>
              <th className="py-2 pr-4 text-right">Net</th>
            </tr>
          </thead>
          <tbody>
            {query.data?.length ? (
              query.data.map((row) => (
                <tr
                  key={`${row.supplier_code}-${row.item_code}-${row.month}`}
                  className="border-t border-slate-200"
                >
                  <td className="py-2 pr-4">{row.month}</td>
                  <td className="py-2 pr-4">{`${row.supplier_code} — ${row.supplier_name}`}</td>
                  <td className="py-2 pr-4">{`${row.item_code} — ${row.item_name}`}</td>
                  <td className="py-2 pr-4 text-right">{Number(row.total_out || 0).toFixed(2)}</td>
                  <td className="py-2 pr-4 text-right">{Number(row.total_in || 0).toFixed(2)}</td>
                  <td className="py-2 pr-4 text-right">
                    {(Number(row.total_out || 0) - Number(row.total_in || 0)).toFixed(2)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="py-4 text-center text-slate-500" colSpan={6}>
                  {query.isFetching ? "Loading report…" : "No damage activity in selected range."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
};

export default DamageReportPage;
