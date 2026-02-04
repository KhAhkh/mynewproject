import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import SectionCard from "../../components/SectionCard.jsx";
import FormField from "../../components/FormField.jsx";
import SearchSelect from "../../components/SearchSelect.jsx";
import { api } from "../../api/client.js";
import { toDisplay } from "../../utils/date.js";

const ENTITY_TYPES = [
  { value: "customer", label: "Customer Opening Balance" },
  { value: "supplier", label: "Supplier Opening Balance" },
  { value: "bank", label: "Bank Opening Balance" }
];

const DEFAULT_SUMMARY_KEYS = {
  customer: {
    title: "Customer Opening Balances",
    description: "Current opening balance totals by customer.",
    codeLabel: "Customer Code",
    nameLabel: "Customer Name"
  },
  supplier: {
    title: "Supplier Opening Balances",
    description: "Current opening balance totals by supplier.",
    codeLabel: "Supplier Code",
    nameLabel: "Supplier Name"
  },
  bank: {
    title: "Bank Opening Balances",
    description: "Current opening balance totals by bank.",
    codeLabel: "Bank Code",
    nameLabel: "Bank Name",
    extraLabel: "Account No."
  }
};

const entityConfig = {
  customer: {
    searchKey: "customers",
    placeholder: "Search customer",
    labelFormatter: (row) => `${row.code} — ${row.name}`,
    optionFields: (row) => ({ code: row.code, display: `${row.code} — ${row.name}` }),
    historyKey: "customer-opening-balances",
    summaryKey: "customer-opening-balances-summary",
    historyFormatter: (entry) => ({
      code: entry.customerCode,
      name: entry.customerName,
      amount: entry.amount,
      createdAt: entry.createdAt
    }),
    summaryFormatter: (entry) => ({
      id: entry.id,
      code: entry.code,
      name: entry.name,
      extra: null,
      total: entry.total
    }),
    submitPath: "/customer-opening-balances",
    payloadBuilder: ({ code, amount }) => ({ customerCode: code, amount })
  },
  supplier: {
    searchKey: "suppliers",
    placeholder: "Search supplier",
    labelFormatter: (row) => `${row.code} — ${row.name}`,
    optionFields: (row) => ({ code: row.code, display: `${row.code} — ${row.name}` }),
    historyKey: "supplier-opening-balances",
    summaryKey: "supplier-opening-balances-summary",
    historyFormatter: (entry) => ({
      code: entry.supplierCode,
      name: entry.supplierName,
      amount: entry.amount,
      createdAt: entry.createdAt
    }),
    summaryFormatter: (entry) => ({
      id: entry.id,
      code: entry.code,
      name: entry.name,
      extra: null,
      total: entry.total
    }),
    submitPath: "/supplier-opening-balances",
    payloadBuilder: ({ code, amount }) => ({ supplierCode: code, amount })
  },
  bank: {
    searchKey: "banks",
    placeholder: "Search bank",
    labelFormatter: (row) => `${row.code} — ${row.name}${row.account_no ? ` (${row.account_no})` : ""}`,
    optionFields: (row) => ({ code: row.code, display: `${row.code} — ${row.name}`, accountNo: row.account_no }),
    historyKey: "bank-opening-balances",
    summaryKey: "bank-opening-balances-summary",
    historyFormatter: (entry) => ({
      code: entry.bankCode,
      name: entry.bankName,
      extra: entry.accountNo,
      amount: entry.amount,
      createdAt: entry.createdAt
    }),
    summaryFormatter: (entry) => ({
      id: entry.id,
      code: entry.code,
      name: entry.name,
      extra: entry.accountNo,
      total: entry.total
    }),
    submitPath: "/bank-opening-balances",
    payloadBuilder: ({ code, amount }) => ({ bankCode: code, amount })
  }
};

