import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FiSearch } from "react-icons/fi";
import SectionCard from "../../components/SectionCard.jsx";
import FormField from "../../components/FormField.jsx";
import SearchSelect from "../../components/SearchSelect.jsx";
import { api } from "../../api/client.js";
import { normalizeDateInput, toDisplay } from "../../utils/date.js";

const defaultFilters = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    invoiceNo: "",
    supplierId: "",
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

const BillCheckingPage = () => {
  const [mode, setMode] = useState("invoice"); // "invoice" or "supplier"
  const [filters, setFilters] = useState(defaultFilters);
  const [supplierSearch, setSupplierSearch] = useState("");

  // Load suppliers for dropdown
  const supplierLookup = useQuery({
    queryKey: ["bill-checking-suppliers", supplierSearch],
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

  // Fetch bill details by invoice number
  const billQuery = useQuery({
    queryKey: ["bill-checking-by-number", filters.invoiceNo],
    enabled: Boolean(filters.invoiceNo && mode === "invoice"),
    queryFn: async () => {
      const response = await api.get("/reports/purchase/bill-details", {
        params: { invoiceNo: filters.invoiceNo }
      });
      return response.data;
    }
  });

  // Fetch bills by supplier and date range
  const billsListQuery = useQuery({
    queryKey: ["bill-checking-by-filter", filters.supplierId, filters.startDate, filters.endDate],
    enabled: Boolean(filters.supplierId && mode === "supplier"),
    queryFn: async () => {
      const response = await api.get("/reports/purchase/bills-by-supplier", {
        params: {
          supplierId: filters.supplierId,
          startDate: filters.startDate || undefined,
          endDate: filters.endDate || undefined
        }
      });
      return response.data;
    }
  });

  const handleSearchByInvoice = (e) => {
    e.preventDefault();
    // Invoice number is already in filters, query will trigger automatically
  };

  const handleSelectBill = (bill) => {
    setFilters((prev) => ({
      ...prev,
      invoiceNo: bill.invoice_no
    }));
    setMode("invoice");
  };

  const handleClear = () => {
    setFilters(defaultFilters());
    setMode("invoice");
  };

  const bill = billQuery.data?.bill;
  const items = billQuery.data?.items ?? [];
  const billsList = billsListQuery.data?.bills ?? [];

  return (
    <SectionCard
      title="Bill Checking"
      description="Search by invoice number, or browse by supplier and date"
    >
      <div className="space-y-6">
        {/* Tab-like interface */}
        <div className="flex gap-2 border-b border-slate-200">
          <button
            type="button"
            onClick={() => setMode("invoice")}
            className={`px-4 py-2 font-medium transition-colors ${
              mode === "invoice"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-slate-600 hover:text-slate-800"
            }`}
          >
            Search by Invoice #
          </button>
          <button
            type="button"
            onClick={() => setMode("supplier")}
            className={`px-4 py-2 font-medium transition-colors ${
              mode === "supplier"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-slate-600 hover:text-slate-800"
            }`}
          >
            Browse by Supplier
          </button>
        </div>

        {/* Search by Invoice Number */}
        {mode === "invoice" && (
          <div className="space-y-4">
            <form onSubmit={handleSearchByInvoice} className="flex gap-3">
              <div className="flex-1 min-w-[200px]">
                <input
                  type="text"
                  value={filters.invoiceNo}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, invoiceNo: e.target.value.toUpperCase() }))
                  }
                  placeholder="Enter Invoice Number (e.g., 23, 456)"
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
                  autoFocus
                />
              </div>
              <button
                type="submit"
                disabled={billQuery.isFetching || !filters.invoiceNo}
                className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-lg font-medium transition-colors whitespace-nowrap"
              >
                <FiSearch className="text-lg" />
                Search
              </button>
              {filters.invoiceNo && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="px-4 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-medium transition-colors"
                >
                  Clear
                </button>
              )}
            </form>

            {billQuery.isFetching && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center text-slate-500">
                <div className="animate-pulse">Searching for bill #{filters.invoiceNo}…</div>
              </div>
            )}

            {billQuery.error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center text-red-600">
                <div className="font-semibold">Bill Not Found</div>
                <div className="text-sm mt-1">
                  {billQuery.error.message || "No bill found with that invoice number"}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Browse by Supplier */}
        {mode === "supplier" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <SearchSelect
                  label="Select Supplier"
                  placeholder="Search and select supplier"
                  value={
                    filters.supplierId
                      ? {
                          value: filters.supplierId,
                          label: filters.supplierLabel || filters.supplierId
                        }
                      : null
                  }
                  onSelect={(option) => {
                    setFilters((prev) => ({
                      ...prev,
                      supplierId: option?.value || "",
                      supplierLabel: option?.label || ""
                    }));
                  }}
                  onSearch={setSupplierSearch}
                  results={supplierOptions}
                />
              </div>
              <button
                type="button"
                onClick={handleClear}
                className="mt-7 px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-medium transition-colors"
              >
                Clear All
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
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
              <div>
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
            </div>

            {billsListQuery.isFetching && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center text-slate-500">
                <div className="animate-pulse">Loading bills…</div>
              </div>
            )}

            {billsListQuery.error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center text-red-600">
                <div className="font-semibold">Error loading bills</div>
                <div className="text-sm mt-1">{billsListQuery.error.message}</div>
              </div>
            )}

            {filters.supplierId && !billsListQuery.isFetching && billsList.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-3">
                  Found {billsList.length} bill(s)
                </h3>
                <div className="grid gap-2 max-h-64 overflow-y-auto">
                  {billsList.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => handleSelectBill(b)}
                      className="text-left p-3 rounded-lg border border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-all"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-semibold text-slate-800">Invoice #{b.invoice_no}</div>
                          <div className="text-sm text-slate-600">{b.invoice_date}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-slate-900">{formatCurrency(b.total_amount)}</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {filters.supplierId && !billsListQuery.isFetching && billsList.length === 0 && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center text-slate-500">
                No bills found for this supplier in the selected date range.
              </div>
            )}
          </div>
        )}

        {/* Bill Details Display */}
        {bill && items.length > 0 && (
          <div className="mt-8 border-t border-slate-200 pt-6">
            {/* Header */}
            <div className="bg-slate-50 font-mono text-sm mb-6 p-4 border border-slate-200 rounded">
              <div className="font-semibold text-base mb-2">{bill.supplier_name}</div>
              <div className="mb-1">PURCHASE INVOICE # : {bill.invoice_no}</div>
              <div className="text-xs text-slate-600">DATE: {bill.invoice_date}</div>
            </div>

            {/* Table - Legacy Format */}
            <div className="mb-4 border border-slate-300 bg-white">
              <div className="font-mono text-xs">
                {/* Header Row */}
                <div className="flex border-b-2 border-slate-400 bg-slate-50">
                  <div className="flex-1 px-3 py-2 border-r border-slate-300 font-semibold text-center min-w-[80px]">QUANTITY</div>
                  <div className="flex-[3] px-3 py-2 border-r border-slate-300 font-semibold min-w-[200px]">ITEM DESCRIPTION</div>
                  <div className="flex-1 px-3 py-2 border-r border-slate-300 font-semibold text-center min-w-[70px]">PACKING</div>
                  <div className="flex-1 px-3 py-2 border-r border-slate-300 font-semibold text-center min-w-[50px]">TAX</div>
                  <div className="flex-1 px-3 py-2 border-r border-slate-300 font-semibold text-right min-w-[80px]">RATE</div>
                  <div className="flex-1 px-3 py-2 border-r border-slate-300 font-semibold text-center min-w-[50px]">DISC.</div>
                  <div className="flex-1 px-3 py-2 font-semibold text-right min-w-[100px]">NET AMOUNT</div>
                </div>

                {/* Separator */}
                <div className="border-b border-dashed border-slate-300"></div>

                {/* Data Rows */}
                {items.map((item, index) => (
                  <div key={index} className="flex border-b border-slate-300 hover:bg-slate-50 transition">
                    <div className="flex-1 px-3 py-2 border-r border-slate-300 text-right">{item.quantity}</div>
                    <div className="flex-[3] px-3 py-2 border-r border-slate-300">{item.item_name || "-"}</div>
                    <div className="flex-1 px-3 py-2 border-r border-slate-300 text-center">{item.packing || "-"}</div>
                    <div className="flex-1 px-3 py-2 border-r border-slate-300 text-center">{item.tax || "-"}</div>
                    <div className="flex-1 px-3 py-2 border-r border-slate-300 text-right">{Number(item.purchase_rate || 0).toFixed(2)}</div>
                    <div className="flex-1 px-3 py-2 border-r border-slate-300 text-center">{item.discount || "0"}%</div>
                    <div className="flex-1 px-3 py-2 text-right font-semibold">{Number(item.total_amount || 0).toFixed(2)}</div>
                  </div>
                ))}

                {/* Bottom Border */}
                <div className="border-t-2 border-slate-400"></div>
              </div>
            </div>

            {/* Totals Row */}
            <div className="font-mono text-sm bg-slate-50 border border-slate-300 px-4 py-3 rounded flex justify-between items-center">
              <div className="font-semibold">
                TOTAL # OF ITEMS : <span className="ml-2">{items.length}</span>
              </div>
              <div className="font-semibold text-lg">
                {Number(bill.total_amount || 0).toFixed(2)}
              </div>
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  );
};

export default BillCheckingPage;
