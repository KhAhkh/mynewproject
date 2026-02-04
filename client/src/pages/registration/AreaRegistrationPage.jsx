import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import SectionCard from "../../components/SectionCard.jsx";
import FormField from "../../components/FormField.jsx";
import { api } from "../../api/client.js";

const makeForm = () => ({
  code: "",
  name: ""
});

const AreaRegistrationPage = () => {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(makeForm);

  const mutation = useMutation({
    mutationFn: async (payload) => {
      const response = await api.post("/areas", payload);
      return response.data;
    },
    onSuccess: () => {
      setForm(makeForm());
      queryClient.invalidateQueries({ queryKey: ["areas"] });
    }
  });

  const handleSubmit = (event) => {
    event.preventDefault();
    mutation.mutate({
      code: form.code.trim(),
      name: form.name.trim()
    });
  };

  return (
    <div className="space-y-6">
      <SectionCard
        title="Area Registration"
        description="Define sales areas for customer grouping."
      >
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid md:grid-cols-2 gap-4">
            <FormField label="Area Code" required>
              <input
                value={form.code}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, code: event.target.value }))
                }
                required
              />
            </FormField>
            <FormField label="Area Name" required>
              <input
                value={form.name}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, name: event.target.value }))
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
              <span className="text-xs text-emerald-400">Area saved.</span>
            ) : null}
            <button type="submit" className="primary">
              {mutation.isPending ? "Saving..." : "Save Area"}
            </button>
          </div>
        </form>
      </SectionCard>
    </div>
  );
};

export default AreaRegistrationPage;
