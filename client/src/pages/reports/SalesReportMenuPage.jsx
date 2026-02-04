import { useMemo, useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import SectionCard from "../../components/SectionCard.jsx";
import FormField from "../../components/FormField.jsx";
import SearchSelect from "../../components/SearchSelect.jsx";

// Sales report options
const salesReportOptions = [
  { value: "customer-sales-summary", label: "CUSTOMER WISE SALES SUMMARY", path: "/reports/sales/customer-summary" },
  { value: "day-sales-summary", label: "DAYS WISE SALES SUMMARY", path: "/reports/sales/day-summary" },
  { value: "salesman-sales-summary", label: "SALESMAN WISE SALES SUMMARY", path: "/reports/sales/salesman-summary" },
  { value: "area-sales-summary", label: "AREA WISE SALES SUMMARY", path: "/reports/sales/area-summary" },
  { value: "date-cash-credit", label: "DATE WISE CASH/CREDIT SALES", path: "/reports/sales/cash-credit" },
  { value: "date-items-summary", label: "DATE WISE ITEMS SUMMARY", path: "/reports/sales/date-items-summary" },
  { value: "item-customer-sales", label: "ITEM + CUSTOMER WISE SALES", path: "/reports/sales/item-customer" },
  { value: "company-entire-area", label: "COMPANY WISE ENTIRE AREA SALES", path: "/reports/sales/company-entire-area" },
  { value: "area-company-summary", label: "AREA + COMPANY WISE SALES SUMMARY", path: "/reports/sales/area-company" },
  { value: "company-statement", label: "COMPANY WISE STATEMENT (T.P.)", path: "/reports/sales/company-statement" },
  { value: "company-percentage-details", label: "COMPANY + PERCENTAGE DETAILS", path: "/reports/sales/company-percentage-details" },
  { value: "area-wise-item-summary", label: "AREA WISE ITEM SALE SUMMARY", path: "/reports/sales/area-wise-item-summary" },
  { value: "date-wise-damage-out", label: "DATE WISE DAMAGE OUT SUMMARY", path: "/reports/sales/date-wise-damage-out" },
  { value: "date-wise-damage-in", label: "DATE WISE DAMAGE IN SUMMARY", path: "/reports/sales/date-wise-damage-in" },
  { value: "salesman-items-summary", label: "SALESMAN WISE ITEMS SUMMARY", path: "/reports/salesman/items-summary" }
];

// Entire sales status report options
const entireSalesReportOptions = [
  { value: "salesman-wise", label: "ENTIRE SALESMAN WISE SALES SUMMARY", path: null },
  { value: "area-wise", label: "ENTIRE AREA WISE SALES SUMMARY", path: null },
  { value: "day-wise", label: "DAY WISE SALES SUMMARY", path: null },
  { value: "customer-wise", label: "ENTIRE CUSTOMER WISE SALES SUMMARY", path: null }
];

const SalesReportMenuPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedReport, setSelectedReport] = useState(null);
  const [showEntireSales, setShowEntireSales] = useState(false);

  const filteredReports = useMemo(() => {
    // Determine which report list to show based on active button
    const activeReportOptions = showEntireSales ? entireSalesReportOptions : salesReportOptions;
    
    const term = searchTerm.trim().toLowerCase();
    if (!term) return activeReportOptions;
    return activeReportOptions.filter((option) => option.label.toLowerCase().includes(term));
  }, [searchTerm, showEntireSales]);

  // Clear selected report and search when switching between tabs
  useEffect(() => {
    setSelectedReport(null);
    setSearchTerm("");
  }, [showEntireSales]);

  const handleViewReport = () => {
    if (selectedReport?.path) {
      navigate(selectedReport.path);
    }
  };

  return (
    <SectionCard
      title="Sales Reports"
      description="Choose a sales report. Select a report template and click Generate to view the results."
    >
      <div className="space-y-6">
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setShowEntireSales(false)}
            className={`px-4 py-2 rounded-lg border text-sm font-semibold transition-colors ${
              !showEntireSales
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-slate-800 border-slate-200 hover:bg-blue-50"
            }`}
          >
            Sales Report
          </button>
          <button
            type="button"
            onClick={() => setShowEntireSales(true)}
            className={`px-4 py-2 rounded-lg border text-sm font-semibold transition-colors ${
              showEntireSales
                ? "bg-emerald-600 text-white border-emerald-600"
                : "bg-white text-slate-800 border-slate-200 hover:bg-emerald-50"
            }`}
          >
            Entire Sales Report
          </button>
        </div>

        <FormField label={showEntireSales ? "Entire Sales Report" : "Sales Report"} description="Select a report template." required>
          <SearchSelect
            key={showEntireSales ? "entire" : "sales"}
            placeholder={showEntireSales ? "Search entire sales reports" : "Search sales reports"}
            value={selectedReport}
            onSelect={(option) => setSelectedReport(option)}
            onSearch={setSearchTerm}
            results={filteredReports}
            emptyMessage={searchTerm.trim() ? "No sales reports found." : "Start typing a report name."}
          />
        </FormField>
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 text-sm text-slate-600">
          {selectedReport ? (
            <>
              <p className="text-base font-semibold text-slate-800">{selectedReport.label}</p>
              <p className="mt-2 text-xs text-slate-500">
                {selectedReport.path
                  ? "Click the button below to view this report."
                  : "This report will be implemented soon."}
              </p>
              {selectedReport.path && (
                <button
                  type="button"
                  onClick={handleViewReport}
                  className="mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                >
                  View Report
                </button>
              )}
            </>
          ) : (
            <p className="text-xs text-slate-500">Select any sales report above to view details.</p>
          )}
        </div>
      </div>
    </SectionCard>
  );
};

export default SalesReportMenuPage;
