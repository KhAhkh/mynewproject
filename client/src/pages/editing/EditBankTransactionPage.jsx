import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import SectionCard from "../../components/SectionCard.jsx";
import FormField from "../../components/FormField.jsx";
import SearchSelect from "../../components/SearchSelect.jsx";
import { api } from "../../api/client.js";

const formatCurrency = (value) =>
  `Rs ${Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const formatTransactionLabel = (type) => (type === "drawing" ? "Drawing" : "Deposit");

const formatBankLabel = (bank) => {
  if (!bank || !bank.code) return "";
  if (bank.name) return `${bank.code} — ${bank.name}`;
  return bank.code;
};

const describeSource = (detail) => {
  if (!detail) return "Manual Entry";
  if (detail.sourceType === "customer-receipt") {
    return detail.sourceReference ? `Customer receipt ${detail.sourceReference}` : "Customer receipt";
  }
  if (detail.sourceType === "supplier-payment") {
    return detail.sourceReference
      ? `Supplier payment ${detail.sourceReference}`
      : "Supplier payment";
  }
  return "Manual Entry";
};

const lockedMessage = (detail) => {
  if (!detail || detail.isEditable) return null;
  if (detail.sourceType === "customer-receipt") {
    return detail.sourceReference
      ? `This entry was generated from customer receipt ${detail.sourceReference} and cannot be edited.`
      : "This entry was generated from a customer receipt and cannot be edited.";
  }
  if (detail.sourceType === "supplier-payment") {
    return detail.sourceReference
      ? `This entry was generated from supplier payment ${detail.sourceReference} and cannot be edited.`
      : "This entry was generated from a supplier payment and cannot be edited.";
  }
  return "This bank entry is locked and cannot be edited.";
};

const createInitialForm = () => ({
  transactionType: "deposit",
  bankCode: "",
  bankLabel: "",
  slipNo: "",
  slipDate: "",
  amount: ""
});

const EditBankTransactionPage = () => {
  const queryClient = useQueryClient();
  const [entrySearch, setEntrySearch] = useState("");
  const [entryNo, setEntryNo] = useState("");
  const [entryLocked, setEntryLocked] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [entryDetails, setEntryDetails] = useState(null);
  const [formState, setFormState] = useState(createInitialForm);
  const [status, setStatus] = useState(null);
  const [isLoadingEntry, setIsLoadingEntry] = useState(false);
  const [bankQuery, setBankQuery] = useState("");

  const entryLookup = useQuery({
    queryKey: ["bank-transactions", { search: entrySearch }],
    queryFn: async () => {
      const response = await api.get("/bank-transactions", { params: { search: entrySearch } });
      return response.data;
    }
  });

  useEffect(() => {
    if (entryLookup.error) {
      setStatus({ type: "error", message: entryLookup.error.message });
    }
  }, [entryLookup.error]);

  const entryOptions = useMemo(
    () =>
      entryLookup.data?.map((transaction) => {
        const labelParts = [];
        if (transaction.entryNo) {
          labelParts.push(transaction.entryNo);
        } else {
          labelParts.push(`Txn ${transaction.id}`);
        }
        labelParts.push(`${formatTransactionLabel(transaction.transactionType)} • ${formatCurrency(transaction.amount)}`);
        const bankLabel = formatBankLabel(transaction.bank);
        if (bankLabel) {
          labelParts.push(bankLabel);
        }
        return {
          value: transaction.entryNo || String(transaction.id),
          entryNo: transaction.entryNo || "",
          label: labelParts.join(" — "),
          meta: transaction
        };
      }) ?? [],
    [entryLookup.data]
  );

  const bankSearchTerm = bankQuery.trim();
  const bankQueryReady = bankSearchTerm.length >= 2;

  const bankLookup = useQuery({
    queryKey: ["banks", { search: bankSearchTerm }],
    enabled: bankQueryReady,
    queryFn: async () => {
      const response = await api.get("/banks", { params: { search: bankSearchTerm } });
      return response.data;
    }
  });

  const resetForm = () => {
    setEntryLocked(false);
    setEntryDetails(null);
    setSelectedEntry(null);
    setFormState(createInitialForm);
    setEntryNo("");
    setEntrySearch("");
    setStatus(null);
    setBankQuery("");
  };

  const populateForm = (detail) => {
    const nextForm = createInitialForm();
    nextForm.transactionType = detail.transactionType || "deposit";
    nextForm.bankCode = detail.bank?.code || "";
    nextForm.bankLabel = formatBankLabel(detail.bank);
    nextForm.slipNo = detail.slipNo || "";
    nextForm.slipDate = detail.slipDate || "";
    nextForm.amount = detail.amount != null ? Number(detail.amount).toFixed(2) : "";
    setFormState(nextForm);
  };

  const loadEntry = async (value) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setStatus({ type: "error", message: "Enter the bank entry number to load." });
      return;
    }
    setIsLoadingEntry(true);
    setStatus({ type: "info", message: "Loading bank entry…" });
    try {
      const response = await api.get(`/bank-transactions/${encodeURIComponent(trimmed)}`);
      const detail = response.data;
      setEntryDetails(detail);
      setEntryNo(detail.entryNo || trimmed);
      setEntryLocked(true);
      setSelectedEntry({
        value: detail.entryNo || trimmed,
        entryNo: detail.entryNo || trimmed,
        label: detail.entryNo
          ? `${detail.entryNo} — ${formatTransactionLabel(detail.transactionType)} • ${formatCurrency(detail.amount)}`
          : trimmed
      });
      setBankQuery("");
      populateForm(detail);
      const lockNotice = lockedMessage(detail);
      if (lockNotice) {
        setStatus({ type: "info", message: lockNotice });
      } else {
        setStatus({ type: "success", message: "Bank entry loaded. You can now update and save changes." });
      }
    } catch (error) {
      const message = error?.response?.data?.message || error?.message || "Failed to load bank entry.";
      resetForm();
      setStatus({ type: "error", message });
    } finally {
      setIsLoadingEntry(false);
    }
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!entryLocked || !entryDetails) {
        throw new Error("Load a bank entry before saving changes.");
      }
      if (!entryDetails.isEditable) {
        throw new Error("This bank entry is locked and cannot be edited.");
      }
      if (!formState.bankCode) {
        throw new Error("Select a bank before saving changes.");
      }
      if (!formState.slipDate) {
        throw new Error("Select the slip date before saving changes.");
      }
      const amountNumber = Number(formState.amount);
      if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
        throw new Error("Enter a valid amount before saving changes.");
      }
      const payload = {
        transactionType: formState.transactionType,
        bankCode: formState.bankCode,
        slipNo: formState.slipNo.trim() || null,
        slipDate: formState.slipDate,
        amount: amountNumber
      };
      const response = await api.put(
        `/bank-transactions/${encodeURIComponent(entryDetails.entryNo || entryNo)}`,
        payload
      );
      return response.data;
    },
    onMutate: () => setStatus(null),
    onSuccess: (data) => {
      const detail = data.transaction;
      setEntryDetails(detail);
      populateForm(detail);
      setStatus({ type: "success", message: "Bank entry updated successfully." });
      setSelectedEntry((prev) => {
        if (!detail.entryNo) return prev;
        return {
          value: detail.entryNo,
          entryNo: detail.entryNo,
          label: `${detail.entryNo} — ${formatTransactionLabel(detail.transactionType)} • ${formatCurrency(detail.amount)}`
        };
      });
      queryClient.invalidateQueries({ queryKey: ["bank-deposit-report"] });
      queryClient.invalidateQueries({ queryKey: ["transaction-history"] });
      queryClient.invalidateQueries({ queryKey: ["bank-transactions"] });
    },
    onError: (error) => {
      const message = error?.response?.data?.message || error?.message || "Failed to update bank entry.";
      setStatus({ type: "error", message });
    }
  });

  const isSaving = updateMutation.isPending;
  const isEditable = Boolean(entryDetails?.isEditable);
  const sourceDescription = describeSource(entryDetails);

  return (
    <div className="space-y-6">
      <SectionCard
        title="Edit Bank Transaction"
        description="Locate a manual bank deposit or drawing, adjust the details, and resave without altering the entry number."
      >
        <form
          className="grid gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (!entryLocked) {
              setStatus({ type: "error", message: "Load a bank entry before saving changes." });
              return;
            }
            updateMutation.mutate();
          }}
        >
          <div className="grid gap-4 md:grid-cols-[minmax(0,2fr),minmax(0,1fr)] items-end">
            <SearchSelect
              label="Search Bank Entries"
              placeholder="Search by entry no., bank, or slip"
              value={selectedEntry}
              onSelect={(option) => {
                setSelectedEntry(option);
                setEntryNo(option.entryNo || option.value || "");
                setEntryLocked(false);
                setEntryDetails(null);
                setFormState(createInitialForm);
                setStatus(null);
              }}
              onSearch={setEntrySearch}
              results={entryOptions}
              emptyMessage={
                entrySearch.trim()
                  ? "No bank transactions match your search."
                  : "Enter an entry number, bank code, or slip to search."
              }
              renderItem={(option) => (
                <div className="flex flex-col text-slate-700">
                  <span className="font-medium text-sm text-slate-800">{option.label}</span>
                  {option.meta ? (
                    <span className="text-xs text-slate-500">
                      Source: {describeSource(option.meta)}
                    </span>
                  ) : null}
                </div>
              )}
            />
            <FormField label="Entry No.">
              <input
                value={entryNo}
                readOnly={entryLocked}
                placeholder="Enter entry number"
                onChange={(event) => {
                  setEntryNo(event.target.value);
                  setEntryLocked(false);
                  setEntryDetails(null);
                  setFormState(createInitialForm);
                  setStatus(null);
                }}
              />
            </FormField>
          </div>
          <div className="flex gap-3">
            <button type="button" className="secondary text-sm" onClick={() => loadEntry(entryNo)} disabled={isLoadingEntry}>
              {isLoadingEntry ? "Loading…" : "Load Entry"}
            </button>
            <button
              type="button"
              className="secondary text-sm"
              onClick={resetForm}
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

          {entryDetails ? (
            <div className="grid gap-4">
              <div className="border border-slate-200 bg-slate-50 rounded-2xl px-4 py-3 text-xs text-slate-600">
                <p className="font-semibold text-slate-700 mb-2">Entry snapshot</p>
                <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4">
                  <div>
                    <p className="uppercase tracking-wide text-slate-500">Entry</p>
                    <p className="text-slate-800">{entryDetails.entryNo || "—"}</p>
                  </div>
                  <div>
                    <p className="uppercase tracking-wide text-slate-500">Type</p>
                    <p className="text-slate-800">{formatTransactionLabel(entryDetails.transactionType)}</p>
                  </div>
                  <div>
                    <p className="uppercase tracking-wide text-slate-500">Bank</p>
                    <p className="text-slate-800">{formatBankLabel(entryDetails.bank) || "—"}</p>
                  </div>
                  <div>
                    <p className="uppercase tracking-wide text-slate-500">Amount</p>
                    <p className="text-slate-800">{formatCurrency(entryDetails.amount)}</p>
                  </div>
                  <div>
                    <p className="uppercase tracking-wide text-slate-500">Slip Date</p>
                    <p className="text-slate-800">{entryDetails.slipDateDisplay || "—"}</p>
                  </div>
                  <div>
                    <p className="uppercase tracking-wide text-slate-500">Source</p>
                    <p className="text-slate-800">{sourceDescription}</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <FormField label="Transaction Type" required>
                  <select
                    value={formState.transactionType}
                    disabled={!isEditable}
                    onChange={(event) =>
                      setFormState((prev) => ({ ...prev, transactionType: event.target.value }))
                    }
                  >
                    <option value="deposit">Deposit</option>
                    <option value="drawing">Drawing</option>
                  </select>
                </FormField>
                <SearchSelect
                  label="Bank"
                  placeholder="Type at least two characters"
                  value={
                    formState.bankCode
                      ? { label: formState.bankLabel || formState.bankCode }
                      : null
                  }
                  onSelect={(option) => {
                    if (!option) return;
                    setFormState((prev) => ({
                      ...prev,
                      bankCode: option.code,
                      bankLabel: `${option.code} — ${option.name}`
                    }));
                    setStatus(null);
                  }}
                  onSearch={setBankQuery}
                  results={
                    bankQueryReady
                      ? bankLookup.data?.map((bank) => ({
                          value: bank.id,
                          code: bank.code,
                          name: bank.name,
                          label: `${bank.code} — ${bank.name}`
                        })) ?? []
                      : []
                  }
                  emptyMessage={
                    bankQueryReady
                      ? "No matching banks found."
                      : "Type at least two characters to search banks."
                  }
                  disabled={!isEditable}
                />
                <FormField label="Slip No.">
                  <input
                    value={formState.slipNo}
                    disabled={!isEditable}
                    onChange={(event) =>
                      setFormState((prev) => ({ ...prev, slipNo: event.target.value }))
                    }
                    placeholder="Enter slip or reference"
                  />
                </FormField>
                <FormField label="Slip Date" required>
                  <input
                    type="date"
                    value={formState.slipDate}
                    disabled={!isEditable}
                    onChange={(event) =>
                      setFormState((prev) => ({ ...prev, slipDate: event.target.value }))
                    }
                  />
                </FormField>
                <FormField label="Amount" required>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={formState.amount}
                    disabled={!isEditable}
                    onChange={(event) =>
                      setFormState((prev) => ({ ...prev, amount: event.target.value }))
                    }
                  />
                </FormField>
              </div>
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-3">
            <button type="submit" className="primary" disabled={isSaving || !isEditable}>
              {isSaving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </SectionCard>
    </div>
  );
};

export default EditBankTransactionPage;
