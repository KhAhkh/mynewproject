import { useEffect, useState, useMemo } from "react";
import SectionCard from "../../components/SectionCard.jsx";
import ProfitMetricsCard from "../../components/ProfitMetricsCard.jsx";
import { api } from "../../api/client.js";

const formatCurrency = (value) =>
  `Rs ${Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  })}`;

const CustomersProfitSummaryPage = () => {
  const [customers, setCustomers] = useState([]);
  const [netProfitData, setNetProfitData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("realized_profit");

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [customersRes, netProfitRes] = await Promise.all([
          api.get("/reports/profit/customers"),
          api.get("/reports/profit/net-profit")
        ]);
        setCustomers(customersRes.data || []);
        setNetProfitData(netProfitRes.data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const filteredCustomers = useMemo(() => {
    let filtered = customers.filter(cust =>
      cust.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cust.code?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    filtered.sort((a, b) => {
      const aVal = a[sortBy] || 0;
      const bVal = b[sortBy] || 0;
      return bVal - aVal;
    });

    return filtered;
  }, [customers, searchTerm, sortBy]);

  const totals = useMemo(() => {
    return filteredCustomers.reduce(
      (acc, cust) => ({
        total_sales: (acc.total_sales || 0) + (cust.total_sales || 0),
        total_paid: (acc.total_paid || 0) + (cust.total_paid || 0),
        total_amount_paid: (acc.total_amount_paid || 0) + (cust.total_paid || 0),
        total_outstanding: (acc.total_outstanding || 0) + (cust.outstanding || 0),
        total_advance: (acc.total_advance || 0) + (cust.advance_amount || 0),
        total_cost: (acc.total_cost || 0) + (cust.total_cost || 0),
        invoice_profit: (acc.invoice_profit || 0) + (cust.invoice_profit || 0),
        realized_profit: (acc.realized_profit || 0) + (cust.realized_profit || 0),
        pending_profit: (acc.pending_profit || 0) + (cust.pending_profit || 0),
      }),
      {}
    );
  }, [filteredCustomers]);

  const summaryMetrics = useMemo(() => {
    const totalSales = totals.total_sales || 0;
    const totalOutstanding = totals.total_outstanding || 0;
    const totalAdvance = totals.total_advance || 0;
    return {
      ...totals,
      total_outstanding: totalOutstanding,
      total_advance: totalAdvance,
      outstanding_calculation_ratio_percent: totalSales > 0 ? (totalOutstanding / totalSales) * 100 : 0
    };
  }, [totals]);

  const exportCsv = () => {
    if (filteredCustomers.length === 0) return;
    const rows = [
      ["Customer", "Code", "Total Sale", "Cost of Sale", "Amount Paid", "Outstanding", "Gained Profit", "Pending Profit"]
    ];
    filteredCustomers.forEach(cust => {
      const advanceAmount = cust.advance_amount || 0;
      const outstandingAmount = cust.outstanding || 0;
      const isAdvance = advanceAmount > 0;
      const outstandingDisplay = isAdvance
        ? `Advance (${formatCurrency(advanceAmount)})`
        : formatCurrency(outstandingAmount);
      
      rows.push([
        cust.name || "",
        cust.code || "",
        formatCurrency(cust.total_sales),
        formatCurrency(cust.total_cost),
        formatCurrency(cust.total_paid || 0),
        outstandingDisplay,
        formatCurrency(cust.realized_profit),
        formatCurrency(cust.pending_profit)
      ]);
    });

    const csv = rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "customers-profit-summary.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const printTable = () => {
    if (filteredCustomers.length === 0) return;
    let html = `<!doctype html>
      <html>
      <head>
        <title>Customers Profit Summary</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h1 { text-align: center; color: #1e293b; margin-bottom: 10px; }
          .timestamp { text-align: center; color: #64748b; font-size: 12px; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; font-size: 11px; }
          th { background: #f1f5f9; font-weight: bold; }
          tr:nth-child(even) { background: #f8fafc; }
          .text-right { text-align: right; }
          .font-semibold { font-weight: bold; }
        </style>
      </head>
      <body>
        <h1>Customers Profit Summary</h1>
        <div class="timestamp">Generated on ${new Date().toLocaleString()}</div>
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th class="text-right">Total Sale</th>
              <th class="text-right">Cost of Sale</th>
              <th class="text-right">Amount Paid</th>
              <th class="text-right">Outstanding</th>
              <th class="text-right">Gained Profit</th>
              <th class="text-right">Pending Profit</th>
            </tr>
          </thead>
          <tbody>`;

    filteredCustomers.forEach(cust => {
      const advanceAmount = cust.advance_amount || 0;
      const outstandingAmount = cust.outstanding || 0;
      const isAdvance = advanceAmount > 0;
      const outstandingDisplay = isAdvance
        ? `Advance (${formatCurrency(advanceAmount)})`
        : formatCurrency(outstandingAmount);
      
      html += `
            <tr>
              <td><strong>${cust.name}</strong><br><span style="font-size: 10px; color: #64748b;">${cust.code}</span></td>
              <td class="text-right">${formatCurrency(cust.total_sales)}</td>
              <td class="text-right">${formatCurrency(cust.total_cost)}</td>
              <td class="text-right">${formatCurrency(cust.total_paid || 0)}</td>
              <td class="text-right" style="color: ${isAdvance ? 'blue' : 'red'};">${outstandingDisplay}</td>
              <td class="text-right font-semibold" style="color: green;">${formatCurrency(cust.realized_profit)}</td>
              <td class="text-right font-semibold" style="color: orange;">${formatCurrency(cust.pending_profit)}</td>
            </tr>`;
    });

    html += `
          </tbody>
        </table>
      </body>
      </html>`;

    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  };

  if (loading) return <div className="p-4 text-center text-slate-500">Loading...</div>;
  if (error) return <div className="p-4 text-center text-red-500">Error: {error}</div>;

  return (
    <div className="space-y-6">
      <ProfitMetricsCard 
        metrics={filteredCustomers.length === 1 ? (() => {
          const totalSales = filteredCustomers[0].total_sales || 0;
          const totalPaid = filteredCustomers[0].total_paid || 0;
          const totalOutstanding = filteredCustomers[0].outstanding || 0;
          const totalAdvance = filteredCustomers[0].advance_amount || 0;
          return {
            total_sales: totalSales,
            total_cost: filteredCustomers[0].total_cost,
            invoice_profit: filteredCustomers[0].invoice_profit,
            amount_paid: totalPaid,
            total_amount_paid: totalPaid,
            outstanding_calculation_ratio_percent: totalSales > 0 ? (totalOutstanding / totalSales) * 100 : 0,
            total_outstanding: totalOutstanding,
            total_advance: totalAdvance,
            realized_profit: filteredCustomers[0].realized_profit,
            pending_profit: filteredCustomers[0].pending_profit
          };
        })() : summaryMetrics}
        title={filteredCustomers.length === 1 ? `${filteredCustomers[0].name} - Profit Summary` : "ENTIRE CUSTOMERS PROFIT SUMMARY"}
      />

      <SectionCard 
        title="Customers Profit Details" 
        description="Profit breakdown by customer"
        actions={
          <div className="flex gap-2">
            <button type="button" className="secondary text-xs px-3 py-1" onClick={printTable}>
              Print
            </button>
            <button type="button" className="secondary text-xs px-3 py-1" onClick={exportCsv}>
              Export CSV
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex gap-4">
            <input
              type="text"
              placeholder="Search by customer name or code..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="realized_profit">Sort by Gained Profit</option>
              <option value="invoice_profit">Sort by Profit</option>
              <option value="total_sales">Sort by Total Sale</option>
              <option value="outstanding">Sort by Outstanding</option>
            </select>
          </div>

          {filteredCustomers.length === 0 ? (
            <p className="text-center text-slate-500 py-8">No customers found</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="border border-slate-200 px-4 py-2 text-left font-semibold">Customer</th>
                    <th className="border border-slate-200 px-4 py-2 text-right font-semibold">Total Sale</th>
                    <th className="border border-slate-200 px-4 py-2 text-right font-semibold">Cost of Sale</th>
                    <th className="border border-slate-200 px-4 py-2 text-right font-semibold">Paid</th>
                    <th className="border border-slate-200 px-4 py-2 text-right font-semibold">Outstanding</th>
                    <th className="border border-slate-200 px-4 py-2 text-right font-semibold">Gained Profit</th>
                    <th className="border border-slate-200 px-4 py-2 text-right font-semibold">Pending Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.map((cust) => {
                    const advanceAmount = cust.advance_amount || 0;
                    const outstandingAmount = cust.outstanding || 0;
                    const isAdvance = advanceAmount > 0;
                    return (
                    <tr key={cust.id} className="hover:bg-slate-50">
                      <td className="border border-slate-200 px-4 py-2">
                        <div className="font-medium text-slate-900">{cust.name}</div>
                        <div className="text-xs text-slate-500">{cust.code}</div>
                      </td>
                      <td className="border border-slate-200 px-4 py-2 text-right text-slate-700">
                        {new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", minimumFractionDigits: 0 }).format(cust.total_sales || 0)}
                      </td>
                      <td className="border border-slate-200 px-4 py-2 text-right text-slate-700">
                        {new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", minimumFractionDigits: 0 }).format(cust.total_cost || 0)}
                      </td>
                      <td className="border border-slate-200 px-4 py-2 text-right text-slate-700">
                        {new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", minimumFractionDigits: 0 }).format(cust.total_paid || 0)}
                      </td>
                      <td className={`border border-slate-200 px-4 py-2 text-right ${isAdvance ? 'text-blue-600' : 'text-red-600'}`}>
                        {isAdvance
                          ? `Advance (${new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", minimumFractionDigits: 0 }).format(advanceAmount)})`
                          : new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", minimumFractionDigits: 0 }).format(outstandingAmount)
                        }
                      </td>
                      <td className={`border border-slate-200 px-4 py-2 text-right font-semibold ${cust.realized_profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {cust.realized_profit >= 0 ? 'Profit ' : 'Loss '}
                        {new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", minimumFractionDigits: 0 }).format(Math.abs(cust.realized_profit || 0))}
                      </td>
                      <td className="border border-slate-200 px-4 py-2 text-right text-yellow-600">
                        {new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", minimumFractionDigits: 0 }).format(cust.pending_profit || 0)}
                      </td>
                    </tr>
                  );
                })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
};

export default CustomersProfitSummaryPage;
