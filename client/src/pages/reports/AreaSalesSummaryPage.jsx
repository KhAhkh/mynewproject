import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import SectionCard from "../../components/SectionCard.jsx";
import SearchSelect from "../../components/SearchSelect.jsx";
import FormField from "../../components/FormField.jsx";
import { api } from "../../api/client.js";
import dayjs from "dayjs";

const formatCurrency = (value) =>
  `Rs ${Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const AreaSalesSummaryPage = () => {
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
      th, td { border: 1px solid #cbd5f5; padding: 6px 8px; text-align: left; }
      th { background: #e2e8f0; text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em; }
      tfoot td { font-weight: 600; background: #f1f5f9; }
    </style>
  `;

  const printButtonClass =
    "inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:border-emerald-200 hover:text-emerald-600 hover:ring-2 hover:ring-emerald-100";

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
    queryKey: ["area-sales-summary", selectedArea?.value, dateRange.start, dateRange.end],
    enabled: hasValidRange,
    queryFn: async () => {
      const response = await api.get("/reports/sales/area-summary", {
        params: {
          areaCode: selectedArea.value,
          startDate: dateRange.start,
          endDate: dateRange.end
        }
      });
      return response.data;
    }
  });

  const rows = salesQuery.data?.rows ?? [];
  const totals = salesQuery.data?.totals ?? { totalAmount: 0, count: 0 };

  const handlePrint = () => {
    if (!reportRef?.current) return;

    const contentClone = reportRef.current.cloneNode(true);
    if (!contentClone) return;

    const printWindow = window.open("", "_blank", "width=1024,height=768");
    if (!printWindow) return;

    const { document: printDocument } = printWindow;

    printDocument.open();
    printDocument.write(
      `<!doctype html><html><head><meta charset="utf-8" /><title>Area Sales Summary</title>${reportPrintStyles}</head><body><div id="print-root"></div></body></html>`
    );
    printDocument.close();

    const mountContent = () => {
      const printRoot = printDocument.getElementById("print-root");
      if (!printRoot) return;

      const titleHeading = printDocument.createElement("h1");
      titleHeading.textContent = "AREA WISE SALES SUMMARY";
      printRoot.appendChild(titleHeading);

      const dateInfo = printDocument.createElement("p");
      dateInfo.textContent = `Area: ${selectedArea?.label || ""} | Period: ${dateRange.start} to ${dateRange.end}`;
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
    const header = ["S/N", "Invoice No", "Date", "Customer", "Amount"];
    const dataRows = rows.map((row, idx) => [
      idx + 1,
      row.invoiceNo || "",
      row.invoiceDate || "",
      row.customerName || "",
      Number(row.totalAmount || 0).toFixed(2)
    ]);

    dataRows.push(["", "", "", "Total", Number(totals.totalAmount).toFixed(2)]);

    const csvContent = [header, ...dataRows].map((row) => row.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `area-sales-summary-${selectedArea?.value || "unknown"}-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  return (
    <SectionCard
      title="Area Wise Sales Summary"
      description="View sales invoices for a specific area within a date range."
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
            {areaDirectory.isFetching ? <p className="mt-1 text-xs text-slate-400">Loading areas…</p> : null}
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

        {hasValidRange ? (
          <div className="mt-4">
            {salesQuery.isError ? (
              <p className="text-xs text-rose-600">
                Unable to load report: {salesQuery.error?.message || "Unknown error."}
              </p>
            ) : salesQuery.isLoading || salesQuery.isFetching ? (
              <p className="text-xs text-slate-500">Loading area sales…</p>
            ) : rows.length === 0 ? (
              <p className="text-xs text-slate-500">No invoices found for the selected area and date range.</p>
            ) : (
              <>
                <div className="mb-3 flex justify-end">
                  <button
                    type="button"
                    className={printButtonClass}
                    onClick={() => handlePrint()}
                  >
                    Print report
                  </button>
                </div>
                <div
                  ref={reportRef}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
                >
                  <table className="min-w-full divide-y divide-slate-200 text-xs text-slate-700">
                    <thead className="bg-slate-100/80 text-slate-500 uppercase tracking-wide">
                      <tr>
                        <th className="px-4 py-2 text-left">S/N</th>
                        <th className="px-4 py-2 text-left">Invoice No.</th>
                        <th className="px-4 py-2 text-left">Date</th>
                        <th className="px-4 py-2 text-left">Customer</th>
                        <th className="px-4 py-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.map((row, idx) => (
                        <tr key={row.invoiceNo || idx} className="odd:bg-white even:bg-slate-50/70">
                          <td className="px-4 py-2 text-slate-600">{idx + 1}</td>
                          <td className="px-4 py-2 font-medium text-slate-800">{row.invoiceNo}</td>
                          <td className="px-4 py-2 text-slate-600">{row.invoiceDate}</td>
                          <td className="px-4 py-2 text-slate-700">
                            {row.customerName}
                            <span className="block text-[10px] text-slate-400">{row.customerCode}</span>
                          </td>
                          <td className="px-4 py-2 text-right font-semibold text-slate-900">
                            {formatCurrency(row.totalAmount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-100/80 text-slate-700 font-semibold">
                      <tr>
                        <td className="px-4 py-2" colSpan={4}>
                          Totals (Invoices: {totals.count})
                        </td>
                        <td className="px-4 py-2 text-right">{formatCurrency(totals.totalAmount)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <div className="mt-3 flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => salesQuery.refetch()}
                    disabled={salesQuery.isFetching}
                    className={`${printButtonClass} disabled:opacity-50`}
                  >
                    Refresh
                  </button>
                  <button
                    type="button"
                    onClick={handleExport}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-100 hover:ring-2 hover:ring-emerald-100"
                  >
                    Export CSV
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <p className="text-xs text-slate-500">Choose an area and date range to view the report.</p>
        )}
      </div>
    </SectionCard>
  );
};

export default AreaSalesSummaryPage;
