import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import SectionCard from "../../components/SectionCard.jsx";
import FormField from "../../components/FormField.jsx";
import SearchSelect from "../../components/SearchSelect.jsx";
import { api } from "../../api/client.js";
import { toDisplay } from "../../utils/date.js";

const CustomerReceiptPage = () => {
  const [customerQuery, setCustomerQuery] = useState("");
  const [salesmanQuery, setSalesmanQuery] = useState("");
  const [bankQuery, setBankQuery] = useState("");
  const [meta, setMeta] = useState({ nextReceipt: "R000001" });
  const createInitialForm = () => ({
    customerCode: "",
    customerLabel: "",
    salesmanCode: "",
    salesmanLabel: "",
    receiptDate: toDisplay(new Date()),
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
  const [formError, setFormError] = useState(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    api.get("/metadata/next/customer-receipt").then((response) => setMeta(response.data));
  }, []);

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

  const balanceQuery = useQuery({
    queryKey: ["customer-balance", formState.customerCode],
    enabled: Boolean(formState.customerCode),
    queryFn: async () => {
      const response = await api.get(`/customers/${encodeURIComponent(formState.customerCode)}/balance`);
      return response.data;
    }
  });

  const isOnline = formState.paymentMode === "online";
  const isBankTransaction = formState.paymentMode === "bank";

  const bankLookup = useQuery({
    queryKey: ["banks", { search: bankQuery }],
    enabled: isOnline || isBankTransaction,
    queryFn: async () => {
      const response = await api.get("/banks", { params: { search: bankQuery } });
      return response.data;
    }
  });

  const previousBalance = useMemo(() => {
    return formState.customerCode ? Number(balanceQuery.data?.balance ?? 0) : 0;
  }, [balanceQuery.data?.balance, formState.customerCode]);

  const remainingBalance = useMemo(() => {
    const entered = Number(formState.amount) || 0;
    const remaining = previousBalance - entered;
    return remaining > 0 ? remaining : 0;
  }, [formState.amount, previousBalance]);

  const mutation = useMutation({
    mutationFn: async (payload) => {
      const response = await api.post("/customer-receipts", payload);
      return response.data;
    },
    onSuccess: (data, variables) => {
      if (data?.receipt_no) setMeta({ nextReceipt: data.receipt_no });
      if (variables?.customerCode) {
        queryClient.invalidateQueries({ queryKey: ["customer-balance", variables.customerCode] });
      }
      setFormState(createInitialForm());
      setBankQuery("");
      setSalesmanQuery("");
      setFormError(null);
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["bank-deposit-report"] });
    }
  });

  return (
    <SectionCard
      title="Customer Receipt"
      description="Log received payments against customers."
      actions={
        <div className="flex items-center gap-3">
          {formError ? (
            <span className="text-xs text-rose-400">{formError}</span>
          ) : mutation.isSuccess ? (
            <span className="text-xs text-emerald-400">Receipt saved</span>
          ) : mutation.isError ? (
            <span className="text-xs text-rose-400">{mutation.error.message}</span>
          ) : null}
          <Link to="/history/transactions?type=customer-receipt" className="secondary text-xs px-3 py-1">
            View saved receipts
          </Link>
        </div>
      }
    >
      <form
        className="grid gap-4 md:grid-cols-3"
        onSubmit={(event) => {
          event.preventDefault();
          const amountValue = Number(formState.amount) || 0;
          const trimmedSlipNo = (formState.slipNo || "").trim();
          if (!formState.customerCode) {
            setFormError("Select a customer before saving.");
            return;
          }
          if (!formState.salesmanCode) {
            setFormError("Select a salesman before saving.");
            return;
          }
          if (!amountValue || amountValue <= 0) {
            setFormError("Enter a valid receipt amount.");
            return;
          }
          if (isOnline) {
            if (!formState.bankCode) {
              setFormError("Select a bank for online receipts.");
              return;
            }
            if (!trimmedSlipNo) {
              setFormError("Enter the transaction ID for online receipts.");
              return;
            }
          }
          if (isBankTransaction) {
            if (!formState.bankCode) {
              setFormError("Select a bank for bank transactions.");
              return;
            }
            if (!formState.slipDate) {
              setFormError("Choose a slip date for bank transactions.");
              return;
            }
          }

          setFormError(null);

          mutation.mutate({
            customerCode: formState.customerCode,
            salesmanCode: formState.salesmanCode,
            receiptDate: formState.receiptDate,
            amount: amountValue,
            details: formState.details,
            paymentMode: formState.paymentMode,
            bankCode: isOnline || isBankTransaction ? formState.bankCode : null,
            slipNo: isOnline || isBankTransaction ? trimmedSlipNo || null : null,
            slipDate: isBankTransaction ? formState.slipDate : null,
            attachmentImage: formState.attachmentImage || null
          });
        }}
      >
        <FormField label="Receipt No." className="md:col-span-1">
          <input value={meta.nextReceipt} disabled />
        </FormField>
        <FormField label="Receipt Date" required className="md:col-span-1">
          <input
            value={formState.receiptDate}
            onChange={(event) => setFormState((prev) => ({ ...prev, receiptDate: event.target.value }))}
          />
        </FormField>
        <SearchSelect
          className="md:col-span-1"
          label="Customer"
          placeholder="Search customer"
          value={
            formState.customerCode
              ? { label: formState.customerLabel || formState.customerCode }
              : null
          }
          onSelect={(option) =>
            setFormState((prev) => ({
              ...prev,
              customerCode: option.code,
              customerLabel: `${option.code} — ${option.name}`
            }))
          }
          onSearch={setCustomerQuery}
          results={
            customerLookup.data?.map((customer) => ({
              value: customer.id,
              code: customer.code,
              name: customer.name,
              label: `${customer.code} — ${customer.name}`
            })) ?? []
          }
        />
        <SearchSelect
          className="md:col-span-1"
          label="Salesman"
          placeholder="Search salesman"
          required
          value={
            formState.salesmanCode
              ? { label: formState.salesmanLabel || formState.salesmanCode }
              : null
          }
          onSelect={(option) =>
            setFormState((prev) => ({
              ...prev,
              salesmanCode: option.code,
              salesmanLabel: `${option.code} — ${option.name}`
            }))
          }
          onSearch={setSalesmanQuery}
          results={
            salesmanLookup.data?.map((salesman) => ({
              value: salesman.id,
              code: salesman.code,
              name: salesman.name,
              label: `${salesman.code} — ${salesman.name}`
            })) ?? []
          }
        />
        <FormField label="Previous Balance" className="md:col-span-1">
          <input
            value={previousBalance.toFixed(2)}
            disabled
            placeholder={balanceQuery.isFetching ? "Loading..." : "0.00"}
          />
        </FormField>
        <FormField
          label="Payment Mode"
          required
          htmlFor="customer-receipt-mode"
          className="md:col-span-1"
        >
          <select
            id="customer-receipt-mode"
            value={formState.paymentMode}
            onChange={(event) => {
              const nextMode = event.target.value;
              const defaultSlipDate = new Date().toISOString().slice(0, 10);
              setFormState((prev) => {
                const next = {
                  ...prev,
                  paymentMode: nextMode
                };
                if (nextMode === "cash") {
                  next.bankCode = "";
                  next.bankLabel = "";
                  next.slipNo = "";
                  next.slipDate = "";
                } else if (nextMode === "online") {
                  next.slipNo = "";
                  next.slipDate = "";
                } else if (nextMode === "bank") {
                  next.slipNo = "";
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
            className="md:col-span-1"
            label="Bank Name"
            placeholder="Search bank"
            value={
              formState.bankCode
                ? { label: formState.bankLabel || formState.bankCode }
                : null
            }
            onSelect={(option) =>
              setFormState((prev) => ({
                ...prev,
                bankCode: option.code,
                bankLabel: `${option.code} — ${option.name}`
              }))
            }
            onSearch={setBankQuery}
            results={
              bankLookup.data?.map((bank) => ({
                value: bank.id,
                code: bank.code,
                name: bank.name,
                label: `${bank.code} — ${bank.name}`
              })) ?? []
            }
          />
        ) : null}
        {isOnline ? (
          <FormField label="Transaction ID" required className="md:col-span-1">
            <input
              value={formState.slipNo}
              onChange={(event) => setFormState((prev) => ({ ...prev, slipNo: event.target.value }))}
              placeholder="Enter transaction reference"
            />
          </FormField>
        ) : null}
        {isBankTransaction ? (
          <>
            <FormField label="Bank Code" className="md:col-span-1">
              <input value={formState.bankCode} disabled placeholder="Select a bank" />
            </FormField>
            <FormField label="Slip No." className="md:col-span-1">
              <input
                value={formState.slipNo}
                onChange={(event) => setFormState((prev) => ({ ...prev, slipNo: event.target.value }))}
                placeholder="Enter slip number"
              />
            </FormField>
            <FormField
              label="Slip Date"
              required
              htmlFor="customer-receipt-slip-date"
              className="md:col-span-1"
            >
              <input
                id="customer-receipt-slip-date"
                type="date"
                value={formState.slipDate}
                onChange={(event) => setFormState((prev) => ({ ...prev, slipDate: event.target.value }))}
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
        <FormField label="Amount" required className="md:col-span-1">
          <input
            type="number"
            value={formState.amount}
            onChange={(event) => setFormState((prev) => ({ ...prev, amount: event.target.value }))}
          />
        </FormField>
        <FormField label="Remaining Balance" className="md:col-span-1">
          <input value={remainingBalance.toFixed(2)} disabled />
        </FormField>
        <FormField label="Details" className="md:col-span-3">
          <textarea
            rows={3}
            value={formState.details}
            onChange={(event) => setFormState((prev) => ({ ...prev, details: event.target.value }))}
          />
        </FormField>
        <div className="flex items-end justify-end gap-3 md:col-span-3">
          <button type="submit" className="primary">
            {mutation.isPending ? "Saving..." : "Save Receipt"}
          </button>
        </div>
      </form>
    </SectionCard>
  );
};

export default CustomerReceiptPage;
