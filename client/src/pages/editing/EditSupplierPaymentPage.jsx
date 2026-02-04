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

const createInitialForm = () => ({
  paymentDate: "",
  amount: "",
  details: "",
  paymentMode: "cash",
  bankCode: "",
  bankLabel: "",
  slipNo: "",
  slipDate: ""
});

const EditSupplierPaymentPage = () => {
  const queryClient = useQueryClient();
  const [paymentSearch, setPaymentSearch] = useState("");
  const [paymentNo, setPaymentNo] = useState("");
  const [paymentLocked, setPaymentLocked] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [paymentDetail, setPaymentDetail] = useState(null);
  const [formState, setFormState] = useState(createInitialForm);
  const [status, setStatus] = useState(null);
  const [isLoadingPayment, setIsLoadingPayment] = useState(false);
  const [bankQuery, setBankQuery] = useState("");
  const [payableSnapshot, setPayableSnapshot] = useState(null);

  const paymentLookup = useQuery({
    queryKey: ["supplier-payments", { search: paymentSearch }],
    queryFn: async () => {
      const response = await api.get("/supplier-payments", { params: { search: paymentSearch } });
      return response.data;
    }
  });

  useEffect(() => {
    if (paymentLookup.error) {
      setStatus({ type: "error", message: paymentLookup.error.message });
    }
  }, [paymentLookup.error]);

  const paymentOptions = useMemo(
    () =>
      paymentLookup.data?.map((payment) => {
        const labelParts = [];
        labelParts.push(payment.payment_no || `Payment ${payment.id}`);
        labelParts.push(payment.payment_date || "—");
        labelParts.push(`Rs ${Number(payment.amount ?? 0).toFixed(2)}`);
        return {
          value: payment.payment_no || String(payment.id),
          paymentNo: payment.payment_no || "",
          label: labelParts.join(" • "),
          meta: payment
        };
      }) ?? [],
    [paymentLookup.data]
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

  const isOnline = formState.paymentMode === "online";
  const isBankTransaction = formState.paymentMode === "bank";

  useEffect(() => {
    if (!isBankTransaction || formState.slipDate) {
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    setFormState((prev) => {
      if (prev.paymentMode !== "bank" || prev.slipDate) {
        return prev;
      }
      return { ...prev, slipDate: today };
    });
  }, [formState.paymentMode, formState.slipDate, isBankTransaction]);

  const resetForm = () => {
    setPaymentLocked(false);
    setPaymentDetail(null);
    setSelectedPayment(null);
    setFormState(createInitialForm);
    setPaymentNo("");
    setPaymentSearch("");
    setStatus(null);
    setBankQuery("");
    setPayableSnapshot(null);
  };

  const populateForm = (detail) => {
    setFormState({
      paymentDate: detail.paymentDateRaw || detail.paymentDate || "",
      amount: detail.amount != null ? Number(detail.amount).toFixed(2) : "",
      details: detail.details || "",
      paymentMode: detail.paymentMode || "cash",
      bankCode: detail.bank?.code || "",
      bankLabel: detail.bank?.code ? `${detail.bank.code} — ${detail.bank.name || detail.bank.code}` : "",
      slipNo: detail.slipNo || "",
      slipDate: detail.slipDate || ""
    });
  };

  const loadPayment = async (value) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setStatus({ type: "error", message: "Enter the payment number to load." });
      return;
    }
    setIsLoadingPayment(true);
    setStatus({ type: "info", message: "Loading supplier payment…" });
    try {
      const response = await api.get(`/supplier-payments/${encodeURIComponent(trimmed)}`);
      const detail = response.data?.payment;
      setPaymentDetail(detail);
      setPayableSnapshot(response.data?.payable || null);
      setPaymentNo(detail?.paymentNo || trimmed);
      setPaymentLocked(true);
      setSelectedPayment({
        value: detail?.paymentNo || trimmed,
        paymentNo: detail?.paymentNo || trimmed,
        label: detail?.paymentNo || trimmed
      });
      setBankQuery("");
      populateForm(detail);
      setStatus({ type: "success", message: "Supplier payment loaded. You can now edit and save changes." });
    } catch (error) {
      const message = error?.response?.data?.message || error?.message || "Failed to load supplier payment.";
      resetForm();
      setStatus({ type: "error", message });
    } finally {
      setIsLoadingPayment(false);
    }
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!paymentLocked || !paymentDetail) {
        throw new Error("Load a supplier payment before saving changes.");
      }
      if (!formState.paymentDate) {
        throw new Error("Select the payment date before saving changes.");
      }
      const amountNumber = Number(formState.amount);
      if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
        throw new Error("Enter a valid amount before saving changes.");
      }
      if (formState.paymentMode !== "cash" && !formState.bankCode) {
        throw new Error("Select a bank for this payment mode.");
      }
      if (formState.paymentMode === "online" && !formState.slipNo.trim()) {
        throw new Error("Enter the transaction reference for online payments.");
      }
      if (formState.paymentMode === "bank" && !formState.slipDate) {
        throw new Error("Select the slip date for bank payments.");
      }

      const payload = {
        paymentDate: formState.paymentDate,
        amount: amountNumber,
        details: formState.details,
        paymentMode: formState.paymentMode,
        bankCode: formState.paymentMode === "cash" ? null : formState.bankCode,
        slipNo: formState.paymentMode === "cash" ? null : formState.slipNo,
        slipDate: formState.paymentMode === "bank" ? formState.slipDate : null
      };

      const response = await api.put(
        `/supplier-payments/${encodeURIComponent(paymentDetail.paymentNo || paymentNo)}`,
        payload
      );
      return response.data;
    },
    onMutate: () => setStatus(null),
    onSuccess: (data) => {
      const detail = data.payment;
      setPaymentDetail(detail);
      setPayableSnapshot(data.payableAfter || null);
      populateForm(detail);
      setStatus({ type: "success", message: "Supplier payment updated successfully." });
      setSelectedPayment((prev) => {
        if (!detail?.paymentNo) return prev;
        return {
          value: detail.paymentNo,
          paymentNo: detail.paymentNo,
          label: detail.paymentNo
        };
      });
      queryClient.invalidateQueries({ queryKey: ["supplier-payments"] });
      queryClient.invalidateQueries({ queryKey: ["transaction-history"] });
      queryClient.invalidateQueries({ queryKey: ["bank-deposit-report"] });
      queryClient.invalidateQueries({ queryKey: ["supplier-payable"] });
    },
    onError: (error) => {
      const message = error?.response?.data?.message || error?.message || "Failed to update supplier payment.";
      setStatus({ type: "error", message });
    }
  });

  const isSaving = updateMutation.isPending;

  const outstandingPreview = useMemo(() => {
    if (!payableSnapshot || !paymentDetail) return null;
    const currentOutstanding = Number(payableSnapshot.payable ?? 0);
    const originalAmount = Number(paymentDetail.amount ?? 0);
    const enteredAmount = Number(formState.amount);
    const usableAmount = Number.isFinite(enteredAmount) && enteredAmount > 0 ? enteredAmount : originalAmount;
    const projected = currentOutstanding + originalAmount - usableAmount;
    return projected > 0 ? projected : 0;
  }, [payableSnapshot, paymentDetail, formState.amount]);

  return (
    <div className="space-y-6">
      <SectionCard
        title="Edit Supplier Payment"
        description="Revise saved supplier payments. Linked bank drawings stay aligned automatically."
      >
        <form
          className="grid gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (!paymentLocked) {
              setStatus({ type: "error", message: "Load a supplier payment before saving changes." });
              return;
            }
            updateMutation.mutate();
          }}
        >
          <div className="grid gap-4 md:grid-cols-[minmax(0,2fr),minmax(0,1fr)] items-end">
            <SearchSelect
              label="Search Supplier Payments"
              placeholder="Search by payment, supplier, or slip"
              value={selectedPayment}
              onSelect={(option) => {
                setSelectedPayment(option);
                setPaymentNo(option.paymentNo || option.value || "");
                setPaymentLocked(false);
                setPaymentDetail(null);
                setFormState(createInitialForm);
                setStatus(null);
                setPayableSnapshot(null);
              }}
              onSearch={setPaymentSearch}
              results={paymentOptions}
              emptyMessage={
                paymentSearch.trim()
                  ? "No supplier payments match your search."
                  : "Enter a payment number, supplier, or slip to search."
              }
            />
            <FormField label="Payment No.">
              <input
                value={paymentNo}
                readOnly={paymentLocked}
                placeholder="Enter payment number"
                onChange={(event) => {
                  setPaymentNo(event.target.value);
                  setPaymentLocked(false);
                  setPaymentDetail(null);
                  setFormState(createInitialForm);
                  setStatus(null);
                  setSelectedPayment(null);
                  setPayableSnapshot(null);
                  setBankQuery("");
                }}
              />
            </FormField>
          </div>
          <div className="flex gap-3">
            <button type="button" className="secondary text-sm" onClick={() => loadPayment(paymentNo)} disabled={isLoadingPayment}>
              {isLoadingPayment ? "Loading…" : "Load Payment"}
            </button>
            <button type="button" className="secondary text-sm" onClick={resetForm}>
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

          {paymentDetail ? (
            <div className="grid gap-4">
              <div className="border border-slate-200 bg-slate-50 rounded-2xl px-4 py-3 text-xs text-slate-600">
                <p className="font-semibold text-slate-700 mb-2">Payment snapshot</p>
                <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4">
                  <div>
                    <p className="uppercase tracking-wide text-slate-500">Payment</p>
                    <p className="text-slate-800">{paymentDetail.paymentNo || "—"}</p>
                  </div>
                  <div>
                    <p className="uppercase tracking-wide text-slate-500">Supplier</p>
                    <p className="text-slate-800">
                      {paymentDetail.supplier?.code ? `${paymentDetail.supplier.code} — ${paymentDetail.supplier.name}` : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="uppercase tracking-wide text-slate-500">Amount</p>
                    <p className="text-slate-800">{formatCurrency(paymentDetail.amount)}</p>
                  </div>
                  <div>
                    <p className="uppercase tracking-wide text-slate-500">Mode</p>
                    <p className="text-slate-800">{(paymentDetail.paymentMode || "cash").toUpperCase()}</p>
                  </div>
                  <div>
                    <p className="uppercase tracking-wide text-slate-500">Bank Info</p>
                    <p className="text-slate-800">
                      {paymentDetail.bank?.code ? `${paymentDetail.bank.code} — ${paymentDetail.bank.name}` : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="uppercase tracking-wide text-slate-500">Slip / Ref</p>
                    <p className="text-slate-800">{paymentDetail.slipNo || "—"}</p>
                  </div>
                  <div>
                    <p className="uppercase tracking-wide text-slate-500">Slip Date</p>
                    <p className="text-slate-800">{paymentDetail.slipDateDisplay || paymentDetail.slipDate || "—"}</p>
                  </div>
                  <div>
                    <p className="uppercase tracking-wide text-slate-500">Outstanding (current)</p>
                    <p className="text-slate-800">
                      {payableSnapshot ? formatCurrency(payableSnapshot.payable) : "—"}
                    </p>
                  </div>
                  {typeof outstandingPreview === "number" ? (
                    <div>
                      <p className="uppercase tracking-wide text-slate-500">Outstanding (after save)</p>
                      <p className="text-slate-800">{formatCurrency(outstandingPreview)}</p>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <FormField label="Payment Date" required>
                  <input
                    type="date"
                    value={formState.paymentDate}
                    onChange={(event) =>
                      setFormState((prev) => ({ ...prev, paymentDate: event.target.value }))
                    }
                  />
                </FormField>
                <FormField label="Payment Mode" required>
                  <select
                    value={formState.paymentMode}
                    onChange={(event) => {
                      const nextMode = event.target.value;
                      const defaultSlipDate = new Date().toISOString().slice(0, 10);
                      setStatus(null);
                      setFormState((prev) => {
                        const next = { ...prev, paymentMode: nextMode };
                        if (nextMode === "cash") {
                          next.bankCode = "";
                          next.bankLabel = "";
                          next.slipNo = "";
                          next.slipDate = "";
                        } else if (nextMode === "online") {
                          next.slipDate = "";
                        } else if (nextMode === "bank") {
                          next.slipDate = prev.slipDate || defaultSlipDate;
                        }
                        return next;
                      });
                      if (nextMode === "cash") {
                        setBankQuery("");
                      }
                    }}
                  >
                    <option value="cash">Cash</option>
                    <option value="online">Online</option>
                    <option value="bank">Bank Transaction</option>
                  </select>
                </FormField>
                {(isOnline || isBankTransaction) ? (
                  <SearchSelect
                    label="Bank"
                    placeholder="Type at least two characters"
                    value={
                      formState.bankCode ? { label: formState.bankLabel || formState.bankCode } : null
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
                  />
                ) : null}
                {(isOnline || isBankTransaction) ? (
                  <FormField label={isOnline ? "Transaction Reference" : "Slip No."}>
                    <input
                      value={formState.slipNo}
                      onChange={(event) =>
                        setFormState((prev) => ({ ...prev, slipNo: event.target.value }))
                      }
                      placeholder={isOnline ? "Enter transaction reference" : "Enter slip number"}
                    />
                  </FormField>
                ) : null}
                {isBankTransaction ? (
                  <FormField label="Slip Date" required>
                    <input
                      type="date"
                      value={formState.slipDate}
                      onChange={(event) =>
                        setFormState((prev) => ({ ...prev, slipDate: event.target.value }))
                      }
                    />
                  </FormField>
                ) : null}
                <FormField label="Payment Amount" required>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={formState.amount}
                    onChange={(event) =>
                      setFormState((prev) => ({ ...prev, amount: event.target.value }))
                    }
                  />
                </FormField>
                <FormField label="Details" className="md:col-span-3">
                  <textarea
                    rows={3}
                    value={formState.details}
                    onChange={(event) =>
                      setFormState((prev) => ({ ...prev, details: event.target.value }))
                    }
                    placeholder="Optional remarks"
                  />
                </FormField>
              </div>
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-3">
            <button type="submit" className="primary" disabled={isSaving || !paymentDetail}>
              {isSaving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </SectionCard>
    </div>
  );
};

export default EditSupplierPaymentPage;
