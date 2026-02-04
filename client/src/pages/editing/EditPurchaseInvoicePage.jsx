import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import SectionCard from "../../components/SectionCard.jsx";
import FormField from "../../components/FormField.jsx";
import SearchSelect from "../../components/SearchSelect.jsx";
import { api } from "../../api/client.js";
import { toDisplay } from "../../utils/date.js";

const emptyFormState = {
  supplierCode: "",
  supplierDisplay: "",
  lastInvoice: "",
  date: "",
  items: [],
  amountPaid: "",
  previousBalance: ""
};

const EditPurchaseInvoicePage = () => {
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceLocked, setInvoiceLocked] = useState(false);
  const [status, setStatus] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedOption, setSelectedOption] = useState(null);
  const [invoiceDetails, setInvoiceDetails] = useState(null);
  const [isLoadingInvoice, setIsLoadingInvoice] = useState(false);
  const [supplierQuery, setSupplierQuery] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [itemEditIndex, setItemEditIndex] = useState(null);
  const [formState, setFormState] = useState({ ...emptyFormState });
  const queryClient = useQueryClient();

  const subtotal = useMemo(() => {
    return formState.items.reduce((running, item) => {
      const quantity = parseFloat(item.quantity) || 0;
      const rate = parseFloat(item.purchaseRate) || 0;
      return running + quantity * rate;
    }, 0);
  }, [formState.items]);

  const purchaseLookup = useQuery({
    queryKey: ["purchases", { search: searchTerm }],
    queryFn: async () => {
      const response = await api.get("/purchases", { params: { search: searchTerm } });
      return response.data;
    }
  });

  const supplierLookup = useQuery({
    queryKey: ["suppliers", { search: supplierQuery }],
    queryFn: async () => {
      const response = await api.get("/suppliers", { params: { search: supplierQuery } });
      return response.data;
    }
  });

  const itemsLookup = useQuery({
    queryKey: ["items", { search: itemSearch, inStock: false }],
    queryFn: async () => {
      const response = await api.get("/items", { params: { search: itemSearch } });
      return response.data;
    }
  });

  useEffect(() => {
    if (purchaseLookup.error) {
      setStatus({ type: "error", message: purchaseLookup.error.message });
    }
  }, [purchaseLookup.error]);

  const purchaseOptions = useMemo(
    () =>
      purchaseLookup.data?.map((purchase) => ({
        value: purchase.invoice_no,
        invoiceNo: purchase.invoice_no,
        label: `${purchase.invoice_no} — ${purchase.supplier_name}`,
        meta: purchase
      })) ?? [],
    [purchaseLookup.data]
  );

  const populateFormFromDetails = (details) => {
    if (!details?.purchase) return;
    const purchase = details.purchase;
    const items = details.items ?? [];
    setFormState({
      supplierCode: purchase.supplier_code || "",
      supplierDisplay: purchase.supplier_code && purchase.supplier_name
        ? `${purchase.supplier_code} — ${purchase.supplier_name}`
        : purchase.supplier_code || "",
      lastInvoice: purchase.last_invoice || "",
      date: toDisplay(purchase.invoice_date),
      items: items.map((item) => ({
        code: item.item_code,
        name: item.item_name,
        baseUnit: item.base_unit,
        quantity: item.quantity != null ? String(item.quantity) : "",
        bonus: item.bonus != null ? String(item.bonus) : "",
        discountPercent: item.discount_percent != null ? String(item.discount_percent) : "",
        purchaseRate: item.purchase_rate != null ? String(item.purchase_rate) : ""
      })),
      amountPaid:
        purchase.amount_paid != null ? String(Number(purchase.amount_paid).toFixed(2)) : "",
      previousBalance:
        purchase.previous_balance != null
          ? String(Number(purchase.previous_balance).toFixed(2))
          : ""
    });
    setSupplierQuery("");
  };

  const loadInvoice = async (value) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setStatus({ type: "error", message: "Enter the invoice number to load." });
      return;
    }
    setIsLoadingInvoice(true);
    setStatus({ type: "info", message: "Loading invoice details…" });
    try {
      const response = await api.get(`/purchases/${encodeURIComponent(trimmed)}`);
      setInvoiceDetails(response.data);
      populateFormFromDetails(response.data);
      setInvoiceNo(trimmed);
      setInvoiceLocked(true);
      if (response.data.purchase?.supplier_code && response.data.purchase?.supplier_name) {
        setSelectedOption({
          value: trimmed,
          invoiceNo: trimmed,
          label: `${trimmed} — ${response.data.purchase.supplier_name}`,
          meta: response.data.purchase
        });
      }
      setStatus({
        type: "success",
        message: "Invoice loaded. You can now review and edit the details."
      });
    } catch (error) {
      const message =
        error?.response?.data?.message || error?.message || "Failed to load invoice.";
      setInvoiceDetails(null);
      setFormState({ ...emptyFormState });
      setInvoiceLocked(false);
      setStatus({ type: "error", message });
    } finally {
      setIsLoadingInvoice(false);
    }
  };

  const handleOpenItemModal = (index = null) => {
    if (!invoiceLocked) {
      setStatus({ type: "error", message: "Load an invoice before editing items." });
      return;
    }
    setItemEditIndex(index ?? null);
    if (index != null) {
      const target = formState.items[index];
      if (target) {
        setItemSearch(target.name || target.code || "");
      }
    }
    setItemModalOpen(true);
  };

  const handleSelectItem = (item) => {
    setFormState((prev) => {
      const nextItems = [...prev.items];
      if (itemEditIndex != null && itemEditIndex >= 0 && itemEditIndex < nextItems.length) {
        const existing = nextItems[itemEditIndex];
        nextItems[itemEditIndex] = {
          ...existing,
          code: item.code,
          name: item.name,
          baseUnit: item.base_unit,
          purchaseRate:
            existing.purchaseRate !== "" && existing.purchaseRate != null
              ? existing.purchaseRate
              : item.purchase_rate != null
              ? String(item.purchase_rate)
              : ""
        };
      } else {
        nextItems.push({
          code: item.code,
          name: item.name,
          baseUnit: item.base_unit,
          quantity: "",
          bonus: "",
          discountPercent: "",
          purchaseRate: item.purchase_rate != null ? String(item.purchase_rate) : ""
        });
      }
      return { ...prev, items: nextItems };
    });
    setItemModalOpen(false);
    setItemEditIndex(null);
    setItemSearch("");
  };

  const handleItemChange = (index, key, value) => {
    setFormState((prev) => ({
      ...prev,
      items: prev.items.map((item, idx) => (idx === index ? { ...item, [key]: value } : item))
    }));
  };

  const handleRemoveItem = (index) => {
    setFormState((prev) => ({
      ...prev,
      items: prev.items.filter((_, idx) => idx !== index)
    }));
    setItemEditIndex(null);
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
      const trimmedInvoice = invoiceNo.trim();
      if (!trimmedInvoice) throw new Error("Missing invoice number.");
      const payload = {
        supplierCode: formState.supplierCode,
        lastInvoice: formState.lastInvoice,
        date: formState.date,
        amountPaid: Number(formState.amountPaid) || 0,
        previousBalance: Number(formState.previousBalance) || 0,
        subtotal: Number(subtotal.toFixed(2)),
        items: formState.items.map((item) => ({
          itemCode: item.code,
          quantity: Number(item.quantity) || 0,
          bonus: Number(item.bonus) || 0,
          discountPercent: Number(item.discountPercent) || 0,
          purchaseRate: Number(item.purchaseRate) || 0
        }))
      };
      const response = await api.put(`/purchases/${encodeURIComponent(trimmedInvoice)}`, payload);
      return response.data;
    },
    onMutate: () => setStatus(null),
    onSuccess: (data) => {
      setStatus({ type: "success", message: "Purchase updated successfully." });
      setInvoiceDetails(data);
      populateFormFromDetails(data);
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
      queryClient.invalidateQueries({ queryKey: ["stock-report"] });
    },
    onError: (error) => {
      const message = error?.response?.data?.message || error?.message || "Failed to update purchase.";
      setStatus({ type: "error", message });
    }
  });

  const isSaving = updateMutation.isPending;

  return (
    <div className="space-y-6">
      <SectionCard
        title="Edit Purchase Invoice"
        description="Review and amend posted purchase invoices without altering their unique numbers."
      >
        <form
          className="grid gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (!invoiceLocked) {
              setStatus({ type: "error", message: "Load an invoice before saving changes." });
              return;
            }
            if (!formState.supplierCode) {
              setStatus({ type: "error", message: "Select a supplier before saving." });
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
            updateMutation.mutate();
          }}
        >
          <div className="grid gap-4 md:grid-cols-[minmax(0,2fr),minmax(0,1fr)] items-end">
            <SearchSelect
              label="Search Purchases"
              placeholder="Search by supplier name or invoice number"
              value={selectedOption}
              onSelect={(option) => {
                setSelectedOption(option);
                setInvoiceNo(option.invoiceNo);
                setInvoiceDetails(null);
                setStatus(null);
                setInvoiceLocked(false);
                setFormState({ ...emptyFormState });
              }}
              onSearch={setSearchTerm}
              results={purchaseOptions}
              renderItem={(option) => (
                <div className="flex flex-col text-slate-700">
                  <span className="font-medium text-sm text-slate-800">{option.label}</span>
                  <span className="text-xs text-slate-500">
                    Total Amount: {Number(option.meta.total_amount ?? 0).toFixed(2)}
                  </span>
                </div>
              )}
            />
            <FormField label="Invoice No.">
              <input
                value={invoiceNo}
                placeholder="Enter or select an invoice number"
                readOnly={invoiceLocked}
                onChange={(event) => {
                  setInvoiceNo(event.target.value);
                  setInvoiceLocked(false);
                }}
              />
            </FormField>
          </div>
          {purchaseLookup.isFetching ? (
            <p className="text-xs text-slate-500">Searching…</p>
          ) : null}
          <div className="flex gap-3">
            <button
              type="button"
              className="secondary text-sm"
              onClick={() => loadInvoice(invoiceNo)}
              disabled={isLoadingInvoice}
            >
              {isLoadingInvoice ? "Loading…" : "Load Invoice"}
            </button>
            <button
              type="button"
              className="secondary text-sm"
              onClick={() => {
                setInvoiceNo("");
                setInvoiceLocked(false);
                setStatus(null);
                setSelectedOption(null);
                setSearchTerm("");
                setInvoiceDetails(null);
                setFormState({ ...emptyFormState });
                setIsLoadingInvoice(false);
              }}
            >
              Reset
            </button>
          </div>
          {invoiceLocked ? (
            <>
              <div className="grid md:grid-cols-3 gap-4">
                <SearchSelect
                  label="Supplier"
                  placeholder="Search supplier"
                  value={{ label: formState.supplierDisplay || formState.supplierCode }}
                  onSelect={(supplier) =>
                    setFormState((prev) => ({
                      ...prev,
                      supplierCode: supplier.code,
                      supplierDisplay: supplier.label
                    }))
                  }
                  onSearch={setSupplierQuery}
                  results={
                    supplierLookup.data?.map((supplier) => ({
                      value: supplier.id,
                      code: supplier.code,
                      label: `${supplier.code} — ${supplier.name}`
                    })) ?? []
                  }
                />
                <FormField label="Last Invoice">
                  <input
                    value={formState.lastInvoice}
                    onChange={(event) =>
                      setFormState((prev) => ({ ...prev, lastInvoice: event.target.value }))
                    }
                  />
                </FormField>
                <FormField label="Invoice Date" required>
                  <input
                    value={formState.date}
                    onChange={(event) =>
                      setFormState((prev) => ({ ...prev, date: event.target.value }))
                    }
                  />
                </FormField>
              </div>

              <div className="border border-slate-200 bg-white rounded-[24px] overflow-hidden shadow-[0_18px_45px_rgba(15,23,42,0.12)]">
                <header className="flex items-center justify-between bg-slate-50 px-5 py-4 border-b border-slate-200">
                  <h3 className="text-sm font-semibold text-slate-700">Items</h3>
                  <button
                    type="button"
                    className="primary text-xs"
                    onClick={handleOpenItemModal}
                  >
                    Add Item
                  </button>
                </header>
                <div className="divide-y divide-slate-100">
                  {formState.items.length === 0 ? (
                    <p className="p-5 text-sm text-slate-500">No items yet</p>
                  ) : (
                    formState.items.map((item, index) => (
                      <div
                        key={`${item.code}-${index}`}
                        className="grid md:grid-cols-6 gap-3 px-5 py-4 text-sm text-slate-700"
                      >
                        <div>
                          <p className="font-medium text-slate-800">{item.code}</p>
                          <p className="text-xs text-slate-500">{item.name}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">Base Unit</p>
                          <p className="text-slate-700">{item.baseUnit}</p>
                        </div>
                        <div>
                          <input
                            type="number"
                            placeholder="Quantity"
                            value={item.quantity}
                            onChange={(event) =>
                              handleItemChange(index, "quantity", event.target.value)
                            }
                          />
                        </div>
                        <div>
                          <input
                            type="number"
                            placeholder="Bonus"
                            value={item.bonus}
                            onChange={(event) =>
                              handleItemChange(index, "bonus", event.target.value)
                            }
                          />
                        </div>
                        <div>
                          <input
                            type="number"
                            placeholder="Discount %"
                            value={item.discountPercent}
                            onChange={(event) =>
                              handleItemChange(index, "discountPercent", event.target.value)
                            }
                          />
                        </div>
                        <div>
                          <input
                            type="number"
                            placeholder="Purchase Rate"
                            value={item.purchaseRate}
                            onChange={(event) =>
                              handleItemChange(index, "purchaseRate", event.target.value)
                            }
                          />
                        </div>
                        <div className="flex gap-2 md:col-span-6 justify-self-end">
                          <button
                            type="button"
                            className="secondary text-xs"
                            onClick={() => handleOpenItemModal(index)}
                          >
                            Change Item
                          </button>
                          <button
                            type="button"
                            className="secondary text-xs"
                            onClick={() => handleRemoveItem(index)}
                          >
                            Remove
                          </button>
                        </div>
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
                <button type="submit" className="primary" disabled={isSaving}>
                  {isSaving ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500 border border-dashed border-slate-300 rounded-lg px-4 py-3">
              Load an invoice to enable editing controls.
            </p>
          )}
          {status ? (
            <p
              className={`text-sm ${
                status.type === "error"
                  ? "text-rose-500"
                  : status.type === "info"
                  ? "text-sky-600"
                  : "text-emerald-600"
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
              <button
                className="secondary text-xs"
                onClick={() => {
                  setItemModalOpen(false);
                  setItemEditIndex(null);
                  setItemSearch("");
                }}
              >
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
                {itemsLookup.data?.length ? (
                  itemsLookup.data.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="flex justify-between items-center bg-white border border-slate-200 rounded-2xl px-5 py-4 hover:bg-slate-50 shadow-sm transition"
                      onClick={() => handleSelectItem(item)}
                    >
                      <div>
                        <p className="font-semibold text-slate-800">{item.code} — {item.name}</p>
                        <p className="text-xs text-slate-500">{item.company_name} • {item.base_unit}</p>
                      </div>
                      <span className="text-sm text-slate-600">Purchase Rate: {item.purchase_rate}</span>
                    </button>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">No results</p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default EditPurchaseInvoicePage;
