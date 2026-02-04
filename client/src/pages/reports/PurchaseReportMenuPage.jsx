import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import SectionCard from "../../components/SectionCard.jsx";
import FormField from "../../components/FormField.jsx";
import SearchSelect from "../../components/SearchSelect.jsx";

const purchaseReportOptions = [
  { value: "supplier-wise-bills-summary", label: "Supplier Wise Bills Summary", path: "/reports/purchase/supplier-bills-summary" },
  { value: "company-wise-items-summary", label: "Company Wise Items Summary", path: "/reports/purchase/company-wise-item-summary" },
  { value: "date-wise-bills-summary", label: "Date Wise Bills Summary", path: "/reports/purchase/date-wise-bills-summary" },
  { value: "bill-checking", label: "Bill Checking", path: "/reports/purchase/bill-checking" },
  { value: "days-wise-purchase-amount", label: "Days Wise Purchase Amount", path: "/reports/purchase/days-wise-summary" },
  { value: "item-wise-purchase-detail", label: "Item Wise Purchase Detail", path: "/reports/purchase/item-wise-detail" },
  { value: "item-company-wise-detail", label: "Item Company Wise Purchase Detail", path: "/reports/purchase/item-company-wise-detail" },
  { value: "company-wise-purchase-detail", label: "Company Wise Purchase Detail" },
  { value: "entire-supplier-purchase-amount", label: "Entire Supplier Purchase Amount" },
  { value: "supplier-wise-purchase-invoices", label: "Supplier Wise Purchase Invoices" },
  { value: "bill-checking", label: "Bill Checking" }
];

const PurchaseReportMenuPage = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedReport, setSelectedReport] = useState(null);

  const filteredReports = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return purchaseReportOptions;
    return purchaseReportOptions.filter((option) => option.label.toLowerCase().includes(term));
  }, [searchTerm]);

  const handleNavigate = () => {
    if (selectedReport?.path) {
      navigate(selectedReport.path);
    }
  };

  return (
    <SectionCard
      title="Purchase Report Launcher"
      description="Pick a purchase report. Detailed flows will be wired later."
    >
      <div className="space-y-6">
        <FormField
          label="Purchase Report"
          description="Select the report you want to configure next."
          required
        >
          <SearchSelect
            placeholder="Search purchase reports"
            value={selectedReport}
            onSelect={(option) => setSelectedReport(option)}
            onSearch={setSearchTerm}
            results={filteredReports}
            emptyMessage={searchTerm.trim() ? "No purchase reports found." : "Start typing a report name."}
          />
        </FormField>
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 text-sm text-slate-600">
          {selectedReport ? (
            <>
              <p className="text-base font-semibold text-slate-800">{selectedReport.label}</p>
              {selectedReport.path ? (
                <button
                  onClick={handleNavigate}
                  className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Open Report
                </button>
              ) : (
                <p className="mt-2 text-xs text-slate-500">
                  This report will be implemented later.
                </p>
              )}
            </>
          ) : (
            <p className="text-xs text-slate-500">
              Use the dropdown above to choose a purchase report template.
            </p>
          )}
        </div>
      </div>
    </SectionCard>
  );
};

export default PurchaseReportMenuPage;
