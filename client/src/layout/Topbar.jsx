import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/auth";
import BackupControl from "../modules/general/BackupControl";

const PAGE_THEME_MAP = {
  "/": {
    title: "Operations Dashboard",
    label: "Loaded Page",
    gradient: "from-[#d7dbe3] via-[#b4bbc8] to-[#949cb0]",
    tone: "light"
  },
  "/master/company": {
    title: "Company Operations",
    label: "Master Data",
    gradient: "from-emerald-500 via-teal-500 to-sky-600",
    buttonClass:
      "inline-flex items-center rounded-xl border border-teal-400 bg-teal-500 px-4 py-2 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(55,65,81,0.45)] transition hover:bg-teal-600"
  },
  "/master/item": {
    title: "Inventory Operations",
    label: "Master Data",
    gradient: "from-amber-500 via-orange-500 to-rose-500"
  },
  "/master/supplier": {
    title: "Supplier Operations",
    label: "Master Data",
    gradient: "from-lime-500 via-green-500 to-emerald-400"
  },
  "/master/area": {
    title: "Area Operations",
    label: "Master Data",
    gradient: "from-teal-500 via-cyan-500 to-blue-400"
  },
  "/master/salesman": {
    title: "Salesforce Operations",
    label: "Master Data",
    gradient: "from-fuchsia-500 via-purple-500 to-indigo-500"
  },
  "/master/customer": {
    title: "Customer Operations",
    label: "Master Data",
    gradient: "from-blue-600 via-indigo-500 to-sky-500"
  },
  "/master/expense": {
    title: "Expense Operations",
    label: "Master Data",
    gradient: "from-rose-500 via-red-500 to-orange-400"
  },
  "/master/rate-change": {
    title: "Rate Change Operations",
    label: "Master Data",
    gradient: "from-sky-600 via-indigo-500 to-purple-500"
  },
  "/master/bank": {
    title: "Banking Operations",
    label: "Master Data",
    gradient: "from-emerald-700 via-green-600 to-lime-500"
  },
  "/transactions/purchase": {
    title: "Supplier Operation",
    label: "Loaded Page",
    gradient: "from-purple-700 via-indigo-600 to-sky-500"
  },
  "/transactions/sales": {
    title: "Sales Operation",
    label: "Transactions",
    gradient: "from-emerald-500 via-teal-500 to-sky-500"
  },
  "/transactions/sale-return": {
    title: "Sales Return Operation",
    label: "Transactions",
    gradient: "from-rose-600 via-pink-500 to-amber-400"
  },
  "/transactions/purchase-return": {
    title: "Purchase Return Operation",
    label: "Transactions",
    gradient: "from-emerald-500 via-teal-500 to-lime-400"
  },
  "/transactions/expense-entry": {
    title: "Expense Entry Operation",
    label: "Transactions",
    gradient: "from-pink-500 via-fuchsia-500 to-purple-500"
  },
  "/transactions/customer-receipt": {
    title: "Customer Receipt Operation",
    label: "Transactions",
    gradient: "from-sky-500 via-cyan-500 to-teal-400"
  },
  "/transactions/opening-balance": {
    title: "Opening Balance Operation",
    label: "Transactions",
    gradient: "from-slate-700 via-slate-600 to-slate-500"
  },
  "/transactions/salesman-receipt": {
    title: "Salesman Receipt Operation",
    label: "Transactions",
    gradient: "from-violet-500 via-purple-500 to-blue-500"
  },
  "/management/salesman-bonus": {
    title: "Salesman Bonus",
    label: "Management",
    gradient: "from-emerald-500 via-teal-500 to-sky-500"
  },
  "/transactions/bank": {
    title: "Bank Transaction Operation",
    label: "Transactions",
    gradient: "from-cyan-600 via-blue-600 to-indigo-600"
  },
  "/history/transactions": {
    title: "Transaction History",
    label: "History",
    gradient: "from-neutral-700 via-slate-700 to-indigo-700"
  },
  "/reports/receivables/summary": {
    title: "Customer Receivable Summary",
    label: "Reports",
    gradient: "from-indigo-500 via-blue-500 to-sky-500"
  },
  "/reports/receivables/salesman-wise-balance": {
    title: "Salesman Wise Balance",
    label: "Reports",
    gradient: "from-indigo-500 via-blue-500 to-sky-500"
  },
  "/reports/receivables/area-wise-balance": {
    title: "Area Wise Balance",
    label: "Reports",
    gradient: "from-indigo-500 via-blue-500 to-sky-500"
  },
  "/reports/receivables/salesman-area-wise-balance": {
    title: "Salesman + Area Wise Balance",
    label: "Reports",
    gradient: "from-indigo-500 via-blue-500 to-sky-500"
  },
  "/reports/receivables/customer-ledger": {
    title: "Receivable Report",
    label: "Reports",
    gradient: "from-indigo-500 via-blue-500 to-sky-500"
  },
  "/reports/receivables/salesman-customer-ledger": {
    title: "Receivable Report",
    label: "Reports",
    gradient: "from-indigo-500 via-blue-500 to-sky-500"
  },
  "/reports/receivables": {
    title: "Receivable Reports",
    label: "Reports",
    gradient: "from-indigo-500 via-blue-500 to-sky-500"
  },
  "/reports/bank-deposits": {
    title: "Bank Statements",
    label: "Reports",
    gradient: "from-amber-600 via-yellow-500 to-lime-400"
  },
    "/reports/stock": {
      title: "Stock Reports",
      label: "Reports",
      gradient: "from-emerald-500 via-teal-500 to-lime-400"
    },
    "/reports/stock/company-wise-cost": {
      title: "Company Wise Stock On Cost",
      label: "Reports",
      gradient: "from-emerald-500 via-teal-500 to-lime-400"
    },
    "/reports/profit": {
      title: "Profit Reports",
      label: "Reports",
      gradient: "from-amber-500 via-orange-500 to-rose-500"
    },
    "/reports/payment": {
      title: "Payment Reports",
      label: "Reports",
      gradient: "from-teal-500 via-cyan-500 to-blue-500"
    },
    "/reports/payable": {
    title: "Payable Reports",
    label: "Reports",
    gradient: "from-sky-500 via-blue-500 to-indigo-500"
  },
  "/reports/salesman/items-summary": {
    title: "Salesman Wise Items Summary",
    label: "Reports",
    gradient: "from-indigo-500 via-purple-500 to-pink-500"
  },
  "/editing/sales": {
    title: "Edit Sales Invoice",
    label: "Editing",
    gradient: "from-purple-500 via-violet-500 to-fuchsia-500"
  },
  "/editing/purchase": {
    title: "Edit Purchase Invoice",
    label: "Editing",
    gradient: "from-rose-500 via-pink-500 to-purple-500"
  },
  "/editing/expense-entry": {
    title: "Edit Expense Entry",
    label: "Editing",
    gradient: "from-orange-500 via-amber-500 to-rose-400"
  },
  "/editing/bank-transaction": {
    title: "Edit Bank Transaction",
    label: "Editing",
    gradient: "from-amber-500 via-yellow-500 to-emerald-400"
  },
  "/editing/customer-receipt": {
    title: "Edit Customer Receipt",
    label: "Editing",
    gradient: "from-cyan-500 via-sky-500 to-blue-400"
  },
  "/editing/supplier-payment": {
    title: "Edit Supplier Payment",
    label: "Editing",
    gradient: "from-rose-500 via-pink-500 to-orange-400"
  },
  "/editing/master-records": {
    title: "Master Records Editor",
    label: "Editing",
    gradient: "from-emerald-500 via-teal-500 to-cyan-400"
  },
  "/management/users": {
    title: "User Administration",
    label: "Management",
    gradient: "from-amber-500 via-orange-500 to-rose-500"
  }
};

