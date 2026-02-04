import { useMemo, useRef, useState } from "react";
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

const formatNumber = (value) =>
  Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

const AreaCompanySalesSummaryPage = () => {
  const [areaSearch, setAreaSearch] = useState("");
  const [selectedArea, setSelectedArea] = useState(null);
  const [dateRange, setDateRange] = useState(() => ({
    start: dayjs().startOf("month").format("DD-MM-YYYY"),
    end: dayjs().format("DD-MM-YYYY")
  }));
  const reportRef = useRef(null);

  const reportPrintStyles = `
    <style>
      @page { size: A4 portrait; margin: 16mm 14mm 18mm 14mm; }
      html, body { width: 210mm; min-height: 297mm; }
      * { box-sizing: border-box; }
      body { font-family: Arial, sans-serif; margin: 0; padding: 18px; color: #0f172a; }
      h1 { font-size: 20px; margin-bottom: 12px; text-align: center; }
      p { margin: 4px 0; font-size: 12px; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
      th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
      th { background: #e2e8f0; text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em; }
      tfoot td { font-weight: 600; background: #f1f5f9; }
      .company-label { font-size: 10px; color: #94a3b8; display: block; }
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

  const salesQuery = useQuery({
    queryKey: ["area-company-sales-summary", selectedArea?.value, dateRange.start, dateRange.end],
    enabled: hasValidRange,
    queryFn: async () => {
      const response = await api.get("/reports/sales/company-area-summary", {
        params: {
          areaCode: selectedArea.value,
          startDate: dateRange.start,
          endDate: dateRange.end
        }
      });
      return response.data;
    }
  });

  const companies = salesQuery.data?.companies ?? [];
  const totals = salesQuery.data?.totals ?? {
    quantity: 0,
    amount: 0,
    companyCount: 0,
    itemCount: 0
  };

  const flatRows = useMemo(() => {
    const rows = [];
    companies.forEach((group) => {
      const items = Array.isArray(group?.items) ? group.items : [];
      items.forEach((item) => {
        rows.push({ company: group.company, item });
      });
    });
    return rows;
  }, [companies]);

  const handlePrint = () => {
    if (!reportRef?.current) return;

    const contentClone = reportRef.current.cloneNode(true);
    if (!contentClone) return;

    const printWindow = window.open("", "_blank", "width=1024,height=768");
    if (!printWindow) return;

    const { document: printDocument } = printWindow;

    printDocument.open();
    printDocument.write(
      `<!doctype html><html><head><meta charset="utf-8" /><title>Area + Company Sales Summary</title>${reportPrintStyles}</head><body><div id="print-root"></div></body></html>`
    );
    printDocument.close();

    const mountContent = () => {
      const printRoot = printDocument.getElementById("print-root");
      if (!printRoot) return;

      const titleHeading = printDocument.createElement("h1");
      titleHeading.textContent = "AREA + COMPANY SALES SUMMARY";
      printRoot.appendChild(titleHeading);

      const metaInfo = printDocument.createElement("p");
      metaInfo.textContent = `Area: ${selectedArea?.label || ""} | Period: ${dateRange.start} to ${dateRange.end} | Companies: ${totals.companyCount} | Items: ${totals.itemCount}`;
      printRoot.appendChild(metaInfo);

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
    const header = ["S/N", "Company", "Item", "Quantity", "Amount"];
    const dataRows = flatRows.map((entry, idx) => [
      idx + 1,
      entry.company?.name || "",
      entry.item?.itemName || "",
      Number(entry.item?.quantity || 0).toFixed(2),
      Number(entry.item?.amount || 0).toFixed(2)
    ]);

    dataRows.push([
      "",
      `Total (Companies: ${totals.companyCount}, Items: ${totals.itemCount})`,
      "",
      Number(totals.quantity).toFixed(2),
      Number(totals.amount).toFixed(2)
    ]);

    const csvContent = [header, ...dataRows].map((row) => row.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `area-company-sales-summary-${selectedArea?.value || "unknown"}-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  return (
    <SectionCard
      title="Area + Company Wise Sales Summary"
      description="View sales summary grouped by company for a specific area, showing item-level breakdown."
    >
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <FormField label="Area" required description="Select the area.">
            <SearchSelect
              placeholder="Search areas"
              value={selectedArea}
              onSelect={(option) => {
                setSelectedArea(option);
                setAreaSearch("");
              }}
              onSearch={setAreaSearch}
              results={areaDirectory.data ?? []}
              emptyMessage={areaSearch.trim() ? "No areas found." : "Start typing an area code or name."}
            />
          </FormField>
          <FormField label="Start Date" required description="Beginning of the reporting window (DD-MM-YYYY).">
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
              value={dateRange.start}
              onChange={(event) => setDateRange((prev) => ({ ...prev, start: event.target.value }))}
              placeholder="DD-MM-YYYY"
            />
          </FormField>
          <FormField label="End Date" required description="End of the reporting window (DD-MM-YYYY).">
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
              value={dateRange.end}
              onChange={(event) => setDateRange((prev) => ({ ...prev, end: event.target.value }))}
              placeholder="DD-MM-YYYY"
            />
          </FormField>
        </div>

        {hasValidRange && (
          <>
            {salesQuery.isLoading || salesQuery.isFetching ? (
              <div className="text-center py-12">
                <p className="text-slate-600">Loading area + company sales summary…</p>
              </div>
            ) : salesQuery.isError ? (
              <div className="text-center py-12">
                <p className="text-rose-600">
                  Error loading summary: {salesQuery.error?.response?.data?.message || salesQuery.error?.message || "Unknown error"}
                </p>
              </div>
            ) : flatRows.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-slate-600">No sales found for the selected criteria.</p>
              </div>
            ) : (
              <>
                {/* Controls */}
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => salesQuery.refetch()}
                    disabled={salesQuery.isFetching}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <FiRefreshCw className={salesQuery.isFetching ? "animate-spin" : ""} />
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
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-lg p-4 border border-indigo-200">
                    <p className="text-xs text-indigo-700 uppercase font-medium">Companies</p>
                    <p className="text-2xl font-bold text-indigo-900 mt-1">{totals.companyCount}</p>
                  </div>
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
                    <p className="text-xs text-blue-700 uppercase font-medium">Items</p>
                    <p className="text-2xl font-bold text-blue-900 mt-1">{totals.itemCount}</p>
                  </div>
                  <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4 border border-purple-200">
                    <p className="text-xs text-purple-700 uppercase font-medium">Total Quantity</p>
                    <p className="text-2xl font-bold text-purple-900 mt-1">{formatNumber(totals.quantity)}</p>
                  </div>
                  <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-lg p-4 border border-emerald-200">
                    <p className="text-xs text-emerald-700 uppercase font-medium">Total Amount</p>
                    <p className="text-2xl font-bold text-emerald-900 mt-1">{formatCurrency(totals.amount)}</p>
                  </div>
                </div>

                {/* Table */}
                <div ref={reportRef} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200">
                      <thead className="bg-gradient-to-r from-slate-50 to-slate-100">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                            S/N
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                            Company
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                            Item
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">
                            Quantity
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">
                            Amount
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-slate-100">
                        {flatRows.map((entry, idx) => (
                          <tr key={`${entry.company?.code}-${entry.item?.itemCode}-${idx}`} className="hover:bg-purple-50 transition-colors">
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{idx + 1}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-800">
                              {entry.company?.name || entry.company?.code}
                              <span className="block text-xs text-slate-400">{entry.company?.code}</span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">
                              {entry.item?.itemName}
                              <span className="block text-xs text-slate-400">{entry.item?.itemCode}</span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-slate-800">
                              {formatNumber(entry.item?.quantity)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-semibold text-slate-900">
                              {formatCurrency(entry.item?.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gradient-to-r from-slate-100 to-slate-50">
                        <tr>
                          <td colSpan="3" className="px-6 py-4 text-sm font-bold text-slate-800">
                            Totals (Companies: {totals.companyCount} · Items: {totals.itemCount})
                          </td>
                          <td className="px-6 py-4 text-sm text-right font-bold text-slate-900">
                            {formatNumber(totals.quantity)}
                          </td>
                          <td className="px-6 py-4 text-sm text-right font-bold text-slate-900">
                            {formatCurrency(totals.amount)}
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

export default AreaCompanySalesSummaryPage;
