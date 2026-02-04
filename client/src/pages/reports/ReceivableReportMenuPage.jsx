import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import SectionCard from "../../components/SectionCard.jsx";
import FormField from "../../components/FormField.jsx";
import SearchSelect from "../../components/SearchSelect.jsx";

// Receivable report options based on the provided sample
const receivableReportOptions = [
  { value: "customer-receivable-summary", label: "CUSTOMER RECEIVABLE SUMMARY", path: "/reports/receivables/summary" },
  { value: "customer-wise-ledger", label: "CUSTOMER WISE LEDGER", path: "/reports/receivables/customer-ledger" },
  { value: "salesman-wise-balance", label: "SALESMAN WISE BALANCE", path: "/reports/receivables/salesman-wise-balance" },
  { value: "area-wise-balance", label: "AREA WISE BALANCE", path: "/reports/receivables/area-wise-balance" },
  { value: "salesman-area-wise-balance", label: "SALESMAN+AREA WISE BALANCE", path: "/reports/receivables/salesman-area-wise-balance" },
  { value: "customer-salesman-wise-ledger", label: "CUSTOMER+SALESMAN WISE LEDGER", path: "/reports/receivables/salesman-customer-ledger" }
];

const ReceivableReportMenuPage = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedReport, setSelectedReport] = useState(null);

  const filteredReports = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return receivableReportOptions;
    return receivableReportOptions.filter((option) => option.label.toLowerCase().includes(term));
  }, [searchTerm]);

  const handleViewReport = () => {
    if (selectedReport?.path) {
      navigate(selectedReport.path);
    }
  };

  return (
    <SectionCard
      title="Receivable Reports"
      description="Choose a receivable report. Implemented options will navigate to their pages; others are coming soon."
    >
      <div className="space-y-6">
        <FormField label="Receivable Report" description="Select a report template." required>
          <SearchSelect
            placeholder="Search receivable reports"
            value={selectedReport}
            onSelect={(option) => setSelectedReport(option)}
            onSearch={setSearchTerm}
            results={filteredReports}
            emptyMessage={searchTerm.trim() ? "No receivable reports found." : "Start typing a report name."}
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
            <p className="text-xs text-slate-500">Select any receivable report above to view details.</p>
          )}
        </div>
      </div>
    </SectionCard>
  );
};

export default ReceivableReportMenuPage;
