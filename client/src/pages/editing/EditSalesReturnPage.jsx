import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import SectionCard from "../../components/SectionCard.jsx";
import FormField from "../../components/FormField.jsx";
import SearchSelect from "../../components/SearchSelect.jsx";
import { api } from "../../api/client.js";
import { toDisplay } from "../../utils/date.js";

const EditSalesReturnPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedReturn, setSelectedReturn] = useState(null);
  const [isLoadingReturn, setIsLoadingReturn] = useState(false);
  const [status, setStatus] = useState(null);

  const [formState, setFormState] = useState({
    date: toDisplay(new Date()),
    saleItemId: "",
    quantity: "",
    invoiceNo: ""
  });

  // Lookup sales returns to edit
  const returnsLookup = useQuery({
    queryKey: ["sale-returns", { search: searchTerm }],
    queryFn: async () => {
      const response = await api.get("/sale-returns", { params: { search: searchTerm } });
      return response.data;
    }
  });

  // Load return details when selected
  useEffect(() => {
    if (!selectedReturn) return;

    const loadReturnDetails = async () => {
      try {
        setIsLoadingReturn(true);
        const response = await api.get(`/sale-returns/${selectedReturn.id}`);
        const returnData = response.data;
        setFormState({
          date: toDisplay(returnData.return_date || new Date()),
          saleItemId: String(returnData.sale_item_id || ""),
          quantity: String(returnData.quantity || ""),
          invoiceNo: returnData.invoice_no || ""
        });
        setStatus(null);
      } catch (error) {
        setStatus({ type: "error", message: error.message });
      } finally {
        setIsLoadingReturn(false);
      }
    };

    loadReturnDetails();
  }, [selectedReturn]);

  // Mutation to update return
  const mutation = useMutation({
    mutationFn: async () => {
      if (!selectedReturn) throw new Error("Select return to edit");
      const payload = {
        date: formState.date,
        quantity: Number(formState.quantity)
      };
      const response = await api.put(`/sale-returns/${selectedReturn.id}`, payload);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sale-returns"] });
      setStatus({ type: "success", message: "Return updated successfully" });
      setTimeout(() => {
        navigate("/history/transactions?type=sale-return");
      }, 1500);
    },
    onError: (error) => {
      setStatus({ type: "error", message: error.message });
    }
  });

  // Mutation to delete/reverse return
  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!selectedReturn) throw new Error("Select return to delete");
      const response = await api.delete(`/sale-returns/${selectedReturn.id}`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sale-returns"] });
      setStatus({ type: "success", message: "Return reversed successfully" });
      setTimeout(() => {
        navigate("/history/transactions?type=sale-return");
      }, 1500);
    },
    onError: (error) => {
      setStatus({ type: "error", message: error.message });
    }
  });

  return (
    <SectionCard
      title="Edit Sale Return"
      description="Search and edit existing sale returns."
      actions={
        <div className="flex items-center gap-3">
          {status ? (
            <span
              className={`text-xs ${
                status.type === "error" ? "text-rose-400" : "text-emerald-400"
              }`}
            >
              {status.message}
            </span>
          ) : null}
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
        <div className="grid md:grid-cols-2 gap-4">
          <SearchSelect
            label="Sale Return"
            placeholder="Search return by invoice or item"
            value={
              selectedReturn
                ? {
                    label: `${selectedReturn.invoice_no} — ${selectedReturn.item_code} (Qty: ${selectedReturn.quantity})`
                  }
                : null
            }
            onSelect={(item) => {
              const returnRecord = returnsLookup.data?.find((row) => row.id === item.value);
              if (returnRecord) setSelectedReturn(returnRecord);
            }}
            onSearch={setSearchTerm}
            results={
              returnsLookup.data?.map((returnRecord) => ({
                value: returnRecord.id,
                label: `${returnRecord.invoice_no} — ${returnRecord.item_code} (Qty: ${returnRecord.quantity})`
              })) ?? []
            }
          />
        </div>

        {selectedReturn && !isLoadingReturn && (
          <div className="grid gap-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-slate-600">
                <span className="font-semibold">Invoice:</span> {formState.invoiceNo}
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <FormField label="Return Date" required>
                <input
                  type="date"
                  value={formState.date}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, date: event.target.value }))
                  }
                />
              </FormField>

              <FormField label="Item" required>
                <input
                  type="text"
                  value={selectedReturn.item_code}
                  disabled
                  className="bg-slate-100 text-slate-600"
                />
              </FormField>

              <FormField label="Quantity" required>
                <input
                  type="number"
                  min="0"
                  value={formState.quantity}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, quantity: event.target.value }))
                  }
                />
              </FormField>
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setSelectedReturn(null);
                  setFormState({
                    date: toDisplay(new Date()),
                    saleItemId: "",
                    quantity: "",
                    invoiceNo: ""
                  });
                  setSearchTerm("");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-4 py-2 text-sm font-medium text-rose-600 border border-rose-300 rounded-md hover:bg-rose-50 disabled:opacity-50"
                onClick={() => {
                  if (confirm("Are you sure you want to reverse this return?")) {
                    deleteMutation.mutate();
                  }
                }}
                disabled={deleteMutation.isPending || mutation.isPending}
              >
                {deleteMutation.isPending ? "Reversing..." : "Reverse Return"}
              </button>
              <button type="submit" className="primary" disabled={mutation.isPending || deleteMutation.isPending}>
                {mutation.isPending ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        )}

        {isLoadingReturn && (
          <div className="text-center text-sm text-slate-500">Loading return details...</div>
        )}
      </form>
    </SectionCard>
  );
};

export default EditSalesReturnPage;
