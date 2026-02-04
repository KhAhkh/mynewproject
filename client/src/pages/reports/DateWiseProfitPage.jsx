import { useEffect, useState, useMemo } from "react";
import SectionCard from "../../components/SectionCard.jsx";
import ProfitMetricsCard from "../../components/ProfitMetricsCard.jsx";
import { api } from "../../api/client.js";

const DateWiseProfitPage = () => {
  const [dateData, setDateData] = useState([]);
  const [netProfitData, setNetProfitData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortBy, setSortBy] = useState("sale_date");

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [dateRes, netProfitRes] = await Promise.all([
          api.get("/reports/profit/date-wise"),
          api.get("/reports/profit/net-profit")
        ]);
        setDateData(dateRes.data || []);
        setNetProfitData(netProfitRes.data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const sortedData = useMemo(() => {
    const sorted = [...dateData];
    sorted.sort((a, b) => {
      if (sortBy === "sale_date") {
        return new Date(b.sale_date) - new Date(a.sale_date);
      }
      const aVal = a[sortBy] || 0;
      const bVal = b[sortBy] || 0;
      return bVal - aVal;
    });
    return sorted;
  }, [dateData, sortBy]);

  const totals = useMemo(() => {
    return dateData.reduce(
      (acc, row) => ({
        total_sales: (acc.total_sales || 0) + (row.total_sales || 0),
        total_cost: (acc.total_cost || 0) + (row.total_cost || 0),
        invoice_profit: (acc.invoice_profit || 0) + (row.invoice_profit || 0),
        realized_profit: (acc.realized_profit || 0) + (row.realized_profit || 0),
        pending_profit: (acc.pending_profit || 0) + (row.pending_profit || 0),
      }),
      {}
    );
  }, [dateData]);

  if (loading) return <div className="p-4 text-center text-slate-500">Loading...</div>;
  if (error) return <div className="p-4 text-center text-red-500">Error: {error}</div>;

  return (
    <div className="space-y-6">
      <ProfitMetricsCard 
        metrics={netProfitData} 
        title="DATE WISE PROFIT WITH RETURN"
      />

      <SectionCard 
        title="Daily Profit Analysis" 
        description="Profit breakdown by transaction date"
      >
        <div className="space-y-4">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
          >
            <option value="sale_date">Sort by Date (Latest First)</option>
            <option value="realized_profit">Sort by Realized Profit</option>
            <option value="total_sales">Sort by Total Sales</option>
            <option value="transaction_count">Sort by Transaction Count</option>
          </select>

          {sortedData.length === 0 ? (
            <p className="text-center text-slate-500 py-8">No data found</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="border border-slate-200 px-4 py-2 text-left font-semibold">Date</th>
                    <th className="border border-slate-200 px-4 py-2 text-right font-semibold">Transactions</th>
                    <th className="border border-slate-200 px-4 py-2 text-right font-semibold">Total Sales</th>
                    <th className="border border-slate-200 px-4 py-2 text-right font-semibold">Total Cost</th>
                    <th className="border border-slate-200 px-4 py-2 text-right font-semibold">Invoice Profit</th>
                    <th className="border border-slate-200 px-4 py-2 text-right font-semibold">Profit Gained (Paid)</th>
                    <th className="border border-slate-200 px-4 py-2 text-right font-semibold">Profit Pending (to get)</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedData.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="border border-slate-200 px-4 py-2 font-medium text-slate-900">
                        {new Date(row.sale_date).toLocaleDateString('en-PK')}
                      </td>
                      <td className="border border-slate-200 px-4 py-2 text-right text-slate-600">
                        {row.transaction_count || 0}
                      </td>
                      <td className="border border-slate-200 px-4 py-2 text-right text-slate-700">
                        {new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", minimumFractionDigits: 0 }).format(row.total_sales || 0)}
                      </td>
                      <td className="border border-slate-200 px-4 py-2 text-right text-slate-700">
                        {new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", minimumFractionDigits: 0 }).format(row.total_cost || 0)}
                      </td>
                      <td className="border border-slate-200 px-4 py-2 text-right font-semibold text-green-600">
                        {new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", minimumFractionDigits: 0 }).format(row.invoice_profit || 0)}
                      </td>
                      <td className={`border border-slate-200 px-4 py-2 text-right font-semibold ${date.realized_profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {date.realized_profit >= 0 ? 'Profit ' : 'Loss '}
                        {new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", minimumFractionDigits: 0 }).format(Math.abs(date.realized_profit || 0))}
                      </td>
                      <td className="border border-slate-200 px-4 py-2 text-right text-yellow-600">
                        {new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", minimumFractionDigits: 0 }).format(row.pending_profit || 0)}
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

export default DateWiseProfitPage;
