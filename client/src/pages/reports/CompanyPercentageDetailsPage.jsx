import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FiDownload, FiPrinter, FiRefreshCw } from "react-icons/fi";
import dayjs from "dayjs";
import SectionCard from "../../components/SectionCard.jsx";
import SearchSelect from "../../components/SearchSelect.jsx";
import FormField from "../../components/FormField.jsx";
import { api } from "../../api/client.js";

const formatCurrency = (value) =>
  `Rs ${Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const CompanyPercentageDetailsPage = () => {
  const [companySearch, setCompanySearch] = useState("");
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [dateRange, setDateRange] = useState(() => ({
    start: dayjs().startOf("month").format("DD-MM-YYYY"),
    end: dayjs().format("DD-MM-YYYY")
  }));
  const reportRef = useRef(null);

  const reportPrintStyles = `
    <style>
      @page { size: A4 landscape; margin: 16mm 14mm 18mm 14mm; }
      html, body { width: 297mm; min-height: 210mm; }
      * { box-sizing: border-box; }
      body { font-family: Arial, sans-serif; margin: 0; padding: 18px; color: #0f172a; }
      h1 { font-size: 18px; margin-bottom: 8px; text-align: center; }
      h2 { font-size: 14px; margin-bottom: 12px; text-align: center; color: #475569; }
      p { margin: 4px 0; font-size: 11px; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 10px; }
      th, td { border: 1px solid #cbd5f5; padding: 4px 6px; text-align: left; }
      th { background: #e2e8f0; text-transform: uppercase; font-size: 9px; letter-spacing: 0.04em; }
      .text-right { text-align: right; }
      tfoot td { font-weight: 600; background: #f1f5f9; }
    </style>
  `;

  const scrollbarStyles = `
    .thick-scrollbar::-webkit-scrollbar {
      width: 12px;
      height: 12px;
    }
    .thick-scrollbar::-webkit-scrollbar-track {
      background: #f1f5f9;
      border-radius: 10px;
    }
    .thick-scrollbar::-webkit-scrollbar-thumb {
      background: #cbd5f5;
      border-radius: 10px;
    }
    .thick-scrollbar::-webkit-scrollbar-thumb:hover {
      background: #94a3b8;
    }
    .thick-scrollbar {
      scrollbar-width: thick;
      scrollbar-color: #cbd5f5 #f1f5f9;
    }
  `;

  const hasValidRange = Boolean(
    selectedCompany?.value && 
    dateRange.start && 
    dateRange.end
  );

  const companyDirectory = useQuery({
    queryKey: ["companies-directory", companySearch],
    staleTime: 0,
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
        label: company.name ? `${company.code} — ${company.name}` : company.code,
        name: company.name
      }));
    }
  });

  const reportQuery = useQuery({
    queryKey: ["company-percentage-details", selectedCompany?.value, dateRange.start, dateRange.end],
    enabled: hasValidRange,
    queryFn: async () => {
      const response = await api.get("/reports/sales/company-percentage-details", {
        params: {
          companyCode: selectedCompany.value,
          startDate: dateRange.start,
          endDate: dateRange.end
        }
      });
      return response.data;
    }
  });

  const rows = reportQuery.data?.rows ?? [];
  const totals = reportQuery.data?.totals ?? { fullQty: 0, grossValue: 0, netValue: 0, rowCount: 0 };
  const company = reportQuery.data?.company ?? null;

  const handlePrint = () => {
    if (!reportRef?.current) return;

    const contentClone = reportRef.current.cloneNode(true);
    if (!contentClone) return;

    const printWindow = window.open("", "_blank", "width=1200,height=900");
    if (!printWindow) return;

    const { document: printDocument } = printWindow;

    printDocument.open();
    printDocument.write(
      `<!doctype html><html><head><meta charset="utf-8" /><title>Company + Percentage Details</title>${reportPrintStyles}</head><body>
        <h1>ITEMS SOLD ON DISCOUNT</h1>
        <h2>Company: ${company?.name || ""} (${company?.code || ""})</h2>
        <p style="text-align: center;">From ${dateRange.start} To ${dateRange.end}</p>
        <div id="print-root"></div>
      </body></html>`
    );
    printDocument.close();

    const mountContent = () => {
      const printRoot = printDocument.getElementById("print-root");
      if (!printRoot) return;
      printRoot.appendChild(contentClone);

      setTimeout(() => {
        printWindow.print();
        printWindow.onafterprint = () => printWindow.close();
      }, 250);
    };

    if (printDocument.readyState === "loading") {
      printDocument.addEventListener("DOMContentLoaded", mountContent);
    } else {
      mountContent();
    }
  };

  const handleExport = () => {
    const header = ["Inv.#", "Inv.Date", "Customer Name", "Item Name", "Rate", "Full", "B.Full", "Disc.", "TAX", "Gross Value", "Net Value"];
    const dataRows = rows.map((row) => [
      row.invoiceNo || "",
      row.invoiceDate || "",
      row.customerName || "",
      row.itemName || "",
      Number(row.rate || 0).toFixed(2),
      Number(row.fullQty || 0).toFixed(2),
      Number(row.bonusQty || 0).toFixed(2),
      `${Number(row.discountPercent || 0).toFixed(2)} %`,
      Number(row.taxPercent || 0).toFixed(2),
      Number(row.grossValue || 0).toFixed(2),
      Number(row.netValue || 0).toFixed(2)
    ]);

    dataRows.push([
      "",
      "",
      "",
      "TOTAL - - >",
      "",
      Number(totals.fullQty || 0).toFixed(2),
      "",
      "",
      "0.00",
      Number(totals.grossValue || 0).toFixed(2),
      Number(totals.netValue || 0).toFixed(2)
    ]);

    const csvContent = [header, ...dataRows].map((row) => row.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `Company_Percentage_Details_${selectedCompany?.value}_${discountPercent}_${dateRange.start}_${dateRange.end}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <SectionCard
      title="Company + Percentage Details"
      description="View invoices showing company items sold at a specific discount percentage."
    >
      <style>{scrollbarStyles}</style>
      <div className="space-y-6">
        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Company" description="Select a company to filter by." required>
            <SearchSelect
              placeholder="Search by company code or name"
              value={selectedCompany}
              onSelect={(option) => setSelectedCompany(option)}
              onSearch={setCompanySearch}
              results={companyDirectory.data ?? []}
              emptyMessage={
                companyDirectory.isLoading
                  ? "Loading companies..."
                  : companySearch
                  ? "No companies found."
                  : "Start typing to search."
              }
            />
          </FormField>

          <div></div>

          <FormField label="Start Date" description="Enter start date (DD-MM-YYYY)." required>
            <input
              type="text"
              className="w-full px-4 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={dateRange.start}
              onChange={(event) => {
                setDateRange((prev) => ({ ...prev, start: event.target.value }));
              }}
              placeholder="DD-MM-YYYY"
            />
          </FormField>

          <FormField label="End Date" description="Enter end date (DD-MM-YYYY)." required>
            <input
              type="text"
              className="w-full px-4 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={dateRange.end}
              onChange={(event) => {
                setDateRange((prev) => ({ ...prev, end: event.target.value }));
              }}
              placeholder="DD-MM-YYYY"
            />
          </FormField>
        </div>

        {/* Results */}
        {hasValidRange && (
          <>
            {reportQuery.isLoading || reportQuery.isFetching ? (
              <div className="text-center py-12">
                <p className="text-slate-600">Loading report data…</p>
              </div>
            ) : reportQuery.isError ? (
              <div className="text-center py-12">
                <p className="text-rose-600">
                  Error loading report: {reportQuery.error?.response?.data?.message || reportQuery.error?.message || "Unknown error"}
                </p>
              </div>
            ) : rows.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-slate-600">No items sold on discount for the selected company and date range.</p>
              </div>
            ) : (
              <>
                {/* Report Header Info */}
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-200">
                  <div className="text-center">
                    <h3 className="text-lg font-bold text-slate-800">ITEMS SOLD ON DISCOUNT</h3>
                    <p className="text-sm text-slate-600 mt-1">
                      Company: <span className="font-semibold">{company?.name || ""}</span> ({company?.code || ""})
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      From {dateRange.start} To {dateRange.end}
                    </p>
                  </div>
                </div>

                {/* Controls */}
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => reportQuery.refetch()}
                    disabled={reportQuery.isFetching}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <FiRefreshCw className={reportQuery.isFetching ? "animate-spin" : ""} />
                    Refresh
                  </button>

                  <button
                    onClick={handleExport}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-300 rounded-lg hover:bg-emerald-100 transition-colors"
                  >
                    <FiDownload />
                    Export CSV
                  </button>

                  <button
                    onClick={handlePrint}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-300 rounded-lg hover:bg-amber-100 transition-colors"
                  >
                    <FiPrinter />
                    Print
                  </button>
                </div>

                {/* Summary Stats */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
                    <p className="text-xs text-blue-700 uppercase font-medium">Total Quantity</p>
                    <p className="text-2xl font-bold text-blue-900 mt-1">{Number(totals.fullQty || 0).toFixed(2)}</p>
                  </div>
                  <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4 border border-purple-200">
                    <p className="text-xs text-purple-700 uppercase font-medium">Gross Value</p>
                    <p className="text-2xl font-bold text-purple-900 mt-1">{formatCurrency(totals.grossValue)}</p>
                  </div>
                  <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-lg p-4 border border-emerald-200">
                    <p className="text-xs text-emerald-700 uppercase font-medium">Net Value</p>
                    <p className="text-2xl font-bold text-emerald-900 mt-1">{formatCurrency(totals.netValue)}</p>
                  </div>
                </div>

                {/* Table */}
                <div ref={reportRef} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="overflow-x-auto thick-scrollbar">
                    <table className="min-w-full divide-y divide-slate-200">
                      <thead className="bg-gradient-to-r from-slate-50 to-slate-100">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                            Inv.#
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                            Inv.Date
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                            Customer Name
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                            Item Name
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">
                            Rate
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">
                            Full
                          </th>
                          {rows.some(r => r.isPack) && (
                            <th className="px-4 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">
                              B.Full
                            </th>
                          )}
                          <th className="px-4 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">
                            Disc.
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">
                            TAX
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">
                            Gross Value
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">
                            Net Value
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-slate-100">
                        {rows.map((row, idx) => (
                          <tr key={row.invoiceNo + row.itemName + idx} className="hover:bg-blue-50 transition-colors">
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-800 font-medium">
                              {row.invoiceNo}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-600">
                              {row.invoiceDate}
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-800">
                              {row.customerName}
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-800">
                              {row.itemName}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-slate-800">
                              {Number(row.rate || 0).toFixed(2)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-slate-800">
                              {Number(row.fullQty || 0).toFixed(2)}
                            </td>
                            {rows.some(r => r.isPack) && (
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-slate-800">
                                {row.isPack ? `${Number(row.bonusQty || 0).toFixed(2)} (x${Number(row.packSize || 0)})` : '—'}
                              </td>
                            )}
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-slate-800">
                              {Number(row.discountPercent || 0).toFixed(2)} %
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-slate-800">
                              {Number(row.taxPercent || 0).toFixed(2)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-slate-900 font-medium">
                              {formatCurrency(row.grossValue)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-slate-900 font-semibold">
                              {formatCurrency(row.netValue)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gradient-to-r from-slate-100 to-slate-50">
                        <tr>
                          <td colSpan="4" className="px-4 py-4 text-sm font-bold text-slate-800">
                            TOTAL - - &gt;
                          </td>
                          <td className="px-4 py-4 text-sm text-right font-bold text-slate-900">
                            —
                          </td>
                          <td className="px-4 py-4 text-sm text-right font-bold text-slate-900">
                            {Number(totals.fullQty || 0).toFixed(2)}
                          </td>
                          {rows.some(r => r.isPack) && (
                            <td className="px-4 py-4 text-sm text-right font-bold text-slate-900">
                              {Number(totals.bonusQty || 0).toFixed(2)}
                            </td>
                          )}
                          <td className="px-4 py-4 text-sm text-right font-bold text-slate-900">
                            —
                          </td>
                          <td className="px-4 py-4 text-sm text-right font-bold text-slate-900">
                            0.00
                          </td>
                          <td className="px-4 py-4 text-sm text-right font-bold text-slate-900">
                            {formatCurrency(totals.grossValue)}
                          </td>
                          <td className="px-4 py-4 text-sm text-right font-bold text-slate-900">
                            {formatCurrency(totals.netValue)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </SectionCard>
  );
};

export default CompanyPercentageDetailsPage;
