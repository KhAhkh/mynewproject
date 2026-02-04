import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import SectionCard from "../../components/SectionCard.jsx";
import FormField from "../../components/FormField.jsx";
import SearchSelect from "../../components/SearchSelect.jsx";
import { api } from "../../api/client.js";

const DEFAULT_BASE_UNIT = "Pieces";

const MASTER_TYPES = [
  { value: "company", label: "Company" },
  { value: "item", label: "Item" },
  { value: "supplier", label: "Supplier" },
  { value: "area", label: "Area" },
  { value: "salesman", label: "Salesman" },
  { value: "customer", label: "Customer" },
  { value: "expense", label: "Expense" },
  { value: "bank", label: "Bank" }
];

const ensureString = (value) => {
  if (value === null || value === undefined) return "";
  return String(value);
};

const toNumberOrNull = (value) => {
  if (value === "" || value === null || value === undefined) return null;
  const coerced = Number(value);
  return Number.isNaN(coerced) ? null : coerced;
};

const makeEmptyForm = (resource) => {
  switch (resource) {
    case "company":
      return { id: null, code: "", name: "", address: "", phone1: "", phone2: "" };
    case "supplier":
      return { id: null, code: "", name: "", contactPerson: "", address: "", phone: "" };
    case "area":
      return { id: null, code: "", name: "" };
    case "salesman":
      return { id: null, code: "", name: "", address: "", phone1: "", phone2: "" };
    case "customer":
      return {
        id: null,
        code: "",
        name: "",
        address: "",
        phone1: "",
        phone2: "",
        areaId: null
      };
    case "expense":
      return { id: null, code: "", description: "" };
    case "bank":
      return {
        id: null,
        code: "",
        accountNo: "",
        name: "",
        address: "",
        phone1: "",
        phone2: ""
      };
    case "item":
    default:
      return {
        id: null,
        code: "",
        name: "",
        companyId: null,
        baseUnit: DEFAULT_BASE_UNIT,
        packSize: "",
        minQuantity: "",
        purchaseRate: "",
        tradeRate: "",
        retailPrice: "",
        salesTax: ""
      };
  }
};

const mapRecordToForm = (resource, record) => {
  if (!record) return makeEmptyForm(resource);
  switch (resource) {
    case "company":
      return {
        id: record.id,
        code: ensureString(record.code),
        name: ensureString(record.name),
        address: ensureString(record.address),
        phone1: ensureString(record.phone1),
        phone2: ensureString(record.phone2)
      };
    case "supplier":
      return {
        id: record.id,
        code: ensureString(record.code),
        name: ensureString(record.name),
        contactPerson: ensureString(record.contact_person),
        address: ensureString(record.address),
        phone: ensureString(record.phone)
      };
    case "area":
      return {
        id: record.id,
        code: ensureString(record.code),
        name: ensureString(record.name)
      };
    case "salesman":
      return {
        id: record.id,
        code: ensureString(record.code),
        name: ensureString(record.name),
        address: ensureString(record.address),
        phone1: ensureString(record.phone1),
        phone2: ensureString(record.phone2)
      };
    case "customer":
      return {
        id: record.id,
        code: ensureString(record.code),
        name: ensureString(record.name),
        address: ensureString(record.address),
        phone1: ensureString(record.phone1),
        phone2: ensureString(record.phone2),
        areaId: record.area_id ?? null
      };
    case "expense":
      return {
        id: record.id,
        code: ensureString(record.code),
        description: ensureString(record.description)
      };
    case "bank":
      return {
        id: record.id,
        code: ensureString(record.code),
        accountNo: ensureString(record.account_no),
        name: ensureString(record.name),
        address: ensureString(record.address),
        phone1: ensureString(record.phone1),
        phone2: ensureString(record.phone2)
      };
    case "item":
    default:
      return {
        id: record.id,
        code: ensureString(record.code),
        name: ensureString(record.name),
        companyId: record.company_id ?? null,
        baseUnit: ensureString(record.base_unit || DEFAULT_BASE_UNIT),
        packSize: ensureString(record.pack_size),
        minQuantity: ensureString(record.min_quantity),
        purchaseRate: ensureString(record.purchase_rate),
        tradeRate: ensureString(record.trade_rate),
        retailPrice: ensureString(record.retail_price),
        salesTax: ensureString(record.sales_tax)
      };
  }
};

