import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import SectionCard from "../../components/SectionCard.jsx";
import FormField from "../../components/FormField.jsx";
import SearchSelect from "../../components/SearchSelect.jsx";
import { api } from "../../api/client.js";
import { normalizeDateInput, toDisplay, validateDisplayDate } from "../../utils/date.js";

const tabConfig = [
  { key: "out", label: "Damage-Out", description: "Mark supplier stock as damaged and deduct quantities." },
  { key: "in", label: "Damage-In", description: "Record replacements or claims credited back to stock." }
];

const defaultFilters = () => {
  const today = toDisplay(new Date());
  const monthStart = (() => {
    const now = new Date();
    return toDisplay(new Date(now.getFullYear(), now.getMonth(), 1));
  })();
  return {
    startDate: monthStart,
    endDate: today,
    supplierCode: "",
    supplierLabel: "",
    type: "",
    voucher: ""
  };
};

const DamageTransactionPage = () => {
  const [activeTab, setActiveTab] = useState("out");
  const [supplierQuery, setSupplierQuery] = useState("");
  const [itemQuery, setItemQuery] = useState("");
  const [status, setStatus] = useState(null);
  const [errors, setErrors] = useState(null);
  const [availability, setAvailability] = useState(null);
  const [filters, setFilters] = useState(defaultFilters);
  const [meta, setMeta] = useState({ nextVoucher: "V000001" });

  const createFormState = () => ({
    supplierCode: "",
    supplierLabel: "",
    itemCode: "",
    itemLabel: "",
    itemPurchaseRate: null,
    itemPurchaseValue: null,
    itemBaseUnit: "",
    itemPackSize: 0,
    itemCompanyName: "",
    quantityMode: "pieces",
    quantity: "",
    notes: "",
    date: toDisplay(new Date())
  });
  const [formState, setFormState] = useState(createFormState);

  const queryClient = useQueryClient();

  const supplierLookup = useQuery({
    queryKey: ["damage-suppliers", { search: supplierQuery }],
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

  const supplierItems = useQuery({
    queryKey: [
      "damage-items",
      {
        supplierCode: formState.supplierCode,
        search: itemQuery,
        type: activeTab
      }
    ],
    enabled: Boolean(formState.supplierCode),
    queryFn: async ({ queryKey }) => {
      const [, params] = queryKey;
      const response = await api.get("/supplier-items", {
        params: {
          supplierCode: params.supplierCode,
          search: params.search,
          type: params.type === "in" ? "in" : undefined
        }
      });
      return response.data;
    }
  });

  const itemOptions = useMemo(() => {
    return supplierItems.data?.map((item) => ({
      value: item.id,
      code: item.code,
      label: `${item.code} — ${item.name}`,
      purchaseRate:
        item.last_purchase_rate != null ? Number(item.last_purchase_rate) : null,
      purchaseValue:
        item.last_purchase_value != null ? Number(item.last_purchase_value) : null,
      baseUnit: item.base_unit || "",
      packSize: Number(item.pack_size ?? 0),
      companyName: item.company_name || ""
    })) ?? [];
  }, [supplierItems.data]);

  const isPackItem = useMemo(() => {
    const packSize = Number(formState.itemPackSize || 0);
    const baseUnit = String(formState.itemBaseUnit || "").toLowerCase();
    return packSize > 0 && ["carton", "pack", "box"].includes(baseUnit);
  }, [formState.itemPackSize, formState.itemBaseUnit]);

  const computedQuantityUnits = useMemo(() => {
    const qty = Number(formState.quantity || 0);
    if (!Number.isFinite(qty) || qty <= 0) return 0;
    if (isPackItem) {
      const packSize = Number(formState.itemPackSize || 0);
      if (formState.quantityMode === "full") {
        return qty;
      }
      return packSize > 0 ? qty / packSize : qty;
    }
    return qty;
  }, [formState.quantity, formState.quantityMode, formState.itemPackSize, isPackItem]);

  useEffect(() => {
    if (!formState.itemCode) {
      setAvailability(null);
      return;
    }
    let cancelled = false;
    api
      .get(`/items/${encodeURIComponent(formState.itemCode)}/availability`)
      .then((response) => {
        if (cancelled) return;
        setAvailability(Number(response.data?.quantity ?? 0));
      })
      .catch(() => {
        if (cancelled) return;
        setAvailability(null);
      });
    return () => {
      cancelled = true;
    };
  }, [formState.itemCode]);

  const mutation = useMutation({
    mutationFn: async (payload) => {
      const response = await api.post("/damage-transactions", payload);
      return response.data;
    },
    onMutate: () => {
      setStatus(null);
      setErrors(null);
    },
    onSuccess: (data) => {
      const voucherMessage = data?.voucher_no ? ` (Voucher ${data.voucher_no})` : "";
      setStatus({ type: "success", message: `Damage transaction recorded${voucherMessage}.` });
      setFormState(createFormState());
      setSupplierQuery("");
      setItemQuery("");
      setAvailability(null);
      queryClient.invalidateQueries({ queryKey: ["damage-transactions-list"] });
      queryClient.invalidateQueries({ queryKey: ["stock-report"] });
      queryClient.invalidateQueries({ queryKey: ["reports/damage"] });
      const nextVoucher = data?.nextVoucher;
      if (nextVoucher) {
        setMeta({ nextVoucher });
      } else {
        api
          .get("/metadata/next/damage-voucher")
          .then((response) => setMeta(response.data))
          .catch(() => null);
      }
    },
    onError: (error) => {
      const message = error?.message || "Failed to record damage transaction.";
      const code = error?.status;
      setErrors({ message, code });
      setStatus({ type: "error", message });
    }
  });

  useEffect(() => {
    api
      .get("/metadata/next/damage-voucher")
      .then((response) => setMeta(response.data))
      .catch(() => null);
  }, []);

  const listQuery = useQuery({
    queryKey: ["damage-transactions-list", filters],
    queryFn: async ({ queryKey }) => {
      const [, params] = queryKey;
      const response = await api.get("/damage-transactions", {
        params: {
          supplierCode: params.supplierCode || undefined,
          type: params.type || undefined,
          startDate: params.startDate || undefined,
          endDate: params.endDate || undefined,
          voucher: params.voucher || undefined
        }
      });
      return response.data;
    }
  });

  const validateForm = () => {
    if (!formState.supplierCode) return "Select a supplier.";
    if (!formState.itemCode) return "Select an item purchased from the supplier.";
    if (!formState.date || !validateDisplayDate(formState.date)) return "Enter a valid transaction date.";
    const qty = Number(formState.quantity);
    if (!Number.isFinite(qty) || qty <= 0) return "Enter a quantity greater than zero.";
    if (!formState.notes.trim()) return "Enter a reason/notes for this transaction.";
    if (activeTab === "out" && availability != null && computedQuantityUnits - availability > 1e-6) {
      return `Quantity exceeds available stock (${availability.toFixed(2)}).`;
    }
    return null;
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const errorMessage = validateForm();
    if (errorMessage) {
      setStatus(null);
      setErrors({ message: errorMessage });
      return;
    }

    setErrors(null);
    setStatus(null);

    mutation.mutate({
      type: activeTab,
      supplierCode: formState.supplierCode,
      itemCode: formState.itemCode,
      quantity: computedQuantityUnits,
      date: formState.date,
      notes: formState.notes.trim()
    });
  };

  return (
    <div className="space-y-6">
      <SectionCard
        title="Damage-IN/Out"
        description="Manage damaged inventory adjustments across supplier stock."
        actions={
          status ? (
            <span className={`text-xs ${status.type === "error" ? "text-rose-500" : "text-emerald-600"}`}>
              {status.message}
            </span>
          ) : null
        }
      >
        <div className="flex items-center gap-3">
          {tabConfig.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                setActiveTab(tab.key);
                setFormState((prev) => ({
                  ...prev,
                  itemCode: "",
                  itemLabel: "",
                  itemPurchaseRate: null,
                  itemPurchaseValue: null,
                  quantity: ""
                }));
                setItemQuery("");
                setAvailability(null);
                setStatus(null);
                setErrors(null);
              }}
              className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                activeTab === tab.key
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-600 border border-slate-200 hover:border-slate-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500 -mt-2 mb-2">
          {tabConfig.find((tab) => tab.key === activeTab)?.description}
        </p>
        {errors ? <p className="text-xs text-rose-500">{errors.message}</p> : null}
        <form className="grid md:grid-cols-3 gap-4" onSubmit={handleSubmit}>
          <FormField label="Voucher No.">
            <input value={meta.nextVoucher || "V000001"} disabled />
          </FormField>
          <FormField label="Transaction Date" required>
            <input
              value={formState.date}
              onChange={(event) => {
                const value = normalizeDateInput(event.target.value);
                setFormState((prev) => ({ ...prev, date: value }));
              }}
              placeholder="DD-MM-YYYY"
            />
          </FormField>
          <SearchSelect
            label="Supplier"
            placeholder="Search suppliers"
            className="md:col-span-1"
            value={
              formState.supplierCode
                ? { label: formState.supplierLabel || formState.supplierCode }
                : null
            }
            onSelect={(option) => {
              setFormState((prev) => ({
                ...prev,
                supplierCode: option?.code || "",
                supplierLabel: option?.label || "",
                itemCode: "",
                itemLabel: "",
                itemPurchaseRate: null,
                itemPurchaseValue: null,
                itemBaseUnit: "",
                itemPackSize: 0,
                itemCompanyName: "",
                quantityMode: "pieces",
                quantity: ""
              }));
              setItemQuery("");
              setAvailability(null);
              setErrors(null);
              setStatus(null);
            }}
            onSearch={setSupplierQuery}
            results={supplierOptions}
          />
          <SearchSelect
            label="Item"
            placeholder="Search supplier items"
            className="md:col-span-1"
            disabled={!formState.supplierCode}
            value={
              formState.itemCode
                ? { label: formState.itemLabel || formState.itemCode }
                : null
            }
            onSelect={(option) => {
              setFormState((prev) => ({
                ...prev,
                itemCode: option?.code || "",
                itemLabel: option?.label || "",
                itemPurchaseRate: option?.purchaseRate ?? null,
                itemPurchaseValue: option?.purchaseValue ?? null,
                itemBaseUnit: option?.baseUnit || "",
                itemPackSize: option?.packSize || 0,
                itemCompanyName: option?.companyName || "",
                quantityMode: "pieces",
                quantity: ""
              }));
              setAvailability(null);
              setErrors(null);
              setStatus(null);
            }}
            onSearch={setItemQuery}
            results={itemOptions}
            renderItem={(option) => (
              <div className="flex justify-between items-center w-full">
                <span>{option.label}</span>
                {option.purchaseRate != null ? (
                  <span className="text-xs text-slate-500">
                    Rate: {option.purchaseRate.toFixed(2)}
                  </span>
                ) : null}
              </div>
            )}
            emptyMessage={
              formState.supplierCode
                ? "No matching items"
                : "Select a supplier first"
            }
          />
          {formState.itemCompanyName ? (
            <FormField label="Company" className="md:col-span-1">
              <input value={formState.itemCompanyName} disabled />
            </FormField>
          ) : null}
          {isPackItem ? (
            <FormField label="Quantity Type" className="md:col-span-1">
              <select
                value={formState.quantityMode}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    quantityMode: event.target.value
                  }))
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="pieces">Pieces</option>
                <option value="full">Full Pack/Carton</option>
              </select>
            </FormField>
          ) : null}
          <FormField label="Last Purchase Rate" className="md:col-span-1">
            <input
              value={
                formState.itemPurchaseRate != null
                  ? formState.itemPurchaseRate.toFixed(2)
                  : "--"
              }
              disabled
              placeholder="--"
            />
          </FormField>
          <FormField label="Last Purchase Value" className="md:col-span-1">
            <input
              value={
                formState.itemPurchaseValue != null
                  ? formState.itemPurchaseValue.toFixed(2)
                  : "--"
              }
              disabled
              placeholder="--"
            />
          </FormField>
          <FormField
            label="Available Stock"
            className="md:col-span-1"
            description={activeTab === "out" ? "Damage-Out cannot exceed available stock." : undefined}
          >
            <input value={availability != null ? availability.toFixed(2) : "--"} disabled />
          </FormField>
          <FormField label="Quantity" required>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={formState.quantity}
              onChange={(event) => {
                setFormState((prev) => ({ ...prev, quantity: event.target.value }));
              }}
              placeholder={isPackItem && formState.quantityMode === "full" ? "Full pack/carton count" : "Pieces"}
            />
            {isPackItem ? (
              <p className="mt-1 text-xs text-slate-500">
                {formState.quantityMode === "full"
                  ? `Total cartons = ${computedQuantityUnits} (pieces = ${Number(formState.quantity || 0)} × ${Number(formState.itemPackSize || 0)})`
                  : `Total cartons = ${computedQuantityUnits.toFixed(3)} (pieces = ${Number(formState.quantity || 0)})`}
              </p>
            ) : null}
          </FormField>
          <FormField label="Notes / Reason" required className="md:col-span-2">
            <textarea
              value={formState.notes}
              onChange={(event) => {
                setFormState((prev) => ({ ...prev, notes: event.target.value }));
              }}
              rows={3}
              placeholder="Explain why this stock is damaged or restored"
            />
          </FormField>
          <div className="md:col-span-3 flex items-center justify-end">
            <button
              type="submit"
              className="primary px-4 py-2"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? "Saving..." : "Save Damage Transaction"}
            </button>
          </div>
        </form>
      </SectionCard>

      <SectionCard
        title="Damage Transaction Log"
        description="Audit trail of all Damage-IN/Out adjustments."
        actions={
          listQuery.isFetching ? <span className="text-xs text-slate-500">Loading…</span> : null
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
            label="Supplier Filter"
            placeholder="All suppliers"
            className="md:col-span-1"
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
          <FormField label="Type">
            <select
              value={filters.type}
              onChange={(event) => {
                setFilters((prev) => ({ ...prev, type: event.target.value }));
              }}
            >
              <option value="">All</option>
              <option value="out">Damage-Out</option>
              <option value="in">Damage-In</option>
            </select>
          </FormField>
          <FormField label="Voucher No.">
            <input
              value={filters.voucher}
              onChange={(event) => {
                const value = event.target.value.toUpperCase();
                setFilters((prev) => ({ ...prev, voucher: value }));
              }}
              placeholder="e.g. V000123"
            />
          </FormField>
          <div className="md:col-span-1 flex items-end">
            <button
              type="button"
              className="secondary px-4 py-2"
              onClick={() => setFilters(defaultFilters())}
            >
              Reset Filters
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 uppercase">
                <th className="py-2 pr-4">Voucher</th>
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Supplier</th>
                <th className="py-2 pr-4">Item</th>
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 pr-4 text-right">Purchase Rate</th>
                <th className="py-2 pr-4 text-right">Damage Value</th>
                <th className="py-2 pr-4 text-right">Quantity</th>
                <th className="py-2 pr-4">Notes</th>
              </tr>
            </thead>
            <tbody>
              {listQuery.data?.length ? (
                listQuery.data.map((row) => {
                  const purchaseRate =
                    row.last_purchase_rate != null ? Number(row.last_purchase_rate) : null;
                  const quantity = Number(row.quantity || 0);
                  const damageValue =
                    purchaseRate != null ? purchaseRate * quantity : null;
                  return (
                    <tr key={row.id} className="border-t border-slate-200">
                      <td className="py-2 pr-4">{row.voucher_no}</td>
                      <td className="py-2 pr-4">{row.transaction_date}</td>
                      <td className="py-2 pr-4">{`${row.supplier_code} — ${row.supplier_name}`}</td>
                      <td className="py-2 pr-4">{`${row.item_code} — ${row.item_name}`}</td>
                      <td className="py-2 pr-4 capitalize">{row.transaction_type === "out" ? "Damage-Out" : "Damage-In"}</td>
                      <td className="py-2 pr-4 text-right">
                        {purchaseRate != null ? purchaseRate.toFixed(2) : "--"}
                      </td>
                      <td className="py-2 pr-4 text-right">
                        {damageValue != null ? damageValue.toFixed(2) : "--"}
                      </td>
                      <td className="py-2 pr-4 text-right">{quantity.toFixed(2)}</td>
                      <td className="py-2 pr-4">{row.notes}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td className="py-4 text-center text-slate-500" colSpan={9}>
                    {listQuery.isFetching ? "Loading transactions…" : "No damage transactions found."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
};

export default DamageTransactionPage;
