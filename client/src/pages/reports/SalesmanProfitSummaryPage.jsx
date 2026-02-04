import { useEffect, useState, useMemo } from "react";
import SectionCard from "../../components/SectionCard.jsx";
import ProfitMetricsCard from "../../components/ProfitMetricsCard.jsx";
import { api } from "../../api/client.js";

const formatCurrency = (value) =>
  `Rs ${Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  })}`;

const SalesmanProfitSummaryPage = () => {
  const [salesmen, setSalesmen] = useState([]);
  const [netProfitData, setNetProfitData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("realized_profit");

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [salesmenRes, netProfitRes] = await Promise.all([
          api.get("/reports/profit/salesmen"),
          api.get("/reports/profit/net-profit")
        ]);
        setSalesmen(salesmenRes.data || []);
        setNetProfitData(netProfitRes.data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const filteredSalesmen = useMemo(() => {
    let filtered = salesmen.filter(sm =>
      sm.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sm.code?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    filtered.sort((a, b) => {
      const aVal = a[sortBy] || 0;
      const bVal = b[sortBy] || 0;
      return bVal - aVal;
    });

    return filtered;
  }, [salesmen, searchTerm, sortBy]);

  const totals = useMemo(() => {
    return filteredSalesmen.reduce(
      (acc, sm) => ({
        total_sales: (acc.total_sales || 0) + (sm.total_sales || 0),
        total_cost: (acc.total_cost || 0) + (sm.total_cost || 0),
        invoice_profit: (acc.invoice_profit || 0) + (sm.invoice_profit || 0),
        realized_profit: (acc.realized_profit || 0) + (sm.realized_profit || 0),
        pending_profit: (acc.pending_profit || 0) + (sm.pending_profit || 0),
      }),
      {}
    );
  }, [filteredSalesmen]);

  const exportCsv = () => {
    if (filteredSalesmen.length === 0) return;
    const rows = [
      ["Salesman", "Code", "Total Sale", "Cost of Sale", "Profit", "Gained Profit", "Pending Profit"]
    ];
    filteredSalesmen.forEach(sm => {
      rows.push([
        sm.name || "",
        sm.code || "",
        formatCurrency(sm.total_sales),
        formatCurrency(sm.total_cost),
        formatCurrency(sm.invoice_profit),
        formatCurrency(sm.realized_profit),
        formatCurrency(sm.pending_profit)
      ]);
    });

    const csv = rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "salesman-profit-summary.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const printTable = () => {
    if (filteredSalesmen.length === 0) return;
    let html = `<!doctype html>
      <html>
      <head>
        <title>Salesman Profit Summary</title>
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
        <h1>Salesman Profit Summary</h1>
        <div class="timestamp">Generated on ${new Date().toLocaleString()}</div>
        <table>
          <thead>
            <tr>
              <th>Salesman</th>
              <th>Code</th>
              <th class="text-right">Total Sale</th>
              <th class="text-right">Cost of Sale</th>
              <th class="text-right">Profit</th>
              <th class="text-right">Gained Profit</th>
              <th class="text-right">Profit Pending</th>
            </tr>
          </thead>
          <tbody>`;

    filteredSalesmen.forEach(sm => {
      html += `
            <tr>
              <td><strong>${sm.name}</strong><br><span style="font-size: 10px; color: #64748b;">${sm.code}</span></td>
              <td>${sm.code}</td>
              <td class="text-right">${formatCurrency(sm.total_sales)}</td>
              <td class="text-right">${formatCurrency(sm.total_cost)}</td>
              <td class="text-right font-semibold">${formatCurrency(sm.invoice_profit)}</td>
              <td class="text-right font-semibold" style="color: green;">${formatCurrency(sm.realized_profit)}</td>
              <td class="text-right font-semibold" style="color: orange;">${formatCurrency(sm.pending_profit)}</td>
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
        metrics={netProfitData} 
        title="ENTIRE SALESMAN PROFIT SUMMARY"
      />

      <SectionCard 
        title="Salesmen Profit Details" 
        description="Profit breakdown by salesman"
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
              placeholder="Search by salesman name or code..."
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
              <option value="pending_profit">Sort by Pending Profit</option>
            </select>
          </div>

          {filteredSalesmen.length === 0 ? (
            <p className="text-center text-slate-500 py-8">No salesmen found</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="border border-slate-200 px-4 py-2 text-left font-semibold">Salesman</th>
                    <th className="border border-slate-200 px-4 py-2 text-right font-semibold">Total Sale</th>
                    <th className="border border-slate-200 px-4 py-2 text-right font-semibold">Cost of Sale</th>
                    <th className="border border-slate-200 px-4 py-2 text-right font-semibold">Profit</th>
                    <th className="border border-slate-200 px-4 py-2 text-right font-semibold">Gained Profit</th>
                    <th className="border border-slate-200 px-4 py-2 text-right font-semibold">Profit Pending (to get)</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSalesmen.map((sm) => (
                    <tr key={sm.id} className="hover:bg-slate-50">
                      <td className="border border-slate-200 px-4 py-2">
                        <div className="font-medium text-slate-900">{sm.name}</div>
                        <div className="text-xs text-slate-500">{sm.code}</div>
                      </td>
                      <td className="border border-slate-200 px-4 py-2 text-right text-slate-700">
                        {new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", minimumFractionDigits: 0 }).format(sm.total_sales || 0)}
                      </td>
                      <td className="border border-slate-200 px-4 py-2 text-right text-slate-700">
                        {new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", minimumFractionDigits: 0 }).format(sm.total_cost || 0)}
                      </td>
                      <td className="border border-slate-200 px-4 py-2 text-right font-semibold text-green-600">
                        {new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", minimumFractionDigits: 0 }).format(sm.invoice_profit || 0)}
                      </td>
                      <td className={`border border-slate-200 px-4 py-2 text-right font-semibold ${sm.realized_profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {sm.realized_profit >= 0 ? 'Profit ' : 'Loss '}
                        {new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", minimumFractionDigits: 0 }).format(Math.abs(sm.realized_profit || 0))}
                      </td>
                      <td className="border border-slate-200 px-4 py-2 text-right text-yellow-600">
                        {new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", minimumFractionDigits: 0 }).format(sm.pending_profit || 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
};

export default SalesmanProfitSummaryPage;
