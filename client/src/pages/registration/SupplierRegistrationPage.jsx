import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import SectionCard from "../../components/SectionCard.jsx";
import FormField from "../../components/FormField.jsx";
import { api } from "../../api/client.js";

const makeForm = () => ({
  code: "",
  name: "",
  contactPerson: "",
  address: "",
  phone: ""
});

const SupplierRegistrationPage = () => {
  const [form, setForm] = useState(makeForm);

  const mutation = useMutation({
    mutationFn: async (payload) => {
      const response = await api.post("/suppliers", payload);
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
      name: form.name.trim(),
      contact_person: form.contactPerson.trim(),
      address: form.address.trim(),
      phone: form.phone.trim()
    });
  };

  return (
    <div className="space-y-6">
      <SectionCard
        title="Supplier Registration"
        description="Capture supplier contacts for purchases."
      >
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid md:grid-cols-2 gap-4">
            <FormField label="Supplier Code" required>
              <input
                value={form.code}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, code: event.target.value }))
                }
                required
              />
            </FormField>
            <FormField label="Supplier Name" required>
              <input
                value={form.name}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, name: event.target.value }))
                }
                required
              />
            </FormField>
          </div>
          <FormField label="Contact Person">
            <input
              value={form.contactPerson}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, contactPerson: event.target.value }))
              }
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
          <FormField label="Phone">
            <input
              value={form.phone}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, phone: event.target.value }))
              }
            />
          </FormField>
          <div className="flex items-center gap-4 justify-end">
            {mutation.isError ? (
              <span className="text-xs text-rose-400">{mutation.error.message}</span>
            ) : null}
            {mutation.isSuccess ? (
              <span className="text-xs text-emerald-400">Supplier saved.</span>
            ) : null}
            <button type="submit" className="primary">
              {mutation.isPending ? "Saving..." : "Save Supplier"}
            </button>
          </div>
        </form>
      </SectionCard>
    </div>
  );
};

export default SupplierRegistrationPage;
