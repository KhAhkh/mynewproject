import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import SectionCard from "../../components/SectionCard.jsx";
import FormField from "../../components/FormField.jsx";
import SearchSelect from "../../components/SearchSelect.jsx";
import { api } from "../../api/client.js";
import { toDisplay } from "../../utils/date.js";
import { Link } from "react-router-dom";

const ExpenseEntryPage = () => {
  const [expenseQuery, setExpenseQuery] = useState("");
  const [meta, setMeta] = useState({ nextVoucher: "EX000001" });
  const [formState, setFormState] = useState({
    expenseCode: "",
    expenseLabel: "",
    voucherDate: toDisplay(new Date()),
    cashPayment: "",
    details: ""
  });

  useEffect(() => {
    api.get("/metadata/next/expense-voucher").then((response) => setMeta(response.data));
  }, []);

  const expenseLookup = useQuery({
    queryKey: ["expenses", { search: expenseQuery }],
    queryFn: async () => {
      const response = await api.get("/expenses", { params: { search: expenseQuery } });
      return response.data;
    }
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        expenseCode: formState.expenseCode,
        voucherDate: formState.voucherDate,
        cashPayment: Number(formState.cashPayment) || 0,
        details: formState.details
      };
      const response = await api.post("/expense-entries", payload);
      return response.data;
    },
    onSuccess: (data) => {
      if (data?.voucher_no) setMeta({ nextVoucher: data.voucher_no });
      setFormState({ expenseCode: "", expenseLabel: "", voucherDate: toDisplay(new Date()), cashPayment: "", details: "" });
    }
  });

  return (
    <SectionCard
      title="Expense Entry"
      description="Record expenses using predefined codes."
      actions={
        <div className="flex items-center gap-3">
          {mutation.isSuccess ? (
            <span className="text-xs text-emerald-400">Voucher saved</span>
          ) : mutation.isError ? (
            <span className="text-xs text-rose-400">{mutation.error.message}</span>
          ) : null}
          <Link to="/history/transactions?type=expense" className="secondary text-xs px-3 py-1">
            View saved expenses
          </Link>
        </div>
      }
    >
      <form
        className="grid gap-4 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <FormField label="Voucher No.">
          <input value={meta.nextVoucher} disabled />
        </FormField>
        <FormField label="Voucher Date" required>
          <input
            value={formState.voucherDate}
            onChange={(event) => setFormState((prev) => ({ ...prev, voucherDate: event.target.value }))}
          />
        </FormField>
        <SearchSelect
          label="Expense Code"
          placeholder="Search expense"
          value={formState.expenseCode ? { label: formState.expenseLabel || formState.expenseCode } : null}
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
        <FormField label="Cash Payment" required>
          <input
            type="number"
            value={formState.cashPayment}
            onChange={(event) => setFormState((prev) => ({ ...prev, cashPayment: event.target.value }))}
          />
        </FormField>
        <FormField label="Details">
          <textarea
            rows={3}
            value={formState.details}
            onChange={(event) => setFormState((prev) => ({ ...prev, details: event.target.value }))}
          />
        </FormField>
        <div className="flex items-end justify-end gap-3 md:col-span-2">
          <button type="submit" className="primary">
            {mutation.isPending ? "Saving..." : "Save Expense"}
          </button>
        </div>
      </form>
    </SectionCard>
  );
};

export default ExpenseEntryPage;
