import { useQuery } from "@tanstack/react-query";
import { useState, useRef } from "react";
import SectionCard from "../../components/SectionCard.jsx";
import FormField from "../../components/FormField.jsx";
import SearchSelect from "../../components/SearchSelect.jsx";
import { fetchCompanyStatementReport } from "../../api/queries.js";
import { api } from "../../api/client.js";

const formatNumber = (value) => {
  const num = Number(value ?? 0);
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

const reportPrintStyles = `
@media print {
  @page { size: A4 landscape; margin: 12mm; }
  body { font-family: Arial, sans-serif; font-size: 10pt; margin: 0; padding: 0; }
  table { width: 100%; border-collapse: collapse; page-break-inside: auto; }
  tr { page-break-inside: avoid; page-break-after: auto; }
  th, td { border: 1px solid #000; padding: 3px 5px; text-align: left; }
  th { background-color: #f0f0f0; font-weight: bold; }
  tfoot { background-color: #e8e8e8; font-weight: bold; }
  .text-right { text-align: right; }
  .font-bold { font-weight: bold; }
  .item-name { font-weight: bold; }
  .item-code { font-size: 9pt; color: #666; }
}
`;

const CompanyStatementPage = () => {
  const reportRef = useRef(null);
  const [companySearch, setCompanySearch] = useState("");
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [dateRange, setDateRange] = useState({ start: "", end: "" });

  const hasValidRange = Boolean(
    selectedCompany &&
    dateRange.start &&
    dateRange.end &&
    dateRange.start <= dateRange.end
  );

  const {
    data: companyDirectory,
  } = useQuery({
    queryKey: ["companies-directory", companySearch],
    staleTime: 0,
    queryFn: async () => {
      const response = await api.get("/companies", {
        params: {
          search: companySearch || undefined,
          limit: 50,
          offset: 0,
        },
      });
      const data = Array.isArray(response.data) ? response.data : [];
      return data.map((company) => ({
        value: company.code,
        label: company.name ? `${company.code} — ${company.name}` : company.code,
        code: company.code,
        name: company.name,
      }));
    },
  });

  const formatDateForAPI = (dateString) => {
    if (!dateString) return "";
    const [year, month, day] = dateString.split("-");
    return `${day}-${month}-${year}`;
  };

  const companyCode = selectedCompany?.value || selectedCompany?.code;

  const {
    data: reportData,
    isLoading: isLoadingReport,
    error: reportError,
  } = useQuery({
    queryKey: [
      "companyStatement",
      companyCode,
      dateRange.start,
      dateRange.end,
    ],
    queryFn: () =>
      fetchCompanyStatementReport(
        companyCode,
        formatDateForAPI(dateRange.start),
        formatDateForAPI(dateRange.end)
      ),
    enabled: hasValidRange && !!companyCode,
  });

  const handlePrint = () => {
    if (!reportRef.current) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const clonedContent = reportRef.current.cloneNode(true);
    printWindow.document.write(`
      <html>
        <head>
          <title>Company Statement (T.P.) Report - Print</title>
          <style>${reportPrintStyles}</style>
        </head>
        <body>${clonedContent.outerHTML}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  const handleExportCSV = () => {
    if (!reportData?.rows || reportData.rows.length === 0) return;

    const headers = [
      "Item Code",
      "Item Name",
      "Base Unit",
      "Pack Size",
      "T.P.",
      "Opening Qty",
      "Purchase Qty",
      "Purchase Bonus",
      "Purchase Amount",
      "Total Qty",
      "Total Amount",
      "Sales Qty",
      "Sales Bonus",
      "Sales Amount",
      "Purchase Return",
      "Sale Return",
      "Damage In",
      "Damage Out",
      "Closing Qty",
      "Closing Cartons",
      "Closing Pieces",
      "Closing Amount",
      "Packing Label",
      "Packing Qty",
    ];

    const rows = reportData.rows.map((row) => [
      row.itemCode,
      row.itemName,
      row.baseUnit || "",
      row.packSize,
      row.tradePrice.toFixed(2),
      row.openingQty.toFixed(2),
      row.purchaseQty.toFixed(2),
      row.purchaseBonus.toFixed(2),
      row.purchaseAmount.toFixed(2),
      row.totalQty.toFixed(2),
      row.totalAmount.toFixed(2),
      row.salesQty.toFixed(2),
      row.salesBonus.toFixed(2),
      row.salesAmount.toFixed(2),
      row.purchaseReturnQty.toFixed(2),
      row.saleReturnQty.toFixed(2),
      row.damageInQty.toFixed(2),
      row.damageOutQty.toFixed(2),
      row.closingQty.toFixed(2),
      row.closingCartons.toFixed(2),
      row.closingPieces.toFixed(2),
      row.closingAmount.toFixed(2),
      row.packingLabel || "",
      row.packingQty.toFixed(2),
    ]);

    if (reportData.totals) {
      rows.push([
        "TOTAL",
        "",
        "",
        "",
        "",
        reportData.totals.openingQty.toFixed(2),
        reportData.totals.purchaseQty.toFixed(2),
        reportData.totals.purchaseBonus.toFixed(2),
        reportData.totals.purchaseAmount.toFixed(2),
        reportData.totals.totalQty.toFixed(2),
        reportData.totals.totalAmount.toFixed(2),
        reportData.totals.salesQty.toFixed(2),
        reportData.totals.salesBonus.toFixed(2),
        reportData.totals.salesAmount.toFixed(2),
        reportData.totals.purchaseReturnQty.toFixed(2),
        reportData.totals.saleReturnQty.toFixed(2),
        reportData.totals.damageInQty.toFixed(2),
        reportData.totals.damageOutQty.toFixed(2),
        reportData.totals.closingQty.toFixed(2),
        reportData.totals.closingCartons.toFixed(2),
        reportData.totals.closingPieces.toFixed(2),
        reportData.totals.closingAmount.toFixed(2),
        "",
        reportData.totals.packingQty.toFixed(2),
      ]);
    }

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `company_statement_${companyCode}_${formatDateForAPI(dateRange.start)}_${formatDateForAPI(dateRange.end)}.csv`
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Company Wise Statement (T.P.)</h1>
      </div>

      <SectionCard title="Report Filters">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormField label="Company" required description="Select a company to view its statement.">
            <SearchSelect
              value={selectedCompany}
              results={companyDirectory || []}
              onSelect={setSelectedCompany}
              onSearch={setCompanySearch}
              placeholder="Search and select company..."
            />
          </FormField>

          <FormField label="Start Date" required description="Beginning of the reporting window (DD-MM-YYYY).">
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
              type="date"
              value={dateRange.start}
              onChange={(e) =>
                setDateRange((prev) => ({ ...prev, start: e.target.value }))
              }
            />
          </FormField>

          <FormField label="End Date" required description="End of the reporting window (DD-MM-YYYY).">
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
              type="date"
              value={dateRange.end}
              onChange={(e) =>
                setDateRange((prev) => ({ ...prev, end: e.target.value }))
              }
            />
          </FormField>
        </div>
      </SectionCard>

      {reportError && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded">
          <p className="text-red-800">
            Error:{" "}
            {reportError?.response?.data?.message ||
              reportError?.message ||
              "Failed to load report"}
          </p>
        </div>
      )}

      {isLoadingReport && (
        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded">
          <p className="text-blue-800">Loading report...</p>
        </div>
      )}

      {reportData && (
        <div className="mt-6">
          <div className="flex gap-2 mb-4">
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Print Report
            </button>
            <button
              onClick={handleExportCSV}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Export to CSV
            </button>
          </div>

          <div
            ref={reportRef}
            className="bg-white border border-gray-300 rounded overflow-x-auto"
          >
            <div className="p-4 border-b border-gray-300">
              <h2 className="text-lg font-bold mb-2">
                {reportData.company?.name}
              </h2>
              <p className="text-sm text-gray-600">
                Period: {reportData.startDate} to {reportData.endDate}
              </p>
            </div>

            <table className="w-full text-xs font-mono">
              <thead className="bg-gray-100 text-gray-700 uppercase tracking-wide">
                <tr>
                  <th
                    className="px-3 py-2 text-left border border-gray-300 w-56"
                    rowSpan="2"
                  >
                    Item Description
                  </th>
                  <th
                    className="px-3 py-2 text-right border border-gray-300"
                    rowSpan="2"
                  >
                    Trade Price
                  </th>
                  <th
                    className="px-3 py-2 text-right border border-gray-300"
                    rowSpan="2"
                  >
                    Opening Qty
                  </th>
                  <th
                    className="px-3 py-2 text-center border border-gray-300"
                    colSpan="3"
                  >
                    Purchase
                  </th>
                  <th
                    className="px-3 py-2 text-center border border-gray-300"
                    colSpan="2"
                  >
                    Total Available
                  </th>
                  <th
                    className="px-3 py-2 text-center border border-gray-300"
                    colSpan="3"
                  >
                    Sales
                  </th>
                  <th
                    className="px-3 py-2 text-right border border-gray-300"
                    rowSpan="2"
                  >
                    Pur. Return
                  </th>
                  <th
                    className="px-3 py-2 text-center border border-gray-300"
                    colSpan="2"
                  >
                    Damage
                  </th>
                  <th
                    className="px-3 py-2 text-center border border-gray-300"
                    colSpan="3"
                  >
                    Closing Stock
                  </th>
                </tr>
                <tr>
                  <th className="px-3 py-2 text-right border border-gray-300">Qty</th>
                  <th className="px-3 py-2 text-right border border-gray-300">
                    Bonus
                  </th>
                  <th className="px-3 py-2 text-right border border-gray-300">
                    Amount
                  </th>
                  <th className="px-3 py-2 text-right border border-gray-300">Qty</th>
                  <th className="px-3 py-2 text-right border border-gray-300">
                    Amount
                  </th>
                  <th className="px-3 py-2 text-right border border-gray-300">Qty</th>
                  <th className="px-3 py-2 text-right border border-gray-300">
                    Bonus
                  </th>
                  <th className="px-3 py-2 text-right border border-gray-300">
                    Amount
                  </th>
                  <th className="px-3 py-2 text-right border border-gray-300">In</th>
                  <th className="px-3 py-2 text-right border border-gray-300">
                    Out
                  </th>
                  <th className="px-3 py-2 text-right border border-gray-300">
                    Packing
                  </th>
                  <th className="px-3 py-2 text-right border border-gray-300">PCS</th>
                  <th className="px-3 py-2 text-right border border-gray-300">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {reportData.rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan="24"
                      className="border border-gray-300 px-3 py-4 text-center text-gray-500"
                    >
                      No data found for the selected criteria
                    </td>
                  </tr>
                ) : (
                  <>
                    {reportData.rows.map((row, index) => (
                      <tr key={index} className="hover:bg-gray-50 border-b border-gray-200">
                        <td className="px-3 py-2 text-left border border-gray-300">
                          <div className="font-semibold text-gray-800">
                            {row.itemName}
                          </div>
                          <div className="text-xs text-gray-400">{row.itemCode}</div>
                        </td>
                        <td className="px-3 py-2 text-right border border-gray-300">
                          {formatNumber(row.tradePrice)}
                        </td>
                        <td className="px-3 py-2 text-right border border-gray-300">
                          {formatNumber(row.openingQty)}
                        </td>
                        <td className="px-3 py-2 text-right border border-gray-300">
                          {formatNumber(row.purchaseQty)}
                        </td>
                        <td className="px-3 py-2 text-right border border-gray-300">
                          {formatNumber(row.purchaseBonus)}
                        </td>
                        <td className="px-3 py-2 text-right border border-gray-300">
                          {formatNumber(row.purchaseAmount)}
                        </td>
                        <td className="px-3 py-2 text-right border border-gray-300">
                          {formatNumber(row.totalQty)}
                        </td>
                        <td className="px-3 py-2 text-right border border-gray-300">
                          {formatNumber(row.totalAmount)}
                        </td>
                        <td className="px-3 py-2 text-right border border-gray-300">
                          {formatNumber(row.salesQty)}
                        </td>
                        <td className="px-3 py-2 text-right border border-gray-300">
                          {formatNumber(row.salesBonus)}
                        </td>
                        <td className="px-3 py-2 text-right border border-gray-300">
                          {formatNumber(row.salesAmount)}
                        </td>
                        <td className="px-3 py-2 text-right border border-gray-300">
                          {formatNumber(row.purchaseReturnQty)}
                        </td>
                        <td className="px-3 py-2 text-right border border-gray-300">
                          {formatNumber(row.damageInQty)}
                        </td>
                        <td className="px-3 py-2 text-right border border-gray-300">
                          {formatNumber(row.damageOutQty)}
                        </td>
                        <td className="px-3 py-2 text-right border border-gray-300">
                          <div className="font-semibold">
                            {formatNumber(row.packingQty)}
                          </div>
                          <div className="text-xs uppercase tracking-wide text-gray-400">
                            {row.packingLabel || "Pack"}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right border border-gray-300">
                          {formatNumber(row.closingPieces)}
                        </td>
                        <td className="px-3 py-2 text-right border border-gray-300">
                          {formatNumber(row.closingAmount)}
                        </td>
                      </tr>
                    ))}
                    {reportData.totals && (
                      <tr className="bg-gray-100 font-semibold">
                        <td
                          colSpan="2"
                          className="border border-gray-300 px-3 py-2 text-left"
                        >
                          Totals
                        </td>
                        <td className="border border-gray-300 px-3 py-2 text-right">
                          {formatNumber(reportData.totals.openingQty)}
                        </td>
                        <td className="border border-gray-300 px-3 py-2 text-right">
                          {formatNumber(reportData.totals.purchaseQty)}
                        </td>
                        <td className="border border-gray-300 px-3 py-2 text-right">
                          {formatNumber(reportData.totals.purchaseBonus)}
                        </td>
                        <td className="border border-gray-300 px-3 py-2 text-right">
                          {formatNumber(reportData.totals.purchaseAmount)}
                        </td>
                        <td className="border border-gray-300 px-3 py-2 text-right">
                          {formatNumber(reportData.totals.totalQty)}
                        </td>
                        <td className="border border-gray-300 px-3 py-2 text-right">
                          {formatNumber(reportData.totals.totalAmount)}
                        </td>
                        <td className="border border-gray-300 px-3 py-2 text-right">
                          {formatNumber(reportData.totals.salesQty)}
                        </td>
                        <td className="border border-gray-300 px-3 py-2 text-right">
                          {formatNumber(reportData.totals.salesBonus)}
                        </td>
                        <td className="border border-gray-300 px-3 py-2 text-right">
                          {formatNumber(reportData.totals.salesAmount)}
                        </td>
                        <td className="border border-gray-300 px-3 py-2 text-right">
                          {formatNumber(reportData.totals.purchaseReturnQty)}
                        </td>
                        <td className="border border-gray-300 px-3 py-2 text-right">
                          {formatNumber(reportData.totals.damageInQty)}
                        </td>
                        <td className="border border-gray-300 px-3 py-2 text-right">
                          {formatNumber(reportData.totals.damageOutQty)}
                        </td>
                        <td className="border border-gray-300 px-3 py-2 text-right">
                          {formatNumber(reportData.totals.packingQty)}
                        </td>
                        <td className="border border-gray-300 px-3 py-2 text-right">
                          {formatNumber(reportData.totals.closingPieces)}
                        </td>
                        <td className="border border-gray-300 px-3 py-2 text-right">
                          {formatNumber(reportData.totals.closingAmount)}
                        </td>
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default CompanyStatementPage;
