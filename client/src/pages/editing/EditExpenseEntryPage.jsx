import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import SectionCard from "../../components/SectionCard.jsx";
import FormField from "../../components/FormField.jsx";
import SearchSelect from "../../components/SearchSelect.jsx";
import { api } from "../../api/client.js";

const emptyFormState = {
  expenseCode: "",
  expenseLabel: "",
  voucherDate: "",
  cashPayment: "",
  details: ""
};

const EditExpenseEntryPage = () => {
  const [voucherNo, setVoucherNo] = useState("");
  const [selectedVoucher, setSelectedVoucher] = useState(null);
  const [status, setStatus] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [expenseQuery, setExpenseQuery] = useState("");
  const [voucherLocked, setVoucherLocked] = useState(false);
  const [isLoadingVoucher, setIsLoadingVoucher] = useState(false);
  const [formState, setFormState] = useState({ ...emptyFormState });
  const queryClient = useQueryClient();

  const voucherLookup = useQuery({
    queryKey: ["expense-entries", { search: searchTerm }],
    queryFn: async () => {
      const response = await api.get("/expense-entries", { params: { search: searchTerm } });
      return response.data;
    }
  });

  const expenseLookup = useQuery({
    queryKey: ["expenses", { search: expenseQuery }],
    queryFn: async () => {
      const response = await api.get("/expenses", { params: { search: expenseQuery } });
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
      voucherLookup.data?.map((entry) => ({
        value: entry.voucher_no,
        voucherNo: entry.voucher_no,
        label: `${entry.voucher_no} — ${entry.expense_description || entry.expense_code}`,
        meta: entry
      })) ?? [],
    [voucherLookup.data]
  );

  const populateForm = (entry) => {
    setFormState({
      expenseCode: entry.expense_code || "",
      expenseLabel:
        entry.expense_code && entry.expense_description
          ? `${entry.expense_code} — ${entry.expense_description}`
          : entry.expense_code || "",
      voucherDate: entry.voucher_date || "",
      cashPayment:
        entry.cash_payment != null ? String(Number(entry.cash_payment).toFixed(2)) : "",
      details: entry.details || ""
    });
    setExpenseQuery("");
  };

  const loadVoucher = async (value) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setStatus({ type: "error", message: "Enter the voucher number to load." });
      return;
    }
    setIsLoadingVoucher(true);
    setStatus({ type: "info", message: "Loading voucher details…" });
    try {
      const response = await api.get(`/expense-entries/${encodeURIComponent(trimmed)}`);
      populateForm(response.data);
      setVoucherNo(trimmed);
      setVoucherLocked(true);
      setSelectedVoucher({
        value: trimmed,
        voucherNo: trimmed,
        label: `${trimmed} — ${response.data.expense_description || response.data.expense_code}`
      });
      setStatus({ type: "success", message: "Voucher loaded. You can now edit and save changes." });
    } catch (error) {
      const message = error?.response?.data?.message || error?.message || "Failed to load voucher.";
      setFormState({ ...emptyFormState });
      setVoucherLocked(false);
      setSelectedVoucher(null);
      setStatus({ type: "error", message });
    } finally {
      setIsLoadingVoucher(false);
    }
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
      const trimmedVoucher = voucherNo.trim();
      if (!trimmedVoucher) throw new Error("Missing voucher number.");
      if (!formState.expenseCode) throw new Error("Select an expense code before saving.");
      if (!formState.voucherDate.trim()) throw new Error("Enter a voucher date before saving.");
      const payload = {
        expenseCode: formState.expenseCode,
        voucherDate: formState.voucherDate,
        cashPayment: Number(formState.cashPayment) || 0,
        details: formState.details
      };
      const response = await api.put(
        `/expense-entries/${encodeURIComponent(trimmedVoucher)}`,
        payload
      );
      return response.data;
    },
    onMutate: () => setStatus(null),
    onSuccess: (data) => {
      populateForm(data);
      queryClient.invalidateQueries({ queryKey: ["expense-entries"] });
      setSelectedVoucher({
        value: data.voucher_no,
        voucherNo: data.voucher_no,
        label: `${data.voucher_no} — ${data.expense_description || data.expense_code}`
      });
      setStatus({ type: "success", message: "Expense entry updated successfully." });
    },
    onError: (error) => {
      const message =
        error?.response?.data?.message || error?.message || "Failed to update expense entry.";
      setStatus({ type: "error", message });
    }
  });

  const isSaving = updateMutation.isPending;

  return (
    <div className="space-y-6">
      <SectionCard
        title="Edit Expense Entry"
        description="Locate an expense voucher, adjust the allocation, and resave without changing the voucher number."
      >
        <form
          className="grid gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (!voucherLocked) {
              setStatus({ type: "error", message: "Load a voucher before saving changes." });
              return;
            }
            updateMutation.mutate();
          }}
        >
          <div className="grid gap-4 md:grid-cols-[minmax(0,2fr),minmax(0,1fr)] items-end">
            <SearchSelect
              label="Search Vouchers"
              placeholder="Search by voucher or expense"
              value={selectedVoucher}
              onSelect={(option) => {
                setSelectedVoucher(option);
                setVoucherNo(option.voucherNo);
                setVoucherLocked(false);
                setFormState({ ...emptyFormState });
                setStatus(null);
              }}
              onSearch={setSearchTerm}
              results={voucherOptions}
              renderItem={(option) => (
                <div className="flex flex-col text-slate-700">
                  <span className="font-medium text-sm text-slate-800">{option.label}</span>
                  <span className="text-xs text-slate-500">
                    Amount: {Number(option.meta.cash_payment ?? 0).toFixed(2)} • Date: {option.meta.voucher_date}
                  </span>
                </div>
              )}
            />
            <FormField label="Voucher No.">
              <input
                value={voucherNo}
                placeholder="Enter or select a voucher number"
                readOnly={voucherLocked}
                onChange={(event) => {
                  setVoucherNo(event.target.value);
                  setVoucherLocked(false);
                }}
              />
            </FormField>
          </div>
          {voucherLookup.isFetching ? (
            <p className="text-xs text-slate-500">Searching…</p>
          ) : null}
          <div className="flex gap-3">
            <button
              type="button"
              className="secondary text-sm"
              onClick={() => loadVoucher(voucherNo)}
              disabled={isLoadingVoucher}
            >
              {isLoadingVoucher ? "Loading…" : "Load Voucher"}
            </button>
            <button
              type="button"
              className="secondary text-sm"
              onClick={() => {
                setVoucherNo("");
                setVoucherLocked(false);
                setSelectedVoucher(null);
                setSearchTerm("");
                setExpenseQuery("");
                setFormState({ ...emptyFormState });
                setStatus(null);
                setIsLoadingVoucher(false);
              }}
            >
              Reset
            </button>
          </div>
          {status ? (
            <p
              className={`text-xs ${
                status.type === "error"
                  ? "text-rose-500"
                  : status.type === "success"
                  ? "text-emerald-500"
                  : "text-slate-500"
              }`}
            >
              {status.message}
            </p>
          ) : null}

          {voucherLocked ? (
            <div className="grid gap-4 md:grid-cols-2">
              <SearchSelect
                label="Expense Code"
                placeholder="Search expense"
                value={
                  formState.expenseCode
                    ? { label: formState.expenseLabel || formState.expenseCode }
                    : null
                }
                onSelect={(option) =>
                  setFormState((prev) => ({
                    ...prev,
                    expenseCode: option.code,
                    expenseLabel: option.label
                  }))
                }
                onSearch={setExpenseQuery}
                results={
                  expenseLookup.data?.map((expense) => ({
                    value: expense.id,
                    code: expense.code,
                    label: `${expense.code} — ${expense.description}`
                  })) ?? []
                }
              />
              <FormField label="Voucher Date" required>
                <input
                  value={formState.voucherDate}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, voucherDate: event.target.value }))
                  }
                />
              </FormField>
              <FormField label="Cash Payment" required>
                <input
                  type="number"
                  value={formState.cashPayment}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, cashPayment: event.target.value }))
                  }
                />
              </FormField>
              <FormField label="Details">
                <textarea
                  rows={3}
                  value={formState.details}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, details: event.target.value }))
                  }
                />
              </FormField>
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-3">
            <button type="submit" className="primary" disabled={isSaving}>
              {isSaving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </SectionCard>
    </div>
  );
};

export default EditExpenseEntryPage;
