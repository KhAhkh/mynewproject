import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import SectionCard from "../../components/SectionCard.jsx";
import FormField from "../../components/FormField.jsx";
import SearchSelect from "../../components/SearchSelect.jsx";

const profitReportOptions = [
  { value: "net-profit", label: "ENTIRE NET PROFIT" },
  { value: "item-profit-summary", label: "ENTIRE ITEMS PROFIT SUMMARY" },
  { value: "customer-profit-summary", label: "ENTIRE CUSTOMERS PROFIT SUMMARY" },
  { value: "company-profit-summary", label: "ENTIRE COMPANIES PROFIT SUMMARY" },
  { value: "date-profit-with-return", label: "DATE WISE PROFIT WITH RETURN" },
  { value: "salesman-profit-summary", label: "ENTIRE SALESMAN PROFIT SUMMARY" }
];

const reportDescriptions = {
  "net-profit": "Complete profit analysis for your entire business with realized vs unrealized profit breakdown.",
  "item-profit-summary": "Item-wise profit analysis showing which products are most profitable and collection status.",
  "customer-profit-summary": "Customer-wise profit tracking with payment status and outstanding amounts.",
  "company-profit-summary": "Company-wise profit distribution across your product lines.",
  "date-profit-with-return": "Daily profit trends showing how your profitability changes over time.",
  "salesman-profit-summary": "Salesman-wise profit performance metrics for commission calculations."
};

const reportRoutes = {
  "net-profit": "/reports/net-profit",
  "item-profit-summary": "/reports/items-profit-summary",
  "customer-profit-summary": "/reports/customers-profit-summary",
  "company-profit-summary": "/reports/companies-profit-summary",
  "date-profit-with-return": "/reports/date-wise-profit",
  "salesman-profit-summary": "/reports/salesman-profit-summary"
};

const ProfitReportMenuPage = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedReport, setSelectedReport] = useState(null);

  const filteredReports = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return profitReportOptions;
    return profitReportOptions.filter((option) => option.label.toLowerCase().includes(term));
  }, [searchTerm]);

  const handleSelectReport = (option) => {
    setSelectedReport(option);
  };

  const handleViewReport = () => {
    if (selectedReport && reportRoutes[selectedReport.value]) {
      navigate(reportRoutes[selectedReport.value]);
    }
  };

  return (
    <SectionCard
      title="Profit Report Launcher"
      description="Select a profit report to view detailed analysis with realized and unrealized profit metrics."
    >
      <div className="space-y-6">
        <FormField
          label="Profit Report"
          description="Pick the summary you want to view."
          required
        >
          <SearchSelect
            placeholder="Search profit reports"
            value={selectedReport}
            onSelect={handleSelectReport}
            onSearch={setSearchTerm}
            results={filteredReports}
            emptyMessage={searchTerm.trim() ? "No profit reports found." : "Start typing a report name."}
          />
        </FormField>
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 text-sm text-slate-600">
          {selectedReport ? (
            <>
              <p className="text-base font-semibold text-slate-800">{selectedReport.label}</p>
              <p className="mt-2 text-xs text-slate-500">
                {reportDescriptions[selectedReport.value]}
              </p>
              <button
                onClick={handleViewReport}
                className="mt-4 rounded-lg bg-blue-600 text-white px-4 py-2 font-medium hover:bg-blue-700 transition-colors"
              >
                View Report →
              </button>
            </>
          ) : (
            <p className="text-xs text-slate-500">
              Choose any profit report to view its details including realized profit (from paid amounts) and unrealized profit (from outstanding amounts).
            </p>
          )}
        </div>
      </div>
    </SectionCard>
  );
};

export default ProfitReportMenuPage;
