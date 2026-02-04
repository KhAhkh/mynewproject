import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FiPrinter, FiDownload } from "react-icons/fi";
import SectionCard from "../../components/SectionCard.jsx";
import { api } from "../../api/client.js";

const formatCurrency = (value) =>
  `Rs ${Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const SupplierPayableSummaryPage = () => {
  const { data: suppliers = [], isLoading, error, refetch } = useQuery({
    queryKey: ["supplier-payable-summary"],
    queryFn: async () => {
      const response = await api.get("/reports/supplier-payable-summary");
      return response.data || [];
    }
  });

  const totalBalance = suppliers.reduce((sum, s) => sum + (s.balance || 0), 0);

  const exportCsv = () => {
    if (suppliers.length === 0) return;
    const rows = [
      ["Code", "Supplier Name", "Invoice No", "Date", "Balance"]
    ];
    suppliers.forEach(s => {
      rows.push([
        s.code || "",
        s.name || "",
        s.invoice_no || "",
        s.invoice_date || "",
        Number(s.balance || 0).toFixed(2)
      ]);
    });
    rows.push(["", "", "", "TOTAL", Number(totalBalance).toFixed(2)]);

    const csv = rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "supplier-payable-summary.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const printReport = () => {
    let html = `<!doctype html>
      <html>
      <head>
        <title>Supplier Payable Summary</title>
        <style>
          @page { size: A4 portrait; margin: 16mm; }
          body { font-family: Arial, sans-serif; padding: 20px; color: #0f172a; }
          h1 { text-align: center; font-size: 24px; margin-bottom: 20px; text-transform: uppercase; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: left; }
          th { background: #e2e8f0; font-weight: bold; text-transform: uppercase; font-size: 12px; }
          td { font-size: 13px; }
          .text-right { text-align: right; }
          tfoot td { font-weight: bold; background: #f1f5f9; }
          .positive { color: #dc2626; }
          .negative { color: #16a34a; }
        </style>
      </head>
      <body>
        <h1>Supplier Payable Summary</h1>
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Supplier Name</th>
              <th>Invoice No</th>
              <th>Date</th>
              <th class="text-right">Balance</th>
            </tr>
          </thead>
          <tbody>`;

    suppliers.forEach(s => {
      const balance = s.balance || 0;
      const balanceClass = balance > 0 ? 'positive' : balance < 0 ? 'negative' : '';
      html += `
            <tr>
              <td>${s.code}</td>
              <td>${s.name}</td>
              <td>${s.invoice_no || ''}</td>
              <td>${s.invoice_date || ''}</td>
              <td class="text-right ${balanceClass}">${formatCurrency(balance)}</td>
            </tr>`;
    });

    html += `
          </tbody>
          <tfoot>
            <tr>
              <td colspan="4">TOTAL</td>
              <td class="text-right">${formatCurrency(totalBalance)}</td>
            </tr>
          </tfoot>
        </table>
        <p style="text-align: center; color: #64748b; font-size: 12px; margin-top: 20px;">
          Generated on ${new Date().toLocaleString()}
        </p>
      </body>
      </html>`;

    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    setTimeout(() => {
      w.print();
    }, 250);
  };

  return (
    <SectionCard
      title="Supplier Payable Summary"
      description="Overview of outstanding balances for all suppliers"
    >
      <div className="space-y-6">
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={printReport}
            disabled={isLoading || suppliers.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-lg font-medium transition-colors"
          >
            <FiPrinter className="text-lg" />
            Print
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={isLoading || suppliers.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-lg font-medium transition-colors"
          >
            <FiDownload className="text-lg" />
            Export CSV
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <p className="font-semibold">Error loading supplier payable data</p>
            <button
              type="button"
              onClick={() => refetch()}
              className="mt-2 text-red-600 underline"
            >
              Retry
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-12 text-slate-600">Loading supplier payables...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gradient-to-r from-slate-100 to-slate-200">
                  <th className="border border-slate-300 px-4 py-3 text-left font-semibold uppercase text-xs">
                    Code
                  </th>
                  <th className="border border-slate-300 px-4 py-3 text-left font-semibold uppercase text-xs">
                    Supplier Name
                  </th>
                  <th className="border border-slate-300 px-4 py-3 text-left font-semibold uppercase text-xs">
                    Invoice No
                  </th>
                  <th className="border border-slate-300 px-4 py-3 text-left font-semibold uppercase text-xs">
                    Date
                  </th>
                  <th className="border border-slate-300 px-4 py-3 text-right font-semibold uppercase text-xs">
                    Balance
                  </th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((supplier, idx) => (
                  <tr key={`${supplier.code}-${supplier.invoice_no}-${idx}`} className="hover:bg-slate-50">
                    <td className="border border-slate-200 px-4 py-2 text-slate-700 font-medium">
                      {supplier.code}
                    </td>
                    <td className="border border-slate-200 px-4 py-2 text-slate-900">
                      {supplier.name}
                    </td>
                    <td className="border border-slate-200 px-4 py-2 text-slate-700">
                      {supplier.invoice_no}
                    </td>
                    <td className="border border-slate-200 px-4 py-2 text-slate-700">
                      {supplier.invoice_date}
                    </td>
                    <td className={`border border-slate-200 px-4 py-2 text-right font-semibold ${
                      (supplier.balance || 0) > 0 ? 'text-red-600' : (supplier.balance || 0) < 0 ? 'text-green-600' : 'text-slate-700'
                    }`}>
                      {formatCurrency(supplier.balance || 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100">
                  <td colSpan="4" className="border border-slate-300 px-4 py-3 text-right font-bold uppercase">
                    Total
                  </td>
                  <td className="border border-slate-300 px-4 py-3 text-right font-bold text-slate-900">
                    {formatCurrency(totalBalance)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </SectionCard>
  );
};

export default SupplierPayableSummaryPage;
