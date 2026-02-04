import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import SectionCard from "../../components/SectionCard.jsx";
import FormField from "../../components/FormField.jsx";
import SearchSelect from "../../components/SearchSelect.jsx";
import { api } from "../../api/client.js";
import { toDisplay } from "../../utils/date.js";
import { Link } from "react-router-dom";

const PurchaseReturnPage = () => {
  const [invoiceQuery, setInvoiceQuery] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [status, setStatus] = useState(null);
  const [meta, setMeta] = useState({ nextReturn: "PR000001" });
  const [formState, setFormState] = useState({
    date: toDisplay(new Date()),
    purchaseItemId: "",
    quantity: ""
  });
  const queryClient = useQueryClient();

  useEffect(() => {
    api
      .get("/metadata/next/purchase-return")
      .then((response) => setMeta(response.data))
      .catch(() => setMeta((prev) => prev));
  }, []);

  const invoiceLookup = useQuery({
    queryKey: ["purchases", { search: invoiceQuery }],
    queryFn: async () => {
      const response = await api.get("/purchases", { params: { search: invoiceQuery } });
      return response.data;
    }
  });

  const itemsQuery = useQuery({
    queryKey: ["purchase-items", selectedInvoice?.invoice_no],
    queryFn: async () => {
      if (!selectedInvoice) return [];
      const response = await api.get(`/purchases/${selectedInvoice.invoice_no}`);
      return response.data.items;
    },
    enabled: Boolean(selectedInvoice)
  });

  const {
    mutate: submitReturn,
    reset: resetMutation,
    isPending
  } = useMutation({
    mutationFn: async () => {
      if (!selectedInvoice) throw new Error("Select invoice");
      if (!formState.purchaseItemId) throw new Error("Choose an item to return");
      if (!formState.quantity || Number(formState.quantity) <= 0) {
        throw new Error("Enter a quantity greater than zero");
      }
      const payload = {
        purchaseItemId: Number(formState.purchaseItemId),
        quantity: Number(formState.quantity),
        date: formState.date
      };
      const response = await api.post(`/purchases/${selectedInvoice.invoice_no}/returns`, payload);
      return response.data;
    },
    onMutate: () => setStatus(null),
    onSuccess: (data) => {
      const returnNo = data?.return_no || data?.returnNo || null;
      const invoiceNo = data?.invoice_no || selectedInvoice?.invoice_no || null;
      const messageParts = [];
      if (returnNo) messageParts.push(`Return ${returnNo} recorded`);
      if (invoiceNo) messageParts.push(`Invoice ${invoiceNo}`);
      setStatus({ type: "success", message: messageParts.length ? messageParts.join(" - ") : "Return logged" });
      setFormState((prev) => ({ ...prev, quantity: "" }));
      queryClient.invalidateQueries({ queryKey: ["purchase-items", selectedInvoice?.invoice_no] });
      queryClient.invalidateQueries({ queryKey: ["stock-report"] });
      queryClient.invalidateQueries({ queryKey: ["transaction-history"] });
      api
        .get("/metadata/next/purchase-return")
        .then((response) => setMeta(response.data))
        .catch(() => null);
    },
    onError: (error) => {
      setStatus({ type: "error", message: error.message });
    }
  });

  useEffect(() => {
    if (selectedInvoice) {
      setFormState((prev) => ({ ...prev, purchaseItemId: "", quantity: "" }));
      setStatus(null);
      resetMutation();
    }
  }, [selectedInvoice, resetMutation]);

  return (
    <SectionCard
      title="Purchase Return"
      description="Return items against supplier invoices."
      actions={
        <div className="flex items-center gap-3">
          {status ? (
            <span
              className={`text-xs ${
                status.type === "success" ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {status.message}
            </span>
          ) : null}
          <Link to="/history/transactions?type=purchase-return" className="secondary text-xs px-3 py-1">
            View saved returns
          </Link>
        </div>
      }
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          submitReturn();
        }}
      >
        <div className="grid md:grid-cols-3 gap-4">
          <FormField label="Return No.">
            <input value={meta.nextReturn} disabled />
          </FormField>
          <SearchSelect
            label="Invoice"
            placeholder="Search invoice"
            value={selectedInvoice ? { label: `${selectedInvoice.invoice_no} — ${selectedInvoice.supplier_name}` } : null}
            onSelect={(option) => {
              const invoice = invoiceLookup.data?.find((row) => row.invoice_no === option.invoice);
              if (invoice) setSelectedInvoice(invoice);
              setStatus(null);
              resetMutation();
            }}
            onSearch={setInvoiceQuery}
            results={
              invoiceLookup.data?.map((invoice) => ({
                value: invoice.invoice_no,
                invoice: invoice.invoice_no,
                label: `${invoice.invoice_no} — ${invoice.supplier_name}`
              })) ?? []
            }
          />
          <FormField label="Return Date" required>
            <input
              value={formState.date}
              onChange={(event) => setFormState((prev) => ({ ...prev, date: event.target.value }))}
            />
          </FormField>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <FormField label="Purchase Item" required>
            <select
              value={formState.purchaseItemId}
              onChange={(event) => setFormState((prev) => ({ ...prev, purchaseItemId: event.target.value }))}
            >
              <option value="">Select item</option>
              {itemsQuery.data?.map((item) => {
                const quantity = Number(item.quantity ?? 0);
                const bonus = Number(item.bonus ?? 0);
                const rate = Number(item.purchase_rate ?? 0);
                const discount = Number(item.discount_percent ?? 0);
                const unit = item.base_unit ? ` ${item.base_unit}` : "";
                const quantityText = `${quantity}${unit}${bonus ? ` + ${bonus}${unit} bonus` : ""}`;
                const rateText = rate ? ` @ Rs ${rate.toFixed(2)}` : "";
                const discountText = discount ? ` (Disc ${discount.toFixed(2)}%)` : "";
                const description = `${item.item_code} — ${item.item_name} - Qty ${quantityText}${rateText}${discountText}`;
                return (
                  <option key={item.id} value={item.id}>
                    {description}
                  </option>
                );
              })}
            </select>
          </FormField>
          <FormField label="Quantity" required>
            <input
              type="number"
              value={formState.quantity}
              onChange={(event) => setFormState((prev) => ({ ...prev, quantity: event.target.value }))}
            />
          </FormField>
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="reset"
            className="secondary"
            onClick={() => {
              setFormState({ date: toDisplay(new Date()), purchaseItemId: "", quantity: "" });
              setSelectedInvoice(null);
              setStatus(null);
              resetMutation();
            }}
          >
            Reset
          </button>
          <button type="submit" className="primary">
            {isPending ? "Recording..." : "Save Return"}
          </button>
        </div>
      </form>
    </SectionCard>
  );
};

export default PurchaseReturnPage;
