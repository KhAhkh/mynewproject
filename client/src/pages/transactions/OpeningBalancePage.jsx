import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import SectionCard from "../../components/SectionCard.jsx";
import FormField from "../../components/FormField.jsx";
import SearchSelect from "../../components/SearchSelect.jsx";
import { api } from "../../api/client.js";
import { toDisplay } from "../../utils/date.js";

const ENTITY_OPTIONS = [
  { value: "customer", label: "Customer Opening Balance" },
  { value: "supplier", label: "Supplier Opening Balance" },
  { value: "bank", label: "Bank Opening Balance" }
];

const configByEntity = {
  customer: {
    searchEndpoint: "/customers",
    historyKey: "customer-opening-balances",
    summaryKey: "customer-opening-balances-summary",
    submitPath: "/customer-opening-balances",
    payloadBuilder: ({ code, amount }) => ({ customerCode: code, amount }),
    historyFormatter: (entry) => ({
      code: entry.customerCode,
      name: entry.customerName,
      extra: null,
      amount: entry.amount,
      createdAt: entry.createdAt
    }),
    summaryMetadata: {
      title: "Customer Opening Balances",
      description: "Current opening balance totals by customer.",
      codeHeading: "Customer Code",
      nameHeading: "Customer Name",
      extraHeading: null
    }
  },
  supplier: {
    searchEndpoint: "/suppliers",
    historyKey: "supplier-opening-balances",
    summaryKey: "supplier-opening-balances-summary",
    submitPath: "/supplier-opening-balances",
    payloadBuilder: ({ code, amount }) => ({ supplierCode: code, amount }),
    historyFormatter: (entry) => ({
      code: entry.supplierCode,
      name: entry.supplierName,
      extra: null,
      amount: entry.amount,
      createdAt: entry.createdAt
    }),
    summaryMetadata: {
      title: "Supplier Opening Balances",
      description: "Current opening balance totals by supplier.",
      codeHeading: "Supplier Code",
      nameHeading: "Supplier Name",
      extraHeading: null
    }
  },
  bank: {
    searchEndpoint: "/banks",
    historyKey: "bank-opening-balances",
    summaryKey: "bank-opening-balances-summary",
    submitPath: "/bank-opening-balances",
    payloadBuilder: ({ code, amount }) => ({ bankCode: code, amount }),
    historyFormatter: (entry) => ({
      code: entry.bankCode,
      name: entry.bankName,
      extra: entry.accountNo,
      amount: entry.amount,
      createdAt: entry.createdAt
    }),
    summaryMetadata: {
      title: "Bank Opening Balances",
      description: "Current opening balance totals by bank.",
      codeHeading: "Bank Code",
      nameHeading: "Bank Name",
      extraHeading: "Account No."
    }
  }
};

