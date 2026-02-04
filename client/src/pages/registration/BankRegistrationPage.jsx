import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import SectionCard from "../../components/SectionCard.jsx";
import FormField from "../../components/FormField.jsx";
import { api } from "../../api/client.js";

const makeForm = () => ({
  code: "",
  accountNo: "",
  name: "",
  address: "",
  phone1: "",
  phone2: ""
});

const BankRegistrationPage = () => {
  const [form, setForm] = useState(makeForm);

  const mutation = useMutation({
    mutationFn: async (payload) => {
      const response = await api.post("/banks", payload);
      return response.data;
    },
    onSuccess: () => {
      setForm(makeForm());
    }
  });

  const handleSubmit = (event) => {
    event.preventDefault();
    mutation.mutate({
      code: form.code.trim(),
      account_no: form.accountNo.trim(),
      name: form.name.trim(),
      address: form.address.trim(),
      phone1: form.phone1.trim(),
      phone2: form.phone2.trim()
    });
  };

  return (
    <div className="space-y-6">
      <SectionCard
        title="Bank Registration"
        description="Register bank accounts for payment tracking."
      >
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid md:grid-cols-2 gap-4">
            <FormField label="Bank Code" required>
              <input
                value={form.code}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, code: event.target.value }))
                }
                required
              />
            </FormField>
            <FormField label="Account Number" required>
              <input
                value={form.accountNo}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, accountNo: event.target.value }))
                }
                required
              />
            </FormField>
          </div>
          <FormField label="Bank Name" required>
            <input
              value={form.name}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, name: event.target.value }))
              }
              required
            />
          </FormField>
          <FormField label="Address" required>
            <input
              value={form.address}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, address: event.target.value }))
              }
              required
            />
          </FormField>
          <div className="grid md:grid-cols-2 gap-4">
            <FormField label="Phone 1">
              <input
                value={form.phone1}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, phone1: event.target.value }))
                }
              />
            </FormField>
            <FormField label="Phone 2">
              <input
                value={form.phone2}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, phone2: event.target.value }))
                }
              />
            </FormField>
          </div>
          <div className="flex items-center gap-4 justify-end">
            {mutation.isError ? (
              <span className="text-xs text-rose-400">{mutation.error.message}</span>
            ) : null}
            {mutation.isSuccess ? (
              <span className="text-xs text-emerald-400">Bank saved.</span>
            ) : null}
            <button type="submit" className="primary">
              {mutation.isPending ? "Saving..." : "Save Bank"}
            </button>
          </div>
        </form>
      </SectionCard>
    </div>
  );
};

export default BankRegistrationPage;
