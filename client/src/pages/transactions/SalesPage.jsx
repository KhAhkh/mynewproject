import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import SectionCard from "../../components/SectionCard.jsx";
import FormField from "../../components/FormField.jsx";
import SearchSelect from "../../components/SearchSelect.jsx";
import { api } from "../../api/client.js";
import { toDisplay } from "../../utils/date.js";

const formatCurrency = (value) => {
  const numeric = Number.isFinite(Number(value)) ? Number(value) : 0;
  return numeric.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

const formatPrintNumber = (value, { decimals = 0, fallback = "-" } = {}) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return numeric.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
};

const createInitialForm = () => ({
  customerCode: "",
  customerDisplay: "",
  salesmanCode: "",
  salesmanDisplay: "",
  date: toDisplay(new Date()),
  items: [],
  amountPaid: "",
  previousBalance: ""
});

const resolveTradeOffPrice = (item) => {
  const tradePrice = Number(item.tradePrice) || 0;
  const discountPercent = Number(item.discountPercent) || 0;
  const parsed = Number(item.tradeOffPrice);
  if (item.tradeOffPrice !== "" && Number.isFinite(parsed)) {
    return parsed;
  }
  return tradePrice * (1 - discountPercent / 100);
};

const calculateLineAmounts = (item) => {
  const quantity = Number(item.quantity) || 0;
  const bonus = Number(item.bonus) || 0;
  const tradePrice = Number(item.tradePrice) || 0;
  const discountPercent = Number(item.discountPercent) || 0;
  const resolvedRate = Number(resolveTradeOffPrice(item)) || 0;
  const baseAmount = quantity * resolvedRate;
  const taxPercent = Number(item.taxPercent ?? item.salesTax ?? 0) || 0;
  const taxAmount = baseAmount * (taxPercent / 100);
  const lineTotal = baseAmount + taxAmount;
  const discountValue = tradePrice - resolvedRate;
  return {
    quantity,
    bonus,
    tradePrice,
    discountPercent,
    unitRate: resolvedRate,
    baseAmount,
    taxPercent,
    taxAmount,
    lineTotal,
    discountValue
  };
};

