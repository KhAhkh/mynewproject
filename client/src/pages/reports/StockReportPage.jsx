import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import SectionCard from "../../components/SectionCard.jsx";
import { api } from "../../api/client.js";

const formatUnits = (value) =>
  Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

const formatCurrency = (value) =>
  `Rs ${Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const StockReportPage = () => {
  const [companyFilter, setCompanyFilter] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["stock-report"],
    queryFn: async () => {
      const response = await api.get("/reports/stock");
      return response.data;
    }
  });

  const supplierDirectory = useQuery({
    queryKey: ["suppliers", "stock-report"],
    queryFn: async () => {
      const response = await api.get("/suppliers", { params: { limit: 1000, offset: 0 } });
      return Array.isArray(response.data) ? response.data : [];
    },
    staleTime: 5 * 60 * 1000
  });

  const companyDirectory = useQuery({
    queryKey: ["companies", "stock-report"],
    queryFn: async () => {
      const response = await api.get("/companies", { params: { limit: 1000, offset: 0 } });
      return Array.isArray(response.data) ? response.data : [];
    },
    staleTime: 5 * 60 * 1000
  });

  const rows = data ?? [];

  const companyOptions = useMemo(() => {
    const directory = companyDirectory.data ?? [];
    if (directory.length > 0) {
      return directory
        .filter((company) => company?.code)
        .map((company) => ({
          code: company.code,
          label: company.name ? `${company.code} — ${company.name}` : company.code
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
    }

    const map = new Map();
    for (const row of rows) {
      if (row.companyCode && !map.has(row.companyCode)) {
        map.set(row.companyCode, row.company || row.companyCode);
      }
    }
    return Array.from(map.entries()).map(([code, label]) => ({ code, label })).sort((a, b) =>
      a.label.localeCompare(b.label)
    );
  }, [companyDirectory.data, rows]);

  const supplierOptions = useMemo(() => {
    const directory = supplierDirectory.data ?? [];
    if (directory.length > 0) {
      const map = new Map();
      for (const supplier of directory) {
        if (!supplier?.code) continue;
        const label = supplier.name ? `${supplier.code} — ${supplier.name}` : supplier.code;
        map.set(supplier.code, label);
      }
      return Array.from(map.entries())
        .map(([code, label]) => ({ code, label }))
        .sort((a, b) => a.label.localeCompare(b.label));
    }

    const map = new Map();
    for (const row of rows) {
      if (Array.isArray(row.suppliers)) {
        for (const supplier of row.suppliers) {
          if (supplier?.code && !map.has(supplier.code)) {
            const label = supplier.name ? `${supplier.code} — ${supplier.name}` : supplier.code;
            map.set(supplier.code, label);
          }
        }
      }
    }
    return Array.from(map.entries())
      .map(([code, label]) => ({ code, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [supplierDirectory.data, rows]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const companyMatch = companyFilter ? row.companyCode === companyFilter : true;
      const supplierMatch = supplierFilter
        ? Array.isArray(row.suppliers) && row.suppliers.some((supplier) => supplier.code === supplierFilter)
        : true;
      return companyMatch && supplierMatch;
    });
  }, [rows, companyFilter, supplierFilter]);

  const hasActiveFilters = Boolean(companyFilter || supplierFilter);

  return (
    <div className="space-y-6">
      <SectionCard
        title="Stock Report"
        description="Purchased inventory totals with weighted average cost."
        actions={
          error || hasActiveFilters ? (
            <div className="flex gap-2">
              {hasActiveFilters ? (
                <button
                  type="button"
                  className="secondary text-xs px-3 py-1"
                  onClick={() => {
                    setCompanyFilter("");
                    setSupplierFilter("");
                  }}
                >
                  Clear Filters
                </button>
              ) : null}
              {error ? (
                <button type="button" className="secondary text-xs px-3 py-1" onClick={() => refetch()}>
                  Retry
                </button>
              ) : null}
            </div>
          ) : null
        }
      >
        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-white text-sm text-rose-700 px-4 py-3 shadow-[0_8px_20px_rgba(244,63,94,0.08)]">
            Unable to load stock report.
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm text-slate-600 font-semibold">
            <span className="block mb-1">Company</span>
            <select
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-200"
              value={companyFilter}
              onChange={(event) => setCompanyFilter(event.target.value)}
            >
              <option value="">All Companies</option>
              {companyOptions.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-600 font-semibold">
            <span className="block mb-1">Supplier</span>
            <select
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              value={supplierFilter}
              onChange={(event) => setSupplierFilter(event.target.value)}
            >
              <option value="">All Suppliers</option>
              {supplierOptions.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
          <table className="min-w-full divide-y divide-slate-200 text-sm text-slate-700">
            <thead className="bg-slate-100/80 text-slate-500 uppercase tracking-wide text-xs">
              <tr>
                <th className="px-5 py-3 text-left">Item</th>
                <th className="px-5 py-3 text-left">Company</th>
                <th className="px-5 py-3 text-right">Quantity</th>
                <th className="px-5 py-3 text-right">Unit</th>
                <th className="px-5 py-3 text-right">Avg. Cost</th>
                <th className="px-5 py-3 text-right">Total Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-6 text-center text-slate-500">
                    Loading stock…
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-6 text-center text-slate-500">
                    {hasActiveFilters ? "No items match the selected filters." : "No purchased stock available yet."}
                  </td>
                </tr>
              ) : (
                filteredRows.map((item) => (
                  <tr key={item.code} className="even:bg-slate-50/60 hover:bg-slate-100/60 transition">
                    <td className="px-5 py-4 align-middle">
                      <div className="font-semibold text-slate-800">{item.name}</div>
                      <div className="text-xs text-slate-500">{item.code}</div>
                    </td>
                    <td className="px-5 py-4 align-middle text-slate-600">{item.company}</td>
                    <td className="px-5 py-4 align-middle text-right text-slate-800">{formatUnits(item.quantity)}</td>
                    <td className="px-5 py-4 align-middle text-right text-slate-500">{item.baseUnit}</td>
                    <td className="px-5 py-4 align-middle text-right text-slate-800">{formatCurrency(item.averageCost)}</td>
                    <td className="px-5 py-4 align-middle text-right text-slate-900 font-semibold">
                      {formatCurrency(item.totalValue)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
};

export default StockReportPage;