const optionLabelFromRecord = (resource, record) => {
  if (!record) return "";
  switch (resource) {
    case "company":
      return `${record.code ?? ""} — ${record.name ?? ""}`.trim();
    case "supplier":
      return `${record.code ?? ""} — ${record.name ?? ""}`.trim();
    case "area":
      return `${record.code ?? ""} — ${record.name ?? ""}`.trim();
    case "salesman":
      return `${record.code ?? ""} — ${record.name ?? ""}`.trim();
    case "customer":
      return `${record.code ?? ""} — ${record.name ?? ""}`.trim();
    case "expense":
      return `${record.code ?? ""} — ${record.description ?? ""}`.trim();
    case "bank":
      return `${record.code ?? ""} — ${record.name ?? ""}`.trim();
    case "item":
    default:
      return `${record.code ?? ""} — ${record.name ?? ""}`.trim();
  }
};

const optionLabelFromForm = (resource, form) => {
  if (!form) return "";
  switch (resource) {
    case "company":
      return `${form.code} — ${form.name}`.trim();
    case "supplier":
      return `${form.code} — ${form.name}`.trim();
    case "area":
      return `${form.code} — ${form.name}`.trim();
    case "salesman":
      return `${form.code} — ${form.name}`.trim();
    case "customer":
      return `${form.code} — ${form.name}`.trim();
    case "expense":
      return `${form.code} — ${form.description}`.trim();
    case "bank":
      return `${form.code} — ${form.name}`.trim();
    case "item":
    default:
      return `${form.code} — ${form.name}`.trim();
  }
};

const buildPayload = (resource, form, { customerAreaOption, itemCompanyOption }) => {
  switch (resource) {
    case "company":
      return {
        code: form.code.trim(),
        name: form.name.trim(),
        address: form.address.trim(),
        phone1: form.phone1.trim(),
        phone2: form.phone2.trim()
      };
    case "supplier":
      return {
        code: form.code.trim(),
        name: form.name.trim(),
        contact_person: form.contactPerson.trim(),
        address: form.address.trim(),
        phone: form.phone.trim()
      };
    case "area":
      return {
        code: form.code.trim(),
        name: form.name.trim()
      };
    case "salesman":
      return {
        code: form.code.trim(),
        name: form.name.trim(),
        address: form.address.trim(),
        phone1: form.phone1.trim(),
        phone2: form.phone2.trim()
      };
    case "customer":
      return {
        code: form.code.trim(),
        name: form.name.trim(),
        address: form.address.trim(),
        phone1: form.phone1.trim(),
        phone2: form.phone2.trim(),
        area_id: customerAreaOption?.id ?? form.areaId ?? null
      };
    case "expense":
      return {
        code: form.code.trim(),
        description: form.description.trim()
      };
    case "bank":
      return {
        code: form.code.trim(),
        account_no: form.accountNo.trim(),
        name: form.name.trim(),
        address: form.address.trim(),
        phone1: form.phone1.trim(),
        phone2: form.phone2.trim()
      };
    case "item":
    default: {
      const requiresPackSize = form.baseUnit === "Pack" || form.baseUnit === "Carton";
      return {
        code: form.code.trim(),
        name: form.name.trim(),
        company_id: itemCompanyOption?.id ?? form.companyId ?? null,
        base_unit: form.baseUnit,
        pack_size: requiresPackSize ? toNumberOrNull(form.packSize) : null,
        min_quantity: toNumberOrNull(form.minQuantity),
        purchase_rate: toNumberOrNull(form.purchaseRate),
        trade_rate: toNumberOrNull(form.tradeRate),
        retail_price: toNumberOrNull(form.retailPrice),
        sales_tax: toNumberOrNull(form.salesTax)
      };
    }
  }
};

