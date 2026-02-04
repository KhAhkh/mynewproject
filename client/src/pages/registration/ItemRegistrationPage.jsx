import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import SectionCard from "../../components/SectionCard.jsx";
import FormField from "../../components/FormField.jsx";
import SearchSelect from "../../components/SearchSelect.jsx";
import { api } from "../../api/client.js";

const makeForm = () => ({
  code: "",
  name: "",
  baseUnit: "Pieces",
  packSize: "",
  minQuantity: "",
  purchaseRate: "",
  tradeRate: "",
  retailPrice: "",
  salesTax: ""
});

const toNumberOrNull = (value) => {
  if (value === "" || value === null || value === undefined) return null;
  const coerced = Number(value);
  return Number.isNaN(coerced) ? null : coerced;
};

const ItemRegistrationPage = () => {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(makeForm);
  const [companyQuery, setCompanyQuery] = useState("");
  const [companyOption, setCompanyOption] = useState(null);

  const companiesLookup = useQuery({
    queryKey: ["companies", { search: companyQuery }],
    queryFn: async () => {
      const response = await api.get("/companies", { params: { search: companyQuery } });
      return response.data;
    }
  });

  const mutation = useMutation({
    mutationFn: async (payload) => {
      const response = await api.post("/items", payload);
      return response.data;
    },
    onSuccess: () => {
      setForm(makeForm());
      setCompanyOption(null);
      queryClient.invalidateQueries({ queryKey: ["items"] });
    }
  });

  const requiresPackSize = form.baseUnit === "Pack" || form.baseUnit === "Carton";

  const handleSubmit = (event) => {
    event.preventDefault();
    mutation.mutate({
      code: form.code.trim(),
      name: form.name.trim(),
      company_id: companyOption?.id ?? null,
      base_unit: form.baseUnit,
      pack_size: requiresPackSize ? toNumberOrNull(form.packSize) : null,
      min_quantity: toNumberOrNull(form.minQuantity),
      purchase_rate: toNumberOrNull(form.purchaseRate),
      trade_rate: toNumberOrNull(form.tradeRate),
      retail_price: toNumberOrNull(form.retailPrice),
      sales_tax: toNumberOrNull(form.salesTax)
    });
  };

  return (
    <div className="space-y-6">
      <SectionCard
        title="Item Registration"
        description="Manage inventory items with company linkage and pricing."
      >
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid md:grid-cols-2 gap-4">
            <FormField label="Item Code" required>
              <input
                value={form.code}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, code: event.target.value }))
                }
                required
              />
            </FormField>
            <FormField label="Item Name" required>
              <input
                value={form.name}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, name: event.target.value }))
                }
                required
              />
            </FormField>
          </div>
          <SearchSelect
            label="Company"
            placeholder="Search company"
            onSearch={setCompanyQuery}
            onSelect={(option) => {
              setCompanyOption(option);
            }}
            value={companyOption}
            results={
              companiesLookup.data?.map((company) => ({
                value: company.id,
                id: company.id,
                label: `${company.code} — ${company.name}`
              })) ?? []
            }
          />
          <div className="grid md:grid-cols-2 gap-4">
            <FormField label="Unit of Measure" required>
              <select
                value={form.baseUnit}
                onChange={(event) => {
                  const nextUnit = event.target.value;
                  setForm((prev) => ({
                    ...prev,
                    baseUnit: nextUnit,
                    packSize: nextUnit === "Pack" || nextUnit === "Carton" ? prev.packSize : ""
                  }));
                }}
                required
              >
                <option value="Pieces">Piece</option>
                <option value="Pack">Pack</option>
                <option value="Carton">Carton</option>
              </select>
            </FormField>
            <FormField label="Pack/Carton Size">
              <input
                type="number"
                step="any"
                value={form.packSize}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, packSize: event.target.value }))
                }
                disabled={!requiresPackSize}
                required={requiresPackSize}
              />
            </FormField>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <FormField label="Minimum Quantity" required>
              <input
                type="number"
                step="any"
                value={form.minQuantity}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, minQuantity: event.target.value }))
                }
                required
              />
            </FormField>
            <FormField label="Purchase Rate" required>
              <input
                type="number"
                step="any"
                value={form.purchaseRate}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, purchaseRate: event.target.value }))
                }
                required
              />
            </FormField>
            <FormField label="Trade Rate" required>
              <input
                type="number"
                step="any"
                value={form.tradeRate}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, tradeRate: event.target.value }))
                }
                required
              />
            </FormField>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <FormField label="Retail Price">
              <input
                type="number"
                step="any"
                value={form.retailPrice}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, retailPrice: event.target.value }))
                }
              />
            </FormField>
            <FormField label="Sales Tax (%)">
              <input
                type="number"
                step="any"
                value={form.salesTax}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, salesTax: event.target.value }))
                }
              />
            </FormField>
          </div>
          <div className="flex items-center gap-4 justify-end">
            {mutation.isError ? (
              <span className="text-xs text-rose-400">{mutation.error.message}</span>
            ) : null}
            {mutation.isSuccess ? (
              <span className="text-xs text-emerald-400">Item saved.</span>
            ) : null}
            <button type="submit" className="primary">
              {mutation.isPending ? "Saving..." : "Save Item"}
            </button>
          </div>
        </form>
      </SectionCard>
    </div>
  );
};

export default ItemRegistrationPage;
