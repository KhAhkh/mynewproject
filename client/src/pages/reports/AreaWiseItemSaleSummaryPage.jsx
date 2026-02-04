import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import SectionCard from "../../components/SectionCard.jsx";
import SearchSelect from "../../components/SearchSelect.jsx";
import FormField from "../../components/FormField.jsx";
import { api } from "../../api/client.js";
import dayjs from "dayjs";
import { FiDownload, FiPrinter, FiRefreshCw } from "react-icons/fi";

const formatCurrency = (value) =>
  `Rs ${Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const AreaWiseItemSaleSummaryPage = () => {
  const [areaSearch, setAreaSearch] = useState("");
  const [selectedArea, setSelectedArea] = useState(null);
  const [dateRange, setDateRange] = useState(() => ({
    start: dayjs().startOf("month").format("DD-MM-YYYY"),
    end: dayjs().format("DD-MM-YYYY")
  }));
  const reportRef = useRef(null);

  const reportPrintStyles = `
    <style>
      @page { size: A4 landscape; margin: 12mm 16mm 16mm 16mm; }
      html, body { width: 297mm; min-height: 210mm; }
      * { box-sizing: border-box; }
      body { font-family: Arial, sans-serif; margin: 0; padding: 16px; color: #0f172a; }
      h1 { font-size: 18px; letter-spacing: 0.08em; margin-bottom: 10px; text-align: center; text-transform: uppercase; }
      p { margin: 4px 0; font-size: 11px; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
      th, td { border: 1px solid #1e293b; padding: 4px 6px; text-align: left; }
      th { background: #e2e8f0; font-weight: 600; letter-spacing: 0.06em; }
      td:nth-child(1) { text-align: center; width: 5%; }
      td:nth-child(3) { text-align: right; width: 12%; }
      td:nth-child(4) { text-align: right; width: 15%; }
      tfoot td { font-weight: 700; background: #f1f5f9; }
    </style>
  `;

  const hasValidRange = Boolean(selectedArea?.value && dateRange.start && dateRange.end);

  const areaDirectory = useQuery({
    queryKey: ["areas-directory", areaSearch],
    staleTime: 0,
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

  const reportQuery = useQuery({
    queryKey: ["area-wise-item-summary", selectedArea?.value, dateRange.start, dateRange.end],
    enabled: hasValidRange,
    queryFn: async () => {
      const response = await api.get("/reports/sales/area-wise-item-summary", {
        params: {
          areaCode: selectedArea.value,
          startDate: dateRange.start,
          endDate: dateRange.end
        }
      });
      return response.data;
    }
  });

  const rows = reportQuery.data?.rows ?? [];
  const totals = reportQuery.data?.totals ?? { quantity: 0, totalAmount: 0, itemCount: 0 };
  const area = reportQuery.data?.area ?? {};
  const displayStartDate = reportQuery.data?.startDate;
  const displayEndDate = reportQuery.data?.endDate;

  const handlePrint = () => {
    if (!reportRef?.current) return;

    const contentClone = reportRef.current.cloneNode(true);
    if (!contentClone) return;

    const printWindow = window.open("", "_blank", "width=1024,height=768");
    if (!printWindow) return;

    const { document: printDocument } = printWindow;

    printDocument.open();
    printDocument.write(
      `<!doctype html><html><head><meta charset="utf-8" /><title>Area Wise Item Sale Summary</title>${reportPrintStyles}</head><body><div id="print-root"></div></body></html>`
    );
    printDocument.close();

    const mountContent = () => {
      const printRoot = printDocument.getElementById("print-root");
      if (!printRoot) return;

      const titleHeading = printDocument.createElement("h1");
      titleHeading.textContent = "AREA WISE ITEM SALE SUMMARY";
      printRoot.appendChild(titleHeading);

      const dateInfo = printDocument.createElement("p");
      dateInfo.textContent = `Area: ${area.name || selectedArea?.label || ""} | Period: ${displayStartDate} to ${displayEndDate}`;
      printRoot.appendChild(dateInfo);

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

  const handleExport = () => {
    const header = ["Sr. No", "Item Name", "Quantity", "Total Amount"];
    const dataRows = rows.map((row) => [
      row.srNo,
      row.itemName || "",
      Number(row.quantity || 0).toFixed(2),
      Number(row.totalAmount || 0).toFixed(2)
    ]);

    dataRows.push(["", "TOTAL", Number(totals.quantity).toFixed(2), Number(totals.totalAmount).toFixed(2)]);

    const csvContent = [header, ...dataRows].map((row) => row.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `area-wise-item-summary-${selectedArea?.value || "unknown"}-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  const handleRefresh = () => {
    reportQuery.refetch();
  };

  return (
    <SectionCard
      title="Area Wise Item Sale Summary"
      description="View itemized sales for a specific area within a date range."
    >
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <FormField label="Area" required>
            <SearchSelect
              placeholder="Search area..."
              value={selectedArea}
              onSelect={setSelectedArea}
              onSearch={setAreaSearch}
              results={areaDirectory.data ?? []}
              loading={areaDirectory.isLoading}
              emptyMessage={areaSearch.trim() ? "No areas found." : "Start typing an area name."}
            />
          </FormField>

          <FormField label="Start Date" required>
            <input
              type="text"
              placeholder="DD-MM-YYYY"
              value={dateRange.start}
              onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </FormField>

          <FormField label="End Date" required>
            <input
              type="text"
              placeholder="DD-MM-YYYY"
              value={dateRange.end}
              onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </FormField>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleRefresh}
            disabled={!hasValidRange || reportQuery.isLoading}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:border-blue-300 hover:text-blue-600 hover:ring-2 hover:ring-blue-100 disabled:opacity-50"
          >
            <FiRefreshCw className={reportQuery.isLoading ? "animate-spin" : ""} />
            Refresh
          </button>

          {rows.length > 0 && (
            <>
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
            </>
          )}
        </div>

        {reportQuery.error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Error: {reportQuery.error?.message || "Failed to load report."}
          </div>
        )}

        {reportQuery.isLoading && (
          <div className="flex justify-center py-8">
            <div className="text-sm text-slate-600">Loading report data...</div>
          </div>
        )}

        {rows.length === 0 && !reportQuery.isLoading && hasValidRange && (
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-center text-sm text-yellow-700">
            No data found for the selected area and date range.
          </div>
        )}

        {rows.length > 0 && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
                <p className="text-xs text-blue-700 uppercase font-medium">Total Items</p>
                <p className="text-2xl font-bold text-blue-900 mt-1">{totals.itemCount || 0}</p>
              </div>
              <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4 border border-purple-200">
                <p className="text-xs text-purple-700 uppercase font-medium">Total Quantity</p>
                <p className="text-2xl font-bold text-purple-900 mt-1">{Number(totals.quantity || 0).toFixed(2)}</p>
              </div>
              <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-lg p-4 border border-emerald-200">
                <p className="text-xs text-emerald-700 uppercase font-medium">Total Amount</p>
                <p className="text-2xl font-bold text-emerald-900 mt-1">{formatCurrency(totals.totalAmount)}</p>
              </div>
            </div>

            {/* Table */}
            <div ref={reportRef} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-gradient-to-r from-slate-50 to-slate-100">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                        Sr. No
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                        Item Name
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">
                        Quantity
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">
                        Total Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-100">
                    {rows.map((row) => (
                      <tr key={row.itemCode} className="hover:bg-blue-50 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-800 font-medium">
                          {row.srNo}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-800">
                          {row.itemName}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-slate-800">
                          {Number(row.quantity || 0).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-slate-900 font-medium">
                          {formatCurrency(row.totalAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gradient-to-r from-slate-100 to-slate-50">
                    <tr>
                      <td colSpan="2" className="px-4 py-4 text-sm font-bold text-slate-800">
                        TOTAL - - &gt;
                      </td>
                      <td className="px-4 py-4 text-sm text-right font-bold text-slate-900">
                        {Number(totals.quantity || 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-4 text-sm text-right font-bold text-slate-900">
                        {formatCurrency(totals.totalAmount)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </SectionCard>
  );
};

export default AreaWiseItemSaleSummaryPage;
