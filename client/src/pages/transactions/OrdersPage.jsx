import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import SectionCard from "../../components/SectionCard.jsx";
import FormField from "../../components/FormField.jsx";
import SearchSelect from "../../components/SearchSelect.jsx";
import { api } from "../../api/client.js";
import { normalizeDateInput, toDisplay, validateDisplayDate } from "../../utils/date.js";

const statusOptions = [
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "fulfilled", label: "Fulfilled" },
  { value: "cancelled", label: "Cancelled" }
];

const createItemRow = () => ({
  itemCode: "",
  itemLabel: "",
  quantity: "",
  bonus: "",
  baseUnit: "",
  notes: ""
});

const createDefaultFormState = () => ({
  date: toDisplay(new Date()),
  customerCode: "",
  customerLabel: "",
  salesmanCode: "",
  salesmanLabel: "",
  status: "pending",
  remarks: "",
  items: [createItemRow()]
});

const OrdersPage = () => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [formState, setFormState] = useState(createDefaultFormState);
  const [activeOrderNo, setActiveOrderNo] = useState(null);
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [errors, setErrors] = useState(null);
  const [customerOptions, setCustomerOptions] = useState([]);
  const [salesmanOptions, setSalesmanOptions] = useState([]);
  const [itemOptions, setItemOptions] = useState([]);

  const ordersQuery = useQuery({
    queryKey: ["orders", searchTerm],
    queryFn: async ({ queryKey }) => {
      const [, term] = queryKey;
      const response = await api.get("/orders", {
        params: {
          search: term || undefined,
          limit: 200
        }
      });
      return response.data;
    }
  });

  const fetchCustomers = useCallback(async (keyword = "") => {
    try {
      const response = await api.get("/customers", {
        params: { search: keyword, limit: 20 }
      });
      const mapped = response.data.map((customer) => ({
        value: customer.code,
        code: customer.code,
        label: `${customer.code} — ${customer.name}`,
        name: customer.name
      }));
      setCustomerOptions(mapped);
    } catch (error) {
      console.error("Failed to load customers", error);
      setCustomerOptions([]);
    }
  }, []);

  const fetchSalesmen = useCallback(async (keyword = "") => {
    try {
      const response = await api.get("/salesmen", {
        params: { search: keyword, limit: 20 }
      });
      const mapped = response.data.map((salesman) => ({
        value: salesman.code,
        code: salesman.code,
        label: `${salesman.code} — ${salesman.name}`,
        name: salesman.name
      }));
      setSalesmanOptions(mapped);
    } catch (error) {
      console.error("Failed to load salesmen", error);
      setSalesmanOptions([]);
    }
  }, []);

  const fetchItems = useCallback(async (keyword = "") => {
    try {
      const response = await api.get("/items", {
        params: { search: keyword, limit: 30 }
      });
      const mapped = response.data.map((item) => ({
        value: item.code,
        code: item.code,
        label: `${item.code} — ${item.name}`,
        name: item.name,
        baseUnit: item.base_unit || ""
      }));
      setItemOptions(mapped);
    } catch (error) {
      console.error("Failed to load items", error);
      setItemOptions([]);
    }
  }, []);

  const resetForm = useCallback(() => {
    setFormState(createDefaultFormState());
    setActiveOrderNo(null);
  }, []);

  const buildPayload = () => {
    const filteredItems = formState.items.filter((entry) => entry.itemCode);
    return {
      customerCode: formState.customerCode,
      salesmanCode: formState.salesmanCode || null,
      date: formState.date,
      status: formState.status,
      remarks: formState.remarks,
      items: filteredItems.map((entry) => ({
        itemCode: entry.itemCode,
        quantity: Number(entry.quantity),
        bonus: entry.bonus === "" ? 0 : Number(entry.bonus),
        notes: entry.notes || ""
      }))
    };
  };

  const validateForm = () => {
    if (!formState.customerCode) {
      return "Select a customer.";
    }
    if (!formState.date || !validateDisplayDate(formState.date)) {
      return "Enter a valid order date (DD-MM-YYYY).";
    }
    const filteredItems = formState.items.filter((entry) => entry.itemCode);
    if (filteredItems.length === 0) {
      return "Add at least one item to the order.";
    }
    for (const entry of filteredItems) {
      const qty = Number(entry.quantity);
      if (!Number.isFinite(qty) || qty <= 0) {
        return `Quantity must be greater than zero for ${entry.itemCode}.`;
      }
      const bonus = entry.bonus === "" ? 0 : Number(entry.bonus);
      if (!Number.isFinite(bonus) || bonus < 0) {
        return `Bonus cannot be negative for ${entry.itemCode}.`;
      }
    }
    return null;
  };

  const mutationCommon = {
    onMutate: () => {
      setStatusMessage(null);
      setErrors(null);
    },
    onError: (error) => {
      const message = error?.message || "Failed to save order.";
      setErrors({ message });
      setStatusMessage({ type: "error", text: message });
    }
  };

  const createMutation = useMutation({
    mutationFn: async (payload) => {
      const response = await api.post("/orders", payload);
      return response.data;
    },
    ...mutationCommon,
    onSuccess: (data) => {
      const orderNo = data?.orderNo || "";
      const message = orderNo ? `Order ${orderNo} recorded successfully.` : "Order recorded successfully.";
      setStatusMessage({ type: "success", text: message });
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ orderNo, payload }) => {
      const response = await api.put(`/orders/${encodeURIComponent(orderNo)}`, payload);
      return response.data;
    },
    ...mutationCommon,
    onSuccess: (data, variables) => {
      const message = `Order ${variables.orderNo} updated successfully.`;
      setStatusMessage({ type: "success", text: message });
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    }
  });

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = (event) => {
    event.preventDefault();
    const validationError = validateForm();
    if (validationError) {
      setErrors({ message: validationError });
      setStatusMessage({ type: "error", text: validationError });
      return;
    }
    const payload = buildPayload();
    if (activeOrderNo) {
      updateMutation.mutate({ orderNo: activeOrderNo, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleLoadOrder = async (orderNo) => {
    setLoadingOrder(true);
    setStatusMessage(null);
    setErrors(null);
    try {
      const response = await api.get(`/orders/${encodeURIComponent(orderNo)}`);
      const { order, items } = response.data;
      const nextState = createDefaultFormState();
      nextState.date = order?.order_date || toDisplay(new Date());
      const customerCode = order?.customer_code || "";
      const customerName = order?.customer_name || "";
      nextState.customerCode = customerCode;
      nextState.customerLabel = customerCode ? `${customerCode} — ${customerName}`.trim() : "";
      const salesmanCode = order?.salesman_code || "";
      const salesmanName = order?.salesman_name || "";
      nextState.salesmanCode = salesmanCode;
      nextState.salesmanLabel = salesmanCode ? `${salesmanCode} — ${salesmanName}`.trim() : "";
      nextState.status = order?.status || "pending";
      nextState.remarks = order?.remarks || "";
      nextState.items = (items || []).map((entry) => ({
        itemCode: entry.itemCode,
        itemLabel: `${entry.itemCode} — ${entry.itemName}`,
        quantity: entry.quantity != null ? String(entry.quantity) : "",
        bonus: entry.bonus != null && entry.bonus !== 0 ? String(entry.bonus) : "",
        baseUnit: entry.baseUnit || "",
        notes: entry.notes || ""
      }));
      if (nextState.items.length === 0) {
        nextState.items = [createItemRow()];
      }
      setFormState(nextState);
      setActiveOrderNo(order?.order_no || orderNo);
    } catch (error) {
      const message = error?.message || "Failed to load order.";
      setErrors({ message });
      setStatusMessage({ type: "error", text: message });
    } finally {
      setLoadingOrder(false);
    }
  };

  const handleCancelEdit = () => {
    resetForm();
    setStatusMessage({ type: "info", text: "Editing cancelled." });
  };

  const itemRows = useMemo(() => formState.items.map((row, index) => ({ row, index })), [formState.items]);

  return (
    <div className="space-y-8">
      <SectionCard
        title={activeOrderNo ? `Edit Order ${activeOrderNo}` : "New Order"}
        description="Capture customer orders with requested quantities before converting them into invoices."
        actions={
          activeOrderNo ? (
            <button
              type="button"
              onClick={handleCancelEdit}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Cancel Edit
            </button>
          ) : null
        }
      >
        {statusMessage ? (
          <div
            className={`rounded-xl border px-4 py-3 text-sm ${
              statusMessage.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : statusMessage.type === "error"
                ? "border-rose-200 bg-rose-50 text-rose-700"
                : "border-sky-200 bg-sky-50 text-sky-700"
            }`}
          >
            {statusMessage.text}
          </div>
        ) : null}

        {errors?.message ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
            {errors.message}
          </div>
        ) : null}

        <form className="grid gap-6" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <FormField label="Order Date" required>
              <input
                type="text"
                value={formState.date}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    date: normalizeDateInput(event.target.value)
                  }))
                }
                placeholder="DD-MM-YYYY"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              />
            </FormField>

            <SearchSelect
              label="Customer"
              required
              value={formState.customerLabel ? { label: formState.customerLabel } : null}
              onSelect={(selection) =>
                setFormState((prev) => ({
                  ...prev,
                  customerCode: selection.code,
                  customerLabel: selection.label
                }))
              }
              onSearch={fetchCustomers}
              results={customerOptions}
              placeholder="Search customer by code or name"
              emptyMessage="No customers found"
              className="md:col-span-1"
            />

            <SearchSelect
              label="Salesman"
              value={formState.salesmanLabel ? { label: formState.salesmanLabel } : null}
              onSelect={(selection) =>
                setFormState((prev) => ({
                  ...prev,
                  salesmanCode: selection.code,
                  salesmanLabel: selection.label
                }))
              }
              onSearch={fetchSalesmen}
              results={salesmanOptions}
              placeholder="Optional: assign salesman"
              emptyMessage="No salesmen found"
              className="md:col-span-1"
            />

            <FormField label="Status">
              <select
                value={formState.status}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    status: event.target.value
                  }))
                }
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Remarks" className="md:col-span-2 xl:col-span-3">
              <textarea
                value={formState.remarks}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    remarks: event.target.value
                  }))
                }
                rows={3}
                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                placeholder="Optional notes for warehouse or billing"
              />
            </FormField>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">Order Items</h3>
              <button
                type="button"
                onClick={() =>
                  setFormState((prev) => ({
                    ...prev,
                    items: [...prev.items, createItemRow()]
                  }))
                }
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
              >
                Add Item
              </button>
            </div>

            <div className="space-y-3">
              {itemRows.map(({ row, index }) => (
                <div
                  key={index}
                  className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 md:grid-cols-[minmax(200px,1.6fr)_repeat(3,minmax(120px,1fr))_minmax(160px,1.2fr)_auto]"
                >
                  <SearchSelect
                    label={`Item ${index + 1}`}
                    value={row.itemLabel ? { label: row.itemLabel } : null}
                    onSelect={(selection) =>
                      setFormState((prev) => {
                        const nextItems = prev.items.slice();
                        nextItems[index] = {
                          ...nextItems[index],
                          itemCode: selection.code,
                          itemLabel: selection.label,
                          baseUnit: selection.baseUnit || ""
                        };
                        return { ...prev, items: nextItems };
                      })
                    }
                    onSearch={fetchItems}
                    results={itemOptions}
                    placeholder="Search item"
                    emptyMessage="No items found"
                  />

                  <FormField label="Quantity" required>
                    <input
                      type="number"
                      step="0.01"
                      value={row.quantity}
                      onChange={(event) =>
                        setFormState((prev) => {
                          const nextItems = prev.items.slice();
                          nextItems[index] = {
                            ...nextItems[index],
                            quantity: event.target.value
                          };
                          return { ...prev, items: nextItems };
                        })
                      }
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                    />
                  </FormField>

                  <FormField label="Bonus">
                    <input
                      type="number"
                      step="0.01"
                      value={row.bonus}
                      onChange={(event) =>
                        setFormState((prev) => {
                          const nextItems = prev.items.slice();
                          nextItems[index] = {
                            ...nextItems[index],
                            bonus: event.target.value
                          };
                          return { ...prev, items: nextItems };
                        })
                      }
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                    />
                  </FormField>

                  <FormField label="Base Unit">
                    <input
                      type="text"
                      value={row.baseUnit}
                      readOnly
                      className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-500"
                    />
                  </FormField>

                  <FormField label="Notes">
                    <input
                      type="text"
                      value={row.notes}
                      onChange={(event) =>
                        setFormState((prev) => {
                          const nextItems = prev.items.slice();
                          nextItems[index] = {
                            ...nextItems[index],
                            notes: event.target.value
                          };
                          return { ...prev, items: nextItems };
                        })
                      }
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                      placeholder="Optional instructions"
                    />
                  </FormField>

                  <div className="mt-7 flex items-start justify-end">
                    <button
                      type="button"
                      onClick={() =>
                        setFormState((prev) => {
                          if (prev.items.length === 1) {
                            return prev;
                          }
                          const nextItems = prev.items.filter((_, idx) => idx !== index);
                          return { ...prev, items: nextItems };
                        })
                      }
                      className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={formState.items.length === 1}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            {loadingOrder ? (
              <span className="text-xs text-slate-500">Loading order…</span>
            ) : null}
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-2xl bg-slate-900 px-6 py-2 text-sm font-semibold text-white shadow-[0_18px_45px_rgba(15,23,42,0.24)] transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {activeOrderNo ? "Update Order" : "Save Order"}
            </button>
          </div>
        </form>
      </SectionCard>

      <SectionCard
        title="Recent Orders"
        description="Monitor pending orders and quickly resume editing when ready to fulfil."
        actions={
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search orders by number or customer"
            className="w-64 rounded-xl border border-slate-200 px-3 py-1.5 text-sm focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-200"
          />
        }
      >
        {ordersQuery.isLoading ? (
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
            Loading orders…
          </p>
        ) : null}

        {!ordersQuery.isLoading && ordersQuery.data?.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
            No orders recorded yet.
          </p>
        ) : null}

        {ordersQuery.data && ordersQuery.data.length > 0 ? (
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Order No</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Date</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Customer</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Salesman</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">Items</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">Units</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Remarks</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {ordersQuery.data.map((order) => (
                  <tr key={order.orderNo} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-semibold text-slate-700">{order.orderNo}</td>
                    <td className="px-4 py-3 text-slate-600">{order.orderDate || "—"}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {order.customer
                        ? `${order.customer.code} — ${order.customer.name}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {order.salesman
                        ? `${order.salesman.code} — ${order.salesman.name}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700">{order.itemCount}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{order.totalUnits.toFixed(2)}</td>
                    <td className="px-4 py-3 uppercase tracking-wide text-slate-600">{order.status}</td>
                    <td className="px-4 py-3 text-slate-500">{order.remarks || ""}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleLoadOrder(order.orderNo)}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
};

export default OrdersPage;
