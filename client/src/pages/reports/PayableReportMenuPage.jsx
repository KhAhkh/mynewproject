import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import SectionCard from "../../components/SectionCard.jsx";
import FormField from "../../components/FormField.jsx";
import SearchSelect from "../../components/SearchSelect.jsx";

const payableReportOptions = [
  { value: "supplier-payable-summary", label: "Supplier Payable Summary", path: "/reports/payable/supplier-summary" },
  { value: "supplier-wise-ledger", label: "Supplier Wise Ledger", path: "/reports/payable/supplier-ledger" }
];

const PayableReportMenuPage = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedReport, setSelectedReport] = useState(null);

  const filteredReports = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return payableReportOptions;
    return payableReportOptions.filter((option) => option.label.toLowerCase().includes(term));
  }, [searchTerm]);

  const handleNavigate = () => {
    if (selectedReport?.path) {
      navigate(selectedReport.path);
    }
  };

  return (
    <SectionCard
      title="Payable Report Launcher"
      description="Pick a supplier payable snapshot. Detailed flows will be wired later."
    >
      <div className="space-y-6">
        <FormField
          label="Payable Report"
          description="Select the report you want to configure next."
          required
        >
          <SearchSelect
            placeholder="Search payable reports"
            value={selectedReport}
            onSelect={(option) => setSelectedReport(option)}
            onSearch={setSearchTerm}
            results={filteredReports}
            emptyMessage={searchTerm.trim() ? "No payable reports found." : "Start typing a report name."}
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
                  Tell me the steps for this report and I will connect the logic.
                </p>
              )}
            </>
          ) : (
            <p className="text-xs text-slate-500">
              Use the dropdown above to choose a payable report template.
            </p>
          )}
        </div>
      </div>
    </SectionCard>
  );
};

export default PayableReportMenuPage;
