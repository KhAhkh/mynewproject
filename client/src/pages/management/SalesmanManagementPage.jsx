import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import SectionCard from "../../components/SectionCard.jsx";
import FormField from "../../components/FormField.jsx";
import { api } from "../../api/client.js";

const makeForm = () => ({
  code: "",
  name: "",
  address: "",
  phone1: "",
  phone2: ""
});

const normalize = (value) => value.trim();

const SalesmanManagementPage = () => {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(makeForm);
  const [editingId, setEditingId] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);

  const salesmenQuery = useQuery({
    queryKey: ["salesmen"],
    queryFn: async () => {
      const response = await api.get("/salesmen");
      return Array.isArray(response.data) ? response.data : [];
    }
  });

  const saveMutation = useMutation({
    mutationFn: async (payload) => {
      if (editingId) {
        const response = await api.put(`/salesmen/${editingId}`, payload);
        return response.data;
      }
      const response = await api.post("/salesmen", payload);
      return response.data;
    },
    onSuccess: () => {
      setStatusMessage({
        type: "success",
        message: editingId ? "Salesman updated." : "Salesman created."
      });
      setForm(makeForm());
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ["salesmen"] });
    },
    onError: (error) => {
      setStatusMessage({ type: "error", message: error.message || "Unable to save salesman." });
    }
  });

  const handleSubmit = (event) => {
    event.preventDefault();
    const payload = {
      code: normalize(form.code),
      name: normalize(form.name),
      address: normalize(form.address),
      phone1: normalize(form.phone1),
      phone2: normalize(form.phone2)
    };

    if (!payload.code || !payload.name || !payload.address) {
      setStatusMessage({ type: "error", message: "Code, name, and address are required." });
      return;
    }

    saveMutation.mutate(payload);
  };

  const handleSelect = (entry) => {
    setEditingId(entry.id);
    setForm({
      code: entry.code ?? "",
      name: entry.name ?? "",
      address: entry.address ?? "",
      phone1: entry.phone1 ?? "",
      phone2: entry.phone2 ?? ""
    });
    setStatusMessage(null);
  };

  const handleReset = () => {
    setEditingId(null);
    setForm(makeForm());
    setStatusMessage(null);
  };

  const salesmen = useMemo(() => salesmenQuery.data ?? [], [salesmenQuery.data]);

  return (
    <div className="space-y-6">
      <SectionCard
        title={editingId ? "Update Salesman" : "Register Salesman"}
        description="Maintain sales representatives and their contact details."
      >
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid md:grid-cols-2 gap-4">
            <FormField label="Salesman Code" required>
              <input
                value={form.code}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, code: event.target.value }))
                }
                required
              />
            </FormField>
            <FormField label="Salesman Name" required>
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
          <div className="flex items-center justify-end gap-4">
            {statusMessage ? (
              <span className={`text-xs ${statusMessage.type === "error" ? "text-rose-500" : "text-emerald-500"}`}>
                {statusMessage.message}
              </span>
            ) : null}
            {editingId ? (
              <button type="button" className="secondary" onClick={handleReset}>
                Cancel
              </button>
            ) : null}
            <button type="submit" className="primary" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving..." : editingId ? "Update Salesman" : "Save Salesman"}
            </button>
          </div>
        </form>
      </SectionCard>

      <SectionCard title="Registered Salesmen" description="Tap a row to edit the salesman details.">
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="grid grid-cols-[1.5fr_1fr_1fr] gap-2 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <span>Salesman</span>
            <span>Code</span>
            <span>Phone</span>
          </div>
          {salesmenQuery.isLoading ? (
            <p className="px-4 py-6 text-sm text-slate-500">Loading salesmen...</p>
          ) : salesmen.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500">No salesmen registered.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {salesmen.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    className={`grid w-full grid-cols-[1.5fr_1fr_1fr] gap-2 px-4 py-3 text-left text-sm transition hover:bg-slate-50 ${
                      editingId === entry.id ? "bg-emerald-50" : ""
                    }`}
                    onClick={() => handleSelect(entry)}
                  >
                    <span className="font-semibold text-slate-700">{entry.name}</span>
                    <span className="text-slate-500">{entry.code}</span>
                    <span className="text-slate-500">{entry.phone1 || entry.phone2 || "-"}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SectionCard>
    </div>
  );
};

export default SalesmanManagementPage;
