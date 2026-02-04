import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  FiBarChart2,
  FiBriefcase,
  FiBox,
  FiChevronRight,
  FiClipboard,
  FiCheckSquare,
  FiCornerUpLeft,
  FiCornerUpRight,
  FiCreditCard,
  FiDatabase,
  FiDollarSign,
  FiFileText,
  FiEdit,
  FiHome,
  FiLayers,
  FiMapPin,
  FiSend,
  FiShoppingCart,
  FiShield,
  FiTag,
  FiTrendingUp,
  FiTruck,
  FiUser,
  FiUsers,
  FiX
} from "react-icons/fi";
import { useAuthStore } from "../store/auth";

const masterLinks = [
  {
    to: "/master/company",
    label: "Company Registration",
    icon: FiBriefcase,
    iconClass: "text-indigo-400",
    requiredPrivileges: ["master.manage"]
  },
  {
    to: "/master/item",
    label: "Item Registration",
    icon: FiTag,
    iconClass: "text-emerald-400",
    requiredPrivileges: ["master.manage"]
  },
  {
    to: "/master/rate-change",
    label: "Rate Change",
    icon: FiEdit,
    iconClass: "text-sky-400",
    requiredPrivileges: ["master.manage"]
  },
  {
    to: "/master/supplier",
    label: "Supplier Registration",
    icon: FiTruck,
    iconClass: "text-amber-400",
    requiredPrivileges: ["master.manage"]
  },
  {
    to: "/master/area",
    label: "Area Registration",
    icon: FiMapPin,
    iconClass: "text-cyan-400",
    requiredPrivileges: ["master.manage"]
  },
  {
    to: "/master/salesman",
    label: "Salesman Registration",
    icon: FiUsers,
    iconClass: "text-purple-400",
    requiredPrivileges: ["master.manage"]
  },
  {
    to: "/master/customer",
    label: "Customer Registration",
    icon: FiUser,
    iconClass: "text-blue-400",
    requiredPrivileges: ["master.manage"]
  },
  {
    to: "/master/expense",
    label: "Expense Definition",
    icon: FiCreditCard,
    iconClass: "text-rose-400",
    requiredPrivileges: ["master.manage"]
  },
  {
    to: "/master/bank",
    label: "Bank Registration",
    icon: FiDatabase,
    iconClass: "text-sky-400",
    requiredPrivileges: ["master.manage"]
  },
  {
    to: "/master/cancel-invoice",
    label: "Cancel Invoice",
    icon: FiX,
    iconClass: "text-rose-400",
    requiredPrivileges: ["master.manage"]
  }
];

const transactionLinks = [
  {
    to: "/transactions/purchase",
    label: "Purchase",
    icon: FiShoppingCart,
    iconClass: "text-lime-400",
    requiredPrivileges: ["transactions.process"]
  },
  {
    to: "/transactions/sales",
    label: "Sales",
    icon: FiTrendingUp,
    iconClass: "text-emerald-400",
    requiredPrivileges: ["transactions.process"]
  },
  {
    to: "/transactions/orders",
    label: "Orders",
    icon: FiFileText,
    iconClass: "text-sky-300",
    requiredPrivileges: ["transactions.process"]
  },
  {
    to: "/transactions/sale-return",
    label: "Sale Return",
    icon: FiCornerUpLeft,
    iconClass: "text-orange-400",
    requiredPrivileges: ["transactions.process"]
  },
  {
    to: "/transactions/purchase-return",
    label: "Purchase Return",
    icon: FiCornerUpRight,
    iconClass: "text-teal-400",
    requiredPrivileges: ["transactions.process"]
  },
  {
    to: "/transactions/expense-entry",
    label: "Expense Entry",
    icon: FiClipboard,
    iconClass: "text-fuchsia-400",
    requiredPrivileges: ["transactions.process"]
  },
  {
    to: "/transactions/customer-receipt",
    label: "Customer Receipt",
    icon: FiSend,
    iconClass: "text-cyan-400",
    requiredPrivileges: ["transactions.process"]
  },
  {
    to: "/transactions/supplier-payment",
    label: "Supplier Payment",
    icon: FiDollarSign,
    iconClass: "text-rose-300",
    requiredPrivileges: ["transactions.process"]
  },
  {
    to: "/transactions/opening-balance",
    label: "Opening Balance",
    icon: FiLayers,
    iconClass: "text-slate-400",
    requiredPrivileges: ["transactions.process"]
  },
  {
    to: "/transactions/salesman-receipt",
    label: "Salesman Receipt",
    icon: FiCreditCard,
    iconClass: "text-violet-400",
    requiredPrivileges: ["transactions.process"]
  },
  {
    to: "/transactions/bank",
    label: "Bank Transaction",
    icon: FiDollarSign,
    iconClass: "text-amber-300",
    requiredPrivileges: ["transactions.process"]
  },
  {
    to: "/transactions/damage",
    label: "Damage-IN/Out",
    icon: FiBox,
    iconClass: "text-rose-300",
    requiredPrivileges: ["transactions.process"]
  }
];

