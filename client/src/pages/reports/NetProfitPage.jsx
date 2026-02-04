import { useEffect, useState } from "react";
import SectionCard from "../../components/SectionCard.jsx";
import ProfitMetricsCard from "../../components/ProfitMetricsCard.jsx";
import { api } from "../../api/client.js";

const formatCurrency = (value) =>
  `Rs ${Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const NetProfitPage = () => {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await api.get("/reports/profit/net-profit");
        setMetrics(response.data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const exportCsv = () => {
    if (!metrics) return;
    const amountPaid = metrics.total_amount_paid ?? metrics.amount_paid ?? 0;
    const outstandingCalcRatio = metrics.outstanding_calculation_ratio_percent ?? metrics.outstanding_calculation_ratio ?? 0;
    const profitPercentOfCost = metrics.total_cost > 0
      ? (metrics.invoice_profit / metrics.total_cost) * 100
      : 0;
    const rows = [
      ["Metric", "Value", "Percentage"],
      ["Total Sales", formatCurrency(metrics.total_sales), "100.00%"],
      ["Cost of Sales", formatCurrency(metrics.total_cost), `${((metrics.total_cost / (metrics.total_sales || 1)) * 100).toFixed(2)}%`],
      ["Invoice Profit (of Cost)", formatCurrency(metrics.invoice_profit), `${profitPercentOfCost.toFixed(2)}%`],
      ["Amount Paid", formatCurrency(amountPaid), `${((amountPaid / (metrics.total_sales || 1)) * 100).toFixed(2)}%`],
      ["Outstanding Calculation Ratio", `${outstandingCalcRatio.toFixed(2)}%`, ""],
      ["Outstanding", formatCurrency(metrics.total_outstanding), `${((metrics.total_outstanding / (metrics.total_sales || 1)) * 100).toFixed(2)}%`],
      ["Realized Profit", formatCurrency(metrics.realized_profit), `${((metrics.realized_profit / (metrics.total_sales || 1)) * 100).toFixed(2)}%`],
      ["Pending Profit", formatCurrency(metrics.pending_profit), `${((metrics.pending_profit / (metrics.total_sales || 1)) * 100).toFixed(2)}%`]
    ];

    const csv = rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "net-profit-report.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const printReport = () => {
    if (!metrics) return;
    const totalSales = metrics.total_sales || 1;
    const amountPaid = metrics.total_amount_paid ?? metrics.amount_paid ?? 0;
    const outstandingCalcRatio = metrics.outstanding_calculation_ratio_percent ?? metrics.outstanding_calculation_ratio ?? 0;
    const profitPercentOfCost = metrics.total_cost > 0
      ? (metrics.invoice_profit / metrics.total_cost) * 100
      : 0;
    const calculatePercentage = (value) => {
      const num = Number(value ?? 0);
      return ((num / totalSales) * 100).toFixed(2);
    };

    const html = `<!doctype html>
      <html>
      <head>
        <title>Entire Net Profit Report</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h1 { text-align: center; color: #1e293b; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: left; }
          th { background: #f1f5f9; font-weight: bold; }
          tr:nth-child(even) { background: #f8fafc; }
          .summary { margin-top: 20px; }
          .summary-item { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0; }
          .summary-item strong { min-width: 200px; }
        </style>
      </head>
      <body>
        <h1>Entire Net Profit Report</h1>
        <table>
          <thead>
            <tr>
              <th>Metric</th>
              <th>Value</th>
              <th>Percentage</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Total Sales</td>
              <td>${formatCurrency(metrics.total_sales)}</td>
              <td>100.00%</td>
            </tr>
            <tr>
              <td>Cost of Sales</td>
              <td>${formatCurrency(metrics.total_cost)}</td>
              <td>${calculatePercentage(metrics.total_cost)}%</td>
            </tr>
            <tr>
              <td>Invoice Profit (of Cost)</td>
              <td>${formatCurrency(metrics.invoice_profit)}</td>
              <td>${profitPercentOfCost.toFixed(2)}%</td>
            </tr>
            <tr>
              <td>Amount Paid</td>
              <td>${formatCurrency(amountPaid)}</td>
              <td>${calculatePercentage(amountPaid)}%</td>
            </tr>
            <tr>
              <td>Outstanding Calculation Ratio</td>
              <td>${outstandingCalcRatio.toFixed(2)}%</td>
              <td></td>
            </tr>
            <tr>
              <td>Outstanding</td>
              <td>${formatCurrency(metrics.total_outstanding)}</td>
              <td>${calculatePercentage(metrics.total_outstanding)}%</td>
            </tr>
            <tr style="background: #dcfce7; font-weight: bold;">
              <td>Realized Profit</td>
              <td>${formatCurrency(metrics.realized_profit)}</td>
              <td>${calculatePercentage(metrics.realized_profit)}%</td>
            </tr>
            <tr style="background: #fef3c7; font-weight: bold;">
              <td>Pending Profit</td>
              <td>${formatCurrency(metrics.pending_profit)}</td>
              <td>${calculatePercentage(metrics.pending_profit)}%</td>
            </tr>
          </tbody>
        </table>
        <p style="text-align: center; color: #64748b; font-size: 12px; margin-top: 20px;">
          Report generated on ${new Date().toLocaleString()}
        </p>
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
        metrics={metrics} 
        title="ENTIRE NET PROFIT"
      />
      
      <SectionCard 
        title="Overview" 
        description="Profit summary for entire period"
        actions={
          <div className="flex gap-2">
            <button type="button" className="secondary text-xs px-3 py-1" onClick={printReport}>
              Print
            </button>
            <button type="button" className="secondary text-xs px-3 py-1" onClick={exportCsv}>
              Export CSV
            </button>
          </div>
        }
      >
        <div className="space-y-4 text-sm text-slate-600">
          <div className="rounded-lg bg-blue-50 p-4 border border-blue-200">
            <h4 className="font-semibold text-blue-900 mb-2">Key Insights</h4>
            <ul className="space-y-1 text-blue-800">
              <li>• Total Sales: {new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR" }).format(metrics?.total_sales || 0)}</li>
              <li>• Total Cost: {new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR" }).format(metrics?.total_cost || 0)}</li>
              <li>• Realized Profit: {new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR" }).format(metrics?.realized_profit || 0)}</li>
              <li>• Pending Profit: {new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR" }).format(metrics?.pending_profit || 0)}</li>
              <li>• Outstanding Amount: {new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR" }).format(metrics?.total_outstanding || 0)}</li>
            </ul>
          </div>
          <p className="text-xs text-slate-500 italic">
            This report shows the total profit for your entire business operations, 
            distinguishing between realized profit (from paid amounts) and pending profit (from outstanding amounts waiting for payment).
          </p>
        </div>
      </SectionCard>
    </div>
  );
};

export default NetProfitPage;