const formatCurrency = (value) =>
  `Rs ${Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const OpeningBalancePage = () => {
  const queryClient = useQueryClient();
  const [entityType, setEntityType] = useState("customer");
  const [entityQuery, setEntityQuery] = useState("");
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState(null);

  const config = configByEntity[entityType];

  const lookupQuery = useQuery({
    queryKey: [config.searchEndpoint, { search: entityQuery }],
    queryFn: async () => {
      const response = await api.get(config.searchEndpoint, { params: { search: entityQuery } });
      return response.data;
    }
  });

  const historyQuery = useQuery({
    queryKey: [config.historyKey],
    queryFn: async () => {
      const response = await api.get(`/${config.historyKey}`, { params: { limit: 20 } });
      return response.data;
    }
  });

  const summaryQuery = useQuery({
    queryKey: [config.summaryKey],
    queryFn: async () => {
      const response = await api.get(`/${config.summaryKey}`);
      return response.data;
    }
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!selectedEntity?.code) {
        throw new Error("Select a record before saving opening balance.");
      }
      const numericAmount = Number(amount);
      const payload = config.payloadBuilder({ code: selectedEntity.code, amount: numericAmount });
      const response = await api.post(config.submitPath, payload);
      return response.data;
    },
    onMutate: () => setStatus(null),
    onSuccess: () => {
      setStatus({ type: "success", message: "Opening balance recorded." });
      setAmount("");
      setSelectedEntity(null);
      queryClient.invalidateQueries({ queryKey: [config.historyKey] });
      queryClient.invalidateQueries({ queryKey: [config.summaryKey] });
    },
    onError: (error) => {
      setStatus({ type: "error", message: error.message });
    }
  });

  const historyEntries = useMemo(() => {
    if (!historyQuery.data) return [];
    return historyQuery.data.map((entry) => config.historyFormatter(entry));
  }, [historyQuery.data, config]);

  const summaryEntries = useMemo(() => summaryQuery.data ?? [], [summaryQuery.data]);

  const handleSubmit = (event) => {
    event.preventDefault();
    if (mutation.isPending) return;

    if (!selectedEntity?.code) {
      setStatus({ type: "error", message: "Select a record." });
      return;
    }

    const numeric = Number(amount);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      setStatus({ type: "error", message: "Enter a valid amount greater than zero." });
      return;
    }

    mutation.mutate();
  };

  const { summaryMetadata } = config;

  return (
    <div className="space-y-6">
      <SectionCard
        title="Opening Balance"
        description="Record opening balances for customers, suppliers, or banks."
      >
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <FormField label="Opening Balance Category" required>
            <select
              value={entityType}
              onChange={(event) => {
                setEntityType(event.target.value);
                setEntityQuery("");
                setSelectedEntity(null);
                setAmount("");
                setStatus(null);
              }}
            >
              {ENTITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </FormField>

          <SearchSelect
            label={`${entityType.charAt(0).toUpperCase() + entityType.slice(1)} Record`}
            placeholder={`Search ${entityType}`}
            onSearch={setEntityQuery}
            onSelect={(option) => setSelectedEntity(option)}
            value={selectedEntity}
            results={
              lookupQuery.data?.map((row) => ({
                value: row.id,
                code: row.code,
                label: `${row.code} — ${row.name}${row.account_no ? ` (${row.account_no})` : ""}`
              })) ?? []
            }
          />

          <FormField label="Amount" required>
            <input
              type="number"
              step="any"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              required
            />
          </FormField>

          <div className="flex items-center justify-end gap-4">
            {status ? (
              <span className={`text-xs ${status.type === "error" ? "text-rose-400" : "text-emerald-500"}`}>
                {status.message}
              </span>
            ) : null}
            <button type="submit" className="primary" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving..." : "Save Opening Balance"}
            </button>
          </div>
        </form>
      </SectionCard>

      <SectionCard
        title="Recent Opening Entries"
        description={`Latest opening-balance records for ${entityType}s.`}
      >
        {historyQuery.isLoading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : historyEntries.length ? (
          <ul className="space-y-3 text-sm text-slate-700">
            {historyEntries.map((entry, index) => (
              <li
                key={`${entry.code}-${entry.createdAt}-${index}`}
                className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
              >
                <div>
                  <p className="font-semibold text-slate-800">
                    {entry.code} — {entry.name}
                    {entry.extra ? <span className="ml-2 text-xs text-slate-500">{entry.extra}</span> : null}
                  </p>
                  <p className="text-xs text-slate-500">Logged on {toDisplay(entry.createdAt)}</p>
                </div>
                <span className="text-base font-semibold text-emerald-600">
                  {formatCurrency(entry.amount)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">No opening balances recorded yet.</p>
        )}
      </SectionCard>

      <SectionCard
        title={summaryMetadata.title}
        description={summaryMetadata.description}
      >
        {summaryQuery.isLoading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : summaryQuery.error ? (
          <p className="text-sm text-rose-500">Unable to load opening balance summary.</p>
        ) : summaryEntries.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm text-left text-slate-700">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">{summaryMetadata.codeHeading}</th>
                  <th className="px-3 py-2">{summaryMetadata.nameHeading}</th>
                  {summaryMetadata.extraHeading ? (
                    <th className="px-3 py-2">{summaryMetadata.extraHeading}</th>
                  ) : null}
                  <th className="px-3 py-2 text-right">Opening Balance</th>
                </tr>
              </thead>
              <tbody>
                {summaryEntries.map((entry) => (
                  <tr key={entry.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2 font-medium text-slate-800">{entry.code}</td>
                    <td className="px-3 py-2">{entry.name}</td>
                    {summaryMetadata.extraHeading ? (
                      <td className="px-3 py-2">{entry.accountNo || "—"}</td>
                    ) : null}
                    <td className="px-3 py-2 text-right font-semibold text-slate-900">
                      {formatCurrency(entry.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-500">No records found.</p>
        )}
      </SectionCard>
    </div>
  );
};

export default OpeningBalancePage;