const editingLinks = [
  {
    to: "/editing/sales",
    label: "Edit Sales Invoice",
    icon: FiTrendingUp,
    iconClass: "text-emerald-400",
    requiredPrivileges: ["editing.modify"]
  },
  {
    to: "/editing/sales-return",
    label: "Edit Sales Return",
    icon: FiCornerUpLeft,
    iconClass: "text-orange-400",
    requiredPrivileges: ["editing.modify"]
  },
  {
    to: "/editing/purchase",
    label: "Edit Purchase Invoice",
    icon: FiShoppingCart,
    iconClass: "text-lime-400",
    requiredPrivileges: ["editing.modify"]
  },
  {
    to: "/editing/expense-entry",
    label: "Edit Expense Entry",
    icon: FiClipboard,
    iconClass: "text-fuchsia-400",
    requiredPrivileges: ["editing.modify"]
  },
  {
    to: "/editing/bank-transaction",
    label: "Edit Bank Transaction",
    icon: FiDollarSign,
    iconClass: "text-amber-300",
    requiredPrivileges: ["editing.modify"]
  },
  {
    to: "/editing/customer-receipt",
    label: "Edit Customer Receipt",
    icon: FiSend,
    iconClass: "text-cyan-400",
    requiredPrivileges: ["editing.modify"]
  },
  {
    to: "/editing/supplier-payment",
    label: "Edit Supplier Payment",
    icon: FiDollarSign,
    iconClass: "text-rose-300",
    requiredPrivileges: ["editing.modify"]
  },
  {
    to: "/editing/damage",
    label: "Edit Damage-IN/Out",
    icon: FiBox,
    iconClass: "text-rose-400",
    requiredPrivileges: ["editing.modify"]
  },
  {
    to: "/editing/master-records",
    label: "Master Records",
    icon: FiDatabase,
    iconClass: "text-sky-400",
    requiredPrivileges: ["editing.modify"]
  }
];

const reportLinks = [
  {
    to: "/reports/receivables",
    label: "Receivable Reports",
    icon: FiBarChart2,
    iconClass: "text-purple-400",
    requiredPrivileges: ["reports.view"]
  },
  {
    to: "/reports/bank-deposits",
    label: "Bank Statements",
    icon: FiDollarSign,
    iconClass: "text-emerald-400",
    requiredPrivileges: ["reports.view"]
  },
  {
    to: "/reports/damage",
    label: "Damage-IN/Out Report",
    icon: FiClipboard,
    iconClass: "text-rose-400",
    requiredPrivileges: ["reports.view"]
  },
  {
    to: "/reports/stock",
    label: "Stock Reports",
    icon: FiBox,
    iconClass: "text-indigo-400",
    requiredPrivileges: ["reports.view"]
  },
  {
    to: "/reports/profit",
    label: "Profit Reports",
    icon: FiTrendingUp,
    iconClass: "text-emerald-400",
    requiredPrivileges: ["reports.view"]
  },
  {
    to: "/reports/sales",
    label: "Sales Reports",
    icon: FiTrendingUp,
    iconClass: "text-amber-400",
    requiredPrivileges: ["reports.view"]
  },
  {
    to: "/reports/payment",
    label: "Payment Reports",
    icon: FiDollarSign,
    iconClass: "text-teal-300",
    requiredPrivileges: ["reports.view"]
  },
  {
    to: "/reports/payable",
    label: "Payable Reports",
    icon: FiBarChart2,
    iconClass: "text-cyan-300",
    requiredPrivileges: ["reports.view"]
  },
  {
    to: "/reports/purchase",
    label: "Purchase Reports",
    icon: FiShoppingCart,
    iconClass: "text-indigo-300",
    requiredPrivileges: ["reports.view"]
  }
];

