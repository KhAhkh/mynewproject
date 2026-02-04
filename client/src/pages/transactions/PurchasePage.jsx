import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import SectionCard from "../../components/SectionCard.jsx";
import FormField from "../../components/FormField.jsx";
import SearchSelect from "../../components/SearchSelect.jsx";
import { api } from "../../api/client.js";
import { toDisplay } from "../../utils/date.js";

const PurchasePage = () => {
  const [supplierQuery, setSupplierQuery] = useState("");
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [formState, setFormState] = useState({
    supplierCode: "",
    supplierDisplay: "",
    invoiceNo: "",
    lastInvoice: "",
    date: toDisplay(new Date()),
    items: [],
    amountPaid: "",
    previousBalance: ""
  });
  const [itemSearch, setItemSearch] = useState("");
  const [status, setStatus] = useState(null);
  const queryClient = useQueryClient();

  const getEffectiveRate = (item) => {
    const quantity = parseFloat(item.quantity) || 0;
    const bonus = parseFloat(item.bonus) || 0;
    const rate = parseFloat(item.purchaseRate) || 0;
    const totalUnits = quantity + bonus;
    if (bonus > 0 && quantity > 0 && totalUnits > 0) {
      return (quantity * rate) / totalUnits;
    }
    return rate;
  };

  const subtotal = useMemo(() => {
    return formState.items.reduce((running, item) => {
      const quantity = parseFloat(item.quantity) || 0;
      const bonus = parseFloat(item.bonus) || 0;
      const discountPercent = parseFloat(item.discountPercent) || 0;
      const taxPercent = parseFloat(item.taxPercent) || 0;
      const rate = getEffectiveRate(item);
      const net = (quantity + bonus) * rate * (1 - discountPercent / 100) * (1 + taxPercent / 100);
      return running + net;
    }, 0);
  }, [formState.items]);

  const supplierLookup = useQuery({
    queryKey: ["suppliers", { search: supplierQuery }],
    queryFn: async () => {
      const response = await api.get("/suppliers", { params: { search: supplierQuery } });
      return response.data;
    }
  });

  const supplierCodeForQuery = formState.supplierCode;

  const lastInvoiceQuery = useQuery({
    queryKey: ["purchases", "last-invoice", supplierCodeForQuery || "all"],
    queryFn: async () => {
      const params = supplierCodeForQuery ? { supplierCode: supplierCodeForQuery } : {};
      const response = await api.get("/purchases/last-invoice", { params });
      return response.data;
    }
  });

  const latestInvoiceNumber = lastInvoiceQuery.data?.invoiceNo ?? "";

  useEffect(() => {
    setFormState((prev) =>
      prev.lastInvoice === latestInvoiceNumber ? prev : { ...prev, lastInvoice: latestInvoiceNumber }
    );
  }, [latestInvoiceNumber]);

  const itemsLookup = useQuery({
    queryKey: ["items", { search: itemSearch, inStock: false }],
    queryFn: async () => {
      const response = await api.get("/items", { params: { search: itemSearch } });
      return response.data;
    }
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const { supplierDisplay, ...submissionState } = formState;
      const payload = {
        ...submissionState,
        amountPaid: Number(formState.amountPaid) || 0,
        previousBalance: Number(formState.previousBalance) || 0,
        subtotal: Number(subtotal.toFixed(2)),
        items: formState.items.map((item) => ({
          itemCode: item.code,
          quantity: Number(item.quantity) || 0,
          bonus: Number(item.bonus) || 0,
          discountPercent: Number(item.discountPercent) || 0,
          taxPercent: Number(item.taxPercent) || 0,
          purchaseRate: Number(getEffectiveRate(item)) || 0
        }))
      };
      const response = await api.post("/purchases", payload);
      return response.data;
    },
    onMutate: () => setStatus(null),
    onSuccess: () => {
      setStatus({ type: "success", message: "Purchase saved successfully." });
      setFormState({
        supplierCode: "",
        supplierDisplay: "",
        invoiceNo: "",
        lastInvoice: "",
        date: toDisplay(new Date()),
        items: [],
        amountPaid: "",
        previousBalance: ""
      });
      setSupplierQuery("");
      setItemSearch("");
      queryClient.invalidateQueries({ queryKey: ["purchases", "last-invoice"] });
      queryClient.invalidateQueries({ queryKey: ["stock-report"] });
    },
    onError: (error) => {
      const message = error?.response?.data?.message || error?.message || "Failed to save purchase.";
      setStatus({ type: "error", message });
    }
  });

  const handleAddItem = (item) => {
    setFormState((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          code: item.code,
          name: item.name,
          baseUnit: item.base_unit,
          quantity: "",
          bonus: "",
          discountPercent: "",
          taxPercent: item.sales_tax ?? "",
          purchaseRate: item.purchase_rate
        }
      ]
    }));
    setItemModalOpen(false);
  };

  const handleItemChange = (index, key, value) => {
    setFormState((prev) => ({
      ...prev,
      items: prev.items.map((item, idx) =>
        idx === index ? { ...item, [key]: value } : item
      )
    }));
  };

  const handleRemoveItem = (index) => {
    setFormState((prev) => ({
      ...prev,
      items: prev.items.filter((_, idx) => idx !== index)
    }));
  };

  return (
    <div className="space-y-6">
      <SectionCard
        title="Purchase Entry"
        description="Capture supplier invoices with item details."
        actions={
          <Link to="/history/transactions?type=purchase" className="secondary text-xs px-3 py-1">
            View saved purchases
          </Link>
        }
      >
        <form className="grid gap-4" onSubmit={(event) => {
          event.preventDefault();
          if (!formState.supplierCode) {
            setStatus({ type: "error", message: "Select a supplier before saving." });
            return;
          }
          if (!formState.invoiceNo.trim()) {
            setStatus({ type: "error", message: "Enter an invoice number." });
            return;
          }
          if (!formState.date.trim()) {
            setStatus({ type: "error", message: "Enter an invoice date." });
            return;
          }
          if (formState.items.length === 0) {
            setStatus({ type: "error", message: "Add at least one item before saving." });
            return;
          }
          mutation.mutate();
        }}>
          <div className="grid md:grid-cols-3 gap-4">
            <SearchSelect
              label="Supplier"
              placeholder="Search supplier"
              value={{ label: formState.supplierDisplay || formState.supplierCode }}
              onSelect={(item) =>
                setFormState((prev) => ({
                  ...prev,
                  supplierCode: item.code,
                  supplierDisplay: item.label
                }))
              }
              onSearch={setSupplierQuery}
              results={supplierLookup.data?.map((supplier) => ({
                value: supplier.id,
                code: supplier.code,
                label: `${supplier.code} — ${supplier.name}`
              })) ?? []}
            />
            <FormField label="Invoice No." required>
              <input
                value={formState.invoiceNo}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, invoiceNo: event.target.value }))
                }
                required
              />
            </FormField>
            <FormField label="Last Invoice">
              <input
                value={formState.lastInvoice}
                readOnly
              />
            </FormField>
            <FormField label="Date" required>
              <input
                value={formState.date}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, date: event.target.value }))
                }
                required
              />
            </FormField>
          </div>

          <div className="border border-slate-200 bg-white rounded-[24px] overflow-hidden shadow-[0_20px_55px_rgba(15,23,42,0.12)]">
            <header className="flex items-center justify-between bg-slate-50 px-5 py-4 border-b border-slate-200">
              <h3 className="text-sm font-semibold text-slate-700">Items</h3>
              <button type="button" className="primary text-xs" onClick={() => setItemModalOpen(true)}>
                Add Item
              </button>
            </header>
            <div className="divide-y divide-slate-100">
              {formState.items.length === 0 ? (
                <p className="p-5 text-sm text-slate-500">No items yet</p>
              ) : (
                formState.items.map((item, index) => (
                  <div key={`${item.code}-${index}`} className="grid md:grid-cols-7 gap-3 px-5 py-4 text-sm text-slate-700">
                    <div>
                      <p className="font-medium text-slate-800">{item.code}</p>
                      <p className="text-xs text-slate-500">{item.name}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Base Unit</p>
                      <p className="text-slate-800">{item.baseUnit}</p>
                    </div>
                    <div>
                      <input
                        type="number"
                        placeholder="Quantity"
                        value={item.quantity}
                        onChange={(event) => handleItemChange(index, "quantity", event.target.value)}
                      />
                    </div>
                    <div>
                      <input
                        type="number"
                        placeholder="Bonus"
                        value={item.bonus}
                        onChange={(event) => handleItemChange(index, "bonus", event.target.value)}
                      />
                    </div>
                    <div>
                      <input
                        type="number"
                        placeholder="Discount %"
                        value={item.discountPercent}
                        onChange={(event) => handleItemChange(index, "discountPercent", event.target.value)}
                      />
                    </div>
                    <div>
                      <input
                        type="number"
                        placeholder="Tax %"
                        value={item.taxPercent}
                        onChange={(event) => handleItemChange(index, "taxPercent", event.target.value)}
                      />
                    </div>
                    <div>
                      <input
                        type="number"
                        placeholder="Purchase Rate"
                        value={item.purchaseRate}
                        onChange={(event) => handleItemChange(index, "purchaseRate", event.target.value)}
                      />
                    </div>
                    <button
                      type="button"
                      className="secondary text-xs md:col-span-7 justify-self-end"
                      onClick={() => handleRemoveItem(index)}
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <FormField label="Subtotal">
              <input value={subtotal.toFixed(2)} readOnly />
            </FormField>
            <FormField label="Amount Paid">
              <input
                type="number"
                value={formState.amountPaid}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, amountPaid: event.target.value }))
                }
              />
            </FormField>
            <FormField label="Previous Balance">
              <input
                type="number"
                value={formState.previousBalance}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, previousBalance: event.target.value }))
                }
              />
            </FormField>
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              className="secondary"
              onClick={() => setFormState((prev) => ({ ...prev, items: [] }))}
              disabled={mutation.isPending}
            >
              Reset Items
            </button>
            <button type="submit" className="primary" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving..." : "Save Purchase"}
            </button>
          </div>
          {status ? (
            <p
              className={`text-sm ${
                status.type === "error" ? "text-rose-400" : "text-emerald-400"
              }`}
            >
              {status.message}
            </p>
          ) : null}
        </form>
      </SectionCard>

      {itemModalOpen ? (
        <div className="fixed inset-0 bg-slate-900/30 backdrop-blur flex items-center justify-center z-50">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-[0_24px_60px_rgba(15,23,42,0.18)] w-full max-w-3xl h-[70vh] grid grid-rows-[auto,1fr]">
            <header className="p-5 border-b border-slate-200 flex items-center justify-between text-slate-800">
              <h3 className="text-sm font-semibold">Select Item</h3>
              <button className="secondary text-xs" onClick={() => setItemModalOpen(false)}>
                Close
              </button>
            </header>
            <div className="p-5 space-y-4 overflow-y-auto scrollbar-thin text-slate-700">
              <input
                placeholder="Search item"
                value={itemSearch}
                onChange={(event) => setItemSearch(event.target.value)}
              />
              <div className="grid gap-3">
                {itemsLookup.data?.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="flex justify-between items-center bg-white border border-slate-200 rounded-2xl px-5 py-4 hover:bg-slate-50 shadow-sm transition"
                    onClick={() => handleAddItem(item)}
                  >
                    <div>
                      <p className="font-semibold text-slate-800">{item.code} — {item.name}</p>
                      <p className="text-xs text-slate-500">{item.company_name} • {item.base_unit}</p>
                    </div>
                    <span className="text-sm text-slate-600">Purchase Rate: {item.purchase_rate}</span>
                  </button>
                )) ?? <p className="text-sm text-slate-500">No results</p>}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default PurchasePage;
