import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import SectionCard from "../../components/SectionCard.jsx";
import FormField from "../../components/FormField.jsx";
import SearchSelect from "../../components/SearchSelect.jsx";
import { api } from "../../api/client.js";
import { validateDisplayDate } from "../../utils/date.js";

const createInitialForm = () => ({
  type: "out",
  transactionDate: "",
  quantity: "",
  notes: "",
  supplierLabel: "",
  supplierCode: "",
  itemLabel: "",
  itemCode: "",
  lastPurchaseRate: null
});

const formatTypeLabel = (value) => (value === "in" ? "Damage-In" : "Damage-Out");

const formatAmount = (value) =>
  value != null
    ? `Rs ${Number(value).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })}`
    : "—";

const toQuantityInput = (value) => {
  if (value == null || value === "") return "";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "";
  return numeric.toString();
};

const EditDamageTransactionPage = () => {
  const queryClient = useQueryClient();
  const [voucherSearch, setVoucherSearch] = useState("");
  const [voucherNo, setVoucherNo] = useState("");
  const [voucherLocked, setVoucherLocked] = useState(false);
  const [selectedVoucher, setSelectedVoucher] = useState(null);
  const [transactionDetail, setTransactionDetail] = useState(null);
  const [formState, setFormState] = useState(createInitialForm);
  const [status, setStatus] = useState(null);
  const [isLoadingVoucher, setIsLoadingVoucher] = useState(false);
  const [availability, setAvailability] = useState(null);

  const voucherLookup = useQuery({
    queryKey: ["damage-transactions", { search: voucherSearch, limit: 40 }],
    queryFn: async ({ queryKey }) => {
      const [, params] = queryKey;
      const response = await api.get("/damage-transactions", {
        params: { search: params.search || undefined, limit: params.limit }
      });
      return response.data;
    }
  });

  useEffect(() => {
    if (voucherLookup.error) {
      setStatus({ type: "error", message: voucherLookup.error.message });
    }
  }, [voucherLookup.error]);

  const voucherOptions = useMemo(
    () =>
      voucherLookup.data?.map((entry) => {
        const labelParts = [entry.voucher_no || `Txn ${entry.id}`];
        labelParts.push(formatTypeLabel(entry.transaction_type));
        if (entry.supplier_code) {
          labelParts.push(`${entry.supplier_code} — ${entry.supplier_name || ""}`.trim());
        }
        if (entry.item_code) {
          labelParts.push(`${entry.item_code} — ${entry.item_name || ""}`.trim());
        }
        return {
          value: entry.voucher_no || String(entry.id),
          voucherNo: entry.voucher_no || "",
          label: labelParts.join(" • "),
          meta: entry
        };
      }) ?? [],
    [voucherLookup.data]
  );

  const resetForm = () => {
    setVoucherLocked(false);
    setTransactionDetail(null);
    setSelectedVoucher(null);
    setFormState(createInitialForm());
    setVoucherNo("");
    setVoucherSearch("");
    setAvailability(null);
    setStatus(null);
  };

  const refreshAvailability = (itemCode) => {
    if (!itemCode) {
      setAvailability(null);
      return;
    }
    api
      .get(`/items/${encodeURIComponent(itemCode)}/availability`)
      .then((response) => {
        const qty = Number(response?.data?.quantity ?? 0);
        setAvailability(Number.isFinite(qty) ? qty : null);
      })
      .catch(() => setAvailability(null));
  };

  const populateForm = (detail) => {
    const nextForm = createInitialForm();
    nextForm.type = detail.transaction_type || "out";
    nextForm.transactionDate = detail.transaction_date || "";
    nextForm.quantity = toQuantityInput(detail.quantity);
    nextForm.notes = detail.notes || "";
    nextForm.supplierCode = detail.supplier_code || "";
    nextForm.supplierLabel = detail.supplier_code && detail.supplier_name
      ? `${detail.supplier_code} — ${detail.supplier_name}`
      : detail.supplier_code || detail.supplier_name || "";
    nextForm.itemCode = detail.item_code || "";
    nextForm.itemLabel = detail.item_code && detail.item_name
      ? `${detail.item_code} — ${detail.item_name}`
      : detail.item_code || detail.item_name || "";
    nextForm.lastPurchaseRate = detail.last_purchase_rate;
    setFormState(nextForm);
    refreshAvailability(detail.item_code);
  };

  const loadVoucher = async (value) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setStatus({ type: "error", message: "Enter the voucher number to load." });
      return;
    }
    setIsLoadingVoucher(true);
    setStatus({ type: "info", message: "Loading damage transaction…" });
    try {
      const response = await api.get(`/damage-transactions/${encodeURIComponent(trimmed)}`);
      const detail = response.data;
      setTransactionDetail(detail);
      setVoucherNo(detail.voucher_no || trimmed);
      setVoucherLocked(true);
      setSelectedVoucher({
        value: detail.voucher_no || trimmed,
        voucherNo: detail.voucher_no || trimmed,
        label: `${detail.voucher_no || trimmed} • ${formatTypeLabel(detail.transaction_type)} • ${detail.supplier_code || ""}`
      });
      populateForm(detail);
      setStatus({ type: "success", message: "Damage transaction loaded. Update and save changes." });
    } catch (error) {
      const message = error?.response?.data?.message || error?.message || "Failed to load damage transaction.";
      resetForm();
      setStatus({ type: "error", message });
    } finally {
      setIsLoadingVoucher(false);
    }
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!voucherLocked || !transactionDetail) {
        throw new Error("Load a damage transaction before saving changes.");
      }
      if (!formState.transactionDate.trim() || !validateDisplayDate(formState.transactionDate.trim())) {
        throw new Error("Enter a valid transaction date before saving changes.");
      }
      const quantityNumber = Number(formState.quantity);
      if (!Number.isFinite(quantityNumber) || quantityNumber <= 0) {
        throw new Error("Enter a quantity greater than zero before saving changes.");
      }
      const notes = formState.notes.trim();
      if (!notes) {
        throw new Error("Enter notes / reason before saving changes.");
      }
      const payload = {
        type: formState.type,
        quantity: quantityNumber,
        date: formState.transactionDate,
        notes
      };
      const response = await api.put(
        `/damage-transactions/${encodeURIComponent(transactionDetail.voucher_no || voucherNo)}`,
        payload
      );
      return response.data;
    },
    onMutate: () => setStatus(null),
    onSuccess: (data) => {
      setTransactionDetail(data);
      setVoucherNo(data.voucher_no || voucherNo);
      populateForm(data);
      setStatus({ type: "success", message: "Damage transaction updated successfully." });
      setSelectedVoucher((prev) => {
        if (!data.voucher_no) return prev;
        return {
          value: data.voucher_no,
          voucherNo: data.voucher_no,
          label: `${data.voucher_no} • ${formatTypeLabel(data.transaction_type)} • ${data.supplier_code || ""}`
        };
      });
      queryClient.invalidateQueries({ queryKey: ["damage-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["damage-transactions-list"] });
      queryClient.invalidateQueries({ queryKey: ["reports/damage"] });
      queryClient.invalidateQueries({ queryKey: ["stock-report"] });
    },
    onError: (error) => {
      const message = error?.response?.data?.message || error?.message || "Failed to update damage transaction.";
      setStatus({ type: "error", message });
    }
  });

  const isSaving = updateMutation.isPending;
  const showForm = voucherLocked && Boolean(transactionDetail);

  return (
    <div className="space-y-6">
      <SectionCard
        title="Edit Damage-IN/Out"
        description="Locate a recorded damage voucher, adjust its details, and resave without creating a new entry."
      >
        <form
          className="grid gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (!showForm) {
              setStatus({ type: "error", message: "Load a damage transaction before saving changes." });
              return;
            }
            updateMutation.mutate();
          }}
        >
          <div className="grid gap-4 md:grid-cols-[minmax(0,2fr),minmax(0,1fr)] items-end">
            <SearchSelect
              label="Search Damage Voucher"
              placeholder="Search by voucher, supplier, or item"
              value={selectedVoucher}
              onSelect={(option) => {
                setSelectedVoucher(option);
                if (option?.voucherNo) {
                  setVoucherNo(option.voucherNo);
                  setVoucherLocked(false);
                  setStatus(null);
                }
              }}
              onSearch={setVoucherSearch}
              results={voucherOptions}
              renderItem={(option) => (
                <div className="flex flex-col text-slate-700">
                  <span className="font-medium text-sm text-slate-800">{option.label}</span>
                  <span className="text-xs text-slate-500">
                    Qty: {option.meta?.quantity ?? "—"} • Date: {option.meta?.transaction_date ?? "—"}
                  </span>
                </div>
              )}
            />
            <FormField label="Voucher No.">
              <input
                value={voucherNo}
                readOnly={voucherLocked}
                onChange={(event) => {
                  setVoucherNo(event.target.value);
                  setVoucherLocked(false);
                  setStatus(null);
                }}
                placeholder="Enter voucher number"
              />
            </FormField>
          </div>
          {voucherLookup.isFetching ? (
            <p className="text-xs text-slate-500">Searching…</p>
          ) : null}
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="secondary"
              onClick={() => loadVoucher(voucherNo)}
              disabled={isLoadingVoucher}
            >
              {isLoadingVoucher ? "Loading…" : "Load Voucher"}
            </button>
            <button type="button" className="ghost" onClick={resetForm}>
              Reset
            </button>
          </div>
          {status ? (
            <div
              className={`rounded-2xl border px-4 py-3 text-sm ${
                status.type === "error"
                  ? "border-red-200 bg-red-50 text-red-700"
                  : status.type === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 bg-slate-50 text-slate-600"
              }`}
            >
              {status.message}
            </div>
          ) : null}

          {showForm ? (
            <div className="grid gap-6">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField label="Transaction Type" required>
                  <select
                    value={formState.type}
                    onChange={(event) =>
                      setFormState((prev) => ({ ...prev, type: event.target.value }))
                    }
                  >
                    <option value="out">Damage-Out</option>
                    <option value="in">Damage-In</option>
                  </select>
                </FormField>
                <FormField label="Transaction Date" required>
                  <input
                    value={formState.transactionDate}
                    onChange={(event) =>
                      setFormState((prev) => ({ ...prev, transactionDate: event.target.value }))
                    }
                    placeholder="DD/MM/YYYY"
                  />
                </FormField>
                <FormField label="Supplier">
                  <input value={formState.supplierLabel} readOnly />
                </FormField>
                <FormField label="Item">
                  <input value={formState.itemLabel} readOnly />
                </FormField>
                <FormField label="Quantity" required>
                  <input
                    type="number"
                    step="0.01"
                    value={formState.quantity}
                    onChange={(event) =>
                      setFormState((prev) => ({ ...prev, quantity: event.target.value }))
                    }
                    min="0.01"
                  />
                </FormField>
                <FormField label="Notes" required>
                  <textarea
                    rows={3}
                    value={formState.notes}
                    onChange={(event) =>
                      setFormState((prev) => ({ ...prev, notes: event.target.value }))
                    }
                  />
                </FormField>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-700 shadow-sm">
                  <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">Stock Insight</p>
                  <p className="mt-1 text-base font-semibold text-slate-900">
                    {availability != null ? `${availability.toFixed(2)} units available` : "Availability unknown"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {formState.type === "out"
                      ? "Ensure the quantity does not exceed available stock."
                      : "Damage-In will credit stock back to inventory."}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-700 shadow-sm">
                  <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">Last Purchase Rate</p>
                  <p className="mt-1 text-base font-semibold text-slate-900">
                    {formState.lastPurchaseRate != null
                      ? formatAmount(formState.lastPurchaseRate)
                      : "Not recorded"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Reference from the most recent purchase prior to this transaction date.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3">
                <button type="submit" className="primary" disabled={isSaving}>
                  {isSaving ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </div>
          ) : null}
        </form>
      </SectionCard>
    </div>
  );
};

export default EditDamageTransactionPage;
