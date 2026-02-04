import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import SectionCard from "../../components/SectionCard.jsx";
import FormField from "../../components/FormField.jsx";
import SearchSelect from "../../components/SearchSelect.jsx";
import { api } from "../../api/client.js";

const makeForm = () => ({
  code: "",
  name: "",
  address: "",
  phone1: "",
  phone2: "",
  areaId: null
});

const CustomerRegistrationPage = () => {
  const [form, setForm] = useState(makeForm);
  const [areaQuery, setAreaQuery] = useState("");
  const [areaOption, setAreaOption] = useState(null);

  const areasLookup = useQuery({
    queryKey: ["areas", { search: areaQuery }],
    queryFn: async () => {
      const response = await api.get("/areas", { params: { search: areaQuery } });
      return response.data;
    }
  });

  const mutation = useMutation({
    mutationFn: async (payload) => {
      const response = await api.post("/customers", payload);
      return response.data;
    },
    onSuccess: () => {
      setForm(makeForm());
      setAreaOption(null);
    }
  });

  const handleSubmit = (event) => {
    event.preventDefault();
    mutation.mutate({
      code: form.code.trim(),
      name: form.name.trim(),
      address: form.address.trim(),
      phone1: form.phone1.trim(),
      phone2: form.phone2.trim(),
      area_id: areaOption?.id ?? form.areaId
    });
  };

  return (
    <div className="space-y-6">
      <SectionCard
        title="Customer Registration"
        description="Store customer profiles and assign sales areas."
      >
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid md:grid-cols-2 gap-4">
            <FormField label="Customer Code" required>
              <input
                value={form.code}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, code: event.target.value }))
                }
                required
              />
            </FormField>
            <FormField label="Customer Name" required>
              <input
                value={form.name}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, name: event.target.value }))
                }
                required
              />
            </FormField>
          </div>
          <FormField label="Address" required>
            <input
              value={form.address}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, address: event.target.value }))
              }
              required
            />
          </FormField>
          <SearchSelect
            label="Sales Area"
            placeholder="Search area"
            onSearch={setAreaQuery}
            onSelect={(option) => {
              setAreaOption(option);
              setForm((prev) => ({ ...prev, areaId: option.id }));
            }}
            value={areaOption}
            results={
              areasLookup.data?.map((area) => ({
                value: area.id,
                id: area.id,
                label: `${area.code} — ${area.name}`
              })) ?? []
            }
          />
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
              <span className="text-xs text-emerald-400">Customer saved.</span>
            ) : null}
            <button type="submit" className="primary">
              {mutation.isPending ? "Saving..." : "Save Customer"}
            </button>
          </div>
        </form>
      </SectionCard>
    </div>
  );
};

export default CustomerRegistrationPage;
