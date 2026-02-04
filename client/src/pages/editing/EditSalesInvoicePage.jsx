import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import SectionCard from "../../components/SectionCard.jsx";
import FormField from "../../components/FormField.jsx";
import SearchSelect from "../../components/SearchSelect.jsx";
import { api } from "../../api/client.js";
import { toDisplay } from "../../utils/date.js";

const mapItemForForm = (item) => ({
  code: item.item_code || item.code,
  name: item.item_name || item.name,
  baseUnit: item.base_unit || item.baseUnit || "",
  companyName: item.company_name || item.companyName || "",
  quantity: item.quantity !== undefined ? String(Number(item.quantity) || 0) : "",
  bonus: item.bonus !== undefined ? String(Number(item.bonus) || 0) : "",
  tradeOffPrice: item.trade_off_price !== undefined ? String(Number(item.trade_off_price) || 0) : String(item.tradeOffPrice ?? ""),
  discountPercent: item.discount_percent !== undefined ? String(Number(item.discount_percent) || 0) : String(item.discountPercent ?? ""),
  tradePrice: item.trade_price !== undefined ? String(Number(item.trade_price) || 0) : String(item.tradePrice ?? "")
});

const EditSalesInvoicePage = () => {
  const [invoiceNo, setInvoiceNo] = useState("");
  const [status, setStatus] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedOption, setSelectedOption] = useState(null);
  const [invoiceDetails, setInvoiceDetails] = useState(null);
  const [isLoadingInvoice, setIsLoadingInvoice] = useState(false);

  const [customerQuery, setCustomerQuery] = useState("");
  const [salesmanQuery, setSalesmanQuery] = useState("");
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [itemSearch, setItemSearch] = useState("");

  const [formState, setFormState] = useState({
    customerCode: "",
    customerDisplay: "",
    salesmanCode: "",
    salesmanDisplay: "",
    date: toDisplay(new Date()),
    items: [],
    amountPaid: "",
    previousBalance: ""
  });

  const queryClient = useQueryClient();

  const salesLookup = useQuery({
    queryKey: ["sales", { search: searchTerm }],
    queryFn: async () => {
      const response = await api.get("/sales", { params: { search: searchTerm } });
      return response.data;
    }
  });

  const salesOptions = useMemo(
    () =>
      salesLookup.data?.map((sale) => ({
        value: sale.invoice_no,
        invoiceNo: sale.invoice_no,
        label: `${sale.invoice_no} — ${sale.customer_name}`,
        meta: sale
      })) ?? [],
    [salesLookup.data]
  );

  useEffect(() => {
    if (salesLookup.error) {
      setStatus({ type: "error", message: salesLookup.error.message });
    }
  }, [salesLookup.error]);

  const customerLookup = useQuery({
    queryKey: ["customers", { search: customerQuery }],
    queryFn: async () => {
      const response = await api.get("/customers", { params: { search: customerQuery } });
      return response.data;
    }
  });

  const salesmanLookup = useQuery({
    queryKey: ["salesmen", { search: salesmanQuery }],
    queryFn: async () => {
      const response = await api.get("/salesmen", { params: { search: salesmanQuery } });
      return response.data;
    }
  });

  const itemLookup = useQuery({
    queryKey: ["items", { search: itemSearch, inStock: true }],
    queryFn: async () => {
      const response = await api.get("/items", { params: { search: itemSearch, inStock: true } });
      return response.data;
    }
  });

  const totals = useMemo(() => {
    const total = formState.items.reduce((sum, item) => {
      const qty = Number(item.quantity) || 0;
      const price = Number(item.tradePrice) || 0;
      const discount = Number(item.discountPercent) || 0;
      return sum + qty * price * (1 - discount / 100);
    }, 0);
    const amountPaid = Number(formState.amountPaid) || 0;
    const previousBalance = Number(formState.previousBalance) || 0;
    return {
      totalAmount: total,
      netAmount: total - amountPaid + previousBalance
    };
  }, [formState.items, formState.amountPaid, formState.previousBalance]);

  const syncInvoiceToForm = (payload) => {
    if (!payload?.sale) return;
    const sale = payload.sale;
    const invoiceDate = sale.invoice_date ? toDisplay(sale.invoice_date) : "";
    const amountPaidValue = Number(sale.amount_paid ?? 0);
    const previousBalanceValue = Number(sale.previous_balance ?? 0);
    setInvoiceDetails(payload);
    setFormState({
      customerCode: sale.customer_code || "",
      customerDisplay: sale.customer_code && sale.customer_name ? `${sale.customer_code} — ${sale.customer_name}` : sale.customer_code || "",
      salesmanCode: sale.salesman_code || "",
      salesmanDisplay: sale.salesman_code && sale.salesman_name ? `${sale.salesman_code} — ${sale.salesman_name}` : sale.salesman_code || "",
      date: invoiceDate,
      items: Array.isArray(payload.items) ? payload.items.map(mapItemForForm) : [],
      amountPaid: amountPaidValue ? amountPaidValue.toString() : "",
      previousBalance: previousBalanceValue ? previousBalanceValue.toString() : "0"
    });
    setSelectedOption({
      value: sale.invoice_no,
      invoiceNo: sale.invoice_no,
      label: `${sale.invoice_no} — ${sale.customer_name || ""}`.trim()
    });
    setInvoiceNo(sale.invoice_no || invoiceNo);
    setStatus({ type: "success", message: "Invoice loaded. You can now edit the details." });
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
      const response = await api.get(`/sales/${encodeURIComponent(trimmed)}`);
      syncInvoiceToForm(response.data);
    } catch (error) {
      const message = error?.response?.data?.message || error?.message || "Failed to load invoice.";
      setInvoiceDetails(null);
      setStatus({ type: "error", message });
    } finally {
      setIsLoadingInvoice(false);
    }
  };

  const addItem = (item) => {
    setFormState((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          code: item.code,
          name: item.name,
          baseUnit: item.base_unit,
          companyName: item.company_name,
          quantity: "",
          bonus: "",
          tradeOffPrice: "",
          discountPercent: "",
          tradePrice: item.trade_rate !== undefined ? String(item.trade_rate) : ""
        }
      ]
    }));
    setItemModalOpen(false);
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
  };

  const handleOpenItemModal = () => {
    if (!formState.customerCode) {
      if (typeof window !== "undefined") {
        window.alert("Select a customer before adding items.");
      }
      return;
    }
    setItemModalOpen(true);
  };

  const updateMutation = useMutation({
    mutationFn: async (options = {}) => {
      if (!invoiceNo) throw new Error("Load an invoice before saving.");
      const allowNegativeStock = Boolean(options?.allowNegativeStock);
      const payload = {
        customerCode: formState.customerCode,
        salesmanCode: formState.salesmanCode,
        date: formState.date,
        amountPaid: Number(formState.amountPaid) || 0,
        previousBalance: Number(formState.previousBalance) || 0,
        tradeOffTotal: Number(totals.netAmount.toFixed(2)),
        allowNegativeStock,
        items: formState.items.map((item) => ({
          itemCode: item.code,
          quantity: Number(item.quantity) || 0,
          bonus: Number(item.bonus) || 0,
          discountPercent: Number(item.discountPercent) || 0,
          tradePrice: Number(item.tradePrice) || 0,
          tradeOffPrice: Number(item.tradeOffPrice) || 0,
          companyName: item.companyName
        }))
      };
      const response = await api.put(`/sales/${encodeURIComponent(invoiceNo)}`, payload);
      return response.data;
    },
    onMutate: () => setStatus(null),
    onSuccess: (data) => {
      syncInvoiceToForm(data);
      queryClient.invalidateQueries({ queryKey: ["sales"] });
    },
    onError: (error) => {
      const message = error?.response?.data?.message || error.message || "Failed to update invoice.";
      setStatus({ type: "error", message });
    }
  });

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (updateMutation.isPending) return;

    if (!invoiceNo) {
      setStatus({ type: "error", message: "Load an invoice before saving." });
      return;
    }
    if (!formState.customerCode) {
      setStatus({ type: "error", message: "Customer is required." });
      return;
    }
    if (formState.items.length === 0) {
      setStatus({ type: "error", message: "Add at least one item before saving." });
      return;
    }
    const missingQuantity = formState.items.some((item) => !item.quantity || Number(item.quantity) <= 0);
    if (missingQuantity) {
      setStatus({ type: "error", message: "Enter quantity for each item before saving." });
      if (typeof window !== "undefined") {
        window.alert("Quantity is required for all items.");
      }
      return;
    }

    try {
      await updateMutation.mutateAsync();
      setStatus({ type: "success", message: "Invoice updated successfully." });
    } catch (error) {
      const responseData = error?.response?.data;
      if (responseData?.code === "LOW_STOCK") {
        const details = Array.isArray(responseData.details) ? responseData.details : [];
        const detailLines = details.map((detail) => {
          const code = detail.itemCode || detail.itemName || "Item";
          const required = Number(detail.required ?? 0).toFixed(2);
          const available = Number(detail.available ?? 0).toFixed(2);
          const shortage = Number.isFinite(detail.shortage)
            ? ` • Short by ${Number(detail.shortage).toFixed(2)}`
            : "";
          return `${code} — Required ${required}, Available ${available}${shortage}`;
        });
        const promptLines = [responseData.message || error.message || "Negative stock detected."];
        if (detailLines.length > 0) {
          promptLines.push("", ...detailLines);
        }
        promptLines.push("", "Proceed with negative stock?");
        const message = promptLines.join("\n");
        const confirmed = typeof window !== "undefined" ? window.confirm(message) : false;
        if (confirmed) {
          try {
            await updateMutation.mutateAsync({ allowNegativeStock: true });
            setStatus({ type: "success", message: "Invoice updated with negative stock allowance." });
          } catch (confirmError) {
            setStatus({ type: "error", message: confirmError.message });
          }
        } else {
          setStatus({ type: "error", message: "Invoice not saved. Adjust quantities or restock items." });
        }
      } else {
        const message = responseData?.message || error.message || "Failed to update invoice.";
        setStatus({ type: "error", message });
      }
    }
  };

  return (
    <div className="space-y-6">
      <SectionCard
        title="Edit Sales Invoice"
        description="Load an existing invoice, adjust the details, and save the updated record."
      >
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            loadInvoice(invoiceNo);
          }}
        >
          <SearchSelect
            label="Search Sales"
            placeholder="Search by customer name or invoice number"
            value={selectedOption}
            onSelect={(option) => {
              setSelectedOption(option);
              setInvoiceNo(option.invoiceNo);
              setInvoiceDetails(null);
              setStatus(null);
            }}
            onSearch={setSearchTerm}
            results={salesOptions}
            renderItem={(option) => (
              <div className="flex flex-col text-slate-700">
                <span className="font-medium text-sm text-slate-800">{option.label}</span>
                <span className="text-xs text-slate-500">
                  Net Amount: {Number(option.meta.total_amount ?? 0).toFixed(2)}
                </span>
              </div>
            )}
          />
          {salesLookup.isFetching ? <p className="text-xs text-slate-500">Searching…</p> : null}
          <FormField label="Invoice No.">
            <input
              value={invoiceNo}
              readOnly
              placeholder="Select an invoice from the search above"
            />
          </FormField>
          <div className="flex gap-3">
            <button type="submit" className="primary text-sm" disabled={isLoadingInvoice}>
              {isLoadingInvoice ? "Loading…" : "Load Invoice"}
            </button>
            <button
              type="button"
              className="secondary text-sm"
              onClick={() => {
                setInvoiceNo("");
                setStatus(null);
                setSelectedOption(null);
                setSearchTerm("");
                setInvoiceDetails(null);
                setFormState({
                  customerCode: "",
                  customerDisplay: "",
                  salesmanCode: "",
                  salesmanDisplay: "",
                  date: toDisplay(new Date()),
                  items: [],
                  amountPaid: "",
                  previousBalance: ""
                });
              }}
            >
              Reset
            </button>
          </div>
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

      {invoiceDetails ? (
        <SectionCard
          title={`Editing Invoice ${invoiceNo}`}
          description="Adjust customer, items, and payment details, then save your changes."
          actions={
            <Link to="/history/transactions?type=sales" className="secondary text-xs px-3 py-1">
              View history
            </Link>
          }
        >
          <form className="grid gap-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <SearchSelect
                label="Customer"
                placeholder="Search customer"
                value={formState.customerCode ? { label: formState.customerDisplay || formState.customerCode } : null}
                onSelect={(option) =>
                  setFormState((prev) => ({
                    ...prev,
                    customerCode: option.code,
                    customerDisplay: `${option.code} — ${option.name}`
                  }))
                }
                onSearch={setCustomerQuery}
                results={
                  customerLookup.data?.map((customer) => ({
                    value: customer.id,
                    code: customer.code,
                    name: customer.name,
                    label: `${customer.code} — ${customer.name}`
                  })) ?? []
                }
              />
              <FormField label="Invoice Date" required>
                <input
                  value={formState.date}
                  onChange={(event) =>
                    setFormState((prev) => ({
                      ...prev,
                      date: event.target.value
                    }))
                  }
                />
              </FormField>
              <SearchSelect
                label="Salesman"
                placeholder="Search salesman"
                value={formState.salesmanCode ? { label: formState.salesmanDisplay || formState.salesmanCode } : null}
                onSelect={(option) =>
                  setFormState((prev) => ({
                    ...prev,
                    salesmanCode: option.code,
                    salesmanDisplay: `${option.code} — ${option.name}`
                  }))
                }
                onSearch={setSalesmanQuery}
                results={
                  salesmanLookup.data?.map((salesman) => ({
                    value: salesman.id,
                    code: salesman.code,
                    name: salesman.name,
                    label: `${salesman.code} — ${salesman.name}`
                  })) ?? []
                }
              />
            </div>

            <div className="border border-slate-200 bg-white rounded-[24px] overflow-hidden shadow-[0_20px_55px_rgba(15,23,42,0.12)]">
              <header className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-sky-900 via-sky-700 to-emerald-500 text-white">
                <h3 className="text-sm font-semibold tracking-wide uppercase">Items</h3>
                <button
                  type="button"
                  className="bg-white/15 hover:bg-white/25 text-xs font-semibold text-white px-3 py-1.5 rounded-lg transition"
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
                      className="grid gap-3 md:grid-cols-2 xl:grid-cols-8 items-start px-5 py-4 text-sm text-slate-700"
                    >
                      <div className="md:col-span-2 xl:col-span-3">
                        <p className="font-medium text-slate-800">{item.code} — {item.name}</p>
                        <p className="text-xs text-slate-500">Company: {item.companyName || "—"}</p>
                        <p className="text-xs text-slate-500">Base Unit: {item.baseUnit || "—"}</p>
                      </div>
                      <div className="md:col-span-1 xl:col-span-1">
                        <input
                          className="w-full"
                          type="number"
                          placeholder="Quantity"
                          value={item.quantity}
                          onChange={(event) => handleItemChange(index, "quantity", event.target.value)}
                        />
                      </div>
                      <div className="md:col-span-1 xl:col-span-1">
                        <input
                          className="w-full"
                          type="number"
                          placeholder="Bonus"
                          value={item.bonus}
                          onChange={(event) => handleItemChange(index, "bonus", event.target.value)}
                        />
                      </div>
                      <div className="md:col-span-1 xl:col-span-1">
                        <input
                          className="w-full"
                          type="number"
                          placeholder="Trade Off Price"
                          value={item.tradeOffPrice}
                          onChange={(event) => handleItemChange(index, "tradeOffPrice", event.target.value)}
                        />
                      </div>
                      <div className="md:col-span-1 xl:col-span-1">
                        <input
                          className="w-full"
                          type="number"
                          placeholder="Discount %"
                          value={item.discountPercent}
                          onChange={(event) => handleItemChange(index, "discountPercent", event.target.value)}
                        />
                      </div>
                      <div className="md:col-span-1 xl:col-span-1">
                        <input
                          className="w-full"
                          type="number"
                          placeholder="Trade Price"
                          value={item.tradePrice}
                          onChange={(event) => handleItemChange(index, "tradePrice", event.target.value)}
                        />
                      </div>
                      <button
                        type="button"
                        className="secondary text-xs md:col-span-2 xl:col-span-1 justify-self-end"
                        onClick={() => handleRemoveItem(index)}
                      >
                        Remove
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="grid md:grid-cols-4 gap-4">
              <FormField label="Total Amount">
                <input value={totals.totalAmount.toFixed(2)} disabled />
              </FormField>
              <FormField label="Amount Paid">
                <input
                  type="number"
                  value={formState.amountPaid}
                  onChange={(event) =>
                    setFormState((prev) => ({
                      ...prev,
                      amountPaid: event.target.value
                    }))
                  }
                />
              </FormField>
              <FormField label="Previous Balance">
                <input
                  type="number"
                  value={formState.previousBalance}
                  onChange={(event) =>
                    setFormState((prev) => ({
                      ...prev,
                      previousBalance: event.target.value
                    }))
                  }
                />
              </FormField>
              <FormField label="Net Balance After Payment">
                <input value={totals.netAmount.toFixed(2)} disabled />
              </FormField>
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                className="secondary"
                onClick={() => setFormState((prev) => ({ ...prev, items: [] }))}
                disabled={updateMutation.isPending}
              >
                Clear Items
              </button>
              <button type="submit" className="primary" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "Saving…" : "Save Changes"}
              </button>
            </div>
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
      ) : null}

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
                {itemLookup.data?.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="flex justify-between items-center bg-white border border-slate-200 rounded-2xl px-5 py-4 hover:bg-slate-50 shadow-sm transition"
                    onClick={() => addItem(item)}
                  >
                    <div>
                      <p className="font-semibold text-slate-800">{item.code} — {item.name}</p>
                      <p className="text-xs text-slate-500">{item.company_name} • {item.base_unit}</p>
                    </div>
                    <span className="text-sm text-slate-600">Trade Rate: {item.trade_rate}</span>
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

export default EditSalesInvoicePage;
