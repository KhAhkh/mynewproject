import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FiDownload, FiFilter, FiPrinter, FiRefreshCw } from "react-icons/fi";
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

const CustomerSalesSummaryPage = () => {
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [dateRange, setDateRange] = useState(() => ({
    start: dayjs().startOf("month").format("DD-MM-YYYY"),
    end: dayjs().format("DD-MM-YYYY")
  }));
  const [hasGenerated, setHasGenerated] = useState(false);
  const tableRef = useRef(null);

  const customerDirectory = useQuery({
    queryKey: ["customers-directory", customerSearch],
    queryFn: async () => {
      const response = await api.get("/customers", {
        params: {
          search: customerSearch || undefined,
          limit: 50,
          offset: 0
        }
      });
      const data = Array.isArray(response.data) ? response.data : [];
      return data.map((customer) => ({
        value: customer.code,
        label: customer.name ? `${customer.code} — ${customer.name}` : customer.code,
        name: customer.name
      }));
    }
  });

  const salesQuery = useQuery({
    queryKey: ["customer-sales-summary", selectedCustomer?.value, dateRange.start, dateRange.end],
    enabled: hasGenerated && Boolean(selectedCustomer?.value && dateRange.start && dateRange.end),
    queryFn: async () => {
      const response = await api.get("/reports/receivables/customer-ledger", {
        params: {
          customerCode: selectedCustomer.value,
          startDate: dateRange.start,
          endDate: dateRange.end,
          mode: "detail"
        }
      });
      return response.data;
    }
  });

  const invoices = useMemo(() => {
    if (!salesQuery.data?.invoices) return [];
    const matching = salesQuery.data.invoices.find(
      (entry) => entry.customerCode === selectedCustomer?.value
    );
    return matching?.invoices ?? [];
  }, [salesQuery.data, selectedCustomer?.value]);
  const totals = useMemo(() => {
    return invoices.reduce(
      (acc, invoice) => {
        acc.amount += Number(invoice.amount ?? 0);
        acc.paid += Number(invoice.amountPaid ?? 0);
        acc.outstanding += Number(invoice.outstanding ?? 0);
        return acc;
      },
      { amount: 0, paid: 0, outstanding: 0 }
    );
  }, [invoices]);

  const handleGenerate = () => {
    if (selectedCustomer?.value && dateRange.start && dateRange.end) {
      setHasGenerated(true);
    }
  };

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    const printStyles = `
      <style>
        @page { size: A4 portrait; margin: 16mm 14mm 18mm 14mm; }
        body { font-family: Arial, sans-serif; color: #1e293b; margin: 0; padding: 18px; }
        .header { background: linear-gradient(135deg, #64748b 0%, #475569 100%); color: white; padding: 20px; text-align: center; margin-bottom: 20px; border-radius: 8px; }
        .header h1 { font-size: 24px; margin: 0; font-weight: 700; letter-spacing: 1px; }
        .meta { margin-bottom: 16px; font-size: 13px; color: #475569; }
        .meta strong { color: #1e293b; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th { background: linear-gradient(135deg, #64748b 0%, #475569 100%); color: white; padding: 14px 16px; text-align: left; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
        th:last-child { text-align: right; }
        td { padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
        td:last-child { text-align: right; font-weight: 600; }
        tr:nth-child(even) { background: #f8fafc; }
        tr:hover { background: #fef3c7; }
        .footer { margin-top: 20px; padding: 14px; background: #f1f5f9; border-radius: 6px; text-align: right; font-weight: 700; font-size: 15px; }
        .footer span { color: #64748b; }
      </style>
    `;

    const printHeader = `
      <div class="header">
        <h1>CUSTOMER SALES SUMMARY</h1>
      </div>
      <div class="meta">
        <p><strong>Customer:</strong> ${selectedCustomer?.label || ""}</p>
        <p><strong>Period:</strong> ${dateRange.start} to ${dateRange.end}</p>
      </div>
    `;

    const rows = invoices
      .map(
        (invoice, idx) => `
        <tr>
          <td style="font-weight: 600;">${idx + 1}</td>
          <td>${invoice.invoiceNo || ""}</td>
          <td>${invoice.invoiceDate || ""}</td>
          <td style="text-align: right;">${formatCurrency(invoice.amount)}</td>
          <td style="text-align: right;">${formatCurrency(invoice.amountPaid)}</td>
          <td style="text-align: right;">${formatCurrency(invoice.outstanding)}</td>
        </tr>
      `
      )
      .join("");

    const tableHTML = `
      <table>
        <thead>
          <tr>
            <th style="width: 8%;">S/N</th>
            <th style="width: 20%;">INVOICE NO</th>
            <th style="width: 17%;">DATE</th>
            <th style="width: 18%;">AMOUNT</th>
            <th style="width: 18%;">PAID</th>
            <th style="width: 19%;">OUTSTANDING</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `;

    const footerHTML = `
      <div class="footer">
        <div>Total Amount: <span>${formatCurrency(totals.amount)}</span></div>
        <div>Total Paid: <span>${formatCurrency(totals.paid)}</span></div>
        <div>Total Outstanding: <span>${formatCurrency(totals.outstanding)}</span></div>
      </div>
    `;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Customer Sales Summary</title>
          ${printStyles}
        </head>
        <body>
          ${printHeader}
          ${tableHTML}
          ${footerHTML}
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

  const handleExport = () => {
    const header = ["S/N", "Invoice No", "Date", "Amount", "Paid", "Outstanding"];
    const rows = invoices.map((invoice, idx) => [
      idx + 1,
      invoice.invoiceNo || "",
      invoice.invoiceDate || "",
      Number(invoice.amount || 0).toFixed(2),
      Number(invoice.amountPaid || 0).toFixed(2),
      Number(invoice.outstanding || 0).toFixed(2)
    ]);

    rows.push([
      "",
      "",
      "Total",
      Number(totals.amount).toFixed(2),
      Number(totals.paid).toFixed(2),
      Number(totals.outstanding).toFixed(2)
    ]);

    const csvContent = [header, ...rows].map((row) => row.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `customer-sales-summary-${selectedCustomer?.value || "unknown"}-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  return (
    <SectionCard
      title="Customer Sales Summary"
      description="View sales summary for a specific customer within a date range."
    >
      <div className="space-y-6">
        {/* Filters */}
        <div className="grid gap-4 md:grid-cols-3">
          <FormField label="Customer" required description="Select the customer.">
            <SearchSelect
              placeholder="Search customers"
              value={selectedCustomer}
              onSelect={(option) => {
                setSelectedCustomer(option);
                setCustomerSearch("");
                setHasGenerated(false);
              }}
              onSearch={setCustomerSearch}
              results={customerDirectory.data ?? []}
              emptyMessage={
                customerSearch.trim() ? "No customers found." : "Start typing a customer code or name."
              }
            />
            {customerDirectory.isFetching && <p className="mt-1 text-xs text-slate-400">Loading customers…</p>}
          </FormField>

          <FormField label="Start Date" required description="Beginning of the reporting window (DD-MM-YYYY).">
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
              value={dateRange.start}
              onChange={(event) => {
                setDateRange((prev) => ({ ...prev, start: event.target.value }));
                setHasGenerated(false);
              }}
              placeholder="DD-MM-YYYY"
            />
          </FormField>

          <FormField label="End Date" required description="End of the reporting window (DD-MM-YYYY).">
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
              value={dateRange.end}
              onChange={(event) => {
                setDateRange((prev) => ({ ...prev, end: event.target.value }));
                setHasGenerated(false);
              }}
              placeholder="DD-MM-YYYY"
            />
          </FormField>
        </div>

        {/* Generate Button */}
        <div className="flex justify-center">
          <button
            onClick={handleGenerate}
            disabled={!selectedCustomer?.value || !dateRange.start || !dateRange.end}
            className="px-8 py-3 text-base font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed rounded-lg transition-colors shadow-md hover:shadow-lg"
          >
            Generate Report
          </button>
        </div>

        {/* Results */}
        {hasGenerated && (
          <>
            {salesQuery.isLoading || salesQuery.isFetching ? (
              <div className="text-center py-12">
                <p className="text-slate-600">Loading sales summary…</p>
              </div>
            ) : salesQuery.isError ? (
              <div className="text-center py-12">
                <p className="text-rose-600">
                  Error loading sales summary: {salesQuery.error?.message || "Unknown error"}
                </p>
              </div>
            ) : invoices.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-slate-600">No sales found for the selected customer and date range.</p>
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
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
                    <p className="text-xs text-blue-700 uppercase font-medium">Total Amount</p>
                    <p className="text-2xl font-bold text-blue-900 mt-1">{formatCurrency(totals.amount)}</p>
                  </div>
                  <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-lg p-4 border border-emerald-200">
                    <p className="text-xs text-emerald-700 uppercase font-medium">Total Paid</p>
                    <p className="text-2xl font-bold text-emerald-900 mt-1">{formatCurrency(totals.paid)}</p>
                  </div>
                  <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg p-4 border border-amber-200">
                    <p className="text-xs text-amber-700 uppercase font-medium">Total Outstanding</p>
                    <p className="text-2xl font-bold text-amber-900 mt-1">{formatCurrency(totals.outstanding)}</p>
                  </div>
                </div>

                {/* Table */}
                <div ref={tableRef} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200">
                      <thead className="bg-gradient-to-r from-slate-50 to-slate-100">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                            S/N
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                            Invoice No
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                            Date
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">
                            Amount
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">
                            Paid
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">
                            Outstanding
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-slate-100">
                        {invoices.map((invoice, idx) => (
                          <tr key={invoice.invoiceNo || idx} className="hover:bg-amber-50 transition-colors">
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{idx + 1}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-800">
                              {invoice.invoiceNo}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                              {invoice.invoiceDate}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-slate-800">
                              {formatCurrency(invoice.amount)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-emerald-600">
                              {formatCurrency(invoice.amountPaid)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-semibold text-slate-900">
                              {formatCurrency(invoice.outstanding)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gradient-to-r from-slate-100 to-slate-50">
                        <tr>
                          <td colSpan="3" className="px-6 py-4 text-sm font-bold text-slate-800">
                            Totals
                          </td>
                          <td className="px-6 py-4 text-sm text-right font-bold text-slate-900">
                            {formatCurrency(totals.amount)}
                          </td>
                          <td className="px-6 py-4 text-sm text-right font-bold text-emerald-700">
                            {formatCurrency(totals.paid)}
                          </td>
                          <td className="px-6 py-4 text-sm text-right font-bold text-slate-900">
                            {formatCurrency(totals.outstanding)}
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

export default CustomerSalesSummaryPage;
