import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import SectionCard from "../../components/SectionCard.jsx";
import FormField from "../../components/FormField.jsx";
import SearchSelect from "../../components/SearchSelect.jsx";
import { api } from "../../api/client.js";

const DEFAULT_BASE_UNIT = "Pieces";

const makeCompanyForm = () => ({
  code: "",
  name: "",
  address: "",
  phone1: "",
  phone2: ""
});

const makeSupplierForm = () => ({
  code: "",
  name: "",
  contactPerson: "",
  address: "",
  phone: ""
});

const makeAreaForm = () => ({
  code: "",
  name: ""
});

const makeSalesmanForm = () => ({
  code: "",
  name: "",
  address: "",
  phone1: "",
  phone2: ""
});

const makeCustomerForm = () => ({
  code: "",
  name: "",
  address: "",
  phone1: "",
  phone2: "",
  areaId: null
});

const makeExpenseForm = () => ({
  code: "",
  description: ""
});

const makeBankForm = () => ({
  code: "",
  accountNo: "",
  name: "",
  address: "",
  phone1: "",
  phone2: ""
});

const makeItemForm = () => ({
  code: "",
  name: "",
  baseUnit: DEFAULT_BASE_UNIT,
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

const RegistrationPage = () => {
  const queryClient = useQueryClient();

  const [companyForm, setCompanyForm] = useState(makeCompanyForm);
  const [supplierForm, setSupplierForm] = useState(makeSupplierForm);
  const [areaForm, setAreaForm] = useState(makeAreaForm);
  const [salesmanForm, setSalesmanForm] = useState(makeSalesmanForm);
  const [customerForm, setCustomerForm] = useState(makeCustomerForm);
  const [expenseForm, setExpenseForm] = useState(makeExpenseForm);
  const [bankForm, setBankForm] = useState(makeBankForm);
  const [itemForm, setItemForm] = useState(makeItemForm);

  const [itemCompanyQuery, setItemCompanyQuery] = useState("");
  const [itemCompanyOption, setItemCompanyOption] = useState(null);
  const [customerAreaQuery, setCustomerAreaQuery] = useState("");
  const [customerAreaOption, setCustomerAreaOption] = useState(null);

  const companiesLookup = useQuery({
    queryKey: ["companies", { search: itemCompanyQuery }],
    queryFn: async () => {
      const response = await api.get("/companies", { params: { search: itemCompanyQuery } });
      return response.data;
    }
  });

  const areasLookup = useQuery({
    queryKey: ["areas", { search: customerAreaQuery }],
    queryFn: async () => {
      const response = await api.get("/areas", { params: { search: customerAreaQuery } });
      return response.data;
    }
  });

  const companyMutation = useMutation({
    mutationFn: async (payload) => {
      const response = await api.post("/companies", payload);
      return response.data;
    },
    onSuccess: () => {
      setCompanyForm(makeCompanyForm());
      queryClient.invalidateQueries({ queryKey: ["companies"] });
    }
  });

  const supplierMutation = useMutation({
    mutationFn: async (payload) => {
      const response = await api.post("/suppliers", payload);
      return response.data;
    },
    onSuccess: () => {
      setSupplierForm(makeSupplierForm());
    }
  });

  const areaMutation = useMutation({
    mutationFn: async (payload) => {
      const response = await api.post("/areas", payload);
      return response.data;
    },
    onSuccess: () => {
      setAreaForm(makeAreaForm());
      queryClient.invalidateQueries({ queryKey: ["areas"] });
    }
  });

  const salesmanMutation = useMutation({
    mutationFn: async (payload) => {
      const response = await api.post("/salesmen", payload);
      return response.data;
    },
    onSuccess: () => {
      setSalesmanForm(makeSalesmanForm());
    }
  });

  const customerMutation = useMutation({
    mutationFn: async (payload) => {
      const response = await api.post("/customers", payload);
      return response.data;
    },
    onSuccess: () => {
      setCustomerForm(makeCustomerForm());
      setCustomerAreaOption(null);
    }
  });

  const expenseMutation = useMutation({
    mutationFn: async (payload) => {
      const response = await api.post("/expenses", payload);
      return response.data;
    },
    onSuccess: () => {
      setExpenseForm(makeExpenseForm());
    }
  });

  const bankMutation = useMutation({
    mutationFn: async (payload) => {
      const response = await api.post("/banks", payload);
      return response.data;
    },
    onSuccess: () => {
      setBankForm(makeBankForm());
    }
  });

  const itemMutation = useMutation({
    mutationFn: async (payload) => {
      const response = await api.post("/items", payload);
      return response.data;
    },
    onSuccess: () => {
      setItemForm(makeItemForm());
      setItemCompanyOption(null);
      queryClient.invalidateQueries({ queryKey: ["items"] });
    }
  });

  const handleSubmitCompany = (event) => {
    event.preventDefault();
    companyMutation.mutate({
      code: companyForm.code.trim(),
      name: companyForm.name.trim(),
      address: companyForm.address.trim(),
      phone1: companyForm.phone1.trim(),
      phone2: companyForm.phone2.trim()
    });
  };

  const handleSubmitSupplier = (event) => {
    event.preventDefault();
    supplierMutation.mutate({
      code: supplierForm.code.trim(),
      name: supplierForm.name.trim(),
      contact_person: supplierForm.contactPerson.trim(),
      address: supplierForm.address.trim(),
      phone: supplierForm.phone.trim()
    });
  };

  const handleSubmitArea = (event) => {
    event.preventDefault();
    areaMutation.mutate({
      code: areaForm.code.trim(),
      name: areaForm.name.trim()
    });
  };

  const handleSubmitSalesman = (event) => {
    event.preventDefault();
    salesmanMutation.mutate({
      code: salesmanForm.code.trim(),
      name: salesmanForm.name.trim(),
      address: salesmanForm.address.trim(),
      phone1: salesmanForm.phone1.trim(),
      phone2: salesmanForm.phone2.trim()
    });
  };

  const handleSubmitCustomer = (event) => {
    event.preventDefault();
    customerMutation.mutate({
      code: customerForm.code.trim(),
      name: customerForm.name.trim(),
      address: customerForm.address.trim(),
      phone1: customerForm.phone1.trim(),
      phone2: customerForm.phone2.trim(),
      area_id: customerAreaOption?.id ?? customerForm.areaId
    });
  };

  const handleSubmitExpense = (event) => {
    event.preventDefault();
    expenseMutation.mutate({
      code: expenseForm.code.trim(),
      description: expenseForm.description.trim()
    });
  };

  const handleSubmitBank = (event) => {
    event.preventDefault();
    bankMutation.mutate({
      code: bankForm.code.trim(),
      account_no: bankForm.accountNo.trim(),
      name: bankForm.name.trim(),
      address: bankForm.address.trim(),
      phone1: bankForm.phone1.trim(),
      phone2: bankForm.phone2.trim()
    });
  };

  const handleSubmitItem = (event) => {
    event.preventDefault();
    const requiresPackSize = itemForm.baseUnit === "Pack" || itemForm.baseUnit === "Carton";
    const payload = {
      code: itemForm.code.trim(),
      name: itemForm.name.trim(),
      company_id: itemCompanyOption?.id ?? null,
      base_unit: itemForm.baseUnit,
      pack_size: requiresPackSize ? toNumberOrNull(itemForm.packSize) : null,
      min_quantity: toNumberOrNull(itemForm.minQuantity),
      purchase_rate: toNumberOrNull(itemForm.purchaseRate),
      trade_rate: toNumberOrNull(itemForm.tradeRate),
      retail_price: toNumberOrNull(itemForm.retailPrice),
      sales_tax: toNumberOrNull(itemForm.salesTax)
    };

    itemMutation.mutate(payload);
  };

  return (
    <div className="space-y-6">
      <SectionCard
        title="Company Registration"
        description="Maintain manufacturer details used across the system."
      >
        <form className="grid gap-4" onSubmit={handleSubmitCompany}>
          <div className="grid md:grid-cols-2 gap-4">
            <FormField label="Company Code" required>
              <input
                value={companyForm.code}
                onChange={(event) =>
                  setCompanyForm((prev) => ({ ...prev, code: event.target.value }))
                }
                required
              />
            </FormField>
            <FormField label="Company Name" required>
              <input
                value={companyForm.name}
                onChange={(event) =>
                  setCompanyForm((prev) => ({ ...prev, name: event.target.value }))
                }
                required
              />
            </FormField>
          </div>
          <FormField label="Address" required>
            <input
              value={companyForm.address}
              onChange={(event) =>
                setCompanyForm((prev) => ({ ...prev, address: event.target.value }))
              }
              required
            />
          </FormField>
          <div className="grid md:grid-cols-2 gap-4">
            <FormField label="Phone 1">
              <input
                value={companyForm.phone1}
                onChange={(event) =>
                  setCompanyForm((prev) => ({ ...prev, phone1: event.target.value }))
                }
              />
            </FormField>
            <FormField label="Phone 2">
              <input
                value={companyForm.phone2}
                onChange={(event) =>
                  setCompanyForm((prev) => ({ ...prev, phone2: event.target.value }))
                }
              />
            </FormField>
          </div>
          <div className="flex items-center gap-4 justify-end">
            {companyMutation.isError ? (
              <span className="text-xs text-rose-400">{companyMutation.error.message}</span>
            ) : null}
            {companyMutation.isSuccess ? (
              <span className="text-xs text-emerald-400">Company saved.</span>
            ) : null}
            <button type="submit" className="primary">
              {companyMutation.isPending ? "Saving..." : "Save Company"}
            </button>
          </div>
        </form>
      </SectionCard>
      <SectionCard
        title="Supplier Registration"
        description="Capture supplier contacts for purchases."
      >
        <form className="grid gap-4" onSubmit={handleSubmitSupplier}>
          <div className="grid md:grid-cols-2 gap-4">
            <FormField label="Supplier Code" required>
              <input
                value={supplierForm.code}
                onChange={(event) =>
                  setSupplierForm((prev) => ({ ...prev, code: event.target.value }))
                }
                required
              />
            </FormField>
            <FormField label="Supplier Name" required>
              <input
                value={supplierForm.name}
                onChange={(event) =>
                  setSupplierForm((prev) => ({ ...prev, name: event.target.value }))
                }
                required
              />
            </FormField>
          </div>
          <FormField label="Contact Person">
            <input
              value={supplierForm.contactPerson}
              onChange={(event) =>
                setSupplierForm((prev) => ({ ...prev, contactPerson: event.target.value }))
              }
            />
          </FormField>
          <FormField label="Address" required>
            <input
              value={supplierForm.address}
              onChange={(event) =>
                setSupplierForm((prev) => ({ ...prev, address: event.target.value }))
              }
              required
            />
          </FormField>
          <FormField label="Phone">
            <input
              value={supplierForm.phone}
              onChange={(event) =>
                setSupplierForm((prev) => ({ ...prev, phone: event.target.value }))
              }
            />
          </FormField>
          <div className="flex items-center gap-4 justify-end">
            {supplierMutation.isError ? (
              <span className="text-xs text-rose-400">{supplierMutation.error.message}</span>
            ) : null}
            {supplierMutation.isSuccess ? (
              <span className="text-xs text-emerald-400">Supplier saved.</span>
            ) : null}
            <button type="submit" className="primary">
              {supplierMutation.isPending ? "Saving..." : "Save Supplier"}
            </button>
          </div>
        </form>
      </SectionCard>

      <SectionCard
        title="Area Registration"
        description="Define sales areas for customer grouping."
      >
        <form className="grid gap-4" onSubmit={handleSubmitArea}>
          <div className="grid md:grid-cols-2 gap-4">
            <FormField label="Area Code" required>
              <input
                value={areaForm.code}
                onChange={(event) =>
                  setAreaForm((prev) => ({ ...prev, code: event.target.value }))
                }
                required
              />
            </FormField>
            <FormField label="Area Name" required>
              <input
                value={areaForm.name}
                onChange={(event) =>
                  setAreaForm((prev) => ({ ...prev, name: event.target.value }))
                }
                required
              />
            </FormField>
          </div>
          <div className="flex items-center gap-4 justify-end">
            {areaMutation.isError ? (
              <span className="text-xs text-rose-400">{areaMutation.error.message}</span>
            ) : null}
            {areaMutation.isSuccess ? (
              <span className="text-xs text-emerald-400">Area saved.</span>
            ) : null}
            <button type="submit" className="primary">
              {areaMutation.isPending ? "Saving..." : "Save Area"}
            </button>
          </div>
        </form>
      </SectionCard>

      <SectionCard
        title="Salesman Registration"
        description="Record sales representatives with contact information."
      >
        <form className="grid gap-4" onSubmit={handleSubmitSalesman}>
          <div className="grid md:grid-cols-2 gap-4">
            <FormField label="Salesman Code" required>
              <input
                value={salesmanForm.code}
                onChange={(event) =>
                  setSalesmanForm((prev) => ({ ...prev, code: event.target.value }))
                }
                required
              />
            </FormField>
            <FormField label="Salesman Name" required>
              <input
                value={salesmanForm.name}
                onChange={(event) =>
                  setSalesmanForm((prev) => ({ ...prev, name: event.target.value }))
                }
                required
              />
            </FormField>
          </div>
          <FormField label="Address" required>
            <input
              value={salesmanForm.address}
              onChange={(event) =>
                setSalesmanForm((prev) => ({ ...prev, address: event.target.value }))
              }
              required
            />
          </FormField>
          <div className="grid md:grid-cols-2 gap-4">
            <FormField label="Phone 1">
              <input
                value={salesmanForm.phone1}
                onChange={(event) =>
                  setSalesmanForm((prev) => ({ ...prev, phone1: event.target.value }))
                }
              />
            </FormField>
            <FormField label="Phone 2">
              <input
                value={salesmanForm.phone2}
                onChange={(event) =>
                  setSalesmanForm((prev) => ({ ...prev, phone2: event.target.value }))
                }
              />
            </FormField>
          </div>
          <div className="flex items-center gap-4 justify-end">
            {salesmanMutation.isError ? (
              <span className="text-xs text-rose-400">{salesmanMutation.error.message}</span>
            ) : null}
            {salesmanMutation.isSuccess ? (
              <span className="text-xs text-emerald-400">Salesman saved.</span>
            ) : null}
            <button type="submit" className="primary">
              {salesmanMutation.isPending ? "Saving..." : "Save Salesman"}
            </button>
          </div>
        </form>
      </SectionCard>

      <SectionCard
        title="Customer Registration"
        description="Store customer profiles and assign sales areas."
      >
        <form className="grid gap-4" onSubmit={handleSubmitCustomer}>
          <div className="grid md:grid-cols-2 gap-4">
            <FormField label="Customer Code" required>
              <input
                value={customerForm.code}
                onChange={(event) =>
                  setCustomerForm((prev) => ({ ...prev, code: event.target.value }))
                }
                required
              />
            </FormField>
            <FormField label="Customer Name" required>
              <input
                value={customerForm.name}
                onChange={(event) =>
                  setCustomerForm((prev) => ({ ...prev, name: event.target.value }))
                }
                required
              />
            </FormField>
          </div>
          <FormField label="Address" required>
            <input
              value={customerForm.address}
              onChange={(event) =>
                setCustomerForm((prev) => ({ ...prev, address: event.target.value }))
              }
              required
            />
          </FormField>
          <SearchSelect
            label="Sales Area"
            placeholder="Search area"
            onSearch={setCustomerAreaQuery}
            onSelect={(option) => {
              setCustomerAreaOption(option);
              setCustomerForm((prev) => ({ ...prev, areaId: option.id }));
            }}
            value={customerAreaOption}
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
                value={customerForm.phone1}
                onChange={(event) =>
                  setCustomerForm((prev) => ({ ...prev, phone1: event.target.value }))
                }
              />
            </FormField>
            <FormField label="Phone 2">
              <input
                value={customerForm.phone2}
                onChange={(event) =>
                  setCustomerForm((prev) => ({ ...prev, phone2: event.target.value }))
                }
              />
            </FormField>
          </div>
          <div className="flex items-center gap-4 justify-end">
            {customerMutation.isError ? (
              <span className="text-xs text-rose-400">{customerMutation.error.message}</span>
            ) : null}
            {customerMutation.isSuccess ? (
              <span className="text-xs text-emerald-400">Customer saved.</span>
            ) : null}
            <button type="submit" className="primary">
              {customerMutation.isPending ? "Saving..." : "Save Customer"}
            </button>
          </div>
        </form>
      </SectionCard>

      <SectionCard
        title="Expense Definition"
        description="Maintain expense heads for voucher entry."
      >
        <form className="grid gap-4" onSubmit={handleSubmitExpense}>
          <div className="grid md:grid-cols-2 gap-4">
            <FormField label="Expense Code" required>
              <input
                value={expenseForm.code}
                onChange={(event) =>
                  setExpenseForm((prev) => ({ ...prev, code: event.target.value }))
                }
                required
              />
            </FormField>
            <FormField label="Description" required>
              <input
                value={expenseForm.description}
                onChange={(event) =>
                  setExpenseForm((prev) => ({ ...prev, description: event.target.value }))
                }
                required
              />
            </FormField>
          </div>
          <div className="flex items-center gap-4 justify-end">
            {expenseMutation.isError ? (
              <span className="text-xs text-rose-400">{expenseMutation.error.message}</span>
            ) : null}
            {expenseMutation.isSuccess ? (
              <span className="text-xs text-emerald-400">Expense saved.</span>
            ) : null}
            <button type="submit" className="primary">
              {expenseMutation.isPending ? "Saving..." : "Save Expense"}
            </button>
          </div>
        </form>
      </SectionCard>

      <SectionCard
        title="Bank Registration"
        description="Register bank accounts for payment tracking."
      >
        <form className="grid gap-4" onSubmit={handleSubmitBank}>
          <div className="grid md:grid-cols-2 gap-4">
            <FormField label="Bank Code" required>
              <input
                value={bankForm.code}
                onChange={(event) =>
                  setBankForm((prev) => ({ ...prev, code: event.target.value }))
                }
                required
              />
            </FormField>
            <FormField label="Account Number" required>
              <input
                value={bankForm.accountNo}
                onChange={(event) =>
                  setBankForm((prev) => ({ ...prev, accountNo: event.target.value }))
                }
                required
              />
            </FormField>
          </div>
          <FormField label="Bank Name" required>
            <input
              value={bankForm.name}
              onChange={(event) =>
                setBankForm((prev) => ({ ...prev, name: event.target.value }))
              }
              required
            />
          </FormField>
          <FormField label="Address" required>
            <input
              value={bankForm.address}
              onChange={(event) =>
                setBankForm((prev) => ({ ...prev, address: event.target.value }))
              }
              required
            />
          </FormField>
          <div className="grid md:grid-cols-2 gap-4">
            <FormField label="Phone 1">
              <input
                value={bankForm.phone1}
                onChange={(event) =>
                  setBankForm((prev) => ({ ...prev, phone1: event.target.value }))
                }
              />
            </FormField>
            <FormField label="Phone 2">
              <input
                value={bankForm.phone2}
                onChange={(event) =>
                  setBankForm((prev) => ({ ...prev, phone2: event.target.value }))
                }
              />
            </FormField>
          </div>
          <div className="flex items-center gap-4 justify-end">
            {bankMutation.isError ? (
              <span className="text-xs text-rose-400">{bankMutation.error.message}</span>
            ) : null}
            {bankMutation.isSuccess ? (
              <span className="text-xs text-emerald-400">Bank saved.</span>
            ) : null}
            <button type="submit" className="primary">
              {bankMutation.isPending ? "Saving..." : "Save Bank"}
            </button>
          </div>
        </form>
      </SectionCard>

      <SectionCard
        title="Item Registration"
        description="Manage inventory items with company linkage and pricing."
      >
        <form className="grid gap-4" onSubmit={handleSubmitItem}>
          <div className="grid md:grid-cols-2 gap-4">
            <FormField label="Item Code" required>
              <input
                value={itemForm.code}
                onChange={(event) =>
                  setItemForm((prev) => ({ ...prev, code: event.target.value }))
                }
                required
              />
            </FormField>
            <FormField label="Item Name" required>
              <input
                value={itemForm.name}
                onChange={(event) =>
                  setItemForm((prev) => ({ ...prev, name: event.target.value }))
                }
                required
              />
            </FormField>
          </div>
          <SearchSelect
            label="Company"
            placeholder="Search company"
            onSearch={setItemCompanyQuery}
            onSelect={(option) => {
              setItemCompanyOption(option);
            }}
            value={itemCompanyOption}
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
                value={itemForm.baseUnit}
                onChange={(event) => {
                  const nextUnit = event.target.value;
                  setItemForm((prev) => ({
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
                value={itemForm.packSize}
                onChange={(event) =>
                  setItemForm((prev) => ({ ...prev, packSize: event.target.value }))
                }
                disabled={itemForm.baseUnit !== "Pack" && itemForm.baseUnit !== "Carton"}
                required={itemForm.baseUnit === "Pack" || itemForm.baseUnit === "Carton"}
              />
            </FormField>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <FormField label="Minimum Quantity" required>
              <input
                type="number"
                step="any"
                value={itemForm.minQuantity}
                onChange={(event) =>
                  setItemForm((prev) => ({ ...prev, minQuantity: event.target.value }))
                }
                required
              />
            </FormField>
            <FormField label="Purchase Rate" required>
              <input
                type="number"
                step="any"
                value={itemForm.purchaseRate}
                onChange={(event) =>
                  setItemForm((prev) => ({ ...prev, purchaseRate: event.target.value }))
                }
                required
              />
            </FormField>
            <FormField label="Trade Rate" required>
              <input
                type="number"
                step="any"
                value={itemForm.tradeRate}
                onChange={(event) =>
                  setItemForm((prev) => ({ ...prev, tradeRate: event.target.value }))
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
                value={itemForm.retailPrice}
                onChange={(event) =>
                  setItemForm((prev) => ({ ...prev, retailPrice: event.target.value }))
                }
              />
            </FormField>
            <FormField label="Sales Tax (%)">
              <input
                type="number"
                step="any"
                value={itemForm.salesTax}
                onChange={(event) =>
                  setItemForm((prev) => ({ ...prev, salesTax: event.target.value }))
                }
              />
            </FormField>
          </div>
          <div className="flex items-center gap-4 justify-end">
            {itemMutation.isError ? (
              <span className="text-xs text-rose-400">{itemMutation.error.message}</span>
            ) : null}
            {itemMutation.isSuccess ? (
              <span className="text-xs text-emerald-400">Item saved.</span>
            ) : null}
            <button type="submit" className="primary">
              {itemMutation.isPending ? "Saving..." : "Save Item"}
            </button>
          </div>
        </form>
      </SectionCard>
    </div>
  );
};

export default RegistrationPage;
