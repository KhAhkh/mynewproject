import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FiDownload, FiFilter, FiPrinter, FiRefreshCw } from "react-icons/fi";
import SectionCard from "../../components/SectionCard.jsx";
import { api } from "../../api/client.js";

const formatCurrency = (value) =>
  `Rs ${Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const ReceivableSummaryPage = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const tableRef = useRef(null);

  const summaryQuery = useQuery({
    queryKey: ["receivable-summary"],
    queryFn: async () => {
      const response = await api.get("/reports/receivables/summary");
      return response.data;
    },
    staleTime: 30000
  });

  const customers = summaryQuery.data?.customers ?? [];
  const totalBalance = summaryQuery.data?.totalBalance ?? 0;

  const filteredCustomers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return customers;
    return customers.filter(
      (customer) =>
        customer.code?.toLowerCase().includes(term) ||
        customer.name?.toLowerCase().includes(term)
    );
  }, [customers, searchTerm]);

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    const printStyles = `
      <style>
        @page { size: A4 portrait; margin: 16mm 14mm 18mm 14mm; }
        body { font-family: Arial, sans-serif; color: #1e293b; margin: 0; padding: 18px; }
        .header { background: linear-gradient(135deg, #64748b 0%, #475569 100%); color: white; padding: 20px; text-align: center; margin-bottom: 20px; border-radius: 8px; }
        .header h1 { font-size: 24px; margin: 0; font-weight: 700; letter-spacing: 1px; }
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
        <h1>CUSTOMER RECEIVABLE DISPLAY CARD</h1>
      </div>
    `;

    const rows = filteredCustomers
      .map(
        (customer) => `
        <tr>
          <td style="font-weight: 600;">${customer.code || ""}</td>
          <td>${customer.name || ""}</td>
          <td>${formatCurrency(customer.balance)}</td>
        </tr>
      `
      )
      .join("");

    const tableHTML = `
      <table>
        <thead>
          <tr>
            <th style="width: 15%;">CODE</th>
            <th style="width: 55%;">CUSTOMER NAME</th>
            <th style="width: 30%;">BALANCE</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `;

    const footerHTML = `
      <div class="footer">
        Total Receivable: <span>${formatCurrency(totalBalance)}</span>
      </div>
    `;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Customer Receivable Summary</title>
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
    const header = ["Code", "Customer Name", "Balance"];
    const rows = filteredCustomers.map((c) => [
      c.code || "",
      c.name || "",
      Number(c.balance || 0).toFixed(2)
    ]);

    rows.push(["", "Total", Number(totalBalance).toFixed(2)]);

    const csvContent = [header, ...rows].map((row) => row.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `customer-receivable-summary-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  return (
    <SectionCard
      title="Customer Receivable Summary"
      description="View current outstanding balances for all customers."
    >
      <div className="space-y-6">
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <FiFilter className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by customer code or name..."
              className="receivable-search-input w-full text-sm border border-slate-300 rounded-lg focus:outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <button
            onClick={() => summaryQuery.refetch()}
            disabled={summaryQuery.isFetching}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <FiRefreshCw className={summaryQuery.isFetching ? "animate-spin" : ""} />
            Refresh
          </button>

          <button
            onClick={handleExport}
            disabled={filteredCustomers.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-300 rounded-lg hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <FiDownload />
            Export CSV
          </button>

          <button
            onClick={handlePrint}
            disabled={filteredCustomers.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-300 rounded-lg hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <FiPrinter />
            Print
          </button>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg p-4 border border-amber-200">
            <p className="text-xs text-amber-700 uppercase font-medium">Total Customers</p>
            <p className="text-2xl font-bold text-amber-900 mt-1">{customers.length}</p>
          </div>
          <div className="bg-gradient-to-br from-rose-50 to-rose-100 rounded-lg p-4 border border-rose-200">
            <p className="text-xs text-rose-700 uppercase font-medium">With Outstanding</p>
            <p className="text-2xl font-bold text-rose-900 mt-1">
              {customers.filter((c) => Number(c.balance || 0) > 0).length}
            </p>
          </div>
          <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-lg p-4 border border-emerald-200">
            <p className="text-xs text-emerald-700 uppercase font-medium">Total Receivable</p>
            <p className="text-2xl font-bold text-emerald-900 mt-1">{formatCurrency(totalBalance)}</p>
          </div>
        </div>

        {/* Loading State */}
        {summaryQuery.isLoading && (
          <div className="text-center py-12 text-slate-500">Loading customer balances...</div>
        )}

        {/* Error State */}
        {summaryQuery.isError && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-rose-700">
            Failed to load customer receivables. Please try again.
          </div>
        )}

        {/* Table */}
        {summaryQuery.isSuccess && (
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
            <div className="overflow-x-auto" ref={tableRef}>
              <table className="w-full">
                <thead>
                  <tr className="bg-gradient-to-r from-slate-600 to-slate-700 text-white">
                    <th className="px-6 py-4 text-left text-sm font-semibold uppercase tracking-wider">
                      Code
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-semibold uppercase tracking-wider">
                      Customer Name
                    </th>
                    <th className="px-6 py-4 text-right text-sm font-semibold uppercase tracking-wider">
                      Balance
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredCustomers.length === 0 ? (
                    <tr>
                      <td colSpan="3" className="px-6 py-12 text-center text-slate-500">
                        {searchTerm.trim() ? "No customers match your search." : "No customer data available."}
                      </td>
                    </tr>
                  ) : (
                    filteredCustomers.map((customer, index) => {
                      const balance = Number(customer.balance || 0);
                      return (
                        <tr
                          key={customer.code || index}
                          className="hover:bg-amber-50/50 transition-colors"
                        >
                          <td className="px-6 py-4 text-sm font-semibold text-slate-900">
                            {customer.code || "—"}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-700">{customer.name || "—"}</td>
                          <td
                            className={`px-6 py-4 text-sm font-semibold text-right ${
                              balance > 0 ? "text-rose-600" : balance < 0 ? "text-emerald-600" : "text-slate-500"
                            }`}
                          >
                            {formatCurrency(balance)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {filteredCustomers.length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-100 font-semibold border-t-2 border-slate-300">
                      <td colSpan="2" className="px-6 py-4 text-sm text-slate-700 uppercase">
                        Total Receivable
                      </td>
                      <td className="px-6 py-4 text-sm text-right text-amber-700 font-bold">
                        {formatCurrency(totalBalance)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  );
};

export default ReceivableSummaryPage;