const DEFAULT_THEME = {
  title: "Operations Console",
  label: "Loaded Page",
  gradient: "from-slate-900 via-slate-800 to-slate-900"
};

const Topbar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [showBackup, setShowBackup] = useState(false);
  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);
  const today = dayjs().format("DD-MM-YYYY");
  const theme = useMemo(() => PAGE_THEME_MAP[location.pathname] ?? DEFAULT_THEME, [location.pathname]);
  const tone = theme.tone ?? "dark";
  const baseTextClass = tone === "light" ? "text-slate-800" : "text-white";
  const labelTextClass = tone === "light" ? "text-slate-500" : "text-white/70";
  const metaTextClass = tone === "light" ? "text-slate-500" : "text-white/75";
  const borderClass = tone === "light" ? "border-slate-200/70" : "border-white/15";
  const buttonClass =
    theme.buttonClass ??
    (tone === "light"
      ? "inline-flex items-center rounded-xl border border-slate-900/80 bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-black"
      : "inline-flex items-center rounded-xl border border-black/60 bg-black/80 px-4 py-2 text-sm font-semibold text-white shadow-xl transition hover:bg-black");

  useEffect(() => {
    setShowBackup(false);
  }, [location.pathname]);

  const handleLogout = () => {
    clearSession();
    navigate("/login", { replace: true });
  };

  return (
    <header className="sticky top-0 z-10 shadow-xl print:hidden">
      <div className={`bg-gradient-to-r ${theme.gradient} border-b ${borderClass}`}>
        <div className={`max-w-6xl mx-auto px-8 py-5 flex items-center justify-between ${baseTextClass}`}>
          <div>
            <p className={`text-xs font-semibold uppercase tracking-[0.35em] ${labelTextClass}`}>{theme.label}</p>
            <h1 className={`mt-1 text-lg font-semibold leading-tight ${baseTextClass}`}>{theme.title}</h1>
            <p className={`text-sm ${metaTextClass}`}>{today}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right leading-tight">
              <p className={`text-xs font-semibold uppercase tracking-wide ${labelTextClass}`}>Signed in as</p>
              <p className={`text-sm font-semibold ${baseTextClass}`}>{user?.username ?? "Unknown user"}</p>
            </div>
            <button className={buttonClass} onClick={handleLogout}>
              Log Out
            </button>
            <button className={buttonClass} onClick={() => setShowBackup((prev) => !prev)}>
              {showBackup ? "Close Utilities" : "Backup & Restore"}
            </button>
          </div>
        </div>
      </div>
      {showBackup ? <BackupControl /> : null}
    </header>
  );
};

export default Topbar;
