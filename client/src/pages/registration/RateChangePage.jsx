import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import SectionCard from "../../components/SectionCard.jsx";
import SearchSelect from "../../components/SearchSelect.jsx";
import { api } from "../../api/client.js";

const toInputValue = (value) => {
  if (value === null || value === undefined) return "";
  return String(value);
};

const RateChangePage = () => {
  const queryClient = useQueryClient();
  const [companyQuery, setCompanyQuery] = useState("");
  const [companyOption, setCompanyOption] = useState(null);
  const [draftRates, setDraftRates] = useState({});
  const [hasLocalChanges, setHasLocalChanges] = useState(false);
  const [clientError, setClientError] = useState("");

  const companiesLookup = useQuery({
    queryKey: ["companies", { search: companyQuery }],
    queryFn: async () => {
      const response = await api.get("/companies", { params: { search: companyQuery } });
      return response.data;
    }
  });

  const itemsQuery = useQuery({
    queryKey: ["company-items", companyOption?.id],
    queryFn: async () => {
      if (!companyOption?.id) return [];
      const response = await api.get(`/companies/${companyOption.id}/items`);
      return response.data;
    },
    enabled: Boolean(companyOption?.id)
  });

  useEffect(() => {
    if (!companyOption?.id) {
      setDraftRates({});
      setHasLocalChanges(false);
      setClientError("");
    }
  }, [companyOption?.id]);

  useEffect(() => {
    if (!itemsQuery.data) return;
    if (hasLocalChanges) return;
    const nextDrafts = itemsQuery.data.reduce((acc, item) => {
      acc[item.id] = toInputValue(item.purchase_rate);
      return acc;
    }, {});
    setDraftRates(nextDrafts);
    setClientError("");
  }, [itemsQuery.data, hasLocalChanges]);

  const originalRates = useMemo(() => {
    if (!itemsQuery.data) return {};
    return itemsQuery.data.reduce((acc, item) => {
      acc[item.id] = item.purchase_rate === null ? null : Number(item.purchase_rate);
      return acc;
    }, {});
  }, [itemsQuery.data]);

  const mutation = useMutation({
    mutationFn: async (payload) => {
      if (!companyOption?.id) throw new Error("Company not selected");
      const response = await api.put(`/companies/${companyOption.id}/item-rates`, payload);
      return response.data;
    },
    onSuccess: (data) => {
      setHasLocalChanges(false);
      setDraftRates(
        data.items.reduce((acc, item) => {
          acc[item.id] = toInputValue(item.purchase_rate);
          return acc;
        }, {})
      );
      setClientError("");
      queryClient.invalidateQueries({ queryKey: ["company-items", companyOption?.id] });
    }
  });

  const handleRateChange = (itemId, value) => {
    setDraftRates((prev) => ({ ...prev, [itemId]: value }));
    setHasLocalChanges(true);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setClientError("");
    if (!companyOption?.id) {
      setClientError("Select a company first.");
      return;
    }
    if (!itemsQuery.data || itemsQuery.data.length === 0) {
      setClientError("No items available for the selected company.");
      return;
    }

    const updates = [];
    for (const item of itemsQuery.data) {
      const rawValue = draftRates[item.id];
      let normalized = null;
      if (rawValue !== undefined && rawValue !== "") {
        const numeric = Number(rawValue);
        if (!Number.isFinite(numeric)) {
          setClientError(`Invalid rate for ${item.code}.`);
          return;
        }
        normalized = numeric;
      }

      const original = originalRates[item.id] ?? null;
      const unchanged =
        (original === null && normalized === null) ||
        (original !== null && normalized !== null && Number(original) === Number(normalized));
      if (!unchanged) {
        updates.push({ itemId: item.id, purchaseRate: normalized });
      }
    }

    if (updates.length === 0) {
      setClientError("No changes to save.");
      return;
    }

    mutation.mutate({ updates });
  };

  const itemsError = itemsQuery.error
    ? itemsQuery.error.response?.data?.message ?? itemsQuery.error.message
    : "";
  const mutationError = mutation.error
    ? mutation.error.response?.data?.message ?? mutation.error.message
    : "";

  return (
    <div className="space-y-6">
      <SectionCard
        title="Rate Change"
        description="Select a company to review and update item purchase rates."
      >
        <div className="space-y-4">
          <SearchSelect
            label="Company"
            placeholder="Search company"
            onSearch={setCompanyQuery}
            onSelect={(option) => {
              setCompanyOption(option);
              setHasLocalChanges(false);
              setClientError("");
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

          {!companyOption ? (
            <p className="text-sm text-slate-500">Select a company to load its items.</p>
          ) : (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600">
                      <th className="px-3 py-2 text-left font-semibold">Code</th>
                      <th className="px-3 py-2 text-left font-semibold">Item</th>
                      <th className="px-3 py-2 text-left font-semibold">Purchase Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {itemsQuery.isLoading ? (
                      <tr>
                        <td className="px-3 py-4 text-center text-slate-500" colSpan={3}>
                          Loading items...
                        </td>
                      </tr>
                    ) : itemsQuery.isError ? (
                      <tr>
                        <td className="px-3 py-4 text-center text-rose-400" colSpan={3}>
                          {itemsError || "Failed to load items."}
                        </td>
                      </tr>
                    ) : itemsQuery.data && itemsQuery.data.length > 0 ? (
                      itemsQuery.data.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50">
                          <td className="px-3 py-2 font-mono text-xs text-slate-500">{item.code}</td>
                          <td className="px-3 py-2 text-slate-700">{item.name}</td>
                          <td className="px-3 py-2">
                            <input
                              className="w-36 rounded-lg border border-slate-200 px-2 py-1 text-sm"
                              type="number"
                              step="any"
                              value={draftRates[item.id] ?? ""}
                              onChange={(event) => handleRateChange(item.id, event.target.value)}
                            />
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="px-3 py-4 text-center text-slate-500" colSpan={3}>
                          No items found for the selected company.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-end gap-4">
                {clientError ? <span className="text-xs text-rose-400">{clientError}</span> : null}
                {mutation.isError ? (
                  <span className="text-xs text-rose-400">{mutationError}</span>
                ) : null}
                {mutation.isSuccess ? (
                  <span className="text-xs text-emerald-400">Rates updated.</span>
                ) : null}
                <button
                  type="submit"
                  className="primary"
                  disabled={mutation.isPending || itemsQuery.isLoading || !itemsQuery.data?.length}
                >
                  {mutation.isPending ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          )}
        </div>
      </SectionCard>
    </div>
  );
};

export default RateChangePage;
