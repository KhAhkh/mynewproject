import { useEffect, useState, useMemo } from "react";
import SectionCard from "../../components/SectionCard.jsx";
import ProfitMetricsCard from "../../components/ProfitMetricsCard.jsx";
import { api } from "../../api/client.js";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";

const formatCurrency = (value) =>
  `Rs ${Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  })}`;

const ItemsProfitSummaryPage = () => {
  const [items, setItems] = useState([]);
  const [netProfitData, setNetProfitData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("invoice_profit");

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [itemsRes, netProfitRes] = await Promise.all([
          api.get("/reports/profit/items"),
          api.get("/reports/profit/net-profit")
        ]);
        setItems(itemsRes.data || []);
        setNetProfitData(netProfitRes.data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const filteredItems = useMemo(() => {
    let filtered = items.filter(item =>
      item.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.code?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    filtered.sort((a, b) => {
      const aVal = a[sortBy] || 0;
      const bVal = b[sortBy] || 0;
      return bVal - aVal;
    });

    return filtered;
  }, [items, searchTerm, sortBy]);

  const totals = useMemo(() => {
    return filteredItems.reduce(
      (acc, item) => ({
        total_sales: (acc.total_sales || 0) + (item.total_sales || 0),
        total_cost: (acc.total_cost || 0) + (item.total_cost || 0),
        invoice_profit: (acc.invoice_profit || 0) + (item.invoice_profit || 0),
        realized_profit: (acc.realized_profit || 0) + (item.realized_profit || 0),
        pending_profit: (acc.pending_profit || 0) + (item.pending_profit || 0),
      }),
      {}
    );
  }, [filteredItems]);

  const top10ByMargin = useMemo(() => {
    return items
      .map(item => ({
        ...item,
        profit_margin: item.total_sales > 0 ? ((item.invoice_profit / item.total_sales) * 100).toFixed(2) : 0,
      }))
      .sort((a, b) => parseFloat(b.profit_margin) - parseFloat(a.profit_margin))
      .slice(0, 10)
      .map(item => ({
        name: item.name,
        code: item.code,
        margin: parseFloat(item.profit_margin),
      }));
  }, [items]);

  const exportCsv = () => {
    if (filteredItems.length === 0) return;
    const rows = [
      ["Item", "Code", "Total Sale", "Cost of Sale", "Profit", "Gained Profit", "Pending Profit"]
    ];
    filteredItems.forEach(item => {
      rows.push([
        item.name || "",
        item.code || "",
        formatCurrency(item.total_sales),
        formatCurrency(item.total_cost),
        formatCurrency(item.invoice_profit),
        formatCurrency(item.realized_profit),
        formatCurrency(item.pending_profit)
      ]);
    });

    const csv = rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "items-profit-summary.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const printTable = () => {
    if (filteredItems.length === 0) return;
    let html = `<!doctype html>
      <html>
      <head>
        <title>Items Profit Summary</title>
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
        <h1>Items Profit Summary</h1>
        <div class="timestamp">Generated on ${new Date().toLocaleString()}</div>
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Code</th>
              <th class="text-right">Total Sale</th>
              <th class="text-right">Cost of Sale</th>
              <th class="text-right">Profit</th>
              <th class="text-right">Gained Profit</th>
              <th class="text-right">Profit Pending</th>
            </tr>
          </thead>
          <tbody>`;

    filteredItems.forEach(item => {
      html += `
            <tr>
              <td><strong>${item.name}</strong><br><span style="font-size: 10px; color: #64748b;">${item.code}</span></td>
              <td>${item.code}</td>
              <td class="text-right">${formatCurrency(item.total_sales)}</td>
              <td class="text-right">${formatCurrency(item.total_cost)}</td>
              <td class="text-right font-semibold">${formatCurrency(item.invoice_profit)}</td>
              <td class="text-right font-semibold" style="color: green;">${formatCurrency(item.realized_profit)}</td>
              <td class="text-right font-semibold" style="color: orange;">${formatCurrency(item.pending_profit)}</td>
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
        title="ENTIRE ITEMS PROFIT SUMMARY"
      />

      <SectionCard 
        title="Items Profit Details" 
        description="Profit breakdown by individual items"
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
              placeholder="Search by item name or code..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="invoice_profit">Sort by Profit</option>
              <option value="total_sales">Sort by Sale</option>
              <option value="realized_profit">Sort by Gained</option>
              <option value="pending_profit">Sort by Pending</option>
            </select>
          </div>

          {filteredItems.length === 0 ? (
            <p className="text-center text-slate-500 py-8">No items found</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="border border-slate-200 px-4 py-2 text-left font-semibold">Item</th>
                    <th className="border border-slate-200 px-4 py-2 text-right font-semibold">Total Sale</th>
                    <th className="border border-slate-200 px-4 py-2 text-right font-semibold">Cost of Sale</th>
                    <th className="border border-slate-200 px-4 py-2 text-right font-semibold">Profit</th>
                    <th className="border border-slate-200 px-4 py-2 text-right font-semibold">Gained Profit</th>
                    <th className="border border-slate-200 px-4 py-2 text-right font-semibold">Pending Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="border border-slate-200 px-4 py-2">
                        <div className="font-medium text-slate-900">{item.name}</div>
                        <div className="text-xs text-slate-500">{item.code}</div>
                      </td>
                      <td className="border border-slate-200 px-4 py-2 text-right text-slate-700">
                        {new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", minimumFractionDigits: 0 }).format(item.total_sales || 0)}
                      </td>
                      <td className="border border-slate-200 px-4 py-2 text-right text-slate-700">
                        {new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", minimumFractionDigits: 0 }).format(item.total_cost || 0)}
                      </td>
                      <td className="border border-slate-200 px-4 py-2 text-right font-semibold text-green-600">
                        {new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", minimumFractionDigits: 0 }).format(item.invoice_profit || 0)}
                      </td>
                      <td className={`border border-slate-200 px-4 py-2 text-right font-semibold ${item.realized_profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {item.realized_profit < 0 ? 'Loss ' : ''}
                        {new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", minimumFractionDigits: 0 }).format(Math.abs(item.realized_profit || 0))}
                      </td>
                      <td className="border border-slate-200 px-4 py-2 text-right text-yellow-600">
                        {new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", minimumFractionDigits: 0 }).format(item.pending_profit || 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard 
        title="Calculation Details & Analysis" 
        description="Profit calculations and top 10 items by profit margin"
      >
        <div className="space-y-6">
          {/* Calculation Details */}
          <div className="rounded-lg bg-blue-50 p-4 border border-blue-200">
            <h4 className="font-semibold text-blue-900 mb-3">Summary Calculations</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm text-blue-800">
              <div>
                <p className="text-xs text-blue-600 mb-1">Total Sale</p>
                <p className="font-semibold">
                  {new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR" }).format(totals.total_sales || 0)}
                </p>
              </div>
              <div>
                <p className="text-xs text-blue-600 mb-1">Cost of Sale</p>
                <p className="font-semibold">
                  {new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR" }).format(totals.total_cost || 0)}
                </p>
              </div>
              <div>
                <p className="text-xs text-blue-600 mb-1">Profit</p>
                <p className="font-semibold text-green-600">
                  {new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR" }).format(totals.invoice_profit || 0)}
                </p>
              </div>
              <div>
                <p className="text-xs text-blue-600 mb-1">Gained Profit</p>
                <p className={`font-semibold ${totals.realized_profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {totals.realized_profit < 0 ? 'Loss ' : ''}
                  {new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR" }).format(Math.abs(totals.realized_profit || 0))}
                </p>
              </div>
              <div>
                <p className="text-xs text-blue-600 mb-1">Pending Profit</p>
                <p className="font-semibold text-yellow-600">
                  {new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR" }).format(totals.pending_profit || 0)}
                </p>
              </div>
              <div>
                <p className="text-xs text-blue-600 mb-1">Profit Margin</p>
                <p className="font-semibold">
                  {totals.total_sales > 0 ? ((totals.invoice_profit / totals.total_sales) * 100).toFixed(2) : 0}%
                </p>
              </div>
            </div>
          </div>

          {/* Top 10 Items by Profit Margin Chart */}
          {top10ByMargin.length > 0 && (
            <div>
              <h4 className="font-semibold text-slate-900 mb-4">Top 10 Items by Profit Margin</h4>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={top10ByMargin} margin={{ top: 20, right: 30, left: 0, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="name" 
                    angle={-45}
                    textAnchor="end"
                    height={120}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis 
                    label={{ value: "Profit Margin (%)", angle: -90, position: "insideLeft" }}
                  />
                  <Tooltip 
                    formatter={(value) => `${value.toFixed(2)}%`}
                    contentStyle={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                  />
                  <Bar dataKey="margin" name="Profit Margin %">
                    {top10ByMargin.map((entry, index) => {
                      const colors = [
                        '#93c5fd', // light blue
                        '#86efac', // light green
                        '#fcd34d', // light yellow
                        '#fca5a5', // light red
                        '#d8b4fe', // light purple
                        '#a5f3fc', // light cyan
                        '#fbcfe8', // light pink
                        '#99f6e4', // light teal
                        '#c7d2fe', // light indigo
                        '#fed7aa', // light orange
                      ];
                      return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
};

export default ItemsProfitSummaryPage;
