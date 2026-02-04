import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import SectionCard from "../../components/SectionCard.jsx";
import FormField from "../../components/FormField.jsx";
import SearchSelect from "../../components/SearchSelect.jsx";

const paymentReportOptions = [
  { value: "date-wise-supplier-payment", label: "Date Wise Supplier Payment", path: "/reports/payment/supplier-date-wise" },
  { value: "expense-report", label: "Expense Report", path: "/reports/payment/expense-report" }
];

const PaymentReportMenuPage = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedReport, setSelectedReport] = useState(null);

  const filteredReports = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return paymentReportOptions;
    return paymentReportOptions.filter((option) => option.label.toLowerCase().includes(term));
  }, [searchTerm]);

  const handleViewReport = () => {
    if (selectedReport?.path) {
      navigate(selectedReport.path);
    }
  };

  return (
    <SectionCard
      title="Payment Report Launcher"
      description="Choose a payment report to view detailed payment information."
    >
      <div className="space-y-6">
        <FormField
          label="Payment Report"
          description="Select a report template to view payment details."
          required
        >
          <SearchSelect
            placeholder="Search payment reports"
            value={selectedReport}
            onSelect={(option) => setSelectedReport(option)}
            onSearch={setSearchTerm}
            results={filteredReports}
            emptyMessage={searchTerm.trim() ? "No payment reports found." : "Start typing a report name."}
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
            <p className="text-xs text-slate-500">
              Select any payment report above to view details.
            </p>
          )}
        </div>
      </div>
    </SectionCard>
  );
};

export default PaymentReportMenuPage;
