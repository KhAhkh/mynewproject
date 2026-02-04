import { useRef, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FiDownload, FiPrinter } from "react-icons/fi";
import SectionCard from "../../components/SectionCard.jsx";
import FormField from "../../components/FormField.jsx";
import SearchSelect from "../../components/SearchSelect.jsx";
import { api } from "../../api/client.js";

const formatNumber = (value) =>
  Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

const formatCurrency = (value) =>
  Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    style: "currency",
    currency: "PKR"
  });

const formatDateForAPI = (date) => {
  if (!date) return "";
  const [year, month, day] = date.split("-");
  return `${day}-${month}-${year}`;
};

const SalesmanItemSummaryPage = () => {
  const reportRef = useRef(null);
  const today = new Date();
  const defaultEnd = today.toISOString().slice(0, 10);
  const defaultStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30)
    .toISOString()
    .slice(0, 10);

  const [salesmanQuery, setSalesmanQuery] = useState("");
  const [selectedSalesman, setSelectedSalesman] = useState(null);
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);

  const salesmanLookup = useQuery({
    queryKey: ["salesmen-directory", salesmanQuery],
    queryFn: async () => {
      const response = await api.get("/salesmen", { params: { search: salesmanQuery } });
      return response.data;
    },
    staleTime: 0
  });

  const reportQuery = useQuery({
    queryKey: ["salesman-items-summary", selectedSalesman?.value, startDate, endDate],
    queryFn: async () => {
      const response = await api.get("/reports/sales/salesman-items-summary", {
        params: {
          salesmanCode: selectedSalesman?.value,
          startDate: formatDateForAPI(startDate),
          endDate: formatDateForAPI(endDate)
        }
      });
      return response.data;
    },
    enabled: Boolean(selectedSalesman?.value && startDate && endDate),
    staleTime: 0
  });

  const salesmanResults = useMemo(() => {
    const data = salesmanLookup.data || [];
    return data.map((s) => ({ value: s.code, code: s.code, label: `${s.code} — ${s.name}` }));
  }, [salesmanLookup.data]);

  const reportRows = reportQuery.data?.rows ?? [];
  const reportTotals = reportQuery.data?.totals ?? { totalUnits: 0, totalAmount: 0, itemCount: 0 };
  const salesman = reportQuery.data?.salesman;
  const period = reportQuery.data;
  const hasData = reportRows.length > 0;

  const handleExport = () => {
    if (!reportRows.length) return;
    const rows = [
      ["Salesman", salesman?.name || ""],
      ["From", period?.startDate || startDate],
      ["To", period?.endDate || endDate],
      [],
      ["Sr#", "Item Name", "Quantity"]
    ];
    items.forEach((item, idx) => {
      rows.push([idx + 1, item.name || item.code || "—", Number(item.quantity || 0).toFixed(2)]);
    });
    rows.push([]);
    rows.push(["", "Total", Number(totalQuantity || 0).toFixed(2)]);

    const csvContent = rows.map((row) => row.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `salesman-item-summary-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    const printStyles = `
      <style>
        @page { size: A4 portrait; margin: 12mm 12mm 14mm 12mm; }
        body { font-family: "Inter", Arial, sans-serif; color: #0f172a; margin: 0; padding: 16px; }
        .header { text-align: center; margin-bottom: 16px; }
        .header h1 { margin: 0; font-size: 20px; letter-spacing: 0.5px; color: #0f172a; }
        .meta { margin-top: 6px; font-size: 12px; color: #475569; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 12px; }
        th { background: #f1f5f9; text-align: left; text-transform: uppercase; letter-spacing: 0.4px; font-weight: 700; }
        td:last-child, th:last-child { text-align: right; }
        tfoot td { font-weight: 700; }
      </style>
    `;

    const rowsHtml = items
      .map(
        (item, idx) => `
          <tr>
            <td>${idx + 1}</td>
            <td>${item.name || item.code || ""}</td>
            <td>${formatNumber(item.quantity)}</td>
          </tr>
        `
      )
      .join("");

    printWindow.document.write(`
      <html>
        <head><title>Salesman Wise Items Summary</title>${printStyles}</head>
        <body>
          <div class="header">
            <h1>Salesman Wise Items Summary</h1>
            <div class="meta">
              Salesman: ${summarySalesman?.name || "All Salesmen"} | Period: ${period?.start || startDate} to ${period?.end || endDate}
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Sr.#</th>
                <th>Item Name</th>
                <th>Quantity</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
            <tfoot>
              <tr>
                <td></td>
                <td>Total</td>
                <td>${formatNumber(totalQuantity)}</td>
              </tr>
            </tfoot>
          </table>
          <script>
            window.onload = () => {
              window.print();
              window.onafterprint = () => window.close();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <SectionCard
      title="Salesman Wise Items Summary"
      description="View items sold by a salesman within a selected date range."
    >
      <div className="space-y-6">
        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormField label="Salesman" description="Select a salesman">
            <SearchSelect
              placeholder="Search salesman by code or name"
              value={selectedSalesman}
              results={salesmanResults}
              onSelect={setSelectedSalesman}
              onSearch={setSalesmanQuery}
              isLoading={salesmanLookup.isLoading}
            />
          </FormField>

          <FormField label="From" description="Start date (DD-MM-YYYY)">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </FormField>

          <FormField label="To" description="End date (DD-MM-YYYY)">
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </FormField>
        </div>

        {/* Results */}
        {selectedSalesman && startDate && endDate ? (
          reportQuery.isError ? (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg">
              <p className="text-sm text-rose-600">
                Unable to load report: {reportQuery.error?.response?.data?.message || reportQuery.error?.message || "Unknown error"}
              </p>
            </div>
          ) : reportQuery.isLoading ? (
            <div className="p-4 text-center">
              <p className="text-sm text-slate-500">Loading report…</p>
            </div>
          ) : !hasData ? (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
              <p className="text-sm text-slate-500">No items recorded for this salesman in the selected period.</p>
            </div>
          ) : (
            <>
              {/* Header Info and Actions */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                <div className="text-sm text-slate-600">
                  <p className="font-semibold text-slate-700">{salesman?.name}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Period: {period?.startDate} — {period?.endDate}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handlePrint}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 text-sm font-medium rounded-lg hover:bg-blue-100 transition-colors"
                  >
                    <FiPrinter className="w-4 h-4" />
                    Print
                  </button>
                  <button
                    onClick={handleExport}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-200 transition-colors"
                  >
                    <FiDownload className="w-4 h-4" />
                    Export CSV
                  </button>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <table className="w-full text-sm text-slate-700">
                  <thead className="bg-slate-100 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">Item</th>
                      <th className="px-4 py-3 text-right font-semibold">Units</th>
                      <th className="px-4 py-3 text-right font-semibold">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reportRows.map((row) => (
                      <tr key={row.itemCode} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-800">{row.itemName}</div>
                          <div className="text-xs text-slate-400 mt-1">{row.itemCode}</div>
                        </td>
                        <td className="px-4 py-3 text-right text-slate-800">{formatNumber(row.totalUnits)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatNumber(row.totalAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-100 border-t-2 border-slate-200">
                    <tr>
                      <td className="px-4 py-3 font-semibold">Totals (Items: {reportTotals.itemCount})</td>
                      <td className="px-4 py-3 text-right font-semibold">{formatNumber(reportTotals.totalUnits)}</td>
                      <td className="px-4 py-3 text-right font-semibold">{formatNumber(reportTotals.totalAmount)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )
        ) : (
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
            <p className="text-sm text-slate-500">Select a salesman and date range to view the report.</p>
          </div>
        )}
      </div>
    </SectionCard>
  );
};

export default SalesmanItemSummaryPage;
