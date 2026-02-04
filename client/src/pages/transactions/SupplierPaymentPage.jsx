import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import SectionCard from "../../components/SectionCard.jsx";
import FormField from "../../components/FormField.jsx";
import SearchSelect from "../../components/SearchSelect.jsx";
import { api } from "../../api/client.js";
import { toDisplay } from "../../utils/date.js";

const SupplierPaymentPage = () => {
  const [supplierQuery, setSupplierQuery] = useState("");
  const [bankQuery, setBankQuery] = useState("");
  const [formError, setFormError] = useState(null);
  const [status, setStatus] = useState(null);
  const [meta, setMeta] = useState({ nextPayment: "SP000001" });
  const createInitialForm = () => ({
    supplierCode: "",
    supplierLabel: "",
    paymentDate: toDisplay(new Date()),
    paymentMode: "cash",
    bankCode: "",
    bankLabel: "",
    slipNo: "",
    slipDate: "",
    amount: "",
    details: "",
    attachmentImage: null,
    attachmentPreview: null
  });
  const [formState, setFormState] = useState(createInitialForm);
  const queryClient = useQueryClient();

  useEffect(() => {
    api
      .get("/metadata/next/supplier-payment")
      .then((response) => setMeta(response.data))
      .catch(() => setMeta((prev) => prev));
  }, []);

  const supplierLookup = useQuery({
    queryKey: ["supplier-payables", { search: supplierQuery }],
    queryFn: async () => {
      const response = await api.get("/suppliers/payables", { params: { search: supplierQuery } });
      return response.data;
    }
  });

  const payableQuery = useQuery({
    queryKey: ["supplier-payable", formState.supplierCode],
    enabled: Boolean(formState.supplierCode),
    queryFn: async () => {
      const response = await api.get(`/suppliers/${encodeURIComponent(formState.supplierCode)}/payable`);
      return response.data;
    }
  });

  const isOnline = formState.paymentMode === "online";
  const isBankTransaction = formState.paymentMode === "bank";

  const bankSearchTerm = bankQuery.trim();

  const bankLookup = useQuery({
    queryKey: ["banks", { search: bankSearchTerm }],
    enabled: isOnline || isBankTransaction,
    queryFn: async () => {
      const response = await api.get("/banks", { params: { search: bankSearchTerm } });
      return response.data;
    }
  });

  const payableAmount = useMemo(() => {
    return formState.supplierCode ? Number(payableQuery.data?.payable ?? 0) : 0;
  }, [formState.supplierCode, payableQuery.data?.payable]);

  const receivableAmount = useMemo(() => {
    return formState.supplierCode ? Number(payableQuery.data?.receivable ?? 0) : 0;
  }, [formState.supplierCode, payableQuery.data?.receivable]);

  const netBalance = useMemo(() => {
    return formState.supplierCode ? Number(payableQuery.data?.net ?? 0) : 0;
  }, [formState.supplierCode, payableQuery.data?.net]);

  // Ensure bank payments pick up a default slip date so validation passes without manual entry.
  useEffect(() => {
    if (formState.paymentMode !== "bank" || formState.slipDate) {
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    setFormState((prev) => {
      if (prev.paymentMode !== "bank" || prev.slipDate) {
        return prev;
      }
      return { ...prev, slipDate: today };
    });
  }, [formState.paymentMode, formState.slipDate]);

  useEffect(() => {
    if (!formState.supplierCode) return;
    const suggested = payableAmount > 0 ? payableAmount.toFixed(2) : "";
    setFormState((prev) => {
      if (!prev.supplierCode) return prev;
      if (Number(prev.amount || 0) > 0 && Math.abs(Number(prev.amount) - payableAmount) > 0.01) {
        return prev;
      }
      return prev.amount === suggested ? prev : { ...prev, amount: suggested };
    });
  }, [formState.supplierCode, payableAmount]);

  const mutation = useMutation({
    mutationFn: async (payload) => {
      const response = await api.post("/supplier-payments", payload);
      return response.data;
    },
    onMutate: () => {
      setStatus(null);
    },
    onSuccess: (data, variables) => {
      setStatus({ type: "success", message: "Payment recorded successfully." });
      setFormState(createInitialForm());
      setSupplierQuery("");
      setBankQuery("");
      setFormError(null);
      queryClient.invalidateQueries({ queryKey: ["supplier-payables"] });
      if (variables?.supplierCode) {
        queryClient.invalidateQueries({ queryKey: ["supplier-payable", variables.supplierCode] });
      }
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      queryClient.invalidateQueries({ queryKey: ["bank-deposit-report"] });
      queryClient.invalidateQueries({ queryKey: ["transaction-history"] });
      api
        .get("/metadata/next/supplier-payment")
        .then((response) => setMeta(response.data))
        .catch(() => null);
    },
    onError: (error) => {
      const message = error?.response?.data?.message || error?.message || "Failed to record payment.";
      setStatus({ type: "error", message });
    }
  });

  const breakdown = useMemo(() => payableQuery.data?.breakdown ?? null, [payableQuery.data]);

  return (
    <SectionCard
      title="Supplier Payment"
      description="Record payments made against supplier payables."
      actions={
        <div className="flex items-center gap-3">
          {formError ? (
            <span className="text-xs text-rose-400">{formError}</span>
          ) : status ? (
            <span className={`text-xs ${status.type === "error" ? "text-rose-400" : "text-emerald-400"}`}>
              {status.message}
            </span>
          ) : null}
          <Link to="/history/transactions?type=supplier-payment" className="secondary text-xs px-3 py-1">
            View supplier payments
          </Link>
        </div>
      }
    >
      <form
        className="grid gap-4 md:grid-cols-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!formState.supplierCode) {
            setFormError("Select a supplier with outstanding payable.");
            return;
          }
          if (!formState.paymentDate.trim()) {
            setFormError("Enter a payment date.");
            return;
          }
          if (payableAmount <= 0) {
            if (receivableAmount > 0) {
              setFormError("Selected supplier currently has a receivable balance. No payment is due.");
            } else {
              setFormError("Selected supplier has no outstanding payable.");
            }
            return;
          }
          const enteredAmount = Number(formState.amount || 0);
          if (!Number.isFinite(enteredAmount) || enteredAmount <= 0) {
            setFormError("Enter a valid payment amount.");
            return;
          }
          if (enteredAmount - payableAmount > 0.01) {
            setFormError("Payment amount cannot exceed outstanding payable.");
            return;
          }
          const trimmedSlipNo = (formState.slipNo || "").trim();
          if (formState.paymentMode !== "cash" && !formState.bankCode) {
            setFormError("Select a bank for this payment mode.");
            return;
          }
          if (formState.paymentMode === "online" && !trimmedSlipNo) {
            setFormError("Enter the transaction reference for online payments.");
            return;
          }
          if (formState.paymentMode === "bank" && !formState.slipDate) {
            setFormError("Select the slip date for bank payments.");
            return;
          }

          setFormError(null);

          mutation.mutate({
            supplierCode: formState.supplierCode,
            paymentDate: formState.paymentDate,
            amount: enteredAmount,
            details: formState.details?.trim() || null,
            paymentMode: formState.paymentMode,
            bankCode: formState.paymentMode === "cash" ? null : formState.bankCode || null,
            slipNo: formState.paymentMode === "cash" ? null : trimmedSlipNo || null,
            slipDate: formState.paymentMode === "bank" ? formState.slipDate : null,
            attachmentImage: formState.attachmentImage || null
          });
        }}
      >
        <FormField label="Payment No." className="md:col-span-1">
          <input value={meta.nextPayment} disabled />
        </FormField>
        <FormField label="Payment Date" required className="md:col-span-1">
          <input
            value={formState.paymentDate}
            onChange={(event) => {
              const value = event.target.value;
              setStatus(null);
              setFormState((prev) => ({ ...prev, paymentDate: value }));
            }}
          />
        </FormField>
        <FormField label="Payment Mode" required className="md:col-span-1">
          <select
            value={formState.paymentMode}
            onChange={(event) => {
              const nextMode = event.target.value;
              const defaultSlipDate = new Date().toISOString().slice(0, 10);
              setStatus(null);
              setFormError(null);
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
        <SearchSelect
          className="md:col-span-1"
          label="Supplier"
          placeholder="Search payable suppliers"
          value={
            formState.supplierCode
              ? { label: formState.supplierLabel || formState.supplierCode }
              : null
          }
          onSelect={(option) => {
            const payableValue = Number(option.payable ?? 0);
            setFormState((prev) => ({
              ...prev,
              supplierCode: option.code,
              supplierLabel: option.label,
              amount: payableValue > 0 ? payableValue.toFixed(2) : "",
              details: ""
            }));
            setStatus(null);
            setFormError(null);
          }}
          onSearch={setSupplierQuery}
          results={
            supplierLookup.data?.map((supplier) => ({
              value: supplier.id,
              code: supplier.code,
              label: `${supplier.code} — ${supplier.name}`,
              payable: supplier.payable,
              receivable: supplier.receivable,
              net: supplier.net
            })) ?? []
          }
          renderItem={(option) => (
            <div className="flex justify-between items-center w-full">
              <span>{option.label}</span>
              <span className="text-xs text-right text-slate-500">
                {Number(option.payable ?? 0) > 0 ? `Payable Rs ${Number(option.payable ?? 0).toFixed(2)}` : null}
                {Number(option.receivable ?? 0) > 0
                  ? `${Number(option.payable ?? 0) > 0 ? " · " : ""}Receivable Rs ${Number(option.receivable ?? 0).toFixed(2)}`
                  : null}
              </span>
            </div>
          )}
        />
        {(isOnline || isBankTransaction) ? (
          <SearchSelect
            className="md:col-span-1"
            label="Bank Name"
            placeholder="Type at least two characters"
            value={
              formState.bankCode
                ? { label: formState.bankLabel || formState.bankCode }
                : null
            }
            onSelect={(option) => {
              if (!option) {
                setStatus(null);
                setFormError(null);
                setFormState((prev) => ({
                  ...prev,
                  bankCode: "",
                  bankLabel: "",
                  slipNo: prev.paymentMode === "cash" ? "" : prev.slipNo
                }));
                return;
              }
              setFormState((prev) => ({
                ...prev,
                bankCode: option.code,
                bankLabel: `${option.code} — ${option.name}`
              }));
              setStatus(null);
              setFormError(null);
            }}
            onSearch={setBankQuery}
            results={
              bankLookup.data?.map((bank) => ({
                value: bank.id,
                code: bank.code,
                name: bank.name,
                label: `${bank.code} — ${bank.name}`
              })) ?? []
            }
            emptyMessage="No banks found."
          />
        ) : null}
        {(isOnline || isBankTransaction) ? (
          <FormField label="Bank Code" className="md:col-span-1">
            <input value={formState.bankCode} disabled placeholder="Select a bank" />
          </FormField>
        ) : null}
        {isOnline ? (
          <FormField label="Transaction ID" required className="md:col-span-1">
            <input
              value={formState.slipNo}
              onChange={(event) => {
                const value = event.target.value;
                setStatus(null);
                setFormError(null);
                setFormState((prev) => ({ ...prev, slipNo: value }));
              }}
              placeholder="Enter transaction reference"
            />
          </FormField>
        ) : null}
        {isBankTransaction ? (
          <>
            <FormField label="Slip No." className="md:col-span-1">
              <input
                value={formState.slipNo}
                onChange={(event) => {
                  const value = event.target.value;
                  setStatus(null);
                  setFormError(null);
                  setFormState((prev) => ({ ...prev, slipNo: value }));
                }}
                placeholder="Enter slip number"
              />
            </FormField>
            <FormField label="Slip Date" required className="md:col-span-1">
              <input
                type="date"
                value={formState.slipDate}
                onChange={(event) => {
                  const value = event.target.value;
                  setStatus(null);
                  setFormError(null);
                  setFormState((prev) => ({ ...prev, slipDate: value }));
                }}
              />
            </FormField>
          </>
        ) : null}
        {(isOnline || isBankTransaction) ? (
          <FormField label="Attach Image (optional)" className="md:col-span-3">
            <div className="space-y-2">
              <input
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                      setFormState((prev) => ({
                        ...prev,
                        attachmentImage: reader.result,
                        attachmentPreview: reader.result
                      }));
                    };
                    reader.readAsDataURL(file);
                  }
                }}
                className="block w-full text-sm text-slate-500
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-full file:border-0
                  file:text-sm file:font-semibold
                  file:bg-indigo-50 file:text-indigo-700
                  hover:file:bg-indigo-100"
              />
              {formState.attachmentPreview && (
                <div className="relative inline-block">
                  <img
                    src={formState.attachmentPreview}
                    alt="Attachment preview"
                    className="h-24 w-auto rounded-lg border border-slate-200 cursor-pointer hover:opacity-80"
                    onClick={() => {
                      const modal = document.createElement('div');
                      modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4';
                      modal.onclick = () => modal.remove();
                      const img = document.createElement('img');
                      img.src = formState.attachmentPreview;
                      img.className = 'max-w-full max-h-full rounded-lg';
                      modal.appendChild(img);
                      document.body.appendChild(modal);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setFormState(prev => ({ ...prev, attachmentImage: null, attachmentPreview: null }))}
                    className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full w-6 h-6 flex items-center justify-center hover:bg-rose-600"
                  >
                    ×
                  </button>
                </div>
              )}
            </div>
          </FormField>
        ) : null}
        <FormField label="Outstanding Payable" className="md:col-span-1">
          <input
            value={payableAmount.toFixed(2)}
            disabled
            placeholder={payableQuery.isFetching ? "Loading..." : "0.00"}
          />
        </FormField>
        {receivableAmount > 0 ? (
          <FormField label="Supplier Receivable" className="md:col-span-1">
            <input value={receivableAmount.toFixed(2)} disabled />
          </FormField>
        ) : null}
        <FormField label="Payment Amount" required className="md:col-span-1">
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={formState.amount}
            onChange={(event) => {
              const value = event.target.value;
              setStatus(null);
              setFormError(null);
              setFormState((prev) => ({ ...prev, amount: value }));
            }}
          />
        </FormField>
        <FormField label="Notes" className="md:col-span-3">
          <textarea
            rows={3}
            value={formState.details}
            onChange={(event) => {
              const value = event.target.value;
              setStatus(null);
              setFormState((prev) => ({ ...prev, details: value }));
            }}
            placeholder="Optional remarks"
          />
        </FormField>
        {formState.supplierCode && breakdown ? (
          <div className="md:col-span-3 border border-slate-200 bg-slate-50 rounded-2xl px-4 py-3 text-xs text-slate-600">
            <p className="font-semibold text-slate-700 mb-2">Payable breakdown</p>
            <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4">
              <div>
                <p className="uppercase tracking-wide text-slate-500">Opening Balances</p>
                <p className="text-slate-800">Rs {Number(breakdown.opening).toFixed(2)}</p>
              </div>
              <div>
                <p className="uppercase tracking-wide text-slate-500">Purchases</p>
                <p className="text-slate-800">Rs {Number(breakdown.purchaseTotal).toFixed(2)}</p>
              </div>
              <div>
                <p className="uppercase tracking-wide text-slate-500">Paid With Purchases</p>
                <p className="text-slate-800">Rs {Number(breakdown.purchasePaid).toFixed(2)}</p>
              </div>
              <div>
                <p className="uppercase tracking-wide text-slate-500">Returns</p>
                <p className="text-slate-800">Rs {Number(breakdown.returnsTotal).toFixed(2)}</p>
              </div>
              <div>
                <p className="uppercase tracking-wide text-slate-500">Previous Payments</p>
                <p className="text-slate-800">Rs {Number(breakdown.paymentsTotal).toFixed(2)}</p>
              </div>
              <div>
                <p className="uppercase tracking-wide text-slate-500">Supplier Receivable</p>
                <p className="text-slate-800">Rs {receivableAmount.toFixed(2)}</p>
              </div>
              <div>
                <p className="uppercase tracking-wide text-slate-500">Net Balance</p>
                <p className={netBalance < 0 ? "text-emerald-600" : "text-slate-800"}>
                  Rs {netBalance.toFixed(2)}
                </p>
              </div>
            </div>
          </div>
        ) : null}
        <div className="flex items-end justify-end gap-3 md:col-span-3">
          <button type="submit" className="primary">
            {mutation.isPending ? "Saving..." : "Record Payment"}
          </button>
        </div>
      </form>
    </SectionCard>
  );
};

export default SupplierPaymentPage;
