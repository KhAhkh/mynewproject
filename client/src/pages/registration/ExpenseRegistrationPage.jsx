import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import SectionCard from "../../components/SectionCard.jsx";
import FormField from "../../components/FormField.jsx";
import { api } from "../../api/client.js";

const makeForm = () => ({
  code: "",
  description: ""
});

const ExpenseRegistrationPage = () => {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(makeForm);

  const mutation = useMutation({
    mutationFn: async (payload) => {
      const response = await api.post("/expenses", payload);
      return response.data;
    },
    onSuccess: () => {
      setForm(makeForm());
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
    }
  });

  const handleSubmit = (event) => {
    event.preventDefault();
    mutation.mutate({
      code: form.code.trim(),
      description: form.description.trim()
    });
  };

  return (
    <div className="space-y-6">
      <SectionCard
        title="Expense Definition"
        description="Maintain expense heads for voucher entry."
      >
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid md:grid-cols-2 gap-4">
            <FormField label="Expense Code" required>
              <input
                value={form.code}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, code: event.target.value }))
                }
                required
              />
            </FormField>
            <FormField label="Description" required>
              <input
                value={form.description}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, description: event.target.value }))
                }
                required
              />
            </FormField>
          </div>
          <div className="flex items-center gap-4 justify-end">
            {mutation.isError ? (
              <span className="text-xs text-rose-400">{mutation.error.message}</span>
            ) : null}
            {mutation.isSuccess ? (
              <span className="text-xs text-emerald-400">Expense saved.</span>
            ) : null}
            <button type="submit" className="primary">
              {mutation.isPending ? "Saving..." : "Save Expense"}
            </button>
          </div>
        </form>
      </SectionCard>
    </div>
  );
};

export default ExpenseRegistrationPage;