const resourceUpdatePath = (resource, id) => {
  switch (resource) {
    case "company":
      return `/companies/${id}`;
    case "supplier":
      return `/suppliers/${id}`;
    case "area":
      return `/areas/${id}`;
    case "salesman":
      return `/salesmen/${id}`;
    case "customer":
      return `/customers/${id}`;
    case "expense":
      return `/expenses/${id}`;
    case "bank":
      return `/banks/${id}`;
    case "item":
    default:
      return `/items/${id}`;
  }
};

const resourceListEndpoint = (resource) => {
  switch (resource) {
    case "company":
      return "/companies";
    case "supplier":
      return "/suppliers";
    case "area":
      return "/areas";
    case "salesman":
      return "/salesmen";
    case "customer":
      return "/customers";
    case "expense":
      return "/expenses";
    case "bank":
      return "/banks";
    case "item":
    default:
      return "/items";
  }
};

const MasterRecordsPage = () => {
  const queryClient = useQueryClient();
  const [resource, setResource] = useState("company");
  const [recordSearch, setRecordSearch] = useState("");
  const [recordOption, setRecordOption] = useState(null);
  const [form, setForm] = useState(makeEmptyForm("company"));
  const [status, setStatus] = useState(null);

  const [customerAreaQuery, setCustomerAreaQuery] = useState("");
  const [customerAreaOption, setCustomerAreaOption] = useState(null);
  const [itemCompanyQuery, setItemCompanyQuery] = useState("");
  const [itemCompanyOption, setItemCompanyOption] = useState(null);

  useEffect(() => {
    setForm(makeEmptyForm(resource));
    setRecordOption(null);
    setRecordSearch("");
    setStatus(null);
    if (resource !== "customer") {
      setCustomerAreaOption(null);
      setCustomerAreaQuery("");
    }
    if (resource !== "item") {
      setItemCompanyOption(null);
      setItemCompanyQuery("");
    }
  }, [resource]);

  const recordLookup = useQuery({
    queryKey: ["master-records", resource, { search: recordSearch }],
    queryFn: async () => {
      const endpoint = resourceListEndpoint(resource);
      const params = { search: recordSearch };
      const response = await api.get(endpoint, { params });
      return response.data || [];
    }
  });

  const areaLookup = useQuery({
    queryKey: ["areas", { search: customerAreaQuery }],
    queryFn: async () => {
      const response = await api.get("/areas", { params: { search: customerAreaQuery } });
      return response.data;
    },
    enabled: resource === "customer"
  });

  const companyLookup = useQuery({
    queryKey: ["companies", { search: itemCompanyQuery }],
    queryFn: async () => {
      const response = await api.get("/companies", { params: { search: itemCompanyQuery } });
      return response.data;
    },
    enabled: resource === "item"
  });

  const mutation = useMutation({
    mutationFn: async ({ resourceKey, id, payload }) => {
      const path = resourceUpdatePath(resourceKey, id);
      const response = await api.put(path, payload);
      return response.data;
    },
    onMutate: () => setStatus(null),
    onSuccess: () => {
      setStatus({ type: "success", message: "Record updated successfully." });
      queryClient.invalidateQueries({ queryKey: ["master-records", resource] });
      setRecordOption((prev) => {
        if (!form.id) return prev;
        return { value: form.id, label: optionLabelFromForm(resource, form) };
      });
    },
    onError: (error) => {
      const message = error?.response?.data?.message || error?.message || "Update failed.";
      setStatus({ type: "error", message });
    }
  });

  const hasSelection = useMemo(() => Boolean(form.id), [form.id]);
  const isCustomer = resource === "customer";
  const isItem = resource === "item";
  const requiresPackSize = isItem && (form.baseUnit === "Pack" || form.baseUnit === "Carton");

  const handleSelectRecord = (option) => {
    if (!option?.meta) return;
    const record = option.meta;
    setRecordOption({ value: option.value, label: option.label, meta: record });
    setForm(mapRecordToForm(resource, record));
    setStatus(null);

    if (resource === "customer") {
      if (record.area_id) {
        setCustomerAreaOption({
          value: record.area_id,
          id: record.area_id,
          label: record.area_name ? record.area_name : `Area ${record.area_id}`
        });
      } else {
        setCustomerAreaOption(null);
      }
    }

    if (resource === "item") {
      if (record.company_id) {
        setItemCompanyOption({
          value: record.company_id,
          id: record.company_id,
          label: record.company_code && record.company_name
            ? `${record.company_code} — ${record.company_name}`
            : record.company_name || record.company_code || `Company ${record.company_id}`
        });
      } else {
        setItemCompanyOption(null);
      }
    }
  };

  const handleClearSelection = () => {
    setForm(makeEmptyForm(resource));
    setRecordOption(null);
    setStatus(null);
    setCustomerAreaOption(null);
    setItemCompanyOption(null);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!form.id || mutation.isPending) return;

    const payload = buildPayload(resource, form, { customerAreaOption, itemCompanyOption });
    mutation.mutate({ resourceKey: resource, id: form.id, payload });
  };

  const recordOptions = useMemo(() => {
    if (!recordLookup.data) return [];
    return recordLookup.data.map((record) => ({
      value: record.id,
      label: optionLabelFromRecord(resource, record),
      meta: record
    }));
  }, [recordLookup.data, resource]);

  return (
    <div className="space-y-6">
      <SectionCard
        title="Master Records"
        description="Select a record type, choose an existing entry, and update its details."
        actions={
          hasSelection ? (
            <button type="button" className="secondary text-xs" onClick={handleClearSelection}>
              Clear Selection
            </button>
          ) : null
        }
      >
        <div className="space-y-4">
          <FormField label="Record Type" required>
            <select
              value={resource}
              onChange={(event) => setResource(event.target.value)}
            >
              {MASTER_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </FormField>

          <SearchSelect
            label="Select Record"
            placeholder="Search records"
            onSearch={setRecordSearch}
            onSelect={handleSelectRecord}
            value={recordOption}
            results={recordOptions}
            emptyMessage={recordLookup.isLoading ? "Searching..." : "No records found"}
          />

          {recordLookup.isError ? (
            <span className="text-xs text-rose-400">
              {recordLookup.error?.response?.data?.message || recordLookup.error?.message}
            </span>
          ) : null}

          <form className="grid gap-4" onSubmit={handleSubmit}>
            {resource === "company" ? (
              <>
                <div className="grid md:grid-cols-2 gap-4">
                  <FormField label="Company Code" required>
                    <input
                      value={form.code}
                      onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value }))}
                      required
                      disabled={!hasSelection}
                    />
                  </FormField>
                  <FormField label="Company Name" required>
                    <input
                      value={form.name}
                      onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                      required
                      disabled={!hasSelection}
                    />
                  </FormField>
                </div>
                <FormField label="Address" required>
                  <input
                    value={form.address}
                    onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
                    required
                    disabled={!hasSelection}
                  />
                </FormField>
                <div className="grid md:grid-cols-2 gap-4">
                  <FormField label="Phone 1">
                    <input
                      value={form.phone1}
                      onChange={(event) => setForm((prev) => ({ ...prev, phone1: event.target.value }))}
                      disabled={!hasSelection}
                    />
                  </FormField>
                  <FormField label="Phone 2">
                    <input
                      value={form.phone2}
                      onChange={(event) => setForm((prev) => ({ ...prev, phone2: event.target.value }))}
                      disabled={!hasSelection}
                    />
                  </FormField>
                </div>
              </>
            ) : null}

            {resource === "supplier" ? (
              <>
                <div className="grid md:grid-cols-2 gap-4">
                  <FormField label="Supplier Code" required>
                    <input
                      value={form.code}
                      onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value }))}
                      required
                      disabled={!hasSelection}
                    />
                  </FormField>
                  <FormField label="Supplier Name" required>
                    <input
                      value={form.name}
                      onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                      required
                      disabled={!hasSelection}
                    />
                  </FormField>
                </div>
                <FormField label="Contact Person">
                  <input
                    value={form.contactPerson}
                    onChange={(event) => setForm((prev) => ({ ...prev, contactPerson: event.target.value }))}
                    disabled={!hasSelection}
                  />
                </FormField>
                <FormField label="Address" required>
                  <input
                    value={form.address}
                    onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
                    required
                    disabled={!hasSelection}
                  />
                </FormField>
                <FormField label="Phone">
                  <input
                    value={form.phone}
                    onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                    disabled={!hasSelection}
                  />
                </FormField>
              </>
            ) : null}

            {resource === "area" ? (
              <>
                <FormField label="Area Code" required>
                  <input
                    value={form.code}
                    onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value }))}
                    required
                    disabled={!hasSelection}
                  />
                </FormField>
                <FormField label="Area Name" required>
                  <input
                    value={form.name}
                    onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                    required
                    disabled={!hasSelection}
                  />
                </FormField>
              </>
            ) : null}

            {resource === "salesman" ? (
              <>
                <div className="grid md:grid-cols-2 gap-4">
                  <FormField label="Salesman Code" required>
                    <input
                      value={form.code}
                      onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value }))}
                      required
                      disabled={!hasSelection}
                    />
                  </FormField>
                  <FormField label="Salesman Name" required>
                    <input
                      value={form.name}
                      onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                      required
                      disabled={!hasSelection}
                    />
                  </FormField>
                </div>
                <FormField label="Address" required>
                  <input
                    value={form.address}
                    onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
                    required
                    disabled={!hasSelection}
                  />
                </FormField>
                <div className="grid md:grid-cols-2 gap-4">
                  <FormField label="Phone 1">
                    <input
                      value={form.phone1}
                      onChange={(event) => setForm((prev) => ({ ...prev, phone1: event.target.value }))}
                      disabled={!hasSelection}
                    />
                  </FormField>
                  <FormField label="Phone 2">
                    <input
                      value={form.phone2}
                      onChange={(event) => setForm((prev) => ({ ...prev, phone2: event.target.value }))}
                      disabled={!hasSelection}
                    />
                  </FormField>
                </div>
              </>
            ) : null}

            {resource === "customer" ? (
              <>
                <div className="grid md:grid-cols-2 gap-4">
                  <FormField label="Customer Code" required>
                    <input
                      value={form.code}
                      onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value }))}
                      required
                      disabled={!hasSelection}
                    />
                  </FormField>
                  <FormField label="Customer Name" required>
                    <input
                      value={form.name}
                      onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                      required
                      disabled={!hasSelection}
                    />
                  </FormField>
                </div>
                <FormField label="Address" required>
                  <input
                    value={form.address}
                    onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
                    required
                    disabled={!hasSelection}
                  />
                </FormField>
                <div className="grid md:grid-cols-2 gap-4">
                  <FormField label="Phone 1">
                    <input
                      value={form.phone1}
                      onChange={(event) => setForm((prev) => ({ ...prev, phone1: event.target.value }))}
                      disabled={!hasSelection}
                    />
                  </FormField>
                  <FormField label="Phone 2">
                    <input
                      value={form.phone2}
                      onChange={(event) => setForm((prev) => ({ ...prev, phone2: event.target.value }))}
                      disabled={!hasSelection}
                    />
                  </FormField>
                </div>
                <SearchSelect
                  label="Area"
                  placeholder="Search area"
                  onSearch={setCustomerAreaQuery}
                  onSelect={(option) => {
                    setCustomerAreaOption(option);
                    setForm((prev) => ({ ...prev, areaId: option?.id ?? null }));
                  }}
                  value={customerAreaOption}
                  results={
                    areaLookup.data?.map((area) => ({
                      value: area.id,
                      id: area.id,
                      label: `${area.code} — ${area.name}`
                    })) ?? []
                  }
                  disabled={!hasSelection}
                />
              </>
            ) : null}

            {resource === "expense" ? (
              <>
                <FormField label="Expense Code" required>
                  <input
                    value={form.code}
                    onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value }))}
                    required
                    disabled={!hasSelection}
                  />
                </FormField>
                <FormField label="Description" required>
                  <input
                    value={form.description}
                    onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                    required
                    disabled={!hasSelection}
                  />
                </FormField>
              </>
            ) : null}

            {resource === "bank" ? (
              <>
                <div className="grid md:grid-cols-2 gap-4">
                  <FormField label="Bank Code" required>
                    <input
                      value={form.code}
                      onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value }))}
                      required
                      disabled={!hasSelection}
                    />
                  </FormField>
                  <FormField label="Account Number" required>
                    <input
                      value={form.accountNo}
                      onChange={(event) => setForm((prev) => ({ ...prev, accountNo: event.target.value }))}
                      required
                      disabled={!hasSelection}
                    />
                  </FormField>
                </div>
                <FormField label="Bank Name" required>
                  <input
                    value={form.name}
                    onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                    required
                    disabled={!hasSelection}
                  />
                </FormField>
                <FormField label="Address" required>
                  <input
                    value={form.address}
                    onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
                    required
                    disabled={!hasSelection}
                  />
                </FormField>
                <div className="grid md:grid-cols-2 gap-4">
                  <FormField label="Phone 1">
                    <input
                      value={form.phone1}
                      onChange={(event) => setForm((prev) => ({ ...prev, phone1: event.target.value }))}
                      disabled={!hasSelection}
                    />
                  </FormField>
                  <FormField label="Phone 2">
                    <input
                      value={form.phone2}
                      onChange={(event) => setForm((prev) => ({ ...prev, phone2: event.target.value }))}
                      disabled={!hasSelection}
                    />
                  </FormField>
                </div>
              </>
            ) : null}

            {resource === "item" ? (
              <>
                <div className="grid md:grid-cols-2 gap-4">
                  <FormField label="Item Code" required>
                    <input
                      value={form.code}
                      onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value }))}
                      required
                      disabled={!hasSelection}
                    />
                  </FormField>
                  <FormField label="Item Name" required>
                    <input
                      value={form.name}
                      onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                      required
                      disabled={!hasSelection}
                    />
                  </FormField>
                </div>

                <SearchSelect
                  label="Company"
                  placeholder="Search company"
                  onSearch={setItemCompanyQuery}
                  onSelect={(option) => {
                    setItemCompanyOption(option);
                    setForm((prev) => ({ ...prev, companyId: option?.id ?? null }));
                  }}
                  value={itemCompanyOption}
                  results={
                    companyLookup.data?.map((company) => ({
                      value: company.id,
                      id: company.id,
                      label: `${company.code} — ${company.name}`
                    })) ?? []
                  }
                  disabled={!hasSelection}
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
                      disabled={!hasSelection}
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
                      onChange={(event) => setForm((prev) => ({ ...prev, packSize: event.target.value }))}
                      disabled={!hasSelection || !requiresPackSize}
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
                      onChange={(event) => setForm((prev) => ({ ...prev, minQuantity: event.target.value }))}
                      required
                      disabled={!hasSelection}
                    />
                  </FormField>
                  <FormField label="Purchase Rate" required>
                    <input
                      type="number"
                      step="any"
                      value={form.purchaseRate}
                      onChange={(event) => setForm((prev) => ({ ...prev, purchaseRate: event.target.value }))}
                      required
                      disabled={!hasSelection}
                    />
                  </FormField>
                  <FormField label="Trade Rate" required>
                    <input
                      type="number"
                      step="any"
                      value={form.tradeRate}
                      onChange={(event) => setForm((prev) => ({ ...prev, tradeRate: event.target.value }))}
                      required
                      disabled={!hasSelection}
                    />
                  </FormField>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <FormField label="Retail Price">
                    <input
                      type="number"
                      step="any"
                      value={form.retailPrice}
                      onChange={(event) => setForm((prev) => ({ ...prev, retailPrice: event.target.value }))}
                      disabled={!hasSelection}
                    />
                  </FormField>
                  <FormField label="Sales Tax (%)">
                    <input
                      type="number"
                      step="any"
                      value={form.salesTax}
                      onChange={(event) => setForm((prev) => ({ ...prev, salesTax: event.target.value }))}
                      disabled={!hasSelection}
                    />
                  </FormField>
                </div>
              </>
            ) : null}

            <div className="flex items-center justify-end gap-4">
              {status ? (
                <span
                  className={`text-xs ${status.type === "error" ? "text-rose-400" : "text-emerald-400"}`}
                >
                  {status.message}
                </span>
              ) : null}
              <button type="submit" className="primary" disabled={!hasSelection || mutation.isPending}>
                {mutation.isPending ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </div>
      </SectionCard>
    </div>
  );
};

export default MasterRecordsPage;
