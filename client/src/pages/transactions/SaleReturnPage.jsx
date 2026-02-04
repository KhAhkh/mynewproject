import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import SectionCard from "../../components/SectionCard.jsx";
import FormField from "../../components/FormField.jsx";
import SearchSelect from "../../components/SearchSelect.jsx";
import { api } from "../../api/client.js";
import { toDisplay } from "../../utils/date.js";
import { Link } from "react-router-dom";

const SaleReturnPage = () => {
  const [invoiceQuery, setInvoiceQuery] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [returnMode, setReturnMode] = useState("item"); // "item" or "whole"
  const [formState, setFormState] = useState({
    date: toDisplay(new Date()),
    saleItemId: "",
    quantity: ""
  });

  const invoiceLookup = useQuery({
    queryKey: ["sales", { search: invoiceQuery }],
    queryFn: async () => {
      const response = await api.get("/sales", { params: { search: invoiceQuery } });
      return response.data;
    }
  });

  const itemsQuery = useQuery({
    queryKey: ["sale-items", selectedInvoice?.invoice_no],
    queryFn: async () => {
      if (!selectedInvoice) return [];
      const response = await api.get(`/sales/${selectedInvoice.invoice_no}`);
      return response.data.items;
    },
    enabled: Boolean(selectedInvoice)
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!selectedInvoice) throw new Error("Select invoice");
      
      if (returnMode === "whole") {
        // Return all items in the invoice
        const items = itemsQuery.data || [];
        if (items.length === 0) throw new Error("No items to return");
        
        const results = await Promise.all(
          items.map((item) =>
            api.post(`/sales/${selectedInvoice.invoice_no}/returns`, {
              saleItemId: item.id,
              quantity: Number(item.quantity) + Number(item.bonus || 0),
              date: formState.date
            })
          )
        );
        return results;
      } else {
        // Return specific item
        const payload = {
          saleItemId: formState.saleItemId,
          quantity: Number(formState.quantity),
          date: formState.date
        };
        const response = await api.post(`/sales/${selectedInvoice.invoice_no}/returns`, payload);
        return response.data;
      }
    }
  });

  useEffect(() => {
    if (selectedInvoice) {
      setFormState((prev) => ({ ...prev, saleItemId: "", quantity: "" }));
      setReturnMode("item");
    }
  }, [selectedInvoice]);

  return (
    <SectionCard
      title="Sale Return"
      description="Select invoice then choose the item to return."
      actions={
        <div className="flex items-center gap-3">
          {mutation.isSuccess ? (
            <span className="text-xs text-emerald-400">Return logged</span>
          ) : mutation.isError ? (
            <span className="text-xs text-rose-400">{mutation.error.message}</span>
          ) : null}
          <Link to="/history/transactions?type=sale-return" className="secondary text-xs px-3 py-1">
            View saved returns
          </Link>
        </div>
      }
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <div className="grid md:grid-cols-3 gap-4">
          <SearchSelect
            label="Invoice"
            placeholder="Search invoice"
            value={selectedInvoice ? { label: `${selectedInvoice.invoice_no} — ${selectedInvoice.customer_name}` } : null}
            onSelect={(item) => {
              const invoice = invoiceLookup.data?.find((row) => row.invoice_no === item.invoice);
              if (invoice) setSelectedInvoice(invoice);
            }}
            onSearch={setInvoiceQuery}
            results={
              invoiceLookup.data?.map((invoice) => ({
                value: invoice.invoice_no,
                invoice: invoice.invoice_no,
                label: `${invoice.invoice_no} — ${invoice.customer_name}`
              })) ?? []
            }
          />
          <FormField label="Return Date" required>
            <input
              type="date"
              value={formState.date}
              onChange={(event) => setFormState((prev) => ({ ...prev, date: event.target.value }))}
            />
          </FormField>
        </div>

        {selectedInvoice && (
          <div className="grid gap-4">
            <div className="flex gap-4 border-b pb-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="returnMode"
                  value="item"
                  checked={returnMode === "item"}
                  onChange={(e) => setReturnMode(e.target.value)}
                />
                <span className="text-sm font-medium">Return Specific Item</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="returnMode"
                  value="whole"
                  checked={returnMode === "whole"}
                  onChange={(e) => setReturnMode(e.target.value)}
                />
                <span className="text-sm font-medium">Return Whole Invoice</span>
              </label>
            </div>

            {returnMode === "item" ? (
              <div className="grid md:grid-cols-2 gap-4">
                <FormField label="Sale Item" required>
                  <select
                    value={formState.saleItemId}
                    onChange={(event) => setFormState((prev) => ({ ...prev, saleItemId: event.target.value }))}
                  >
                    <option value="">Select item</option>
                    {itemsQuery.data?.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.item_code} — {item.item_name} (Qty: {Number(item.quantity) + Number(item.bonus || 0)})
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Quantity" required>
                  <input
                    type="number"
                    min="0"
                    value={formState.quantity}
                    onChange={(event) => setFormState((prev) => ({ ...prev, quantity: event.target.value }))}
                  />
                </FormField>
              </div>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-700 mb-3">Items to Return:</p>
                <div className="space-y-2">
                  {itemsQuery.data?.map((item) => (
                    <div key={item.id} className="flex justify-between text-sm text-slate-600">
                      <span>{item.item_code} — {item.item_name}</span>
                      <span className="font-medium">{Number(item.quantity) + Number(item.bonus || 0)} units</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setSelectedInvoice(null);
              setReturnMode("item");
              setFormState({ date: toDisplay(new Date()), saleItemId: "", quantity: "" });
              setInvoiceQuery("");
            }}
          >
            Clear
          </button>
          <button type="submit" className="primary" disabled={!selectedInvoice || (returnMode === "item" && !formState.saleItemId)}>
            {mutation.isPending ? "Recording..." : "Save Return"}
          </button>
        </div>
      </form>
    </SectionCard>
  );
};

export default SaleReturnPage;