const managementLinks = [
  {
    to: "/management/users",
    label: "User Management",
    icon: FiShield,
    iconClass: "text-amber-300",
    requiredPrivileges: ["users.manage"]
  },
  {
    to: "/management/salesmen",
    label: "Salesman Management",
    icon: FiUsers,
    iconClass: "text-purple-400",
    requiredPrivileges: ["users.manage"]
  },
  {
    to: "/management/salesman-approvals",
    label: "Salesman Approvals",
    icon: FiCheckSquare,
    iconClass: "text-emerald-400",
    requiredPrivileges: ["users.manage"]
  },
  {
    to: "/management/salesman-bonus",
    label: "Salesman Bonus",
    icon: FiCheckSquare,
    iconClass: "text-sky-400",
    requiredPrivileges: ["users.manage"]
  }
];

const Sidebar = () => {
  const location = useLocation();
  const privileges = useAuthStore((state) => state.user?.privileges ?? []);

  const canAccessLink = (link) => {
    const required = link.requiredPrivileges;
    if (!required || required.length === 0) return true;
    return required.some((privilege) => privileges.includes(privilege));
  };

  const filteredMasterLinks = masterLinks.filter(canAccessLink);
  const filteredTransactionLinks = transactionLinks.filter(canAccessLink);
  const filteredEditingLinks = editingLinks.filter(canAccessLink);
  const filteredReportLinks = reportLinks.filter(canAccessLink);
  const filteredManagementLinks = managementLinks.filter(canAccessLink);

  const isMasterRoute = masterLinks.some((link) => location.pathname.startsWith(link.to));
  const isTransactionRoute = location.pathname.startsWith("/transactions");
  const isEditingRoute = location.pathname.startsWith("/editing");
  const isReportRoute = location.pathname.startsWith("/reports");
  const isManagementRoute = managementLinks.some((link) => location.pathname.startsWith(link.to));

  const [masterOpen, setMasterOpen] = useState(isMasterRoute);
  const [transactionOpen, setTransactionOpen] = useState(isTransactionRoute);
  const [editingOpen, setEditingOpen] = useState(isEditingRoute);
  const [reportOpen, setReportOpen] = useState(isReportRoute);
  const [managementOpen, setManagementOpen] = useState(isManagementRoute);

  const masterButtonRef = useRef(null);
  const transactionButtonRef = useRef(null);
  const editingButtonRef = useRef(null);
  const reportButtonRef = useRef(null);
  const managementButtonRef = useRef(null);

  const masterMenuRef = useRef(null);
  const transactionMenuRef = useRef(null);
  const editingMenuRef = useRef(null);
  const reportMenuRef = useRef(null);
  const managementMenuRef = useRef(null);

  const [masterMenuBounds, setMasterMenuBounds] = useState(null);
  const [transactionMenuBounds, setTransactionMenuBounds] = useState(null);
  const [editingMenuBounds, setEditingMenuBounds] = useState(null);
  const [reportMenuBounds, setReportMenuBounds] = useState(null);
  const [managementMenuBounds, setManagementMenuBounds] = useState(null);

  const computeBounds = (buttonRef, menuRef) => {
    if (!buttonRef.current || !menuRef.current) return null;
    const buttonRect = buttonRef.current.getBoundingClientRect();
    const menuRect = menuRef.current.getBoundingClientRect();
    const windowHeight = window.innerHeight;
    const desiredTop = buttonRect.top;
    const maxTop = windowHeight - menuRect.height - 24;
    const clampedTop = Math.max(16, Math.min(desiredTop, maxTop));
    return {
      top: clampedTop,
      left: buttonRect.right + 12,
      transformOrigin: `${Math.min((buttonRect.top - clampedTop) / Math.max(menuRect.height, 1), 1) * 100}% 50%`
    };
  };

  useEffect(() => {
    if (filteredMasterLinks.length === 0) {
      setMasterOpen(false);
      return;
    }
    if (isMasterRoute) {
      setMasterOpen(true);
      setTransactionOpen(false);
      setEditingOpen(false);
      setReportOpen(false);
      setManagementOpen(false);
    }
  }, [isMasterRoute, filteredMasterLinks.length]);

  useEffect(() => {
    if (filteredTransactionLinks.length === 0) {
      setTransactionOpen(false);
      return;
    }
    if (isTransactionRoute) {
      setTransactionOpen(true);
      setMasterOpen(false);
      setEditingOpen(false);
      setReportOpen(false);
      setManagementOpen(false);
    }
  }, [isTransactionRoute, filteredTransactionLinks.length]);

  useEffect(() => {
    if (filteredEditingLinks.length === 0) {
      setEditingOpen(false);
      return;
    }
    if (isEditingRoute) {
      setEditingOpen(true);
      setMasterOpen(false);
      setTransactionOpen(false);
      setReportOpen(false);
      setManagementOpen(false);
    }
  }, [isEditingRoute, filteredEditingLinks.length]);

  useEffect(() => {
    if (filteredReportLinks.length === 0) {
      setReportOpen(false);
      return;
    }
    if (isReportRoute) {
      setReportOpen(true);
      setMasterOpen(false);
      setTransactionOpen(false);
      setEditingOpen(false);
      setManagementOpen(false);
    }
  }, [isReportRoute, filteredReportLinks.length]);

  useEffect(() => {
    if (filteredManagementLinks.length === 0) {
      setManagementOpen(false);
      return;
    }
    if (isManagementRoute) {
      setManagementOpen(true);
      setMasterOpen(false);
      setTransactionOpen(false);
      setEditingOpen(false);
      setReportOpen(false);
    }
  }, [isManagementRoute, filteredManagementLinks.length]);

  useLayoutEffect(() => {
    if (!masterOpen) return;
    const bounds = computeBounds(masterButtonRef, masterMenuRef);
    if (bounds) setMasterMenuBounds(bounds);
  }, [masterOpen]);

  useLayoutEffect(() => {
    if (!transactionOpen) return;
    const bounds = computeBounds(transactionButtonRef, transactionMenuRef);
    if (bounds) setTransactionMenuBounds(bounds);
  }, [transactionOpen]);

  useLayoutEffect(() => {
    if (!editingOpen) return;
    const bounds = computeBounds(editingButtonRef, editingMenuRef);
    if (bounds) setEditingMenuBounds(bounds);
  }, [editingOpen]);

  useLayoutEffect(() => {
    if (!reportOpen) return;
    const bounds = computeBounds(reportButtonRef, reportMenuRef);
    if (bounds) setReportMenuBounds(bounds);
  }, [reportOpen]);

  useLayoutEffect(() => {
    if (!managementOpen) return;
    const bounds = computeBounds(managementButtonRef, managementMenuRef);
    if (bounds) setManagementMenuBounds(bounds);
  }, [managementOpen]);

  useEffect(() => {
    if (!masterOpen) return;
    const handleReposition = () => {
      const bounds = computeBounds(masterButtonRef, masterMenuRef);
      if (bounds) setMasterMenuBounds(bounds);
    };
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [masterOpen]);

  useEffect(() => {
    if (!transactionOpen) return;
    const handleReposition = () => {
      const bounds = computeBounds(transactionButtonRef, transactionMenuRef);
      if (bounds) setTransactionMenuBounds(bounds);
    };
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [transactionOpen]);

  useEffect(() => {
    if (!editingOpen) return;
    const handleReposition = () => {
      const bounds = computeBounds(editingButtonRef, editingMenuRef);
      if (bounds) setEditingMenuBounds(bounds);
    };
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [editingOpen]);

  useEffect(() => {
    if (!reportOpen) return;
    const handleReposition = () => {
      const bounds = computeBounds(reportButtonRef, reportMenuRef);
      if (bounds) setReportMenuBounds(bounds);
    };
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [reportOpen]);

  useEffect(() => {
    if (!managementOpen) return;
    const handleReposition = () => {
      const bounds = computeBounds(managementButtonRef, managementMenuRef);
      if (bounds) setManagementMenuBounds(bounds);
    };
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [managementOpen]);

  return (
    <aside className="relative z-30 w-72 bg-gradient-to-b from-[#0f172a] via-[#101f36] to-[#182c53] text-slate-100 h-screen sticky top-0 shadow-xl print:hidden">
      <div className="px-6 py-6 border-b border-white/10">
        <div className="text-xl font-semibold tracking-wide text-white">DIGITAL ZONE NEXUS</div>
        <p className="mt-1 text-sm text-slate-300/80">Modern operations cockpit</p>
      </div>
      <div className="px-6 py-6 space-y-4">
        <NavLink
          to="/"
          className={({ isActive }) =>
            `flex items-center gap-3 px-4 py-2.5 text-sm rounded-lg transition ${
              isActive
                ? "bg-white/15 text-white shadow-[0_18px_35px_-28px_rgba(15,23,42,0.9)]"
                : "text-slate-200 hover:bg-white/10"
            }`
          }
        >
          <FiHome className="text-lg" />
          <span>Dashboard</span>
        </NavLink>

        {filteredMasterLinks.length > 0 ? (
          <div className="relative overflow-visible">
            <p className="mb-3 text-xs uppercase tracking-wider text-sky-200/80">Master Data</p>
            <button
              ref={masterButtonRef}
              type="button"
              onClick={() => {
                setMasterOpen((prev) => {
                  const next = !prev;
                  if (next) {
                    setTransactionOpen(false);
                    setEditingOpen(false);
                    setReportOpen(false);
                    setManagementOpen(false);
                  }
                  return next;
                });
              }}
              className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-sm rounded-lg bg-white/5 border border-white/10 text-slate-200 hover:bg-white/10 transition"
            >
              <span className="inline-flex items-center gap-3">
                <FiLayers className="text-lg" />
                Master Data Options
              </span>
              <FiChevronRight className={`transition-transform ${masterOpen ? "rotate-90" : ""}`} />
            </button>
            {masterOpen ? (
              <>
                <div className="fixed inset-0 z-[998]" onClick={() => setMasterOpen(false)} aria-hidden="true" />
                <div
                  ref={masterMenuRef}
                  className="fixed z-[999] pointer-events-auto origin-left animate-fade-in"
                  style={{
                    top: masterMenuBounds?.top ?? 0,
                    left: masterMenuBounds?.left ?? 0,
                    transformOrigin: masterMenuBounds?.transformOrigin || "left top"
                  }}
                >
                  <nav className="w-64 rounded-xl border border-white/10 bg-[#111c2f] p-3 shadow-[0_28px_45px_-35px_rgba(15,23,42,0.85)] divide-y divide-white/5">
                    {filteredMasterLinks.map((link) => {
                      const Icon = link.icon;
                      return (
                        <NavLink
                          key={link.to}
                          to={link.to}
                          className={({ isActive }) =>
                            `flex items-center gap-3 px-3 py-2 text-sm rounded-md transition ${
                              isActive ? "bg-white/15 text-white" : "text-slate-200 hover:bg-white/10"
                            }`
                          }
                          onClick={() => setMasterOpen(false)}
                        >
                          <Icon className={`text-lg ${link.iconClass}`} />
                          <span className="flex-1">{link.label}</span>
                        </NavLink>
                      );
                    })}
                  </nav>
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        {filteredTransactionLinks.length > 0 ? (
          <div className="relative overflow-visible">
            <p className="mb-3 text-xs uppercase tracking-wider text-sky-200/80">Transactions</p>
            <button
              ref={transactionButtonRef}
              type="button"
              onClick={() => {
                setTransactionOpen((prev) => {
                  const next = !prev;
                  if (next) {
                    setMasterOpen(false);
                    setEditingOpen(false);
                    setReportOpen(false);
                    setManagementOpen(false);
                  }
                  return next;
                });
              }}
              className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-sm rounded-lg bg-white/5 border border-white/10 text-slate-200 hover:bg-white/10 transition"
            >
              <span className="inline-flex items-center gap-3">
                <FiBarChart2 className="text-lg text-emerald-400" />
                Transaction Options
              </span>
              <FiChevronRight className={`transition-transform ${transactionOpen ? "rotate-90" : ""}`} />
            </button>
            {transactionOpen ? (
              <>
                <div className="fixed inset-0 z-[998]" onClick={() => setTransactionOpen(false)} aria-hidden="true" />
                <div
                  ref={transactionMenuRef}
                  className="fixed z-[999] pointer-events-auto origin-left animate-fade-in"
                  style={{
                    top: transactionMenuBounds?.top ?? 0,
                    left: transactionMenuBounds?.left ?? 0,
                    transformOrigin: transactionMenuBounds?.transformOrigin || "left top"
                  }}
                >
                  <nav className="w-64 rounded-xl border border-white/10 bg-[#111c2f] p-3 shadow-[0_28px_45px_-35px_rgba(15,23,42,0.85)] divide-y divide-white/5">
                    {filteredTransactionLinks.map((link) => {
                      const Icon = link.icon;
                      return (
                        <NavLink
                          key={link.to}
                          to={link.to}
                          className={({ isActive }) =>
                            `flex items-center gap-3 px-3 py-2 text-sm rounded-md transition ${
                              isActive ? "bg-white/15 text-white" : "text-slate-200 hover:bg-white/10"
                            }`
                          }
                          onClick={() => setTransactionOpen(false)}
                        >
                          <Icon className={`text-lg ${link.iconClass}`} />
                          <span className="flex-1">{link.label}</span>
                        </NavLink>
                      );
                    })}
                  </nav>
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        {filteredReportLinks.length > 0 ? (
          <div className="relative overflow-visible">
            <p className="mb-3 text-xs uppercase tracking-wider text-sky-200/80">Reports</p>
            <button
              ref={reportButtonRef}
              type="button"
              onClick={() => {
                setReportOpen((prev) => {
                  const next = !prev;
                  if (next) {
                    setMasterOpen(false);
                    setTransactionOpen(false);
                    setEditingOpen(false);
                    setManagementOpen(false);
                  }
                  return next;
                });
              }}
              className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-sm rounded-lg bg-white/5 border border-white/10 text-slate-200 hover:bg-white/10 transition"
            >
              <span className="inline-flex items-center gap-3">
                <FiBox className="text-lg text-emerald-400" />
                Report Options
              </span>
              <FiChevronRight className={`transition-transform ${reportOpen ? "rotate-90" : ""}`} />
            </button>
            {reportOpen ? (
              <>
                <div className="fixed inset-0 z-[998]" onClick={() => setReportOpen(false)} aria-hidden="true" />
                <div
                  ref={reportMenuRef}
                  className="fixed z-[999] pointer-events-auto origin-left animate-fade-in"
                  style={{
                    top: reportMenuBounds?.top ?? 0,
                    left: reportMenuBounds?.left ?? 0,
                    transformOrigin: reportMenuBounds?.transformOrigin || "left top"
                  }}
                >
                  <nav className="w-64 rounded-xl border border-white/10 bg-[#111c2f] p-3 shadow-[0_28px_45px_-35px_rgba(15,23,42,0.85)] divide-y divide-white/5">
                    {filteredReportLinks.map((link) => {
                      const Icon = link.icon;
                      return (
                        <NavLink
                          key={link.to}
                          to={link.to}
                          className={({ isActive }) =>
                            `flex items-center gap-3 px-3 py-2 text-sm rounded-md transition ${
                              isActive ? "bg-white/15 text-white" : "text-slate-200 hover:bg-white/10"
                            }`
                          }
                          onClick={() => setReportOpen(false)}
                        >
                          <Icon className={`text-lg ${link.iconClass}`} />
                          <span className="flex-1">{link.label}</span>
                        </NavLink>
                      );
                    })}
                  </nav>
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        {filteredEditingLinks.length > 0 ? (
          <div className="relative overflow-visible">
            <p className="mb-3 text-xs uppercase tracking-wider text-sky-200/80">Editing</p>
            <button
              ref={editingButtonRef}
              type="button"
              onClick={() => {
                setEditingOpen((prev) => {
                  const next = !prev;
                  if (next) {
                    setMasterOpen(false);
                    setTransactionOpen(false);
                    setReportOpen(false);
                    setManagementOpen(false);
                  }
                  return next;
                });
              }}
              className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-sm rounded-lg bg-white/5 border border-white/10 text-slate-200 hover:bg-white/10 transition"
            >
              <span className="inline-flex items-center gap-3">
                <FiEdit className="text-lg text-sky-400" />
                Editing Options
              </span>
              <FiChevronRight className={`transition-transform ${editingOpen ? "rotate-90" : ""}`} />
            </button>
            {editingOpen ? (
              <>
                <div className="fixed inset-0 z-[998]" onClick={() => setEditingOpen(false)} aria-hidden="true" />
                <div
                  ref={editingMenuRef}
                  className="fixed z-[999] pointer-events-auto origin-left animate-fade-in"
                  style={{
                    top: editingMenuBounds?.top ?? 0,
                    left: editingMenuBounds?.left ?? 0,
                    transformOrigin: editingMenuBounds?.transformOrigin || "left top"
                  }}
                >
                  <nav className="w-64 rounded-xl border border-white/10 bg-[#111c2f] p-3 shadow-[0_28px_45px_-35px_rgba(15,23,42,0.85)] divide-y divide-white/5">
                    {filteredEditingLinks.map((link) => {
                      const Icon = link.icon;
                      return (
                        <NavLink
                          key={link.to}
                          to={link.to}
                          className={({ isActive }) =>
                            `flex items-center gap-3 px-3 py-2 text-sm rounded-md transition ${
                              isActive ? "bg-white/15 text-white" : "text-slate-200 hover:bg-white/10"
                            }`
                          }
                          onClick={() => setEditingOpen(false)}
                        >
                          <Icon className={`text-lg ${link.iconClass}`} />
                          <span className="flex-1">{link.label}</span>
                        </NavLink>
                      );
                    })}
                  </nav>
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        {filteredManagementLinks.length > 0 ? (
          <div className="relative overflow-visible">
            <p className="mb-3 text-xs uppercase tracking-wider text-sky-200/80">Management</p>
            <button
              ref={managementButtonRef}
              type="button"
              onClick={() => {
                setManagementOpen((prev) => {
                  const next = !prev;
                  if (next) {
                    setMasterOpen(false);
                    setTransactionOpen(false);
                    setEditingOpen(false);
                    setReportOpen(false);
                  }
                  return next;
                });
              }}
              className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-sm rounded-lg bg-white/5 border border-white/10 text-slate-200 hover:bg-white/10 transition"
            >
              <span className="inline-flex items-center gap-3">
                <FiShield className="text-lg text-amber-300" />
                Management Options
              </span>
              <FiChevronRight className={`transition-transform ${managementOpen ? "rotate-90" : ""}`} />
            </button>
            {managementOpen ? (
              <>
                <div className="fixed inset-0 z-[998]" onClick={() => setManagementOpen(false)} aria-hidden="true" />
                <div
                  ref={managementMenuRef}
                  className="fixed z-[999] pointer-events-auto origin-left animate-fade-in"
                  style={{
                    top: managementMenuBounds?.top ?? 0,
                    left: managementMenuBounds?.left ?? 0,
                    transformOrigin: managementMenuBounds?.transformOrigin || "left top"
                  }}
                >
                  <nav className="w-64 rounded-xl border border-white/10 bg-[#111c2f] p-3 shadow-[0_28px_45px_-35px_rgba(15,23,42,0.85)] divide-y divide-white/5">
                    {filteredManagementLinks.map((link) => {
                      const Icon = link.icon;
                      return (
                        <NavLink
                          key={link.to}
                          to={link.to}
                          className={({ isActive }) =>
                            `flex items-center gap-3 px-3 py-2 text-sm rounded-md transition ${
                              isActive ? "bg-white/15 text-white" : "text-slate-200 hover:bg-white/10"
                            }`
                          }
                          onClick={() => setManagementOpen(false)}
                        >
                          <Icon className={`text-lg ${link.iconClass}`} />
                          <span className="flex-1">{link.label}</span>
                        </NavLink>
                      );
                    })}
                  </nav>
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </aside>
  );
};

export default Sidebar;
