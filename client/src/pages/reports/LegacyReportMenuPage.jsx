import { useEffect, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import { useQuery } from "@tanstack/react-query";
import SectionCard from "../../components/SectionCard.jsx";
import FormField from "../../components/FormField.jsx";
import SearchSelect from "../../components/SearchSelect.jsx";
import { api } from "../../api/client.js";

const formatCurrency = (value) =>
  `Rs ${Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const formatNumber = (value) =>
  Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

const legacyReports = [
  "Customer Wise Sales Summary",
  "Days Wise Sales Summary",
  "Salesman Wise Sales Summary",
  "Area Wise Sales Summary",
  "Date Wise Cash/Credit Sales",
  "Item Wise Sales Detail",
  "Item + Customer Wise Sales",
  "Area + Company Wise Sales Summary",
  "Company Wise Items Summary",
  "Date Wise Sales Detail",
  "Customer Wise Sales Invoices",
  "Company Wise Statement (T.P.)",
  "Salesman Wise Items Summary",
  "Date Wise Items Summary",
  "Date Wise Items Damage Out",
  "Date Wise Items Damage In",
  "Company Wise Entire Areas",
  "Company Wise Stock Statement",
  "Company + Percentage Wise Detail",
  "Company Wise Discounted Report",
  "Special Discount Report",
  "Company Wise Town Statement",
  "Date Wise Stock Statement",
  "Company + Customer Wise Summary",
  "Company + Customer Wise Detail",
  "Customer Wise Sales Detail",
  "Company Wise 2nd Discount Detail",
  "Entire Sales Statuss"
];

const entireSalesStatusOptions = [
  { value: "salesman-wise", label: "Entire Salesman Wise Sales Summary" },
  { value: "area-wise", label: "Entire Area Wise Sales Summary" },
  { value: "day-wise", label: "Day Wise Sales Summary" },
  { value: "customer-wise", label: "Entire Customer Wise Sales Summary" }
];

const LegacyReportMenuPage = () => {
  const [selectedReport, setSelectedReport] = useState(null);
  const [search, setSearch] = useState("");
  const [companySearch, setCompanySearch] = useState("");
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [salesmanSearch, setSalesmanSearch] = useState("");
  const [selectedSalesman, setSelectedSalesman] = useState(null);
  const [areaSearch, setAreaSearch] = useState("");
  const [selectedArea, setSelectedArea] = useState(null);
  const [itemSearch, setItemSearch] = useState("");
  const [selectedItem, setSelectedItem] = useState(null);
  const [comboCustomerSearch, setComboCustomerSearch] = useState("");
  const [comboSelectedCustomer, setComboSelectedCustomer] = useState(null);
  const [entireSalesStatusSearch, setEntireSalesStatusSearch] = useState("");
  const [entireSalesStatusSelection, setEntireSalesStatusSelection] = useState(null);
  const [cashCreditDateRange, setCashCreditDateRange] = useState(() => ({
    start: dayjs().startOf("month").format("DD-MM-YYYY"),
    end: dayjs().format("DD-MM-YYYY")
  }));
  const [dateRange, setDateRange] = useState(() => ({
    start: dayjs().startOf("month").format("DD-MM-YYYY"),
    end: dayjs().format("DD-MM-YYYY")
  }));

  const reportPrintStyles = `
    <style>
      @page { size: A4 portrait; margin: 16mm 14mm 18mm 14mm; }
      html, body { width: 210mm; min-height: 297mm; }
      * { box-sizing: border-box; }
      body { font-family: Arial, sans-serif; margin: 0; padding: 18px; color: #0f172a; }
      h1 { font-size: 20px; margin-bottom: 12px; text-align: center; }
      p { margin: 4px 0; font-size: 12px; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
      th, td { border: 1px solid #cbd5f5; padding: 6px 8px; text-align: left; }
      th { background: #e2e8f0; text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em; }
      tfoot td { font-weight: 600; background: #f1f5f9; }
    </style>
  `;

  const landscapeReportPrintStyles = `
    <style>
      @page { size: A4 landscape; margin: 12mm 16mm 16mm 16mm; }
      html, body { width: 297mm; min-height: 210mm; }
      * { box-sizing: border-box; }
      body { font-family: "Courier New", Courier, monospace; margin: 0; padding: 16px; color: #0f172a; }
      h1 { font-size: 18px; letter-spacing: 0.08em; margin-bottom: 10px; text-align: center; text-transform: uppercase; }
      p { margin: 4px 0; font-size: 11px; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 10px; }
      th, td { border: 1px solid #1e293b; padding: 4px 6px; text-align: center; }
      th { background: #e2e8f0; font-weight: 600; letter-spacing: 0.06em; }
      td:first-child, th:first-child { text-align: left; }
      tfoot td { font-weight: 700; background: #f1f5f9; }
    </style>
  `;

  const handlePrint = (ref, title, options = {}) => {
    if (!ref?.current) return;

    const contentClone = ref.current.cloneNode(true);
    if (!contentClone) return;

    const printWindow = window.open("", "_blank", "width=1024,height=768");
    if (!printWindow) return;

    const { document: printDocument } = printWindow;

    const styles = options.orientation === "landscape" ? landscapeReportPrintStyles : reportPrintStyles;

    printDocument.open();
    printDocument.write(
      `<!doctype html><html><head><meta charset="utf-8" /><title>${title}</title>${styles}</head><body><div id="print-root"></div></body></html>`
    );
    printDocument.close();

    const mountContent = () => {
      const printRoot = printDocument.getElementById("print-root");
      if (!printRoot) return;

      const titleHeading = printDocument.createElement("h1");
      titleHeading.textContent = title;
      printRoot.appendChild(titleHeading);

      printRoot.appendChild(contentClone);

      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
      }, 80);
    };

    if (printDocument.readyState === "complete") {
      mountContent();
    } else {
      printWindow.addEventListener("load", mountContent, { once: true });
    }
  };

  const customerReportRef = useRef(null);
  const dayReportRef = useRef(null);
  const salesmanReportRef = useRef(null);
  const salesmanItemsReportRef = useRef(null);
  const areaReportRef = useRef(null);
  const companyAreaReportRef = useRef(null);
  const cashCreditReportRef = useRef(null);
  const itemReportRef = useRef(null);
  const itemCustomerReportRef = useRef(null);
  const companyStatementReportRef = useRef(null);
  const entireSalesStatusReportRef = useRef(null);

  const printButtonClass =
    "inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:border-emerald-200 hover:text-emerald-600 hover:ring-2 hover:ring-emerald-100";

  const filteredReports = useMemo(() => {
    const term = search.trim().toLowerCase();
    return legacyReports
      .filter((report) => (term ? report.toLowerCase().includes(term) : true))
      .map((report, idx) => ({ value: `${idx}`, label: report }));
  }, [search]);

  const filteredEntireSalesStatusOptions = useMemo(() => {
    const term = entireSalesStatusSearch.trim().toLowerCase();
    return entireSalesStatusOptions.filter((option) =>
      term ? option.label.toLowerCase().includes(term) : true
    );
  }, [entireSalesStatusSearch]);

  const isCustomerWiseReport = useMemo(() => {
    if (!selectedReport?.label) return false;
    const normalized = selectedReport.label.toLowerCase();
    return normalized.startsWith("customer wise");
  }, [selectedReport]);

  const isDayWiseSalesReport = useMemo(() => {
    if (!selectedReport?.label) return false;
    const normalized = selectedReport.label.toLowerCase();
    return normalized.includes("days wise sales") || normalized.includes("day wise sales");
  }, [selectedReport]);

  const isSalesmanWiseReport = useMemo(() => {
    if (!selectedReport?.label) return false;
    const normalized = selectedReport.label.toLowerCase();
    return normalized.includes("salesman wise sales summary");
  }, [selectedReport]);

  const isSalesmanItemsReport = useMemo(() => {
    if (!selectedReport?.label) return false;
    const normalized = selectedReport.label.toLowerCase();
    return normalized.includes("salesman wise items summary");
  }, [selectedReport]);

  const isAreaWiseReport = useMemo(() => {
    if (!selectedReport?.label) return false;
    const normalized = selectedReport.label.toLowerCase();
    return normalized.includes("area wise sales summary");
  }, [selectedReport]);

  const isAreaCompanyReport = useMemo(() => {
    if (!selectedReport?.label) return false;
    const normalized = selectedReport.label.toLowerCase();
    return normalized.includes("company + area wise") || normalized.includes("area + company wise");
  }, [selectedReport]);

  const isDateWiseCashCreditReport = useMemo(() => {
    if (!selectedReport?.label) return false;
    const normalized = selectedReport.label.toLowerCase();
    return normalized.includes("date wise cash/credit sales");
  }, [selectedReport]);

  const isItemWiseSalesReport = useMemo(() => {
    if (!selectedReport?.label) return false;
    const normalized = selectedReport.label.toLowerCase();
    return normalized.includes("item wise sales detail");
  }, [selectedReport]);

  const isItemCustomerWiseReport = useMemo(() => {
    if (!selectedReport?.label) return false;
    const normalized = selectedReport.label.toLowerCase();
    return normalized.includes("item + customer wise sales");
  }, [selectedReport]);

  const isCompanyStatementReport = useMemo(() => {
    if (!selectedReport?.label) return false;
    const normalized = selectedReport.label.toLowerCase();
    return normalized.includes("company wise statement") && normalized.includes("t.p");
  }, [selectedReport]);

  const isEntireSalesStatusReport = useMemo(() => {
    if (!selectedReport?.label) return false;
    const normalized = selectedReport.label.toLowerCase();
    return normalized.includes("entire sales statuss");
  }, [selectedReport]);

  const requiresDateRange =
    isCustomerWiseReport ||
    isDayWiseSalesReport ||
    isSalesmanWiseReport ||
    isSalesmanItemsReport ||
    isAreaWiseReport ||
    isAreaCompanyReport ||
    isDateWiseCashCreditReport ||
    isItemWiseSalesReport ||
    isItemCustomerWiseReport ||
    isCompanyStatementReport ||
    isEntireSalesStatusReport;

  useEffect(() => {
    if (!isCustomerWiseReport) {
      setCustomerSearch("");
      setSelectedCustomer(null);
    }
  }, [isCustomerWiseReport]);

  useEffect(() => {
    if (!isSalesmanWiseReport && !isSalesmanItemsReport && !isEntireSalesStatusReport) {
      setSalesmanSearch("");
      setSelectedSalesman(null);
    }
  }, [isSalesmanWiseReport, isSalesmanItemsReport, isEntireSalesStatusReport]);

  useEffect(() => {
    if (!isAreaWiseReport && !isAreaCompanyReport) {
      setAreaSearch("");
      setSelectedArea(null);
    }
  }, [isAreaWiseReport, isAreaCompanyReport]);

  useEffect(() => {
    if (!isDateWiseCashCreditReport) {
      setCashCreditDateRange({
        start: dayjs().startOf("month").format("DD-MM-YYYY"),
        end: dayjs().format("DD-MM-YYYY")
      });
    }
  }, [isDateWiseCashCreditReport]);

  useEffect(() => {
    if (!isItemWiseSalesReport && !isItemCustomerWiseReport) {
      setItemSearch("");
      setSelectedItem(null);
    }
  }, [isItemWiseSalesReport, isItemCustomerWiseReport]);

  useEffect(() => {
    if (!isItemCustomerWiseReport) {
      setItemSearch("");
      setSelectedItem(null);
      setComboCustomerSearch("");
      setComboSelectedCustomer(null);
    }
  }, [isItemCustomerWiseReport]);

  useEffect(() => {
    if (!isCompanyStatementReport) {
      setCompanySearch("");
      setSelectedCompany(null);
    }
  }, [isCompanyStatementReport]);

  useEffect(() => {
    if (!isEntireSalesStatusReport) {
      setEntireSalesStatusSearch("");
      setEntireSalesStatusSelection(null);
    }
  }, [isEntireSalesStatusReport]);

  const customerDirectory = useQuery({
    queryKey: ["legacy-report-customers", customerSearch],
    enabled: isCustomerWiseReport,
    queryFn: async () => {
      const response = await api.get("/customers", {
        params: {
          search: customerSearch || undefined,
          limit: 25,
          offset: 0
        }
      });
      const data = Array.isArray(response.data) ? response.data : [];
      return data.map((customer) => ({
        value: customer.code,
        label: customer.name ? `${customer.code} — ${customer.name}` : customer.code
      }));
    }
  });

  const companyDirectory = useQuery({
    queryKey: ["legacy-report-companies", companySearch],
    enabled: isCompanyStatementReport,
    queryFn: async () => {
      const response = await api.get("/companies", {
        params: {
          search: companySearch || undefined,
          limit: 50,
          offset: 0
        }
      });
      const data = Array.isArray(response.data) ? response.data : [];
      return data.map((company) => ({
        value: company.code,
        label: company.name ? `${company.code} — ${company.name}` : company.code
      }));
    }
  });

  const hasValidRange = Boolean(dateRange.start && dateRange.end);
  const cashCreditHasValidRange = Boolean(cashCreditDateRange.start && cashCreditDateRange.end);

  const customerSalesReport = useQuery({
    queryKey: [
      "legacy-customer-sales-report",
      isCustomerWiseReport ? selectedCustomer?.value : null,
      isCustomerWiseReport ? dateRange.start : null,
      isCustomerWiseReport ? dateRange.end : null
    ],
    enabled: Boolean(isCustomerWiseReport && selectedCustomer?.value && hasValidRange),
    queryFn: async () => {
      const response = await api.get("/reports/receivables/customer-ledger", {
        params: {
          startDate: dateRange.start,
          endDate: dateRange.end,
          customerCode: selectedCustomer.value,
          mode: "detail"
        }
      });
      return response.data;
    }
  });

  const invoiceSummary = useMemo(() => {
    if (!customerSalesReport.data?.invoices) return [];
    const matching = customerSalesReport.data.invoices.find(
      (entry) => entry.customerCode === selectedCustomer?.value
    );
    return matching?.invoices ?? [];
  }, [customerSalesReport.data, selectedCustomer?.value]);

  const invoiceTotals = useMemo(() => {
    if (invoiceSummary.length === 0) return { amount: 0, paid: 0, outstanding: 0 };
    return invoiceSummary.reduce(
      (totals, invoice) => {
        totals.amount += Number(invoice.amount ?? 0);
        totals.paid += Number(invoice.amountPaid ?? 0);
        totals.outstanding += Number(invoice.outstanding ?? 0);
        return totals;
      },
      { amount: 0, paid: 0, outstanding: 0 }
    );
  }, [invoiceSummary]);

  const dayWiseSalesReport = useQuery({
    queryKey: [
      "legacy-daywise-sales-report",
      isDayWiseSalesReport ? dateRange.start : null,
      isDayWiseSalesReport ? dateRange.end : null
    ],
    enabled: Boolean(isDayWiseSalesReport && hasValidRange),
    queryFn: async () => {
      const response = await api.get("/reports/sales/day-summary", {
        params: {
          startDate: dateRange.start,
          endDate: dateRange.end
        }
      });
      return response.data;
    }
  });

  const dayWiseRows = dayWiseSalesReport.data?.rows ?? [];
  const dayWiseTotals = dayWiseSalesReport.data?.totals ?? {
    totalAmount: 0,
    totalPaid: 0,
    outstanding: 0,
    invoiceCount: 0
  };

  const salesmanDirectory = useQuery({
    queryKey: ["legacy-report-salesmen", salesmanSearch],
    enabled: isSalesmanWiseReport || isSalesmanItemsReport || isEntireSalesStatusReport,
    queryFn: async () => {
      const response = await api.get("/salesmen", {
        params: {
          search: salesmanSearch || undefined,
          limit: 50,
          offset: 0
        }
      });
      const data = Array.isArray(response.data) ? response.data : [];
      return data.map((salesman) => ({
        value: salesman.code,
        label: salesman.name ? `${salesman.code} — ${salesman.name}` : salesman.code
      }));
    }
  });

  const salesmanSalesReport = useQuery({
    queryKey: [
      "legacy-salesman-sales-report",
      isSalesmanWiseReport ? selectedSalesman?.value : null,
      isSalesmanWiseReport ? dateRange.start : null,
      isSalesmanWiseReport ? dateRange.end : null
    ],
    enabled: Boolean(isSalesmanWiseReport && selectedSalesman?.value && hasValidRange),
    queryFn: async () => {
      const response = await api.get("/reports/sales/salesman-summary", {
        params: {
          salesmanCode: selectedSalesman.value,
          startDate: dateRange.start,
          endDate: dateRange.end
        }
      });
      return response.data;
    }
  });

  const salesmanRows = salesmanSalesReport.data?.rows ?? [];
  const salesmanTotals = salesmanSalesReport.data?.totals ?? {
    totalAmount: 0,
    amountPaid: 0,
    outstanding: 0,
    taxAmount: 0,
    count: 0
  };
  const salesmanReportMeta = salesmanSalesReport.data ?? null;

  const salesmanItemsReport = useQuery({
    queryKey: [
      "legacy-salesman-items-report",
      isSalesmanItemsReport ? selectedSalesman?.value : null,
      isSalesmanItemsReport ? dateRange.start : null,
      isSalesmanItemsReport ? dateRange.end : null
    ],
    enabled: Boolean(isSalesmanItemsReport && selectedSalesman?.value && hasValidRange),
    queryFn: async () => {
      const response = await api.get("/reports/sales/salesman-items-summary", {
        params: {
          salesmanCode: selectedSalesman.value,
          startDate: dateRange.start,
          endDate: dateRange.end
        }
      });
      return response.data;
    }
  });

  const salesmanItemRows = salesmanItemsReport.data?.rows ?? [];
  const salesmanItemTotals = salesmanItemsReport.data?.totals ?? {
    totalUnits: 0,
    totalAmount: 0,
    itemCount: 0
  };
  const salesmanItemsMeta = salesmanItemsReport.data ?? null;
  const salesmanItemsHasData = salesmanItemRows.length > 0;

  const entireSalesStatusReport = useQuery({
    queryKey: [
      "legacy-entire-sales-status-report",
      isEntireSalesStatusReport ? entireSalesStatusSelection?.value : null,
      isEntireSalesStatusReport ? dateRange.start : null,
      isEntireSalesStatusReport ? dateRange.end : null
    ],
    enabled: Boolean(isEntireSalesStatusReport && entireSalesStatusSelection?.value && hasValidRange),
    queryFn: async () => {
      const response = await api.get("/reports/sales/entire-status", {
        params: {
          type: entireSalesStatusSelection.value,
          startDate: dateRange.start,
          endDate: dateRange.end
        }
      });
      return response.data;
    }
  });

  const entireStatusRows = entireSalesStatusReport.data?.rows ?? [];
  const entireStatusTotals = entireSalesStatusReport.data?.totals ?? {
    totalAmount: 0,
    taxAmount: 0,
    count: 0
  };
  const entireStatusMeta = entireSalesStatusReport.data ?? null;
  const entireStatusHasData = entireStatusRows.length > 0;

  const areaDirectory = useQuery({
    queryKey: ["legacy-report-areas", areaSearch],
    enabled: isAreaWiseReport || isAreaCompanyReport,
    queryFn: async () => {
      const response = await api.get("/areas", {
        params: {
          search: areaSearch || undefined,
          limit: 50,
          offset: 0
        }
      });
      const data = Array.isArray(response.data) ? response.data : [];
      return data.map((area) => ({
        value: area.code,
        label: area.name ? `${area.code} — ${area.name}` : area.code
      }));
    }
  });

  const areaSalesReport = useQuery({
    queryKey: [
      "legacy-area-sales-report",
      isAreaWiseReport ? selectedArea?.value : null,
      isAreaWiseReport ? dateRange.start : null,
      isAreaWiseReport ? dateRange.end : null
    ],
    enabled: Boolean(isAreaWiseReport && selectedArea?.value && hasValidRange),
    queryFn: async () => {
      const response = await api.get("/reports/sales/area-summary", {
        params: {
          areaCode: selectedArea.value,
          startDate: dateRange.start,
          endDate: dateRange.end
        }
      });
      return response.data;
    }
  });

  const areaRows = areaSalesReport.data?.rows ?? [];
  const areaTotals = areaSalesReport.data?.totals ?? {
    totalAmount: 0,
    count: 0
  };

  const areaCompanyReport = useQuery({
    queryKey: [
      "legacy-company-area-sales-report",
      isAreaCompanyReport ? selectedArea?.value : null,
      isAreaCompanyReport ? dateRange.start : null,
      isAreaCompanyReport ? dateRange.end : null
    ],
    enabled: Boolean(isAreaCompanyReport && selectedArea?.value && hasValidRange),
    queryFn: async () => {
      const response = await api.get("/reports/sales/company-area-summary", {
        params: {
          areaCode: selectedArea.value,
          startDate: dateRange.start,
          endDate: dateRange.end
        }
      });
      return response.data;
    }
  });

  const areaCompanyGroups = areaCompanyReport.data?.companies ?? [];
  const areaCompanyTotals = areaCompanyReport.data?.totals ?? {
    quantity: 0,
    amount: 0,
    companyCount: 0,
    itemCount: 0
  };
  const areaCompanyMeta = areaCompanyReport.data ?? null;
  const areaCompanyFlatRows = useMemo(() => {
    if (!Array.isArray(areaCompanyGroups)) return [];
    const rows = [];
    areaCompanyGroups.forEach((group) => {
      const items = Array.isArray(group?.items) ? group.items : [];
      items.forEach((item) => {
        rows.push({ company: group.company, item });
      });
    });
    return rows;
  }, [areaCompanyGroups]);
  const areaCompanyHasData = areaCompanyFlatRows.length > 0;

  const dateWiseCashCreditReport = useQuery({
    queryKey: [
      "legacy-date-cash-credit-report",
      isDateWiseCashCreditReport ? cashCreditDateRange.start : null,
      isDateWiseCashCreditReport ? cashCreditDateRange.end : null
    ],
    enabled: Boolean(isDateWiseCashCreditReport && cashCreditHasValidRange),
    queryFn: async () => {
      const response = await api.get("/reports/sales/date-cash-credit", {
        params: {
          startDate: cashCreditDateRange.start,
          endDate: cashCreditDateRange.end
        }
      });
      return response.data;
    }
  });

  const cashCreditRows = dateWiseCashCreditReport.data?.rows ?? [];
  const cashCreditTotals = dateWiseCashCreditReport.data?.totals ?? {
    cash: 0,
    credit: 0,
    total: 0,
    count: 0
  };

  const itemDirectory = useQuery({
    queryKey: ["legacy-report-items", itemSearch],
    enabled: isItemWiseSalesReport || isItemCustomerWiseReport,
    queryFn: async () => {
      const response = await api.get("/items", {
        params: {
          search: itemSearch || undefined,
          limit: 50,
          offset: 0
        }
      });
      const data = Array.isArray(response.data) ? response.data : [];
      return data.map((item) => ({
        value: item.code,
        label: item.name ? `${item.code} — ${item.name}` : item.code
      }));
    }
  });

  const itemSalesReport = useQuery({
    queryKey: [
      "legacy-item-sales-report",
      isItemWiseSalesReport ? selectedItem?.value : null,
      isItemWiseSalesReport ? dateRange.start : null,
      isItemWiseSalesReport ? dateRange.end : null
    ],
    enabled: Boolean(isItemWiseSalesReport && selectedItem?.value && hasValidRange),
    queryFn: async () => {
      const response = await api.get("/reports/sales/item-summary", {
        params: {
          itemCode: selectedItem.value,
          startDate: dateRange.start,
          endDate: dateRange.end
        }
      });
      return response.data;
    }
  });

  const itemRows = itemSalesReport.data?.rows ?? [];
  const itemTotals = itemSalesReport.data?.totals ?? {
    quantity: 0,
    value: 0,
    count: 0
  };

  const comboCustomerDirectory = useQuery({
    queryKey: ["legacy-report-customers", comboCustomerSearch],
    enabled: isItemCustomerWiseReport,
    queryFn: async () => {
      const response = await api.get("/customers", {
        params: {
          search: comboCustomerSearch || undefined,
          limit: 50,
          offset: 0
        }
      });
      const data = Array.isArray(response.data) ? response.data : [];
      return data.map((customer) => ({
        value: customer.code,
        label: customer.name ? `${customer.code} — ${customer.name}` : customer.code
      }));
    }
  });

  const itemCustomerSalesReport = useQuery({
    queryKey: [
      "legacy-item-customer-sales-report",
      isItemCustomerWiseReport ? selectedItem?.value : null,
      isItemCustomerWiseReport ? comboSelectedCustomer?.value : null,
      isItemCustomerWiseReport ? dateRange.start : null,
      isItemCustomerWiseReport ? dateRange.end : null
    ],
    enabled: Boolean(
      isItemCustomerWiseReport && selectedItem?.value && comboSelectedCustomer?.value && hasValidRange
    ),
    queryFn: async () => {
      const response = await api.get("/reports/sales/item-customer-summary", {
        params: {
          itemCode: selectedItem.value,
          customerCode: comboSelectedCustomer.value,
          startDate: dateRange.start,
          endDate: dateRange.end
        }
      });
      return response.data;
    }
  });

  const itemCustomerRows = itemCustomerSalesReport.data?.rows ?? [];
  const itemCustomerTotals = itemCustomerSalesReport.data?.totals ?? {
    quantity: 0,
    value: 0,
    count: 0
  };

  const companyStatementReport = useQuery({
    queryKey: [
      "legacy-company-statement-report",
      isCompanyStatementReport ? selectedCompany?.value : null,
      isCompanyStatementReport ? dateRange.start : null,
      isCompanyStatementReport ? dateRange.end : null
    ],
    enabled: Boolean(isCompanyStatementReport && selectedCompany?.value && hasValidRange),
    queryFn: async () => {
      const response = await api.get("/reports/sales/company-statement", {
        params: {
          companyCode: selectedCompany.value,
          startDate: dateRange.start,
          endDate: dateRange.end
        }
      });
      return response.data;
    }
  });

  const defaultCompanyStatementTotals = {
    openingQty: 0,
    purchaseQty: 0,
    purchaseBonus: 0,
    purchaseAmount: 0,
    totalQty: 0,
    totalAmount: 0,
    salesQty: 0,
    salesBonus: 0,
    salesAmount: 0,
    purchaseReturnQty: 0,
    saleReturnQty: 0,
    damageInQty: 0,
    damageOutQty: 0,
    closingQty: 0,
    closingAmount: 0,
    closingCartons: 0,
    closingPieces: 0,
    packingQty: 0
  };

  const companyStatementRows = companyStatementReport.data?.rows ?? [];
  const companyStatementTotals = companyStatementReport.data?.totals ?? defaultCompanyStatementTotals;
  const companyStatementMeta = companyStatementReport.data ?? null;
  const companyStatementHasData = companyStatementRows.length > 0;

  return (
    <SectionCard
      title="Sales Report Launcher"
      description="Choose a sales report template. Detailed functionality will be added later."
    >
      <div className="space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <FormField
            label="Sales Report"
            description="Search and pick the sales report template you need."
            required
          >
            <SearchSelect
              placeholder="Search sales reports"
              value={selectedReport}
              onSelect={(option) => setSelectedReport(option)}
              onSearch={setSearch}
              results={filteredReports}
              emptyMessage={search.trim() ? "No reports found." : "Start typing a report name."}
            />
          </FormField>
          {selectedReport ? (
            <button
              type="button"
              onClick={() => {
                setSelectedReport(null);
                setSearch("");
              }}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:border-rose-200 hover:text-rose-600 hover:ring-2 hover:ring-rose-100"
            >
              Clear selection
            </button>
          ) : null}
        </div>
        {isCustomerWiseReport ? (
          <div className="grid gap-4 md:grid-cols-3">
            <FormField
              label="Customer"
              required
              description="Choose the customer the sales report should focus on."
            >
              <SearchSelect
                placeholder="Search customers"
                value={selectedCustomer}
                onSelect={(option) => {
                  setSelectedCustomer(option);
                  setCustomerSearch("");
                }}
                onSearch={setCustomerSearch}
                results={customerDirectory.data ?? []}
                emptyMessage={customerSearch.trim() ? "No customers found." : "Start typing a customer code or name."}
              />
              {customerDirectory.isFetching ? (
                <p className="mt-1 text-xs text-slate-400">Loading customers…</p>
              ) : null}
            </FormField>
            <FormField
              label="Start Date"
              required
              description="Beginning of the reporting window (DD-MM-YYYY)."
            >
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                value={dateRange.start}
                onChange={(event) => setDateRange((prev) => ({ ...prev, start: event.target.value }))}
                placeholder="DD-MM-YYYY"
              />
            </FormField>
            <FormField
              label="End Date"
              required
              description="End of the reporting window (DD-MM-YYYY)."
            >
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                value={dateRange.end}
                onChange={(event) => setDateRange((prev) => ({ ...prev, end: event.target.value }))}
                placeholder="DD-MM-YYYY"
              />
            </FormField>
          </div>
        ) : null}
        {!isCustomerWiseReport && isSalesmanWiseReport ? (
          <div className="grid gap-4 md:grid-cols-3">
            <FormField
              label="Salesman"
              required
              description="Select the salesman whose sales you want to review."
            >
              <SearchSelect
                placeholder="Search salesmen"
                value={selectedSalesman}
                onSelect={(option) => {
                  setSelectedSalesman(option);
                  setSalesmanSearch("");
                }}
                onSearch={setSalesmanSearch}
                results={salesmanDirectory.data ?? []}
                emptyMessage={salesmanSearch.trim() ? "No salesmen found." : "Start typing a code or name."}
              />
              {salesmanDirectory.isFetching ? (
                <p className="mt-1 text-xs text-slate-400">Loading salesmen…</p>
              ) : null}
            </FormField>
            <FormField
              label="Start Date"
              required
              description="Beginning of the reporting window (DD-MM-YYYY)."
            >
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                value={dateRange.start}
                onChange={(event) => setDateRange((prev) => ({ ...prev, start: event.target.value }))}
                placeholder="DD-MM-YYYY"
              />
            </FormField>
            <FormField
              label="End Date"
              required
              description="End of the reporting window (DD-MM-YYYY)."
            >
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                value={dateRange.end}
                onChange={(event) => setDateRange((prev) => ({ ...prev, end: event.target.value }))}
                placeholder="DD-MM-YYYY"
              />
            </FormField>
          </div>
        ) : null}
        {!isCustomerWiseReport && isSalesmanItemsReport ? (
          <div className="grid gap-4 md:grid-cols-3">
            <FormField
              label="Salesman"
              required
              description="Select the salesman to view their items summary."
            >
              <SearchSelect
                placeholder="Search salesmen"
                value={selectedSalesman}
                onSelect={(option) => {
                  setSelectedSalesman(option);
                  setSalesmanSearch("");
                }}
                onSearch={setSalesmanSearch}
                results={salesmanDirectory.data ?? []}
                emptyMessage={salesmanSearch.trim() ? "No salesmen found." : "Start typing a code or name."}
              />
              {salesmanDirectory.isFetching ? (
                <p className="mt-1 text-xs text-slate-400">Loading salesmen…</p>
              ) : null}
            </FormField>
            <FormField
              label="Start Date"
              required
              description="Beginning of the reporting window (DD-MM-YYYY)."
            >
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                value={dateRange.start}
                onChange={(event) => setDateRange((prev) => ({ ...prev, start: event.target.value }))}
                placeholder="DD-MM-YYYY"
              />
            </FormField>
            <FormField
              label="End Date"
              required
              description="End of the reporting window (DD-MM-YYYY)."
            >
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                value={dateRange.end}
                onChange={(event) => setDateRange((prev) => ({ ...prev, end: event.target.value }))}
                placeholder="DD-MM-YYYY"
              />
            </FormField>
          </div>
        ) : null}
        {isEntireSalesStatusReport ? (
          <div className="grid gap-4 md:grid-cols-3">
            <FormField
              label="Sales Status Template"
              required
              description="Choose the prebuilt sales status summary template."
            >
              <SearchSelect
                placeholder="Select sales status"
                value={entireSalesStatusSelection}
                onSelect={(option) => {
                  setEntireSalesStatusSelection(option);
                  setEntireSalesStatusSearch("");
                }}
                onSearch={setEntireSalesStatusSearch}
                results={filteredEntireSalesStatusOptions}
                emptyMessage={
                  entireSalesStatusSearch.trim()
                    ? "No matching status templates."
                    : "Select from the available status templates."
                }
              />
            </FormField>
            <FormField
              label="Start Date"
              required
              description="Beginning of the reporting window (DD-MM-YYYY)."
            >
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 md:max-w-[170px]"
                value={dateRange.start}
                onChange={(event) => setDateRange((prev) => ({ ...prev, start: event.target.value }))}
                placeholder="DD-MM-YYYY"
              />
            </FormField>
            <FormField
              label="End Date"
              required
              description="End of the reporting window (DD-MM-YYYY)."
            >
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 md:max-w-[170px]"
                value={dateRange.end}
                onChange={(event) => setDateRange((prev) => ({ ...prev, end: event.target.value }))}
                placeholder="DD-MM-YYYY"
              />
            </FormField>
          </div>
        ) : null}
        {!isCustomerWiseReport && !isSalesmanWiseReport && isCompanyStatementReport ? (
          <div className="grid gap-4 md:grid-cols-3">
            <FormField
              label="Company"
              required
              description="Pick the manufacturer to summarise."
            >
              <SearchSelect
                placeholder="Search companies"
                value={selectedCompany}
                onSelect={(option) => {
                  setSelectedCompany(option);
                  setCompanySearch("");
                }}
                onSearch={setCompanySearch}
                results={companyDirectory.data ?? []}
                emptyMessage={companySearch.trim() ? "No companies found." : "Start typing a code or name."}
              />
              {companyDirectory.isFetching ? (
                <p className="mt-1 text-xs text-slate-400">Loading companies…</p>
              ) : null}
            </FormField>
            <FormField
              label="Start Date"
              required
              description="Beginning of the reporting window (DD-MM-YYYY)."
            >
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 md:max-w-[170px]"
                value={dateRange.start}
                onChange={(event) => setDateRange((prev) => ({ ...prev, start: event.target.value }))}
                placeholder="DD-MM-YYYY"
              />
            </FormField>
            <FormField
              label="End Date"
              required
              description="End of the reporting window (DD-MM-YYYY)."
            >
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 md:max-w-[170px]"
                value={dateRange.end}
                onChange={(event) => setDateRange((prev) => ({ ...prev, end: event.target.value }))}
                placeholder="DD-MM-YYYY"
              />
            </FormField>
          </div>
        ) : null}
        {!isCustomerWiseReport && !isSalesmanWiseReport && isAreaCompanyReport ? (
          <div className="grid gap-4 md:grid-cols-3">
            <FormField
              label="Area"
              required
              description="Pick the territory to include in the summary."
            >
              <SearchSelect
                placeholder="Search areas"
                value={selectedArea}
                onSelect={(option) => {
                  setSelectedArea(option);
                  setAreaSearch("");
                }}
                onSearch={setAreaSearch}
                results={areaDirectory.data ?? []}
                emptyMessage={areaSearch.trim() ? "No areas found." : "Start typing an area code or name."}
              />
              {areaDirectory.isFetching ? (
                <p className="mt-1 text-xs text-slate-400">Loading areas…</p>
              ) : null}
            </FormField>
            <FormField
              label="Start Date"
              required
              description="Beginning of the reporting window (DD-MM-YYYY)."
            >
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                value={dateRange.start}
                onChange={(event) => setDateRange((prev) => ({ ...prev, start: event.target.value }))}
                placeholder="DD-MM-YYYY"
              />
            </FormField>
            <FormField
              label="End Date"
              required
              description="End of the reporting window (DD-MM-YYYY)."
            >
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                value={dateRange.end}
                onChange={(event) => setDateRange((prev) => ({ ...prev, end: event.target.value }))}
                placeholder="DD-MM-YYYY"
              />
            </FormField>
          </div>
        ) : null}
        {!isCustomerWiseReport && !isSalesmanWiseReport && isAreaWiseReport && !isAreaCompanyReport ? (
          <div className="grid gap-4 md:grid-cols-3">
            <FormField
              label="Area"
              required
              description="Select the area to review sales for."
            >
              <SearchSelect
                placeholder="Search areas"
                value={selectedArea}
                onSelect={(option) => {
                  setSelectedArea(option);
                  setAreaSearch("");
                }}
                onSearch={setAreaSearch}
                results={areaDirectory.data ?? []}
                emptyMessage={areaSearch.trim() ? "No areas found." : "Start typing an area code or name."}
              />
              {areaDirectory.isFetching ? (
                <p className="mt-1 text-xs text-slate-400">Loading areas…</p>
              ) : null}
            </FormField>
            <FormField
              label="Start Date"
              required
              description="Beginning of the reporting window (DD-MM-YYYY)."
            >
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                value={dateRange.start}
                onChange={(event) => setDateRange((prev) => ({ ...prev, start: event.target.value }))}
                placeholder="DD-MM-YYYY"
              />
            </FormField>
            <FormField
              label="End Date"
              required
              description="End of the reporting window (DD-MM-YYYY)."
            >
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                value={dateRange.end}
                onChange={(event) => setDateRange((prev) => ({ ...prev, end: event.target.value }))}
                placeholder="DD-MM-YYYY"
              />
            </FormField>
          </div>
        ) : null}
        {!isCustomerWiseReport && isDayWiseSalesReport ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <FormField
              label="Start Date"
              required
              description="Beginning of the reporting window (DD-MM-YYYY)."
            >
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                value={dateRange.start}
                onChange={(event) => setDateRange((prev) => ({ ...prev, start: event.target.value }))}
                placeholder="DD-MM-YYYY"
              />
            </FormField>
            <FormField
              label="End Date"
              required
              description="End of the reporting window (DD-MM-YYYY)."
            >
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                value={dateRange.end}
                onChange={(event) => setDateRange((prev) => ({ ...prev, end: event.target.value }))}
                placeholder="DD-MM-YYYY"
              />
            </FormField>
          </div>
        ) : null}
        {!isCustomerWiseReport &&
        !isSalesmanWiseReport &&
        !isAreaWiseReport &&
        !isItemWiseSalesReport &&
        isDateWiseCashCreditReport ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <FormField
              label="Start Date"
              required
              description="Beginning of the reporting window (DD-MM-YYYY)."
            >
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                value={cashCreditDateRange.start}
                onChange={(event) =>
                  setCashCreditDateRange((prev) => ({ ...prev, start: event.target.value }))
                }
                placeholder="DD-MM-YYYY"
              />
            </FormField>
            <FormField
              label="End Date"
              required
              description="End of the reporting window (DD-MM-YYYY)."
            >
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                value={cashCreditDateRange.end}
                onChange={(event) =>
                  setCashCreditDateRange((prev) => ({ ...prev, end: event.target.value }))
                }
                placeholder="DD-MM-YYYY"
              />
            </FormField>
          </div>
        ) : null}
        {!isCustomerWiseReport && !isSalesmanWiseReport && isItemWiseSalesReport ? (
          <div className="grid gap-4 md:grid-cols-3">
            <FormField
              label="Item"
              required
              description="Select the item to inspect."
            >
              <SearchSelect
                placeholder="Search items"
                value={selectedItem}
                onSelect={(option) => {
                  setSelectedItem(option);
                  setItemSearch("");
                }}
                onSearch={setItemSearch}
                results={itemDirectory.data ?? []}
                emptyMessage={itemSearch.trim() ? "No items found." : "Start typing a code or name."}
              />
              {itemDirectory.isFetching ? (
                <p className="mt-1 text-xs text-slate-400">Loading items…</p>
              ) : null}
            </FormField>
            <FormField
              label="Start Date"
              required
              description="Beginning of the reporting window (DD-MM-YYYY)."
            >
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                value={dateRange.start}
                onChange={(event) => setDateRange((prev) => ({ ...prev, start: event.target.value }))}
                placeholder="DD-MM-YYYY"
              />
            </FormField>
            <FormField
              label="End Date"
              required
              description="End of the reporting window (DD-MM-YYYY)."
            >
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                value={dateRange.end}
                onChange={(event) => setDateRange((prev) => ({ ...prev, end: event.target.value }))}
                placeholder="DD-MM-YYYY"
              />
            </FormField>
          </div>
        ) : null}
        {!isCustomerWiseReport && !isSalesmanWiseReport && isItemCustomerWiseReport ? (
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:gap-6">
            <FormField
              label="Item"
              required
              description="Select the item first."
            >
              <SearchSelect
                placeholder="Search items"
                value={selectedItem}
                onSelect={(option) => {
                  setSelectedItem(option);
                  setItemSearch("");
                }}
                onSearch={setItemSearch}
                results={itemDirectory.data ?? []}
                emptyMessage={itemSearch.trim() ? "No items found." : "Start typing a code or name."}
              />
              {itemDirectory.isFetching ? (
                <p className="mt-1 text-xs text-slate-400">Loading items…</p>
              ) : null}
            </FormField>
            <FormField
              label="Customer"
              required
              description="Pick the customer for the item."
            >
              <SearchSelect
                placeholder="Search customers"
                value={comboSelectedCustomer}
                onSelect={(option) => {
                  setComboSelectedCustomer(option);
                  setComboCustomerSearch("");
                }}
                onSearch={setComboCustomerSearch}
                results={comboCustomerDirectory.data ?? []}
                emptyMessage={
                  comboCustomerSearch.trim() ? "No customers found." : "Start typing a code or name."
                }
              />
              {comboCustomerDirectory.isFetching ? (
                <p className="mt-1 text-xs text-slate-400">Loading customers…</p>
              ) : null}
            </FormField>
            <FormField
              className="md:w-[190px]"
              label="Start Date"
              required
              description="Beginning of the reporting window (DD-MM-YYYY)."
            >
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                value={dateRange.start}
                onChange={(event) => setDateRange((prev) => ({ ...prev, start: event.target.value }))}
                placeholder="DD-MM-YYYY"
              />
            </FormField>
            <FormField
              className="md:w-[190px]"
              label="End Date"
              required
              description="End of the reporting window (DD-MM-YYYY)."
            >
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                value={dateRange.end}
                onChange={(event) => setDateRange((prev) => ({ ...prev, end: event.target.value }))}
                placeholder="DD-MM-YYYY"
              />
            </FormField>
          </div>
        ) : null}
        {selectedReport ? (
          <div className="border border-dashed border-slate-300 rounded-xl p-4 text-sm text-slate-600 bg-white/60">
            <p className="font-semibold text-slate-700">Preview</p>
            <p className="mt-2">
              <span className="font-medium">{selectedReport.label}</span> workflow will be wired in a future update.
              {isCustomerWiseReport
                ? " Configure the customer and date range above so the upcoming report runner knows which dataset to prepare."
                : isDayWiseSalesReport
                ? " Choose a date range to view total sales for each day."
                : isSalesmanWiseReport
                ? " Pick a salesman and date range to review their invoices."
                : isAreaCompanyReport
                ? " Select a territory and date window to summarise item performance for every company active in that area."
                : isAreaWiseReport
                ? " Select an area and date window to list invoices for that territory."
                : isDateWiseCashCreditReport
                ? " Provide a date range to break down cash versus credit invoices."
                : isItemWiseSalesReport
                ? " Select an item and range to list its invoices."
                : isItemCustomerWiseReport
                ? " Choose item + customer to detail their invoices."
                : isCompanyStatementReport
                ? " Generate a company-wise stock and sales statement for the chosen period."
                : isEntireSalesStatusReport
                ? " Pick a prebuilt status template and date range to review whole-of-sales snapshots."
                : " For now, this selector helps you navigate to the desired sales report quickly."}
            </p>
            {requiresDateRange ? (
              <ul className="mt-3 space-y-1 text-xs text-slate-500">
                <li>
                  • Date range: {(isDateWiseCashCreditReport ? cashCreditDateRange.start : dateRange.start) || "—"} to {(isDateWiseCashCreditReport ? cashCreditDateRange.end : dateRange.end) || "—"}
                </li>
                {isCustomerWiseReport ? (
                  <li>
                    • Customer: {selectedCustomer?.label || "Not selected"}
                  </li>
                ) : null}
                {isSalesmanWiseReport ? (
                  <li>
                    • Salesman: {selectedSalesman?.label || "Not selected"}
                  </li>
                ) : null}
                {isEntireSalesStatusReport ? (
                  <li>
                    • Status template: {entireSalesStatusSelection?.label || "Not selected"}
                  </li>
                ) : null}
                {isAreaCompanyReport ? (
                  <li>
                    • Area: {selectedArea?.label || "Not selected"}
                  </li>
                ) : null}
                {isAreaWiseReport ? (
                  <li>
                    • Area: {selectedArea?.label || "Not selected"}
                  </li>
                ) : null}
                {isItemWiseSalesReport ? (
                  <li>
                    • Item: {selectedItem?.label || "Not selected"}
                  </li>
                ) : null}
                {isItemCustomerWiseReport ? (
                  <li>
                    • Item: {selectedItem?.label || "Not selected"} · Customer: {comboSelectedCustomer?.label || "Not selected"}
                  </li>
                ) : null}
                {isCompanyStatementReport ? (
                  <li>
                    • Company: {selectedCompany?.label || "Not selected"}
                  </li>
                ) : null}
                {isDateWiseCashCreditReport ? (
                  <li>
                    • Mode: Cash vs Credit summary
                  </li>
                ) : null}
              </ul>
            ) : null}
            {isCustomerWiseReport ? (
              <div className="mt-4">
                {selectedCustomer?.value ? (
                  customerSalesReport.isError ? (
                    <p className="text-xs text-rose-600">
                      Unable to load invoices: {customerSalesReport.error?.message || "Unknown error."}
                    </p>
                  ) : customerSalesReport.isLoading || customerSalesReport.isFetching ? (
                    <p className="text-xs text-slate-500">Loading customer invoices…</p>
                  ) : invoiceSummary.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      No invoices found for the selected range. Try widening the dates.
                    </p>
                  ) : (
                    <>
                      <div className="mb-3 flex justify-end">
                        <button
                          type="button"
                          className={printButtonClass}
                          onClick={() =>
                            handlePrint(
                              customerReportRef,
                              `Customer Sales Summary - ${selectedCustomer?.label ?? ""} (${dateRange.start} to ${dateRange.end})`
                            )
                          }
                        >
                          Print report
                        </button>
                      </div>
                      <div
                        ref={customerReportRef}
                        className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
                      >
                        <table className="min-w-full divide-y divide-slate-200 text-xs text-slate-700">
                          <thead className="bg-slate-100/80 text-slate-500 uppercase tracking-wide">
                            <tr>
                              <th className="px-4 py-2 text-left">Invoice No.</th>
                              <th className="px-4 py-2 text-left">Date</th>
                              <th className="px-4 py-2 text-right">Amount</th>
                              <th className="px-4 py-2 text-right">Paid</th>
                              <th className="px-4 py-2 text-right">Outstanding</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {invoiceSummary.map((invoice) => (
                              <tr key={invoice.invoiceNo} className="odd:bg-white even:bg-slate-50/70">
                                <td className="px-4 py-2 font-medium text-slate-800">{invoice.invoiceNo}</td>
                                <td className="px-4 py-2 text-slate-600">{invoice.invoiceDate}</td>
                                <td className="px-4 py-2 text-right text-slate-800">{formatCurrency(invoice.amount)}</td>
                                <td className="px-4 py-2 text-right text-emerald-600">{formatCurrency(invoice.amountPaid)}</td>
                                <td className="px-4 py-2 text-right font-semibold text-slate-900">
                                  {formatCurrency(invoice.outstanding)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          {invoiceSummary.length > 0 ? (
                            <tfoot className="bg-slate-100/80 text-slate-700 font-semibold">
                              <tr>
                                <td className="px-4 py-2" colSpan={2}>
                                  Totals
                                </td>
                                <td className="px-4 py-2 text-right">{formatCurrency(invoiceTotals.amount)}</td>
                                <td className="px-4 py-2 text-right text-emerald-700">{formatCurrency(invoiceTotals.paid)}</td>
                                <td className="px-4 py-2 text-right text-slate-900">{formatCurrency(invoiceTotals.outstanding)}</td>
                              </tr>
                            </tfoot>
                          ) : null}
                        </table>
                      </div>
                    </>
                  )
                ) : (
                  <p className="text-xs text-slate-500">Select a customer to list invoices for the chosen date range.</p>
                )}
              </div>
            ) : null}
            {isDayWiseSalesReport ? (
              <div className="mt-4">
                {hasValidRange ? (
                  dayWiseSalesReport.isError ? (
                    <p className="text-xs text-rose-600">
                      Unable to load daily sales: {dayWiseSalesReport.error?.message || "Unknown error."}
                    </p>
                  ) : dayWiseSalesReport.isLoading || dayWiseSalesReport.isFetching ? (
                    <p className="text-xs text-slate-500">Loading day-wise totals…</p>
                  ) : dayWiseRows.length === 0 ? (
                    <p className="text-xs text-slate-500">No sales recorded in the selected date range.</p>
                  ) : (
                    <>
                      <div className="mb-3 flex justify-end">
                        <button
                          type="button"
                          className={printButtonClass}
                          onClick={() =>
                            handlePrint(
                              dayReportRef,
                              `Day Wise Sales Summary (${dateRange.start} to ${dateRange.end})`
                            )
                          }
                        >
                          Print report
                        </button>
                      </div>
                      <div
                        ref={dayReportRef}
                        className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
                      >
                        <table className="min-w-full divide-y divide-slate-200 text-xs text-slate-700">
                          <thead className="bg-slate-100/80 text-slate-500 uppercase tracking-wide">
                            <tr>
                              <th className="px-4 py-2 text-left">S/N</th>
                              <th className="px-4 py-2 text-left">Date</th>
                              <th className="px-4 py-2 text-right">Invoices</th>
                              <th className="px-4 py-2 text-right">Total Sales</th>
                              <th className="px-4 py-2 text-right">Paid</th>
                              <th className="px-4 py-2 text-right">Outstanding</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {dayWiseRows.map((row, index) => (
                              <tr key={row.storageDate || row.date} className="odd:bg-white even:bg-slate-50/70">
                                <td className="px-4 py-2 text-slate-600">{index + 1}</td>
                                <td className="px-4 py-2 font-medium text-slate-800">{row.date}</td>
                                <td className="px-4 py-2 text-right text-slate-600">{row.invoiceCount}</td>
                                <td className="px-4 py-2 text-right text-slate-800">{formatCurrency(row.totalAmount)}</td>
                                <td className="px-4 py-2 text-right text-emerald-600">{formatCurrency(row.totalPaid)}</td>
                                <td className="px-4 py-2 text-right font-semibold text-slate-900">
                                  {formatCurrency(row.outstanding)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="bg-slate-100/80 text-slate-700 font-semibold">
                            <tr>
                              <td className="px-4 py-2" colSpan={2}>
                                Totals
                              </td>
                              <td className="px-4 py-2 text-right">{dayWiseTotals.invoiceCount}</td>
                              <td className="px-4 py-2 text-right">{formatCurrency(dayWiseTotals.totalAmount)}</td>
                              <td className="px-4 py-2 text-right text-emerald-700">{formatCurrency(dayWiseTotals.totalPaid)}</td>
                              <td className="px-4 py-2 text-right text-slate-900">{formatCurrency(dayWiseTotals.outstanding)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </>
                  )
                ) : (
                  <p className="text-xs text-slate-500">Enter both start and end dates to generate the summary.</p>
                )}
              </div>
            ) : null}
            {isSalesmanWiseReport ? (
              <div className="mt-4">
                {selectedSalesman?.value && hasValidRange ? (
                  salesmanSalesReport.isError ? (
                    <p className="text-xs text-rose-600">
                      Unable to load salesman summary: {salesmanSalesReport.error?.message || "Unknown error."}
                    </p>
                  ) : salesmanSalesReport.isLoading || salesmanSalesReport.isFetching ? (
                    <p className="text-xs text-slate-500">Loading salesman invoices…</p>
                  ) : salesmanRows.length === 0 ? (
                    <p className="text-xs text-slate-500">No invoices found for the selected salesman in this range.</p>
                  ) : (
                    <>
                      <div className="mb-3 flex justify-end">
                        <button
                          type="button"
                          className={printButtonClass}
                          onClick={() =>
                            handlePrint(
                              salesmanReportRef,
                              `Salesman Sales Summary - ${selectedSalesman?.label ?? ""} (${dateRange.start} to ${dateRange.end})`
                            )
                          }
                        >
                          Print report
                        </button>
                      </div>
                      <div
                        ref={salesmanReportRef}
                        className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
                      >
                        <table className="min-w-full divide-y divide-slate-200 text-xs text-slate-700">
                          <thead className="bg-slate-100/80 text-slate-500 uppercase tracking-wide">
                            <tr>
                              <th className="px-4 py-2 text-left">S/N</th>
                              <th className="px-4 py-2 text-left">Invoice No.</th>
                              <th className="px-4 py-2 text-left">Date</th>
                              <th className="px-4 py-2 text-right">Amount</th>
                              <th className="px-4 py-2 text-right">Paid</th>
                              <th className="px-4 py-2 text-right">Outstanding</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {salesmanRows.map((row, index) => (
                              <tr key={row.invoiceNo || index} className="odd:bg-white even:bg-slate-50/70">
                                <td className="px-4 py-2 text-slate-600">{index + 1}</td>
                                <td className="px-4 py-2 font-medium text-slate-800">{row.invoiceNo}</td>
                                <td className="px-4 py-2 text-slate-600">{row.invoiceDate}</td>
                                <td className="px-4 py-2 text-right text-slate-800">{formatCurrency(row.totalAmount)}</td>
                                <td className="px-4 py-2 text-right text-emerald-600">{formatCurrency(row.amountPaid)}</td>
                                <td className="px-4 py-2 text-right font-semibold text-slate-900">
                                  {formatCurrency(row.outstanding)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="bg-slate-100/80 text-slate-700 font-semibold">
                            <tr>
                              <td className="px-4 py-2" colSpan={3}>
                                Totals
                              </td>
                              <td className="px-4 py-2 text-right">{formatCurrency(salesmanTotals.totalAmount)}</td>
                              <td className="px-4 py-2 text-right text-emerald-700">{formatCurrency(salesmanTotals.amountPaid)}</td>
                              <td className="px-4 py-2 text-right text-slate-900">{formatCurrency(salesmanTotals.outstanding)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </>
                  )
                ) : (
                  <p className="text-xs text-slate-500">
                    Select a salesman and provide start/end dates to view their invoices.
                  </p>
                )}
              </div>
            ) : null}
            {isSalesmanItemsReport ? (
              <div className="mt-4">
                {selectedSalesman?.value && hasValidRange ? (
                  salesmanItemsReport.isError ? (
                    <p className="text-xs text-rose-600">
                      Unable to load salesman item summary: {salesmanItemsReport.error?.message || "Unknown error."}
                    </p>
                  ) : salesmanItemsReport.isLoading || salesmanItemsReport.isFetching ? (
                    <p className="text-xs text-slate-500">Compiling salesman-wise items summary…</p>
                  ) : !salesmanItemsHasData ? (
                    <p className="text-xs text-slate-500">No items recorded for this salesman in the selected range.</p>
                  ) : (
                    <>
                      <div className="mb-3 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-xs text-slate-500">
                          <p className="font-semibold text-slate-700">
                            {salesmanItemsMeta?.salesman?.name || selectedSalesman?.label || "Selected salesman"}
                          </p>
                          <p>
                            Period: {salesmanItemsMeta?.startDate || dateRange.start} – {salesmanItemsMeta?.endDate || dateRange.end}
                          </p>
                        </div>
                        <button
                          type="button"
                          className={printButtonClass}
                          onClick={() =>
                            handlePrint(
                              salesmanItemsReportRef,
                              `Salesman Wise Items Summary - ${selectedSalesman?.label ?? ""} (${dateRange.start} to ${dateRange.end})`
                            )
                          }
                        >
                          Print report
                        </button>
                      </div>
                      <div
                        ref={salesmanItemsReportRef}
                        className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
                      >
                        <table className="min-w-full divide-y divide-slate-200 text-xs text-slate-700">
                          <thead className="bg-slate-100/80 text-slate-500 uppercase tracking-wide">
                            <tr>
                              <th className="px-4 py-2 text-left">Item</th>
                              <th className="px-4 py-2 text-right">Units</th>
                              <th className="px-4 py-2 text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {salesmanItemRows.map((row) => (
                              <tr key={row.itemCode} className="odd:bg-white even:bg-slate-50/70">
                                <td className="px-4 py-2 text-left">
                                  <span className="font-medium text-slate-800">{row.itemName}</span>
                                  <span className="block text-[10px] text-slate-400">{row.itemCode}</span>
                                </td>
                                <td className="px-4 py-2 text-right text-slate-800">{formatNumber(row.totalUnits)}</td>
                                <td className="px-4 py-2 text-right font-semibold text-slate-900">{formatCurrency(row.totalAmount)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="bg-slate-100/80 text-slate-700 font-semibold">
                            <tr>
                              <td className="px-4 py-2">Totals (Items: {salesmanItemTotals.itemCount})</td>
                              <td className="px-4 py-2 text-right">{formatNumber(salesmanItemTotals.totalUnits)}</td>
                              <td className="px-4 py-2 text-right">{formatCurrency(salesmanItemTotals.totalAmount)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </>
                  )
                ) : (
                  <p className="text-xs text-slate-500">Select a salesman with date range to view their items summary.</p>
                )}
              </div>
            ) : null}
            {isEntireSalesStatusReport ? (
              <div className="mt-4">
                {entireSalesStatusSelection?.value && hasValidRange ? (
                  entireSalesStatusReport.isError ? (
                    <p className="text-xs text-rose-600">
                      Unable to load entire sales status report: {entireSalesStatusReport.error?.message || "Unknown error."}
                    </p>
                  ) : entireSalesStatusReport.isLoading || entireSalesStatusReport.isFetching ? (
                    <p className="text-xs text-slate-500">Aggregating sales status…</p>
                  ) : !entireStatusHasData ? (
                    <p className="text-xs text-slate-500">No sales found for the selected range.</p>
                  ) : (
                    <>
                      <div className="mb-3 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-xs text-slate-500">
                          <p className="font-semibold text-slate-700">
                            {entireSalesStatusSelection?.label || "Entire Sales Status"}
                          </p>
                          <p>
                            Period: {entireStatusMeta?.startDate || dateRange.start} – {entireStatusMeta?.endDate || dateRange.end}
                          </p>
                        </div>
                        <button
                          type="button"
                          className={printButtonClass}
                          onClick={() =>
                            handlePrint(
                              entireSalesStatusReportRef,
                              `${entireSalesStatusSelection?.label ?? "Entire Sales Status"} (${dateRange.start} to ${dateRange.end})`
                            )
                          }
                        >
                          Print report
                        </button>
                      </div>
                      <div
                        ref={entireSalesStatusReportRef}
                        className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
                      >
                        {entireStatusMeta?.type === "customer-wise" ? (
                          <table className="min-w-full divide-y divide-slate-200 text-xs text-slate-700">
                            <thead className="bg-slate-100/80 text-slate-500 uppercase tracking-wide">
                              <tr>
                                <th className="px-4 py-2 text-left">S/N</th>
                                <th className="px-4 py-2 text-left">Customer</th>
                                <th className="px-4 py-2 text-right">Tax</th>
                                <th className="px-4 py-2 text-right">Amount</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {entireStatusRows.map((row, index) => (
                                <tr key={row.customerId || row.customerCode || index} className="odd:bg-white even:bg-slate-50/70">
                                  <td className="px-4 py-2 text-slate-600">{index + 1}</td>
                                  <td className="px-4 py-2">
                                    <span className="font-medium text-slate-800">{row.customerName || "Unnamed Customer"}</span>
                                    <span className="block text-[10px] text-slate-400">{row.customerCode || ""}</span>
                                  </td>
                                  <td className="px-4 py-2 text-right text-slate-700">{formatCurrency(row.taxAmount)}</td>
                                  <td className="px-4 py-2 text-right font-semibold text-slate-900">{formatCurrency(row.totalAmount)}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot className="bg-slate-100/80 text-slate-700 font-semibold">
                              <tr>
                                <td className="px-4 py-2" colSpan={2}>
                                  Totals (Customers: {entireStatusTotals.count})
                                </td>
                                <td className="px-4 py-2 text-right">{formatCurrency(entireStatusTotals.taxAmount)}</td>
                                <td className="px-4 py-2 text-right">{formatCurrency(entireStatusTotals.totalAmount)}</td>
                              </tr>
                            </tfoot>
                          </table>
                        ) : (
                          <table className="min-w-full divide-y divide-slate-200 text-xs text-slate-700">
                            <thead className="bg-slate-100/80 text-slate-500 uppercase tracking-wide">
                              <tr>
                                <th className="px-4 py-2 text-left">S/N</th>
                                <th className="px-4 py-2 text-left">
                                  {entireStatusMeta?.type === "salesman-wise"
                                    ? "Salesman"
                                    : entireStatusMeta?.type === "area-wise"
                                    ? "Town"
                                    : "Date"}
                                </th>
                                <th className="px-4 py-2 text-right">Amount</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {entireStatusRows.map((row, index) => (
                                <tr key={row.salesmanId || row.areaId || row.storageDate || index} className="odd:bg-white even:bg-slate-50/70">
                                  <td className="px-4 py-2 text-slate-600">{index + 1}</td>
                                  <td className="px-4 py-2">
                                    {entireStatusMeta?.type === "salesman-wise" ? (
                                      <>
                                        <span className="font-medium text-slate-800">{row.salesmanName || "Unnamed Salesman"}</span>
                                        <span className="block text-[10px] text-slate-400">{row.salesmanCode || ""}</span>
                                      </>
                                    ) : entireStatusMeta?.type === "area-wise" ? (
                                      <>
                                        <span className="font-medium text-slate-800">{row.areaName || "Unnamed Area"}</span>
                                        <span className="block text-[10px] text-slate-400">{row.areaCode || ""}</span>
                                      </>
                                    ) : (
                                      <span className="font-medium text-slate-800">{row.date || ""}</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-2 text-right font-semibold text-slate-900">{formatCurrency(row.totalAmount)}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot className="bg-slate-100/80 text-slate-700 font-semibold">
                              <tr>
                                <td className="px-4 py-2" colSpan={2}>
                                  Totals ({
                                    entireStatusMeta?.type === "salesman-wise"
                                      ? `Salesmen: ${entireStatusTotals.count}`
                                      : entireStatusMeta?.type === "area-wise"
                                      ? `Areas: ${entireStatusTotals.count}`
                                      : `Days: ${entireStatusTotals.count}`
                                  })
                                </td>
                                <td className="px-4 py-2 text-right">{formatCurrency(entireStatusTotals.totalAmount)}</td>
                              </tr>
                            </tfoot>
                          </table>
                        )}
                      </div>
                    </>
                  )
                ) : (
                  <p className="text-xs text-slate-500">Select a status template and date range to view the summary.</p>
                )}
              </div>
            ) : null}
            {isCompanyStatementReport ? (
              <div className="mt-4">
                {selectedCompany?.value && hasValidRange ? (
                  companyStatementReport.isError ? (
                    <p className="text-xs text-rose-600">
                      Unable to load company statement: {companyStatementReport.error?.message || "Unknown error."}
                    </p>
                  ) : companyStatementReport.isLoading || companyStatementReport.isFetching ? (
                    <p className="text-xs text-slate-500">Compiling company-wise statement…</p>
                  ) : !companyStatementHasData ? (
                    <p className="text-xs text-slate-500">
                      No movement found for the selected company in this range.
                    </p>
                  ) : (
                    <>
                      <div className="mb-3 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-xs text-slate-500">
                          <p className="font-semibold text-slate-700">
                            {companyStatementMeta?.company?.name || selectedCompany?.label || "Selected company"}
                          </p>
                          <p>
                            Period: {companyStatementMeta?.startDate || dateRange.start} – {companyStatementMeta?.endDate || dateRange.end}
                          </p>
                        </div>
                        <button
                          type="button"
                          className={printButtonClass}
                          onClick={() =>
                            handlePrint(
                              companyStatementReportRef,
                              `Company Wise Statement (T.P.) - ${selectedCompany?.label ?? ""} (${dateRange.start} to ${dateRange.end})`,
                              { orientation: "landscape" }
                            )
                          }
                        >
                          Print report
                        </button>
                      </div>
                      <div
                        ref={companyStatementReportRef}
                        className="overflow-x-auto rounded-2xl border border-slate-200 bg-white"
                      >
                        <table className="min-w-full divide-y divide-slate-200 text-[11px] text-slate-700 font-mono">
                          <thead className="bg-slate-100/80 text-slate-500 uppercase tracking-wide text-[10px] leading-tight">
                            <tr>
                              <th className="px-3 py-2 text-left w-[220px]" rowSpan={2}>Item Description</th>
                              <th className="px-3 py-2 text-right" rowSpan={2}>Trade Price</th>
                              <th className="px-3 py-2 text-right" rowSpan={2}>Opening Qty</th>
                              <th className="px-3 py-2 text-center" colSpan={3}>Purchase</th>
                              <th className="px-3 py-2 text-center" colSpan={2}>Total Available</th>
                              <th className="px-3 py-2 text-center" colSpan={3}>Sales</th>
                              <th className="px-3 py-2 text-right" rowSpan={2}>Purchase Return Qty</th>
                              <th className="px-3 py-2 text-center" colSpan={2}>Damage</th>
                              <th className="px-3 py-2 text-center" colSpan={3}>Closing Stock</th>
                            </tr>
                            <tr>
                              <th className="px-3 py-2 text-right">Qty</th>
                              <th className="px-3 py-2 text-right">Bonus</th>
                              <th className="px-3 py-2 text-right">Amount</th>
                              <th className="px-3 py-2 text-right">Qty</th>
                              <th className="px-3 py-2 text-right">Amount</th>
                              <th className="px-3 py-2 text-right">Qty</th>
                              <th className="px-3 py-2 text-right">Bonus</th>
                              <th className="px-3 py-2 text-right">Amount</th>
                              <th className="px-3 py-2 text-right">In</th>
                              <th className="px-3 py-2 text-right">Out</th>
                              <th className="px-3 py-2 text-right">Packing</th>
                              <th className="px-3 py-2 text-right">PCS</th>
                              <th className="px-3 py-2 text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {companyStatementRows.map((row, index) => (
                              <tr key={row.itemCode || index} className="odd:bg-white even:bg-slate-50/70">
                                <td className="px-3 py-2 text-left align-top w-[220px]">
                                  <span className="font-semibold text-slate-800">{row.itemName}</span>
                                  <span className="block text-[10px] text-slate-400">{row.itemCode}</span>
                                </td>
                                <td className="px-3 py-2 text-right">{formatNumber(row.tradePrice)}</td>
                                <td className="px-3 py-2 text-right">{formatNumber(row.openingQty)}</td>
                                <td className="px-3 py-2 text-right">{formatNumber(row.purchaseQty)}</td>
                                <td className="px-3 py-2 text-right">{formatNumber(row.purchaseBonus)}</td>
                                <td className="px-3 py-2 text-right">{formatNumber(row.purchaseAmount)}</td>
                                <td className="px-3 py-2 text-right">{formatNumber(row.totalQty)}</td>
                                <td className="px-3 py-2 text-right">{formatNumber(row.totalAmount)}</td>
                                <td className="px-3 py-2 text-right">{formatNumber(row.salesQty)}</td>
                                <td className="px-3 py-2 text-right">{formatNumber(row.salesBonus)}</td>
                                <td className="px-3 py-2 text-right">{formatNumber(row.salesAmount)}</td>
                                <td className="px-3 py-2 text-right">{formatNumber(row.purchaseReturnQty)}</td>
                                <td className="px-3 py-2 text-right">{formatNumber(row.damageInQty)}</td>
                                <td className="px-3 py-2 text-right">{formatNumber(row.damageOutQty)}</td>
                                <td className="px-3 py-2 text-right">
                                  <span className="block text-slate-800">{formatNumber(row.packingQty)}</span>
                                  <span className="block text-[9px] uppercase tracking-[0.08em] text-slate-400">
                                    {(row.packingLabel || "Pack").toString()}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-right">{formatNumber(row.closingPieces)}</td>
                                <td className="px-3 py-2 text-right">{formatNumber(row.closingAmount)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="bg-slate-100/80 text-slate-700 font-semibold">
                            <tr>
                              <td className="px-3 py-2 text-left" colSpan={2}>
                                Totals
                              </td>
                              <td className="px-3 py-2 text-right">{formatNumber(companyStatementTotals.openingQty)}</td>
                              <td className="px-3 py-2 text-right">{formatNumber(companyStatementTotals.purchaseQty)}</td>
                              <td className="px-3 py-2 text-right">{formatNumber(companyStatementTotals.purchaseBonus)}</td>
                              <td className="px-3 py-2 text-right">{formatNumber(companyStatementTotals.purchaseAmount)}</td>
                              <td className="px-3 py-2 text-right">{formatNumber(companyStatementTotals.totalQty)}</td>
                              <td className="px-3 py-2 text-right">{formatNumber(companyStatementTotals.totalAmount)}</td>
                              <td className="px-3 py-2 text-right">{formatNumber(companyStatementTotals.salesQty)}</td>
                              <td className="px-3 py-2 text-right">{formatNumber(companyStatementTotals.salesBonus)}</td>
                              <td className="px-3 py-2 text-right">{formatNumber(companyStatementTotals.salesAmount)}</td>
                              <td className="px-3 py-2 text-right">{formatNumber(companyStatementTotals.purchaseReturnQty)}</td>
                              <td className="px-3 py-2 text-right">{formatNumber(companyStatementTotals.damageInQty)}</td>
                              <td className="px-3 py-2 text-right">{formatNumber(companyStatementTotals.damageOutQty)}</td>
                              <td className="px-3 py-2 text-right">{formatNumber(companyStatementTotals.packingQty)}</td>
                              <td className="px-3 py-2 text-right">{formatNumber(companyStatementTotals.closingPieces)}</td>
                              <td className="px-3 py-2 text-right">{formatNumber(companyStatementTotals.closingAmount)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </>
                  )
                ) : (
                  <p className="text-xs text-slate-500">
                    Select a company and provide start/end dates to prepare the statement.
                  </p>
                )}
              </div>
            ) : null}
            {isAreaWiseReport ? (
              <div className="mt-4">
                {selectedArea?.value && hasValidRange ? (
                  areaSalesReport.isError ? (
                    <p className="text-xs text-rose-600">
                      Unable to load area summary: {areaSalesReport.error?.message || "Unknown error."}
                    </p>
                  ) : areaSalesReport.isLoading || areaSalesReport.isFetching ? (
                    <p className="text-xs text-slate-500">Loading area invoices…</p>
                  ) : areaRows.length === 0 ? (
                    <p className="text-xs text-slate-500">No invoices found for the selected area in this range.</p>
                  ) : (
                    <>
                      <div className="mb-3 flex justify-end">
                        <button
                          type="button"
                          className={printButtonClass}
                          onClick={() =>
                            handlePrint(
                              areaReportRef,
                              `Area Sales Summary - ${selectedArea?.label ?? ""} (${dateRange.start} to ${dateRange.end})`
                            )
                          }
                        >
                          Print report
                        </button>
                      </div>
                      <div
                        ref={areaReportRef}
                        className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
                      >
                        <table className="min-w-full divide-y divide-slate-200 text-xs text-slate-700">
                          <thead className="bg-slate-100/80 text-slate-500 uppercase tracking-wide">
                            <tr>
                              <th className="px-4 py-2 text-left">S/N</th>
                              <th className="px-4 py-2 text-left">Invoice No.</th>
                              <th className="px-4 py-2 text-left">Date</th>
                              <th className="px-4 py-2 text-left">Customer</th>
                              <th className="px-4 py-2 text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {areaRows.map((row, index) => (
                              <tr key={row.invoiceNo || index} className="odd:bg-white even:bg-slate-50/70">
                                <td className="px-4 py-2 text-slate-600">{index + 1}</td>
                                <td className="px-4 py-2 font-medium text-slate-800">{row.invoiceNo}</td>
                                <td className="px-4 py-2 text-slate-600">{row.invoiceDate}</td>
                                <td className="px-4 py-2 text-slate-700">
                                  {row.customerName}
                                  <span className="block text-[10px] text-slate-400">{row.customerCode}</span>
                                </td>
                                <td className="px-4 py-2 text-right font-semibold text-slate-900">
                                  {formatCurrency(row.totalAmount)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="bg-slate-100/80 text-slate-700 font-semibold">
                            <tr>
                              <td className="px-4 py-2" colSpan={4}>
                                Totals (Invoices: {areaTotals.count})
                              </td>
                              <td className="px-4 py-2 text-right">{formatCurrency(areaTotals.totalAmount)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </>
                  )
                ) : (
                  <p className="text-xs text-slate-500">
                    Choose an area and provide start/end dates to list area-wise invoices.
                  </p>
                )}
              </div>
            ) : null}
            {isAreaCompanyReport ? (
              <div className="mt-4">
                {selectedArea?.value && hasValidRange ? (
                  areaCompanyReport.isError ? (
                    <p className="text-xs text-rose-600">
                      Unable to load company + area summary: {areaCompanyReport.error?.message || "Unknown error."}
                    </p>
                  ) : areaCompanyReport.isLoading || areaCompanyReport.isFetching ? (
                    <p className="text-xs text-slate-500">Compiling item performance…</p>
                  ) : !areaCompanyHasData ? (
                    <p className="text-xs text-slate-500">
                      No sales found for the selected area within this date range.
                    </p>
                  ) : (
                    <>
                      <div className="mb-3 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-xs text-slate-500">
                          <p className="font-semibold text-slate-700">{areaCompanyMeta?.area?.name || selectedArea?.label || "Selected area"}</p>
                          <p>Companies represented: {areaCompanyTotals.companyCount}</p>
                          <p>Items summarised: {areaCompanyTotals.itemCount}</p>
                          <p>
                            Period: {areaCompanyMeta?.startDate || dateRange.start} – {areaCompanyMeta?.endDate || dateRange.end}
                          </p>
                        </div>
                        <button
                          type="button"
                          className={printButtonClass}
                          onClick={() =>
                            handlePrint(
                              companyAreaReportRef,
                              `Area + Company Sales Summary - ${selectedArea?.label ?? ""} (${dateRange.start} to ${dateRange.end})`
                            )
                          }
                        >
                          Print report
                        </button>
                      </div>
                      <div
                        ref={companyAreaReportRef}
                        className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
                      >
                        <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-500">
                            Area + Company Sales Summary
                          </p>
                          <div className="mt-2 grid gap-1 text-xs text-slate-600 sm:grid-cols-2">
                            <span>
                              <span className="font-semibold text-slate-700">Area:</span> {areaCompanyMeta?.area?.name || selectedArea?.label || "—"}
                            </span>
                            <span>
                              <span className="font-semibold text-slate-700">Companies:</span> {areaCompanyTotals.companyCount}
                            </span>
                            <span>
                              <span className="font-semibold text-slate-700">From:</span> {areaCompanyMeta?.startDate || dateRange.start}
                            </span>
                            <span>
                              <span className="font-semibold text-slate-700">To:</span> {areaCompanyMeta?.endDate || dateRange.end}
                            </span>
                          </div>
                        </div>
                        <table className="min-w-full divide-y divide-slate-200 text-xs text-slate-700">
                          <thead className="bg-slate-100/80 text-slate-500 uppercase tracking-wide">
                            <tr>
                              <th className="px-4 py-2 text-left">S/N</th>
                              <th className="px-4 py-2 text-left">Company</th>
                              <th className="px-4 py-2 text-left">Item</th>
                              <th className="px-4 py-2 text-right">Qty.</th>
                              <th className="px-4 py-2 text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {areaCompanyFlatRows.map((entry, index) => (
                              <tr key={`${entry.company?.code ?? "company"}-${entry.item?.itemCode ?? index}`} className="odd:bg-white even:bg-slate-50/70">
                                <td className="px-4 py-2 text-slate-600">{index + 1}</td>
                                <td className="px-4 py-2 font-medium text-slate-800">
                                  {entry.company?.name || entry.company?.code || "Company"}
                                  <span className="block text-[10px] text-slate-400">{entry.company?.code || "—"}</span>
                                </td>
                                <td className="px-4 py-2 text-slate-700">
                                  {entry.item?.itemName}
                                  <span className="block text-[10px] text-slate-400">{entry.item?.itemCode}</span>
                                </td>
                                <td className="px-4 py-2 text-right text-slate-700">{formatNumber(entry.item?.quantity ?? 0)}</td>
                                <td className="px-4 py-2 text-right font-semibold text-slate-900">{formatCurrency(entry.item?.amount ?? 0)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="bg-slate-100/80 text-slate-700 font-semibold">
                            <tr>
                              <td className="px-4 py-2" colSpan={3}>
                                Totals (Companies: {areaCompanyTotals.companyCount} · Items: {areaCompanyTotals.itemCount})
                              </td>
                              <td className="px-4 py-2 text-right">{formatNumber(areaCompanyTotals.quantity)}</td>
                              <td className="px-4 py-2 text-right">{formatCurrency(areaCompanyTotals.amount)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </>
                  )
                ) : (
                  <p className="text-xs text-slate-500">
                    Choose an area and provide start/end dates to generate the summary.
                  </p>
                )}
              </div>
            ) : null}
            {isDateWiseCashCreditReport ? (
              <div className="mt-4">
                {cashCreditHasValidRange ? (
                  dateWiseCashCreditReport.isError ? (
                    <p className="text-xs text-rose-600">
                      Unable to load cash/credit summary: {dateWiseCashCreditReport.error?.message || "Unknown error."}
                    </p>
                  ) : dateWiseCashCreditReport.isLoading || dateWiseCashCreditReport.isFetching ? (
                    <p className="text-xs text-slate-500">Loading invoices…</p>
                  ) : cashCreditRows.length === 0 ? (
                    <p className="text-xs text-slate-500">No invoices found for the selected dates.</p>
                  ) : (
                    <>
                      <div className="mb-3 flex justify-end">
                        <button
                          type="button"
                          className={printButtonClass}
                          onClick={() =>
                            handlePrint(
                              cashCreditReportRef,
                              `Date Wise Cash/Credit Sales (${cashCreditDateRange.start} to ${cashCreditDateRange.end})`
                            )
                          }
                        >
                          Print report
                        </button>
                      </div>
                      <div
                        ref={cashCreditReportRef}
                        className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
                      >
                        <table className="min-w-full divide-y divide-slate-200 text-xs text-slate-700">
                          <thead className="bg-slate-100/80 text-slate-500 uppercase tracking-wide">
                            <tr>
                              <th className="px-4 py-2 text-left">S/N</th>
                              <th className="px-4 py-2 text-left">Invoice No.</th>
                              <th className="px-4 py-2 text-left">Date</th>
                              <th className="px-4 py-2 text-left">Customer</th>
                              <th className="px-4 py-2 text-right">Cash</th>
                              <th className="px-4 py-2 text-right">Credit</th>
                              <th className="px-4 py-2 text-right">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {cashCreditRows.map((row, index) => (
                              <tr key={row.invoiceNo || index} className="odd:bg-white even:bg-slate-50/70">
                                <td className="px-4 py-2 text-slate-600">{index + 1}</td>
                                <td className="px-4 py-2 font-medium text-slate-800">{row.invoiceNo}</td>
                                <td className="px-4 py-2 text-slate-600">{row.invoiceDate}</td>
                                <td className="px-4 py-2 text-slate-700">
                                  {row.customerName}
                                  <span className="block text-[10px] text-slate-400">{row.customerCode}</span>
                                </td>
                                <td className="px-4 py-2 text-right text-slate-800">{formatCurrency(row.cash)}</td>
                                <td className="px-4 py-2 text-right text-slate-600">{formatCurrency(row.credit)}</td>
                                <td className="px-4 py-2 text-right font-semibold text-slate-900">{formatCurrency(row.total)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="bg-slate-100/80 text-slate-700 font-semibold">
                            <tr>
                              <td className="px-4 py-2" colSpan={4}>
                                Totals (Invoices: {cashCreditTotals.count})
                              </td>
                              <td className="px-4 py-2 text-right">{formatCurrency(cashCreditTotals.cash)}</td>
                              <td className="px-4 py-2 text-right">{formatCurrency(cashCreditTotals.credit)}</td>
                              <td className="px-4 py-2 text-right">{formatCurrency(cashCreditTotals.total)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </>
                  )
                ) : (
                  <p className="text-xs text-slate-500">Enter both start and end dates to generate the summary.</p>
                )}
              </div>
            ) : null}
            {isItemWiseSalesReport ? (
              <div className="mt-4">
                {selectedItem?.value && hasValidRange ? (
                  itemSalesReport.isError ? (
                    <p className="text-xs text-rose-600">
                      Unable to load item summary: {itemSalesReport.error?.message || "Unknown error."}
                    </p>
                  ) : itemSalesReport.isLoading || itemSalesReport.isFetching ? (
                    <p className="text-xs text-slate-500">Loading item invoices…</p>
                  ) : itemRows.length === 0 ? (
                    <p className="text-xs text-slate-500">No invoices found for the selected item in this range.</p>
                  ) : (
                    <>
                      <div className="mb-3 flex justify-end">
                        <button
                          type="button"
                          className={printButtonClass}
                          onClick={() =>
                            handlePrint(
                              itemReportRef,
                              `Item Sales Detail - ${selectedItem?.label ?? ""} (${dateRange.start} to ${dateRange.end})`
                            )
                          }
                        >
                          Print report
                        </button>
                      </div>
                      <div
                        ref={itemReportRef}
                        className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
                      >
                        <table className="min-w-full divide-y divide-slate-200 text-xs text-slate-700">
                          <thead className="bg-slate-100/80 text-slate-500 uppercase tracking-wide">
                            <tr>
                              <th className="px-4 py-2 text-left">S/N</th>
                              <th className="px-4 py-2 text-left">Invoice No.</th>
                              <th className="px-4 py-2 text-left">Invoice Date</th>
                              <th className="px-4 py-2 text-left">Base</th>
                              <th className="px-4 py-2 text-right">Unit</th>
                              <th className="px-4 py-2 text-right">Rate (Trade Price)</th>
                              <th className="px-4 py-2 text-right">Dis%</th>
                              <th className="px-4 py-2 text-right">Tax</th>
                              <th className="px-4 py-2 text-right">Value</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {itemRows.map((row, index) => (
                              <tr key={`${row.invoiceNo}-${index}`} className="odd:bg-white even:bg-slate-50/70">
                                <td className="px-4 py-2 text-slate-600">{index + 1}</td>
                                <td className="px-4 py-2 font-medium text-slate-800">{row.invoiceNo}</td>
                                <td className="px-4 py-2 text-slate-600">{row.invoiceDate}</td>
                                <td className="px-4 py-2 text-slate-700">{row.baseUnit || "—"}</td>
                                <td className="px-4 py-2 text-right text-slate-700">{formatNumber(row.quantity)}</td>
                                <td className="px-4 py-2 text-right text-slate-800">{formatNumber(row.rate)}</td>
                                <td className="px-4 py-2 text-right text-slate-600">{formatNumber(row.discountPercent)}</td>
                                <td className="px-4 py-2 text-right text-slate-600">{formatNumber(row.taxPercent)}</td>
                                <td className="px-4 py-2 text-right font-semibold text-slate-900">{formatNumber(row.value)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="bg-slate-100/80 text-slate-700 font-semibold">
                            <tr>
                              <td className="px-4 py-2" colSpan={4}>
                                Totals (Invoices: {itemTotals.count})
                              </td>
                              <td className="px-4 py-2 text-right text-slate-700">{formatNumber(itemTotals.quantity)}</td>
                              <td className="px-4 py-2" colSpan={3}></td>
                              <td className="px-4 py-2 text-right">{formatNumber(itemTotals.value)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </>
                  )
                ) : (
                  <p className="text-xs text-slate-500">
                    Select an item and provide start/end dates to list its sales.
                  </p>
                )}
              </div>
            ) : null}
            {isItemCustomerWiseReport ? (
              <div className="mt-4">
                {selectedItem?.value && comboSelectedCustomer?.value && hasValidRange ? (
                  itemCustomerSalesReport.isError ? (
                    <p className="text-xs text-rose-600">
                      Unable to load item/customer summary: {itemCustomerSalesReport.error?.message || "Unknown error."}
                    </p>
                  ) : itemCustomerSalesReport.isLoading || itemCustomerSalesReport.isFetching ? (
                    <p className="text-xs text-slate-500">Loading combined invoices…</p>
                  ) : itemCustomerRows.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      No invoices found for this item and customer within the selected range.
                    </p>
                  ) : (
                    <>
                      <div className="mb-3 flex justify-end">
                        <button
                          type="button"
                          className={printButtonClass}
                          onClick={() =>
                            handlePrint(
                              itemCustomerReportRef,
                              `Item + Customer Sales - ${selectedItem?.label ?? ""} / ${comboSelectedCustomer?.label ?? ""} (${dateRange.start} to ${dateRange.end})`
                            )
                          }
                        >
                          Print report
                        </button>
                      </div>
                      <div
                        ref={itemCustomerReportRef}
                        className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
                      >
                        <table className="min-w-full divide-y divide-slate-200 text-xs text-slate-700">
                          <thead className="bg-slate-100/80 text-slate-500 uppercase tracking-wide">
                            <tr>
                              <th className="px-4 py-2 text-left">S/N</th>
                              <th className="px-4 py-2 text-left">Invoice No.</th>
                              <th className="px-4 py-2 text-left">Invoice Date</th>
                              <th className="px-4 py-2 text-left">Customer Name</th>
                              <th className="px-4 py-2 text-left">Base</th>
                              <th className="px-4 py-2 text-right">Unit</th>
                              <th className="px-4 py-2 text-right">Rate (Trade Price)</th>
                              <th className="px-4 py-2 text-right">Dis%</th>
                              <th className="px-4 py-2 text-right">Tax</th>
                              <th className="px-4 py-2 text-right">Value</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {itemCustomerRows.map((row, index) => (
                              <tr key={`${row.invoiceNo}-${index}`} className="odd:bg-white even:bg-slate-50/70">
                                <td className="px-4 py-2 text-slate-600">{index + 1}</td>
                                <td className="px-4 py-2 font-medium text-slate-800">{row.invoiceNo}</td>
                                <td className="px-4 py-2 text-slate-600">{row.invoiceDate}</td>
                                <td className="px-4 py-2 text-slate-700">{row.customerName}</td>
                                <td className="px-4 py-2 text-slate-700">{row.baseUnit || "—"}</td>
                                <td className="px-4 py-2 text-right text-slate-700">{formatNumber(row.quantity)}</td>
                                <td className="px-4 py-2 text-right text-slate-800">{formatNumber(row.rate)}</td>
                                <td className="px-4 py-2 text-right text-slate-600">{formatNumber(row.discountPercent)}</td>
                                <td className="px-4 py-2 text-right text-slate-600">{formatNumber(row.taxPercent)}</td>
                                <td className="px-4 py-2 text-right font-semibold text-slate-900">{formatNumber(row.value)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="bg-slate-100/80 text-slate-700 font-semibold">
                            <tr>
                              <td className="px-4 py-2" colSpan={5}>
                                Totals (Invoices: {itemCustomerTotals.count})
                              </td>
                              <td className="px-4 py-2 text-right text-slate-700">{formatNumber(itemCustomerTotals.quantity)}</td>
                              <td className="px-4 py-2" colSpan={3}></td>
                              <td className="px-4 py-2 text-right">{formatNumber(itemCustomerTotals.value)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </>
                  )
                ) : (
                  <p className="text-xs text-slate-500">
                    Select both item and customer plus a date range to list combined sales.
                  </p>
                )}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-slate-500">Select a report above to see more details when the implementation arrives.</p>
        )}
      </div>
    </SectionCard>
  );
};

export default LegacyReportMenuPage;
