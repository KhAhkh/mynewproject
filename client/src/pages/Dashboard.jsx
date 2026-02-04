import { useQuery } from "@tanstack/react-query";
import { FiUsers, FiTruck, FiBox, FiDollarSign, FiArrowRight } from "react-icons/fi";
import SectionCard from "../components/SectionCard.jsx";
import { api } from "../api/client.js";
import { useMemo } from "react";

const formatNumber = (value) => Number(value ?? 0).toLocaleString();

const formatCurrency = (value) =>
  `Rs ${Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const SummaryCard = ({ title, value, hint, accent, icon: Icon, iconTint }) => (
  <div
    className={`summary-card group relative overflow-hidden rounded-[26px] border border-slate-200/80 bg-gradient-to-br p-6 text-slate-900 shadow-[0_25px_60px_-35px_rgba(15,23,42,0.65)] backdrop-blur-sm transition-all duration-300 ease-out transform-gpu hover:-translate-y-1 hover:shadow-[0_28px_70px_-30px_rgba(15,23,42,0.6)] hover:border-slate-200 ${accent}`}
  >
    <div className="pointer-events-none absolute inset-y-0 -left-10 w-2/3 rounded-[26px] bg-[radial-gradient(circle_at_left,_rgba(255,255,255,0.82),_transparent_65%)] transition-opacity duration-300 group-hover:opacity-0" />
    <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.55),_transparent_65%)]" />
      <div className="absolute -inset-x-6 inset-y-10 origin-center scale-125 rotate-[12deg] rounded-[42px] bg-gradient-to-br from-white/35 via-white/5 to-transparent blur-2xl transition-transform duration-500 ease-out group-hover:rotate-[5deg] group-hover:scale-150" />
    </div>
    <div className="relative flex items-start justify-between gap-4">
      <div>
        <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500 transition-colors duration-300 group-hover:text-slate-400">
          {title}
        </p>
        <p className="mt-3 text-[26px] font-semibold leading-tight text-slate-900 transition-transform duration-300 group-hover:translate-y-[-2px]">
          {value}
        </p>
        {hint ? (
          <p className="mt-3 text-xs text-slate-500 transition-colors duration-300 group-hover:text-slate-400">
            {hint}
          </p>
        ) : null}
      </div>
      {Icon ? (
        <span
          className={`summary-card__icon rounded-2xl border bg-white/90 p-3 text-slate-600 shadow-sm backdrop-blur transition-all duration-300 ease-out group-hover:scale-110 group-hover:-rotate-6 ${
            iconTint ?? "border-slate-200/70"
          }`}
        >
          <Icon className="text-lg" />
        </span>
      ) : null}
    </div>
    <div className="pointer-events-none absolute inset-x-6 bottom-0 h-1 bg-gradient-to-r from-transparent via-white/70 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
  </div>
);

const metricGradients = [
  "bg-gradient-to-br from-white via-[#f3f6ff] to-[#e4ecff]",
  "bg-gradient-to-br from-white via-[#f0fbf5] to-[#dff3e7]",
  "bg-gradient-to-br from-white via-[#f5f6fb] to-[#e4e7f3]",
  "bg-gradient-to-br from-white via-[#f8f3ff] to-[#ebe2ff]",
  "bg-gradient-to-br from-white via-[#f1f8ff] to-[#e0efff]"
];

const MetricRow = ({ label, value, sublabel, index }) => (
  <div
    className={`group relative flex items-center justify-between rounded-[18px] border border-white/60 px-5 py-4 text-slate-800 shadow-[0_32px_70px_-45px_rgba(15,23,42,0.55)] transition ${
      metricGradients[index % metricGradients.length]
    }`}
  >
    <div className="relative z-[1]">
      <p className="text-sm font-semibold text-slate-700">{label}</p>
      {sublabel ? <p className="mt-1 text-xs text-slate-500">{sublabel}</p> : null}
    </div>
    <p className="relative z-[1] text-base font-semibold text-slate-900">{value}</p>
    <div className="pointer-events-none absolute inset-0 rounded-[18px] bg-white/35 opacity-0 transition group-hover:opacity-60" />
  </div>
);

const MonthlySalesChart = ({ isLoading, monthlyData }) => {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const data = useMemo(() => {
    if (!monthlyData || monthlyData.length === 0) {
      return months.map((month, idx) => ({ month, sales: 0 }));
    }
    return months.map((month, idx) => ({
      month,
      sales: monthlyData[idx]?.sales || 0
    }));
  }, [monthlyData]);

  const maxSales = Math.max(...data.map(d => d.sales), 1);
  const scale = 100 / maxSales;

  return (
    <SectionCard
      title="Monthly Sales Overview"
      description="Year-to-date sales performance by month"
      className="bg-gradient-to-br from-white/95 via-[#f9f7ff]/95 to-[#f0e9ff]/95 text-slate-800 shadow-[0_40px_85px_-52px_rgba(15,23,42,0.6)] border-white/60"
    >
      {isLoading ? (
        <p className="text-slate-600">Loading monthly data…</p>
      ) : (
        <div className="space-y-6">
          <div className="flex gap-6 overflow-x-auto pb-4">
            {data.map((item) => (
              <div key={item.month} className="flex min-w-[80px] flex-col items-center gap-3">
                <div className="h-48 w-12 rounded-lg bg-gradient-to-t from-blue-400/80 via-blue-300/60 to-blue-200/40 shadow-[0_20px_40px_-25px_rgba(59,130,246,0.5)] border border-blue-200/50 relative group hover:shadow-[0_25px_50px_-20px_rgba(59,130,246,0.6)] transition" style={{ height: `${Math.min(item.sales * scale * 1.2, 192)}px` }}>
                  <div className="absolute inset-0 bg-gradient-to-t from-blue-500/20 via-transparent to-transparent rounded-lg opacity-0 group-hover:opacity-100 transition" />
                </div>
                <div className="text-center">
                  <p className="text-xs font-semibold text-slate-600">{item.month}</p>
                  {item.sales > 0 && (
                    <p className="text-xs text-slate-500 mt-1">
                      Rs {(item.sales / 1000).toFixed(1)}k
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-200/50">
            <div className="text-center">
              <p className="text-xs uppercase tracking-wider text-slate-500">Highest Month</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">
                {data.reduce((max, d) => d.sales > max.sales ? d : max).month}
              </p>
              <p className="text-xs text-slate-600">
                {formatCurrency(Math.max(...data.map(d => d.sales)))}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs uppercase tracking-wider text-slate-500">Total Sales</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">
                {formatCurrency(data.reduce((sum, d) => sum + d.sales, 0))}
              </p>
              <p className="text-xs text-slate-600">12 months</p>
            </div>
            <div className="text-center">
              <p className="text-xs uppercase tracking-wider text-slate-500">Average</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">
                {formatCurrency(data.reduce((sum, d) => sum + d.sales, 0) / 12)}
              </p>
              <p className="text-xs text-slate-600">Per month</p>
            </div>
          </div>
        </div>
      )}
    </SectionCard>
  );
};

const Dashboard = () => {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: async () => {
      const response = await api.get("/dashboard/summary");
      return response.data;
    }
  });

  const { data: monthlyData, isLoading: isLoadingMonthly } = useQuery({
    queryKey: ["dashboard-monthly-sales"],
    queryFn: async () => {
      const response = await api.get("/dashboard/monthly-sales");
      return response.data || [];
    }
  });

  const counts = data?.counts ?? {};
  const sales = data?.sales ?? {};
  const purchases = data?.purchases ?? {};
  const receipts = data?.receipts ?? {};
  const expenses = data?.expenses ?? {};
  const recentSales = data?.recentSales ?? [];

  const summaryCards = [
    {
      title: "Customers",
      value: isLoading ? "…" : formatNumber(counts.customers),
      hint: "Active customer profiles",
      accent: "from-white via-[#eff4ff] to-[#d9e4ff]",
      icon: FiUsers,
      iconTint: "border-indigo-200/80 bg-indigo-50 text-indigo-500"
    },
    {
      title: "Payable To Suppliers",
      value: isLoading ? "…" : formatCurrency(purchases.totalPayable || 0),
      hint: "Total outstanding amount",
      accent: "from-white via-[#effaf5] to-[#d7efe4]",
      icon: FiTruck,
      iconTint: "border-emerald-200/80 bg-emerald-50 text-emerald-500"
    },
    {
      title: "Inventory Items",
      value: isLoading ? "…" : formatNumber(counts.items),
      hint: "SKUs ready to ship",
      accent: "from-white via-[#fff7ed] to-[#fde6c8]",
      icon: FiBox,
      iconTint: "border-amber-200/80 bg-amber-50 text-amber-500"
    },
    {
      title: "Outstanding Receivables",
      value: isLoading ? "…" : formatCurrency(sales.outstanding),
      hint: "Balance after receipts",
      accent: "from-white via-[#f8f1ff] to-[#e3d7ff]",
      icon: FiDollarSign,
      iconTint: "border-purple-200/80 bg-purple-50 text-purple-500"
    }
  ];

  const recentSaleGradients = [
    "from-white via-[#f5f7ff] to-[#e7ecff]"
  ];

  return (
    <div className="relative -m-10 min-h-screen">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-[#f9fbff] via-[#eef2fb] to-[#e2e9ff]" />
      <div className="relative px-10 py-12">
        <div className="mx-auto flex max-w-7xl flex-col gap-8">
          <section className="relative overflow-hidden rounded-[32px] border border-[#d7deef] bg-gradient-to-br from-[#fafbff] via-[#eef3ff] to-[#cfe1ff] px-10 py-7 text-slate-800 shadow-[0_35px_70px_-40px_rgba(15,23,42,0.6)] md:py-8">
          <div className="absolute inset-y-0 left-0 w-1/2 bg-[radial-gradient(circle_at_left,_rgba(255,255,255,0.92),_transparent_70%)]" />
          <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_bottom_right,_rgba(154,186,255,0.38),_transparent_65%)]" />
          <div className="relative flex flex-col gap-6 md:flex-row md:items-center">
            <div className="max-w-xl">
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-slate-500">Operations Pulse</p>
              <h1 className="mt-3 text-3xl font-semibold text-slate-800">DIGITAL ZONE NEXUS</h1>
              <p className="mt-3 text-sm text-slate-500">
                Monitor master data coverage, sales momentum, supplier spend, and liquidity from a single, modern control surface.
              </p>
            </div>
            <div className="flex items-center gap-3 rounded-full border border-white/70 bg-gradient-to-r from-white/95 via-white/80 to-[#d6e8ff]/70 px-6 py-3 text-sm text-slate-700 shadow-[0_18px_45px_-26px_rgba(15,23,42,0.4)] md:ml-auto">
              <FiArrowRight className="text-slate-400" />
              <span className="font-medium whitespace-nowrap text-slate-600">Data refreshed on load — click cards for deeper drill-downs soon.</span>
            </div>
          </div>
        </section>
        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700 shadow-inner">
            <p className="font-semibold">Unable to load dashboard metrics.</p>
            <button className="mt-2 inline-flex items-center gap-2 text-rose-600 underline" onClick={() => refetch()}>
              Retry
              <FiArrowRight className="text-xs" />
            </button>
          </div>
        ) : null}
          <div className="space-y-10">
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {summaryCards.map((card) => (
              <SummaryCard key={card.title} {...card} />
            ))}
          </div>
          <MonthlySalesChart isLoading={isLoadingMonthly} monthlyData={monthlyData} />
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6">
              <SectionCard
                title="Sales Overview"
                description={isLoading ? "Gathering the latest sales activity…" : "Snapshot of invoice health"}
                className="bg-gradient-to-br from-white/95 via-[#f5f7ff]/95 to-[#eef2ff]/95 text-slate-800 shadow-[0_40px_85px_-52px_rgba(15,23,42,0.6)] border-white/60"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <MetricRow index={0} label="Invoices Issued" value={isLoading ? "…" : formatNumber(sales.invoiceCount)} />
                  <MetricRow index={1} label="Total Invoiced" value={isLoading ? "…" : formatCurrency(sales.totalAmount)} />
                  <MetricRow index={2} label="Collected at Sale" value={isLoading ? "…" : formatCurrency(sales.totalPaid)} />
                  <MetricRow index={3} label="Receipts Posted" value={isLoading ? "…" : formatCurrency(receipts.totalAmount)} />
                  <MetricRow
                    index={4}
                    label="Outstanding"
                    value={isLoading ? "…" : formatCurrency(sales.outstanding)}
                    sublabel="Pending after receipts"
                  />
                </div>
              </SectionCard>

              <SectionCard
                title="Purchases Overview"
                description={isLoading ? "Loading purchase insights…" : "Supplier spend and payments"}
                className="bg-gradient-to-br from-white/95 via-[#f4f9ff]/95 to-[#eaf2ff]/95 text-slate-800 shadow-[0_40px_85px_-52px_rgba(15,23,42,0.6)] border-white/60"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <MetricRow index={0} label="Purchase Invoices" value={isLoading ? "…" : formatNumber(purchases.invoiceCount)} />
                  <MetricRow index={1} label="Total Procurement" value={isLoading ? "…" : formatCurrency(purchases.totalAmount)} />
                  <MetricRow index={2} label="Paid to Suppliers" value={isLoading ? "…" : formatCurrency(purchases.totalPaid)} />
                  <MetricRow index={3} label="Supplier Payable Total Amount" value={isLoading ? "…" : formatCurrency(purchases.totalPayable)} />
                </div>
              </SectionCard>
            </div>

            <section className="relative overflow-hidden rounded-[30px] border border-white/60 bg-gradient-to-br from-white/95 via-[#f5f6ff]/95 to-[#e9edff]/95 p-8 text-slate-900 shadow-[0_45px_95px_-55px_rgba(15,23,42,0.68)]">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(229,236,255,0.55),_transparent_75%)]" />
              <div className="relative flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Recent Sales</h2>
                  <p className="text-sm text-slate-600">
                    {isLoading ? "Preparing latest invoices…" : "Five most recent invoices"}
                  </p>
                </div>
              </div>
              <div className="relative mt-6 space-y-3 text-sm">
                {isLoading ? (
                  <p className="text-slate-600">Loading…</p>
                ) : recentSales.length === 0 ? (
                  <p className="text-slate-600">No sales recorded yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {recentSales.map((sale, index) => (
                      <li
                        key={sale.invoiceNo}
                        className={`group relative overflow-hidden rounded-2xl border border-[rgba(207,215,240,0.6)] bg-gradient-to-br ${recentSaleGradients[index % recentSaleGradients.length]} px-5 py-4 text-slate-800 shadow-[0_32px_70px_-50px_rgba(15,23,42,0.58)] transition hover:-translate-y-0.5 hover:shadow-[0_42px_95px_-55px_rgba(15,23,42,0.65)]`}
                      >
                        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.72),_transparent_74%)] opacity-90 transition group-hover:opacity-100" />
                        <div className="relative flex items-center justify-between text-[11px] uppercase tracking-[0.22em] text-slate-400">
                          <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-3 py-0.5 font-semibold text-slate-600 shadow-[0_4px_10px_-6px_rgba(15,23,42,0.6)]">
                            {sale.invoiceDate}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-3 py-0.5 font-semibold text-slate-600 shadow-[0_4px_10px_-6px_rgba(15,23,42,0.6)]">
                            {sale.invoiceNo}
                          </span>
                        </div>
                        <p className="relative mt-3 text-base font-semibold text-slate-900">{sale.customer}</p>
                        <div className="relative mt-3 flex items-center justify-between text-xs text-slate-600">
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100/70 px-3 py-1 font-semibold text-emerald-700 shadow-[0_4px_12px_-6px_rgba(16,185,129,0.45)]">
                            Total {formatCurrency(sale.totalAmount)}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-sky-100/70 px-3 py-1 font-semibold text-sky-700 shadow-[0_4px_12px_-6px_rgba(14,165,233,0.45)]">
                            Balance {formatCurrency(sale.tradeOffTotal)}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  </div>
  );
};

export default Dashboard;
