import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FiDownload, FiPrinter, FiRefreshCw } from "react-icons/fi";
import dayjs from "dayjs";
import SectionCard from "../../components/SectionCard.jsx";
import FormField from "../../components/FormField.jsx";
import SearchSelect from "../../components/SearchSelect.jsx";
import { api } from "../../api/client.js";

const formatCurrency = (value) =>
  `Rs ${Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const formatQty = (value) =>
  Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

const DateWiseItemsSummaryPage = () => {
  const [itemSearch, setItemSearch] = useState("");
  const [selectedItem, setSelectedItem] = useState({ value: "all", label: "All Items" });
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
      th, td { border: 1px solid #cbd5f5; padding: 6px 8px; text-align: left; }
      th { background: #e2e8f0; text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em; }
      tfoot td { font-weight: 600; background: #f1f5f9; }
    </style>
  `;

  const hasValidRange = Boolean(dateRange.start && dateRange.end);

  const itemDirectory = useQuery({
    queryKey: ["items-directory", itemSearch],
    staleTime: 0,
    queryFn: async () => {
      const response = await api.get("/items", {
        params: {
          search: itemSearch || undefined,
          limit: 50,
          offset: 0
        }
      });
      const data = Array.isArray(response.data) ? response.data : [];
      const itemOptions = data.map((item) => ({
        value: item.code,
        label: item.name ? `${item.code} — ${item.name}` : item.code,
        name: item.name
      }));
      return [{ value: "all", label: "All Items" }, ...itemOptions];
    }
  });

  const reportQuery = useQuery({
    queryKey: ["date-wise-items-summary", dateRange.start, dateRange.end, selectedItem?.value],
    enabled: true,
    queryFn: async () => {
      const response = await api.get("/reports/sales/date-wise-items-summary", {
        params: {
          startDate: dateRange.start,
          endDate: dateRange.end,
          itemCode: selectedItem?.value !== "all" ? selectedItem.value : undefined
        }
      });
      return response.data;
    }
  });

  const rows = reportQuery.data?.rows ?? [];
  const totals = reportQuery.data?.totals ?? { quantity: 0, amount: 0, itemCount: 0 };

  const handlePrint = () => {
    if (!reportRef?.current) return;

    const contentClone = reportRef.current.cloneNode(true);
    if (!contentClone) return;

    const printWindow = window.open("", "_blank", "width=1024,height=768");
    if (!printWindow) return;

    const { document: printDocument } = printWindow;

    printDocument.open();
    printDocument.write(
      `<!doctype html><html><head><meta charset="utf-8" /><title>Date Wise Items Summary</title>${reportPrintStyles}</head><body><div id="print-root"></div></body></html>`
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

  const handleDownload = () => {
    const header = ["Sr.#", "Item Name", "QTY.", "AMOUNT"];
    const dataRows = rows.map((row) => [
      row.sr,
      row.itemName || "",
      Number(row.quantity || 0).toFixed(2),
      Number(row.amount || 0).toFixed(2)
    ]);

    dataRows.push([
      "",
      "Total",
      Number(totals.quantity).toFixed(2),
      Number(totals.amount).toFixed(2)
    ]);

    const csvContent = [header, ...dataRows].map((row) => row.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `date-wise-items-summary-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  const handleRefresh = () => {
    reportQuery.refetch();
  };

  const handleDateChange = (field, value) => {
    setDateRange((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <SectionCard
      title="Date Wise Items Summary"
      description="View all items sold within a selected date range with quantities and amounts."
    >
      <div className="space-y-6">
        {/* Filters */}
        <div className="grid gap-4 md:grid-cols-3">
          <FormField label="Item" required description="Select an item.">
            <SearchSelect
              results={itemDirectory.data || []}
              value={selectedItem}
              onSelect={setSelectedItem}
              onSearch={setItemSearch}
              placeholder="Search and select item..."
            />
          </FormField>

          <FormField label="Start Date" required description="Start of Report Date">
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
              value={dateRange.start}
              onChange={(event) => {
                setDateRange((prev) => ({ ...prev, start: event.target.value }));
              }}
              placeholder="DD-MM-YYYY"
            />
          </FormField>

          <FormField label="End Date" required description="End of Report Date">
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
              value={dateRange.end}
              onChange={(event) => {
                setDateRange((prev) => ({ ...prev, end: event.target.value }));
              }}
              placeholder="DD-MM-YYYY"
            />
          </FormField>
        </div>

        {/* Results */}
        {reportQuery.isLoading || reportQuery.isFetching ? (
          <div className="text-center py-12">
            <p className="text-slate-600">Loading items summary…</p>
          </div>
        ) : reportQuery.isError ? (
          <div className="text-center py-12">
            <p className="text-rose-600">
              Error loading summary: {reportQuery.error?.message || "Unknown error"}
            </p>
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-600">No data found for the selected date range.</p>
          </div>
        ) : (
          <>
            {/* Controls */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleRefresh}
                disabled={reportQuery.isFetching}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <FiRefreshCw className={reportQuery.isFetching ? "animate-spin" : ""} />
                Refresh
              </button>

              <button
                onClick={handleDownload}
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
              <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-lg p-4 border border-indigo-200">
                <p className="text-xs text-indigo-700 uppercase font-medium">Total Items</p>
                <p className="text-2xl font-bold text-indigo-900 mt-1">{totals.itemCount}</p>
              </div>
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
                <p className="text-xs text-blue-700 uppercase font-medium">Total Quantity</p>
                <p className="text-2xl font-bold text-blue-900 mt-1">{formatQty(totals.quantity)}</p>
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
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                        Sr.#
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                        Item Name
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">
                        Quantity
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-100">
                    {rows.map((row) => (
                      <tr key={`${row.itemCode}`} className="hover:bg-blue-50 transition-colors">
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-600">
                          {row.sr}
                        </td>
                        <td className="px-4 py-4 text-sm font-medium text-slate-800">
                          {row.itemName}
                          {row.itemCode && <div className="text-xs text-slate-500">{row.itemCode}</div>}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-right text-slate-800">
                          {Number(row.quantity || 0).toFixed(2)}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-right font-semibold text-slate-900">
                          {formatCurrency(row.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gradient-to-r from-slate-100 to-slate-50">
                    <tr>
                      <td colSpan={2} className="px-4 py-4 text-sm font-bold text-slate-800">
                        Totals
                      </td>
                      <td className="px-4 py-4 text-sm text-right font-bold text-slate-900">
                        {Number(totals.quantity || 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-4 text-sm text-right font-bold text-slate-900">
                        {formatCurrency(totals.amount)}
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

export default DateWiseItemsSummaryPage;
