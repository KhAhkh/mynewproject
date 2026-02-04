import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FiDownload, FiPrinter, FiRefreshCw } from "react-icons/fi";
import SectionCard from "../../components/SectionCard.jsx";
import SearchSelect from "../../components/SearchSelect.jsx";
import { api } from "../../api/client.js";

const formatCurrency = (value) =>
  `Rs ${Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const AreaWiseBalancePage = () => {
  const [areaQuery, setAreaQuery] = useState("");
  const [selectedArea, setSelectedArea] = useState(null);
  const tableRef = useRef(null);

  const areaLookup = useQuery({
    queryKey: ["areas", { search: areaQuery }],
    queryFn: async () => {
      const response = await api.get("/areas", { params: { search: areaQuery } });
      return response.data;
    }
  });

  const balanceQuery = useQuery({
    queryKey: ["area-wise-balance", { areaCode: selectedArea?.code }],
    queryFn: async () => {
      const params = selectedArea?.code ? { areaCode: selectedArea.code } : {};
      const response = await api.get("/reports/receivables/area-wise-balance", { params });
      return response.data;
    },
    staleTime: 30000
  });

  const areas = balanceQuery.data?.areas ?? [];
  const grandTotal = balanceQuery.data?.grandTotal ?? 0;

  const areaResults = useMemo(() => {
    const data = areaLookup.data || [];
    return data.map((a) => ({
      code: a.code,
      label: `${a.code} - ${a.name}`
    }));
  }, [areaLookup.data]);

  const filteredAreas = useMemo(() => {
    return areas;
  }, [areas]);

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    const printStyles = `
      <style>
        @page { size: A4 portrait; margin: 16mm 14mm 18mm 14mm; }
        body { font-family: Arial, sans-serif; color: #1e293b; margin: 0; padding: 18px; }
        .header { background: linear-gradient(135deg, #64748b 0%, #475569 100%); color: white; padding: 20px; text-align: center; margin-bottom: 20px; border-radius: 8px; }
        .header h1 { font-size: 24px; margin: 0; font-weight: 700; letter-spacing: 1px; }
        .area-section { margin-bottom: 30px; page-break-inside: avoid; }
        .area-header { background: linear-gradient(135deg, #64748b 0%, #475569 100%); color: white; padding: 12px 16px; font-size: 16px; font-weight: 600; border-radius: 6px; margin-bottom: 10px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
        th { background: #94a3b8; color: white; padding: 12px 16px; text-align: left; font-size: 13px; font-weight: 600; text-transform: uppercase; }
        th:last-child { text-align: right; }
        td { padding: 10px 16px; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
        td:last-child { text-align: right; font-weight: 600; }
        tr:nth-child(even) { background: #f8fafc; }
        .subtotal { background: #e2e8f0; font-weight: 700; }
        .footer { margin-top: 20px; padding: 14px; background: #f1f5f9; border-radius: 6px; text-align: right; font-weight: 700; font-size: 15px; }
        .footer span { color: #64748b; font-size: 18px; }
      </style>
    `;

    const printHeader = `
      <div class="header">
        <h1>AREA WISE CUSTOMER BALANCE DISPLAY CARD</h1>
      </div>
    `;

    const areaSections = filteredAreas
      .map((area) => {
        const rows = area.customers
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

        return `
        <div class="area-section">
          <div class="area-header">
            ${area.areaName || "Unassigned"} - Total: ${formatCurrency(area.totalBalance)}
          </div>
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
              <tr class="subtotal">
                <td colspan="2">Subtotal</td>
                <td>${formatCurrency(area.totalBalance)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      `;
      })
      .join("");

    const footerHTML = `
      <div class="footer">
        Grand Total: <span>${formatCurrency(grandTotal)}</span>
      </div>
    `;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Area Wise Balance</title>
          ${printStyles}
        </head>
        <body>
          ${printHeader}
          ${areaSections}
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
    const rows = [];
    filteredAreas.forEach((area) => {
      rows.push([`AREA: ${area.areaName || "Unassigned"}`, "", ""]);
      rows.push(["Code", "Customer Name", "Balance"]);
      area.customers.forEach((customer) => {
        rows.push([
          customer.code || "",
          customer.name || "",
          Number(customer.balance || 0).toFixed(2)
        ]);
      });
      rows.push(["", "Subtotal", Number(area.totalBalance).toFixed(2)]);
      rows.push(["", "", ""]);
    });
    rows.push(["", "Grand Total", Number(grandTotal).toFixed(2)]);

    const csvContent = rows.map((row) => row.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `area-wise-balance-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  return (
    <SectionCard
      title="Area Wise Customer Balance"
      description="View customer balances grouped by area."
    >
      <div className="space-y-6">
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[240px]">
            <SearchSelect
              placeholder="Search area..."
              value={selectedArea}
              onSelect={(option) => setSelectedArea(option)}
              onSearch={setAreaQuery}
              results={areaResults}
              emptyMessage={areaQuery.trim() ? "No areas found." : "Type to search areas."}
            />
          </div>

          {selectedArea && (
            <button
              onClick={() => {
                setSelectedArea(null);
                setAreaQuery("");
              }}
              className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 border border-slate-300 rounded-lg hover:bg-slate-200 transition-colors"
            >
              Clear Filter
            </button>
          )}

          <button
            onClick={() => balanceQuery.refetch()}
            disabled={balanceQuery.isFetching}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <FiRefreshCw className={balanceQuery.isFetching ? "animate-spin" : ""} />
            Refresh
          </button>

          <button
            onClick={handleExport}
            disabled={filteredAreas.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-300 rounded-lg hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <FiDownload />
            Export CSV
          </button>

          <button
            onClick={handlePrint}
            disabled={filteredAreas.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-50 border border-slate-300 rounded-lg hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <FiPrinter />
            Print
          </button>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-lg p-4 border border-slate-200">
            <p className="text-xs text-slate-700 uppercase font-medium">Total Areas</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{areas.length}</p>
          </div>
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
            <p className="text-xs text-blue-700 uppercase font-medium">Total Customers</p>
            <p className="text-2xl font-bold text-blue-900 mt-1">
              {areas.reduce((sum, a) => sum + a.customers.length, 0)}
            </p>
          </div>
          <div className="bg-gradient-to-br from-rose-50 to-rose-100 rounded-lg p-4 border border-rose-200">
            <p className="text-xs text-rose-700 uppercase font-medium">Grand Total</p>
            <p className="text-2xl font-bold text-rose-900 mt-1">{formatCurrency(grandTotal)}</p>
          </div>
        </div>

        {/* Loading State */}
        {balanceQuery.isLoading && (
          <div className="text-center py-12 text-slate-500">Loading area balances...</div>
        )}

        {/* Error State */}
        {balanceQuery.isError && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-rose-700">
            Failed to load area balances. Please try again.
          </div>
        )}

        {/* Area Sections */}
        {balanceQuery.isSuccess && (
          <div className="space-y-6">
            {filteredAreas.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                {areaQuery.trim() ? "No records match your search." : "No area data available."}
              </div>
            ) : (
              filteredAreas.map((area, idx) => (
                <div key={idx} className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                  <div className="bg-gradient-to-r from-slate-600 to-slate-700 text-white px-6 py-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold">{area.areaName || "Unassigned"}</h3>
                      <span className="text-sm font-medium bg-white/20 px-3 py-1 rounded-full">
                        {area.customers.length} Customers
                      </span>
                    </div>
                  </div>

                  <div className="overflow-x-auto" ref={tableRef}>
                    <table className="w-full">
                      <thead>
                        <tr className="bg-slate-100 border-b border-slate-200">
                          <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                            Code
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                            Customer Name
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">
                            Balance
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {area.customers.map((customer, cIdx) => {
                          const balance = Number(customer.balance || 0);
                          return (
                            <tr key={cIdx} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-6 py-3 text-sm font-semibold text-slate-900">
                                {customer.code || "—"}
                              </td>
                              <td className="px-6 py-3 text-sm text-slate-700">{customer.name || "—"}</td>
                              <td
                                className={`px-6 py-3 text-sm font-semibold text-right ${
                                  balance > 0 ? "text-rose-600" : balance < 0 ? "text-emerald-600" : "text-slate-500"
                                }`}
                              >
                                {formatCurrency(balance)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-200 font-semibold border-t-2 border-slate-300">
                          <td colSpan="2" className="px-6 py-3 text-sm text-slate-800 uppercase">
                            Subtotal
                          </td>
                          <td className="px-6 py-3 text-sm text-right text-slate-900 font-bold">
                            {formatCurrency(area.totalBalance)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              ))
            )}

            {/* Grand Total */}
            {filteredAreas.length > 0 && (
              <div className="rounded-xl border-2 border-slate-300 bg-slate-100 p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-lg font-semibold text-slate-800 uppercase">Grand Total</span>
                  <span className="text-2xl font-bold text-slate-900">{formatCurrency(grandTotal)}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </SectionCard>
  );
};

export default AreaWiseBalancePage;