const formatCurrency = (value) =>
  `Rs ${Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const OpeningBalanceLanding = () => {
  const [entityType, setEntityType] = useState(ENTITY_TYPES[0].value);
  const [entityQuery, setEntityQuery] = useState("");

  const config = entityConfig[entityType];
  const summaryLabels = DEFAULT_SUMMARY_KEYS[entityType];

  const lookupQuery = useQuery({
    queryKey: [config.searchKey, { search: entityQuery }],
    queryFn: async () => {
      const response = await api.get(`/${config.searchKey}`, { params: { search: entityQuery } });
      return response.data;
    }
  });

  const historyQuery = useQuery({
    queryKey: [config.historyKey],
    queryFn: async () => {
      const response = await api.get(`/${config.historyKey}`, { params: { limit: 10 } });
      return response.data;
    }
  });

  return (
    <div className="space-y-6">
      <SectionCard
        title="Opening Balance Type"
        description="Select the entity type to capture its opening balance."
      >
        <div className="grid md:grid-cols-2 gap-4">
          <FormField label="Opening Balance Category">
            <select
              value={entityType}
              onChange={(event) => setEntityType(event.target.value)}
            >
              {ENTITY_TYPES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Quick Search">
            <SearchSelect
              placeholder={config.placeholder}
              onSearch={setEntityQuery}
              results={lookupQuery.data?.map((row) => ({
                value: row.id,
                code: row.code,
                label: config.labelFormatter(row)
              })) ?? []}
              onSelect={() => {}}
            />
            <p className="text-xs text-slate-500 mt-2">
              Use the opening-balance form below to record amounts for the selected category.
            </p>
          </FormField>
        </div>
      </SectionCard>

      <SectionCard
        title="Recent Opening Entries"
        description={`Latest opening balance entries for ${entityType} records.`}
      >
        {historyQuery.isLoading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : historyQuery.error ? (
          <p className="text-sm text-rose-500">Unable to load recent entries.</p>
        ) : historyQuery.data?.length ? (
          <ul className="space-y-3 text-sm text-slate-700">
            {historyQuery.data.map((entry) => {
              const mapped = config.historyFormatter(entry);
              return (
                <li
                  key={entry.id}
                  className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
                >
                  <div>
                    <p className="font-semibold text-slate-800">
                      {mapped.code} — {mapped.name}
                      {mapped.extra ? <span className="ml-2 text-xs text-slate-500">{mapped.extra}</span> : null}
                    </p>
                    <p className="text-xs text-slate-500">Logged on {toDisplay(mapped.createdAt)}</p>
                  </div>
                  <span className="text-base font-semibold text-emerald-600">
                    {formatCurrency(mapped.amount)}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">No opening balances recorded yet.</p>
        )}
      </SectionCard>

      <SectionCard
        title={summaryLabels.title}
        description={summaryLabels.description}
      >
        {historyQuery.isLoading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : null}
        <SummaryTable entityType={entityType} config={config} summaryLabels={summaryLabels} />
      </SectionCard>
    </div>
  );
};

const SummaryTable = ({ entityType, config, summaryLabels }) => {
  const summaryQuery = useQuery({
    queryKey: [config.summaryKey],
    queryFn: async () => {
      const response = await api.get(`/${config.summaryKey}`);
      return response.data;
    }
  });

  if (summaryQuery.isLoading) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }

  if (summaryQuery.error) {
    return <p className="text-sm text-rose-500">Unable to load summary.</p>;
  }

  const rows = summaryQuery.data ?? [];

  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">No records found.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm text-left text-slate-700">
        <thead>
          <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2">{summaryLabels.codeLabel}</th>
            <th className="px-3 py-2">{summaryLabels.nameLabel}</th>
            {summaryLabels.extraLabel ? (
              <th className="px-3 py-2">{summaryLabels.extraLabel}</th>
            ) : null}
            <th className="px-3 py-2 text-right">Opening Balance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((entry) => {
            const mapped = config.summaryFormatter(entry);
            return (
              <tr key={mapped.id} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2 font-medium text-slate-800">{mapped.code}</td>
                <td className="px-3 py-2">{mapped.name}</td>
                {summaryLabels.extraLabel ? (
                  <td className="px-3 py-2">{mapped.extra || "—"}</td>
                ) : null}
                <td className="px-3 py-2 text-right font-semibold text-slate-900">
                  {formatCurrency(mapped.total)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default OpeningBalanceLanding;
