import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import SectionCard from "../../components/SectionCard.jsx";
import FormField from "../../components/FormField.jsx";
import SearchSelect from "../../components/SearchSelect.jsx";

const stockReportOptions = [
  { value: "company-wise-stock-cost", label: "Company Wise Stock On Cost", path: "/reports/stock/company-wise-cost" },
  { value: "company-wise-stock-tp", label: "Company Wise Stock On T.P.", path: "/reports/stock/company-wise-tp" },
  { value: "stock-less-than-zero", label: "Stock Less Than Zero" },
  { value: "damage-stock-statement", label: "Entire Damage Stock Statement" }
];

const StockReportMenuPage = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedReport, setSelectedReport] = useState(null);

  const filteredReports = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return stockReportOptions;
    return stockReportOptions.filter((option) => option.label.toLowerCase().includes(term));
  }, [searchTerm]);

  const handleSelectReport = (option) => {
    setSelectedReport(option);
    if (option.path) {
      navigate(option.path);
    }
  };

  return (
    <SectionCard
      title="Stock Report Launcher"
      description="Choose from the legacy stock report styles. We will attach the actual flows soon."
    >
      <div className="space-y-6">
        <FormField
          label="Stock Report"
          description="Select which stock analysis you want to prioritize."
          required
        >
          <SearchSelect
            placeholder="Search stock reports"
            value={selectedReport}
            onSelect={handleSelectReport}
            onSearch={setSearchTerm}
            results={filteredReports}
            emptyMessage={searchTerm.trim() ? "No stock reports found." : "Start typing a report name."}
          />
        </FormField>
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 text-sm text-slate-600">
          {selectedReport ? (
            <>
              <p className="text-base font-semibold text-slate-800">{selectedReport.label}</p>
              <p className="mt-2 text-xs text-slate-500">
                {selectedReport.path ? "Loading report..." : "Tell me how this report should behave and we will wire the actions next."}
              </p>
            </>
          ) : (
            <p className="text-xs text-slate-500">
              Pick any option above to outline how the stock report screen should respond.
            </p>
          )}
        </div>
      </div>
    </SectionCard>
  );
};

export default StockReportMenuPage;