const SalesPage = () => {
  const queryClient = useQueryClient();
  const [meta, setMeta] = useState({ nextInvoice: "" });
  const [status, setStatus] = useState(null);
  const [customerQuery, setCustomerQuery] = useState("");
  const [salesmanQuery, setSalesmanQuery] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [previousBalanceBase, setPreviousBalanceBase] = useState(0);
  const [formState, setFormState] = useState(() => createInitialForm());

  useEffect(() => {
    let active = true;

    const loadMeta = async () => {
      try {
        const response = await api.get("/metadata/next/sales-invoice");
        if (!active) return;
        const payload = response?.data;
        const nextInvoice =
          typeof payload === "string"
            ? payload
            : payload?.nextInvoice ?? payload?.invoice ?? payload?.next ?? meta.nextInvoice;
        setMeta({ nextInvoice: nextInvoice || "" });
      } catch {
        if (!active) return;
        setMeta((prev) => prev);
      }
    };

    loadMeta();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!formState.customerCode) {
      setPreviousBalanceBase(0);
      setFormState((prev) => ({ ...prev, previousBalance: "" }));
      return;
    }

    let active = true;
    const fetchBalance = async () => {
      try {
        const response = await api.get(
          `/customers/${encodeURIComponent(formState.customerCode)}/balance`
        );
        if (!active) return;
        const balance = Number(response?.data?.balance ?? 0);
        setPreviousBalanceBase(balance);
        setFormState((prev) => ({
          ...prev,
          previousBalance: balance ? balance.toFixed(2) : ""
        }));
      } catch (error) {
        if (!active) return;
        setStatus({ type: "error", message: error.message || "Failed to fetch balance." });
      }
    };

    fetchBalance();

    return () => {
      active = false;
    };
  }, [formState.customerCode]);

  const totals = useMemo(() => {
    const summary = formState.items.reduce(
      (accumulator, item) => {
        const { baseAmount, taxAmount, lineTotal } = calculateLineAmounts(item);
        return {
          base: accumulator.base + baseAmount,
          tax: accumulator.tax + taxAmount,
          total: accumulator.total + lineTotal
        };
      },
      { base: 0, tax: 0, total: 0 }
    );
    const amountPaid = Number(formState.amountPaid) || 0;
    const previousBalance = Number(formState.previousBalance) || 0;
    const netAmount = summary.total - amountPaid + previousBalance;
    return {
      subtotal: summary.base,
      taxAmount: summary.tax,
      totalAmount: summary.total,
      amountPaid,
      previousBalance,
      netAmount
    };
  }, [formState.amountPaid, formState.items, formState.previousBalance]);

  const baseBalanceDisplay = useMemo(
    () => formatCurrency(previousBalanceBase),
    [previousBalanceBase]
  );

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
    queryKey: ["items", { search: itemSearch }],
    enabled: itemModalOpen,
    queryFn: async () => {
      const response = await api.get("/items", {
        params: { search: itemSearch }
      });
      return response.data;
    }
  });

  const mutation = useMutation({
    mutationFn: async (options = {}) => {
      const allowNegativeStock = Boolean(options?.allowNegativeStock);
      const payload = {
        customerCode: formState.customerCode,
        salesmanCode: formState.salesmanCode,
        date: formState.date,
        amountPaid: Number(formState.amountPaid) || 0,
        previousBalance: Number(previousBalanceBase.toFixed(2)),
        tradeOffTotal: Number(totals.netAmount.toFixed(2)),
        allowNegativeStock,
        items: formState.items.map((item) => {
          const tradeOff = resolveTradeOffPrice(item);
          return {
            itemCode: item.code,
            quantity: Number(item.quantity) || 0,
            bonus: Number(item.bonus) || 0,
            discountPercent: Number(item.discountPercent) || 0,
            tradePrice: Number(item.tradePrice) || 0,
            tradeOffPrice: Number.isFinite(tradeOff) ? Number(tradeOff.toFixed(2)) : 0,
            taxPercent: Number(item.taxPercent) || 0,
            companyName: item.companyName
          };
        })
      };
      const response = await api.post("/sales", payload);
      return response.data;
    },
    onMutate: () => setStatus(null),
    onSuccess: (data) => {
      const negativeStockItems =
        data?.warnings?.type === "NEGATIVE_STOCK" && Array.isArray(data?.warnings?.items)
          ? data.warnings.items
          : [];
      const shortageSummary = negativeStockItems
        .map((item) => {
          const code = item.itemCode || item.itemName || "Item";
          const shortage = Number(item.shortage ?? 0).toFixed(2);
          return `${code} (short by ${shortage})`;
        })
        .join(", ");
      const hasNegativeStock = negativeStockItems.length > 0;
      const message = hasNegativeStock
        ? `Sale saved with negative stock${shortageSummary ? ` for ${shortageSummary}` : ""}.`
        : "Sale saved successfully.";
      setStatus({ type: hasNegativeStock ? "warning" : "success", message });
      
      // Invalidate ledger and receivable queries to refresh with new data
      queryClient.invalidateQueries({ queryKey: ["salesman-customer-ledger"] });
      queryClient.invalidateQueries({ queryKey: ["salesman-wise-balance"] });
      queryClient.invalidateQueries({ queryKey: ["receivable-summary"] });
      queryClient.invalidateQueries({ queryKey: ["customer-balance"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      
      if (data?.nextInvoice) {
        setMeta({ nextInvoice: data.nextInvoice });
      } else {
        api
          .get("/metadata/next/sales-invoice")
          .then((response) => {
            const payload = response?.data;
            const nextInvoice =
              typeof payload === "string"
                ? payload
                : payload?.nextInvoice ?? payload?.invoice ?? payload?.next ?? meta.nextInvoice;
            setMeta({ nextInvoice: nextInvoice || "" });
          })
          .catch(() => setMeta((prev) => prev));
      }
      setFormState(() => createInitialForm());
      setPreviousBalanceBase(0);
      setCustomerQuery("");
      setSalesmanQuery("");
      setItemSearch("");
    }
  });

  const addItem = (item) => {
    setFormState((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          code: item.code,
          name: item.name,
          baseUnit: item.base_unit,
          packSize: item.pack_size,
          companyName: item.company_name,
          quantity: "",
          bonus: "",
          tradeOffPrice: "",
          discountPercent: "",
          tradePrice: item.trade_rate,
          taxPercent: item.sales_tax
        }
      ]
    }));
    setItemModalOpen(false);
  };

  const handleItemChange = (index, key, value) => {
    setFormState((prev) => ({
      ...prev,
      items: prev.items.map((item, idx) => {
        if (idx !== index) return item;
        
        const updated = { ...item, [key]: value };
        const tradePrice = Number(updated.tradePrice) || 0;
        
        // Validate Rate does not exceed Trade Price
        if (key === 'tradeOffPrice') {
          const tradeOff = Number(value) || 0;
          if (tradeOff > tradePrice && tradePrice > 0) {
            if (typeof window !== 'undefined') {
              window.alert('Rate should not exceed Trade Price');
            }
            return item; // Don't update if validation fails
          }
        }
        
        // Auto-calculate discount % when tradeOffPrice changes
        if (key === 'tradeOffPrice' && tradePrice > 0) {
          const tradeOff = Number(value) || 0;
          const calculatedDiscount = ((tradePrice - tradeOff) / tradePrice) * 100;
          updated.discountPercent = calculatedDiscount >= 0 ? calculatedDiscount.toFixed(2) : '';
        }
        
        // Auto-calculate tradeOffPrice when discount % changes
        if (key === 'discountPercent' && tradePrice > 0) {
          const discount = Number(value) || 0;
          const calculatedRate = tradePrice * (1 - discount / 100);
          updated.tradeOffPrice = calculatedRate >= 0 ? calculatedRate.toFixed(2) : '';
        }
        
        // When tradePrice changes, recalculate tradeOffPrice based on existing discount %
        if (key === 'tradePrice') {
          const discount = Number(updated.discountPercent) || 0;
          if (discount > 0 && tradePrice > 0) {
            updated.tradeOffPrice = (tradePrice * (1 - discount / 100)).toFixed(2);
          }
        }
        
        return updated;
      })
    }));
  };

  const handleRemoveItem = (index) => {
    setFormState((prev) => ({
      ...prev,
      items: prev.items.filter((_, idx) => idx !== index)
    }));
  };

  const handleOpenItemModal = () => {
    if (!formState.customerCode || !formState.salesmanCode) {
      if (typeof window !== "undefined") {
        window.alert("Select both customer and salesman before adding items.");
      }
      return;
    }
    setItemModalOpen(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (mutation.isPending) return;

    if (!formState.customerCode || !formState.salesmanCode) {
      setStatus({ type: "error", message: "Customer and salesman are required." });
      return;
    }
    if (formState.items.length === 0) {
      setStatus({ type: "error", message: "Add at least one item before saving." });
      return;
    }
    const missingQuantity = formState.items.some(
      (item) => !item.quantity || Number(item.quantity) <= 0
    );
    if (missingQuantity) {
      setStatus({ type: "error", message: "Enter quantity for each item before saving." });
      if (typeof window !== "undefined") {
        window.alert("Quantity is required for all items.");
      }
      return;
    }

    try {
      await mutation.mutateAsync();
    } catch (error) {
      if (error?.data?.code === "LOW_STOCK") {
        try {
          await mutation.mutateAsync({ allowNegativeStock: true });
        } catch (confirmError) {
          setStatus({ type: "error", message: confirmError.message || "Failed to save sale." });
        }
        return;
      }

      setStatus({ type: "error", message: error.message || "Failed to save sale." });
    }
  };

  return (
    <div className="space-y-6">
      <SectionCard
        title="Sales Entry"
        description="Issue sales invoices with real-time item context."
        actions={
          <Link to="/history/transactions?type=sales" className="secondary text-xs px-3 py-1">
            View saved sales
          </Link>
        }
      >
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <FormField label="Invoice No.">
              <input value={meta.nextInvoice || ""} disabled />
            </FormField>
            <SearchSelect
              label="Customer"
              placeholder="Search customer"
              value={
                formState.customerCode
                  ? { label: formState.customerDisplay || formState.customerCode }
                  : null
              }
              onSelect={(option) => {
                setPreviousBalanceBase(0);
                setFormState((prev) => ({
                  ...prev,
                  customerCode: option.code,
                  customerDisplay: option.label,
                  amountPaid: "",
                  previousBalance: ""
                }));
              }}
              onSearch={setCustomerQuery}
              results={
                customerLookup.data?.map((customer) => ({
                  value: customer.id,
                  code: customer.code,
                  label: `${customer.code} — ${customer.name}`
                })) ?? []
              }
            />
            <FormField label="Date" required>
              <input
                value={formState.date}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, date: event.target.value }))
                }
              />
            </FormField>
            <SearchSelect
              label="Salesman"
              placeholder="Search salesman"
              value={
                formState.salesmanCode
                  ? { label: formState.salesmanDisplay || formState.salesmanCode }
                  : null
              }
              onSelect={(option) =>
                setFormState((prev) => ({
                  ...prev,
                  salesmanCode: option.code,
                  salesmanDisplay: option.label
                }))
              }
              onSearch={setSalesmanQuery}
              results={
                salesmanLookup.data?.map((salesman) => ({
                  value: salesman.id,
                  code: salesman.code,
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
            <div className="screen-only">
              {/* Column Headers */}
              <div className="hidden xl:grid xl:grid-cols-11 gap-3 items-center px-5 py-2 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <div className="xl:col-span-3">Item</div>
                <div className="xl:col-span-1 text-center">Qty</div>
                <div className="xl:col-span-1 text-center">Bonus</div>
                <div className="xl:col-span-1 text-center">T.Price</div>
                <div className="xl:col-span-1 text-center">DIS%</div>
                <div className="xl:col-span-1 text-center">Rate</div>
                <div className="xl:col-span-1 text-center">Tax%</div>
                <div className="xl:col-span-1 text-center">Total</div>
                <div className="xl:col-span-1"></div>
              </div>
              {/* Items List */}
              <div className="divide-y divide-slate-100">
              {formState.items.length === 0 ? (
                <p className="p-5 text-sm text-slate-500">No items yet</p>
              ) : (
                formState.items.map((item, index) => {
                  const { taxAmount, lineTotal } = calculateLineAmounts(item);
                  const formattedLineTotal = lineTotal ? lineTotal.toFixed(2) : "";
                  const formattedTaxAmount = taxAmount ? taxAmount.toFixed(2) : "0.00";

                  return (
                    <div
                      key={`${item.code}-${index}`}
                      className="grid gap-3 md:grid-cols-2 xl:grid-cols-11 items-start px-5 py-4 text-sm text-slate-700 print:[grid-template-columns:minmax(320px,_1fr)_60px_65px_65px_80px_75px_80px_75px_80px] print:gap-x-1 print:gap-y-1.5 print:px-2 print:py-2 print:text-[11px]"
                    >
                      <div className="md:col-span-2 xl:col-span-3 print:col-span-1">
                        <p className="font-medium text-slate-800">
                          {item.code} — {item.name}
                        </p>
                        <p className="text-xs text-slate-500">Company: {item.companyName}</p>
                        <p className="text-xs text-slate-500">Base Unit: {item.baseUnit}</p>
                      </div>
                      <div
                        className={`hidden print:block md:col-span-1 xl:col-span-1 print:col-span-1 ${
                          item.baseUnit === "Pieces" ? "print:opacity-0" : ""
                        }`}
                      >
                        <input
                          className="w-full bg-slate-100 text-slate-600 print:px-1 print:py-1 print:text-[11px]"
                          type="text"
                          placeholder="Pack Size"
                          value={String(item.packSize ?? "")}
                          readOnly
                          tabIndex={-1}
                          onFocus={(event) => event.target.blur()}
                        />
                      </div>
                      <div className="md:col-span-1 xl:col-span-1 print:col-span-1">
                        <input
                          className="w-full text-right print:px-1 print:py-1 print:text-[11px] print:text-right"
                          type="number"
                          placeholder="Quantity"
                          value={item.quantity}
                          onChange={(event) => handleItemChange(index, "quantity", event.target.value)}
                        />
                      </div>
                      <div className="md:col-span-1 xl:col-span-1 print:col-span-1">
                        <input
                          className="w-full text-right print:px-1 print:py-1 print:text-[11px] print:text-right"
                          type="number"
                          placeholder="Bonus"
                          value={item.bonus}
                          onChange={(event) => handleItemChange(index, "bonus", event.target.value)}
                        />
                      </div>
                      <div className="md:col-span-1 xl:col-span-1 print:col-span-1">
                        <input
                          className="w-full text-right px-3 py-2 min-w-[90px] print:px-1 print:py-1 print:text-[11px] print:text-right"
                          type="number"
                          placeholder="Trade Price"
                          value={item.tradePrice}
                          onChange={(event) => handleItemChange(index, "tradePrice", event.target.value)}
                        />
                      </div>
                      <div className="md:col-span-1 xl:col-span-1 print:col-span-1">
                        <input
                          className="w-full text-right print:px-1 print:py-1 print:text-[11px] print:text-right"
                          type="number"
                          placeholder="Discount %"
                          value={item.discountPercent}
                          onChange={(event) => handleItemChange(index, "discountPercent", event.target.value)}
                        />
                      </div>
                      <div className="md:col-span-1 xl:col-span-1 print:col-span-1">
                        <input
                          className="w-full text-right px-3 py-2 min-w-[90px] print:px-1 print:py-1 print:text-[11px] print:text-right"
                          type="number"
                          placeholder="Trade Off Price"
                          value={item.tradeOffPrice}
                          onChange={(event) => handleItemChange(index, "tradeOffPrice", event.target.value)}
                        />
                      </div>
                      <div className="md:col-span-1 xl:col-span-1 print:col-span-1">
                        <input
                          className="w-full text-right print:px-1 print:py-1 print:text-[11px] print:text-right"
                          type="number"
                          placeholder="Tax %"
                          value={item.taxPercent ?? ""}
                          onChange={(event) => handleItemChange(index, "taxPercent", event.target.value)}
                        />
                      </div>
                      <div className="hidden md:block md:col-span-1 xl:col-span-1">
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-right text-[13px] font-semibold text-slate-700">
                          {formattedLineTotal}
                        </div>
                        <p className="mt-1 text-[11px] text-slate-400">Tax: {formattedTaxAmount}</p>
                      </div>
                      <div className="hidden print:flex print:col-span-1 print:items-center print:justify-end print:px-1">
                        <span className="print:text-right">{formattedLineTotal}</span>
                      </div>
                      <button
                        type="button"
                        className="secondary text-xs md:col-span-2 xl:col-span-1 print:hidden print:px-2 print:py-1 print:text-[10px] justify-self-end"
                        onClick={() => handleRemoveItem(index)}
                      >
                        Remove
                      </button>
                    </div>
                  );
                })
              )}
            </div>
            </div>
            {formState.items.length === 0 ? null : (
              <div className="print-only w-full mt-4">
                <table className="sales-print-table">
                  <colgroup>
                    <col className="sales-print-table__item" />
                    <col className="sales-print-table__qty" />
                    <col className="sales-print-table__qty" />
                    <col className="sales-print-table__price" />
                    <col className="sales-print-table__small" />
                    <col className="sales-print-table__price" />
                    <col className="sales-print-table__small" />
                    <col className="sales-print-table__price" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th scope="col">Item</th>
                      <th scope="col">Qty</th>
                      <th scope="col">Bonus</th>
                      <th scope="col">T.Price</th>
                      <th scope="col">DIS%</th>
                      <th scope="col">Rate</th>
                      <th scope="col">Tax%</th>
                      <th scope="col">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formState.items.map((item, index) => {
                      const {
                        quantity,
                        taxAmount,
                        lineTotal,
                        unitRate,
                        discountPercent,
                        tradePrice,
                        taxPercent
                      } = calculateLineAmounts(item);
                      const itemMeta = [item.companyName, item.baseUnit].filter(Boolean).join(" — ");

                      return (
                        <tr key={`${item.code}-${index}`}>
                          <td>
                            <span className="sales-print-table__item-name">
                              {item.code} — {item.name}
                            </span>
                            {itemMeta ? (
                              <span className="sales-print-table__item-meta">{itemMeta}</span>
                            ) : null}
                          </td>
                          <td className="text-center">
                            {formatPrintNumber(quantity, { fallback: "-" })}
                          </td>
                          <td className="text-center">
                            {formatPrintNumber(Number(item.bonus) || 0, { fallback: "-" })}
                          </td>
                          <td className="text-right">
                            {formatPrintNumber(tradePrice, { decimals: 0, fallback: "0" })}
                          </td>
                          <td className="text-center">
                            {formatPrintNumber(discountPercent, { decimals: 0, fallback: "0" })}
                          </td>
                          <td className="text-right">
                            {formatPrintNumber(unitRate, { decimals: 0, fallback: "0" })}
                          </td>
                          <td className="text-center">
                            {formatPrintNumber(taxPercent, { decimals: 0, fallback: "0" })}
                          </td>
                          <td className="text-right">
                            {formatPrintNumber(lineTotal, { decimals: 0, fallback: "0" })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="grid gap-4 rounded-3xl border border-slate-200 bg-gradient-to-r from-slate-50 via-white to-slate-50 px-6 py-5 shadow-[0_12px_35px_rgba(15,23,42,0.08)]">
            <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-6 text-sm text-slate-700">
              {[
                { label: "Subtotal", value: totals.subtotal },
                { label: "Tax Amount", value: totals.taxAmount },
                { label: "Total Amount", value: totals.totalAmount },
                { label: "Amount Paid", value: totals.amountPaid },
                { label: "Previous Balance", value: totals.previousBalance },
                { label: "Net Balance", value: totals.netAmount, highlight: true }
              ].map((entry) => (
                <div key={entry.label} className="space-y-1">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{entry.label}</p>
                  <p
                    className={`text-lg font-semibold ${entry.highlight ? "text-emerald-600" : "text-slate-900"}`}
                  >
                    {formatCurrency(entry.value)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <FormField label="Subtotal">
              <input value={totals.subtotal.toFixed(2)} disabled />
            </FormField>
            <FormField label="Tax Amount">
              <input value={totals.taxAmount.toFixed(2)} disabled />
            </FormField>
            <FormField label="Total Amount (Incl. Tax)">
              <input value={totals.totalAmount.toFixed(2)} disabled />
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
              <input type="number" value={formState.previousBalance} readOnly />
              <p className="text-[11px] text-slate-500 mt-1 block">
                Original balance: {baseBalanceDisplay} (negative values indicate customer advance).
              </p>
            </FormField>
            <FormField label="Trade Off Total">
              <input value={totals.netAmount.toFixed(2)} disabled />
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
              {mutation.isPending ? "Saving..." : "Save Sale"}
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
                {itemLookup.isLoading ? (
                  <p className="text-sm text-slate-500">Searching…</p>
                ) : itemLookup.data && itemLookup.data.length > 0 ? (
                  itemLookup.data.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="flex justify-between items-center bg-white border border-slate-200 rounded-2xl px-5 py-4 hover:bg-slate-50 shadow-sm transition"
                      onClick={() => addItem(item)}
                    >
                      <div>
                        <p className="font-semibold text-slate-800">
                          {item.code} — {item.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {item.company_name} • {item.base_unit}
                        </p>
                      </div>
                      <span className="text-sm text-slate-600">Trade Rate: {item.trade_rate}</span>
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

export default SalesPage;
