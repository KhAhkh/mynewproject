import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FiDownload, FiPrinter, FiRefreshCw } from "react-icons/fi";
import SectionCard from "../../components/SectionCard.jsx";
import SearchSelect from "../../components/SearchSelect.jsx";
import FormField from "../../components/FormField.jsx";
import { api } from "../../api/client.js";

const formatCurrency = (value) =>
  `Rs ${Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const formatUnits = (value) =>
  Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

const CompanyWiseStockCostPage = () => {
  const [companyQuery, setCompanyQuery] = useState("");
  const [selectedCompany, setSelectedCompany] = useState(null);
  const tableRef = useRef(null);

  const companyLookup = useQuery({
    queryKey: ["companies", { search: companyQuery }],
    queryFn: async () => {
      const response = await api.get("/companies", { params: { search: companyQuery } });
      return response.data;
    }
  });

  const stockQuery = useQuery({
    queryKey: ["company-wise-stock-cost", { companyCode: selectedCompany?.code }],
    queryFn: async () => {
      const params = {};
      if (selectedCompany?.code) params.companyCode = selectedCompany.code;
      const response = await api.get("/reports/stock/company-wise-cost", { params });
      return response.data;
    },
    staleTime: 30000
  });

  const companies = stockQuery.data?.companies ?? [];
  const grandTotal = stockQuery.data?.grandTotal ?? 0;
  const grandTotalUnits = stockQuery.data?.grandTotalUnits ?? 0;

  const companyResults = useMemo(() => {
    const data = companyLookup.data || [];
    return data.map((c) => ({
      code: c.code,
      label: `${c.code} - ${c.name}`
    }));
  }, [companyLookup.data]);

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    const printStyles = `
      <style>
        @page { size: A4 portrait; margin: 16mm 14mm 18mm 14mm; }
        body { font-family: Arial, sans-serif; color: #1e293b; margin: 0; padding: 18px; }
        .header { background: linear-gradient(135deg, #64748b 0%, #475569 100%); color: white; padding: 20px; text-align: center; margin-bottom: 20px; border-radius: 8px; }
        .header h1 { font-size: 24px; margin: 0; font-weight: 700; letter-spacing: 1px; }
        .company-section { margin-bottom: 30px; page-break-inside: avoid; }
        .company-header { background: linear-gradient(135deg, #64748b 0%, #475569 100%); color: white; padding: 12px 16px; font-size: 16px; font-weight: 600; border-radius: 6px; margin-bottom: 10px; }
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
        <h1>COMPANY WISE STOCK ON COST</h1>
      </div>
    `;

    const companySections = companies
      .map((company) => {
        const rows = company.items
          .map(
            (item) => `
          <tr>
            <td style="font-weight: 600;">${item.code || ""}</td>
            <td>${item.name || ""}</td>
            <td>${formatUnits(item.quantity)}</td>
            <td>${formatCurrency(item.costPrice)}</td>
            <td>${formatCurrency(item.totalValue)}</td>
          </tr>
        `
          )
          .join("");

        return `
        <div class="company-section">
          <div class="company-header">
            ${company.companyName || "All Companies"} - Total: ${formatCurrency(company.totalValue)}
          </div>
          <table>
            <thead>
              <tr>
                <th style="width: 12%;">CODE</th>
                <th style="width: 40%;">ITEM NAME</th>
                <th style="width: 15%;">QUANTITY</th>
                <th style="width: 18%;">COST PRICE</th>
                <th style="width: 15%;">TOTAL VALUE</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
              <tr class="subtotal">
                <td colspan="2">Subtotal</td>
                <td>${formatUnits(company.totalQuantity)}</td>
                <td></td>
                <td>${formatCurrency(company.totalValue)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      `;
      })
      .join("");

    const footerHTML = `
      <div class="footer">
        Grand Total: <span>${formatCurrency(grandTotal)}</span> (${formatUnits(grandTotalUnits)} units)
      </div>
    `;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Company Wise Stock On Cost</title>
          ${printStyles}
        </head>
        <body>
          ${printHeader}
          ${companySections}
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
    companies.forEach((company) => {
      rows.push([`${company.companyName || "All Companies"}`, "", "", "", ""]);
      rows.push(["Code", "Item Name", "Quantity", "Cost Price", "Total Value"]);
      company.items.forEach((item) => {
        rows.push([
          item.code || "",
          item.name || "",
          Number(item.quantity || 0).toFixed(2),
          Number(item.costPrice || 0).toFixed(2),
          Number(item.totalValue || 0).toFixed(2)
        ]);
      });
      rows.push(["", "Subtotal", Number(company.totalQuantity).toFixed(2), "", Number(company.totalValue).toFixed(2)]);
      rows.push(["", "", "", "", ""]);
    });
    rows.push(["", "", "", "Grand Total", Number(grandTotal).toFixed(2)]);

    const csvContent = rows.map((row) => row.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `company-wise-stock-cost-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  return (
    <SectionCard
      title="Company Wise Stock On Cost"
      description="View current inventory valued at purchase/cost rates by company."
    >
      <div className="space-y-6">
        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Filter by Company" description="Optional - leave empty for all companies">
            <SearchSelect
              placeholder="Search company..."
              value={selectedCompany}
              onSelect={(option) => setSelectedCompany(option)}
              onSearch={setCompanyQuery}
              results={companyResults}
              emptyMessage={companyQuery.trim() ? "No companies found." : "Type to search companies."}
            />
          </FormField>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {selectedCompany && (
            <button
              onClick={() => {
                setSelectedCompany(null);
                setCompanyQuery("");
              }}
              className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 border border-slate-300 rounded-lg hover:bg-slate-200 transition-colors"
            >
              Clear Filter
            </button>
          )}

          <button
            onClick={() => stockQuery.refetch()}
            disabled={stockQuery.isFetching}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <FiRefreshCw className={stockQuery.isFetching ? "animate-spin" : ""} />
            Refresh
          </button>

          <button
            onClick={handleExport}
            disabled={companies.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-300 rounded-lg hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <FiDownload />
            Export CSV
          </button>

          <button
            onClick={handlePrint}
            disabled={companies.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-50 border border-slate-300 rounded-lg hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <FiPrinter />
            Print
          </button>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-lg p-4 border border-slate-200">
            <p className="text-xs text-slate-700 uppercase font-medium">Total Companies</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{companies.length}</p>
          </div>
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
            <p className="text-xs text-blue-700 uppercase font-medium">Total Items</p>
            <p className="text-2xl font-bold text-blue-900 mt-1">
              {companies.reduce((sum, c) => sum + c.items.length, 0)}
            </p>
          </div>
          <div className="bg-gradient-to-br from-rose-50 to-rose-100 rounded-lg p-4 border border-rose-200">
            <p className="text-xs text-rose-700 uppercase font-medium">Grand Total Value</p>
            <p className="text-2xl font-bold text-rose-900 mt-1">{formatCurrency(grandTotal)}</p>
          </div>
        </div>

        {/* Loading State */}
        {stockQuery.isLoading && (
          <div className="text-center py-12 text-slate-500">Loading stock data...</div>
        )}

        {/* Error State */}
        {stockQuery.isError && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-rose-700">
            Failed to load stock data. Please try again.
          </div>
        )}

        {/* Company Sections */}
        {stockQuery.isSuccess && (
          <div className="space-y-6">
            {companies.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                No stock records found for the selected filters.
              </div>
            ) : (
              companies.map((company, idx) => (
                <div key={idx} className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                  <div className="bg-gradient-to-r from-slate-600 to-slate-700 text-white px-6 py-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold">
                        {company.companyName || "All Companies"}
                      </h3>
                      <span className="text-sm font-medium bg-white/20 px-3 py-1 rounded-full">
                        {company.items.length} Items
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
                            Item Name
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">
                            Quantity
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">
                            Cost Price
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">
                            Total Value
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {company.items.map((item, iIdx) => (
                          <tr key={iIdx} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-3 text-sm font-semibold text-slate-900">
                              {item.code || "—"}
                            </td>
                            <td className="px-6 py-3 text-sm text-slate-700">{item.name || "—"}</td>
                            <td className="px-6 py-3 text-sm font-medium text-right text-slate-900">
                              {formatUnits(item.quantity)}
                            </td>
                            <td className="px-6 py-3 text-sm font-medium text-right text-slate-900">
                              {formatCurrency(item.costPrice)}
                            </td>
                            <td className="px-6 py-3 text-sm font-semibold text-right text-blue-600">
                              {formatCurrency(item.totalValue)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-200 font-semibold border-t-2 border-slate-300">
                          <td colSpan="2" className="px-6 py-3 text-sm text-slate-800 uppercase">
                            Subtotal
                          </td>
                          <td className="px-6 py-3 text-sm text-right text-slate-900 font-bold">
                            {formatUnits(company.totalQuantity)}
                          </td>
                          <td></td>
                          <td className="px-6 py-3 text-sm text-right text-slate-900 font-bold">
                            {formatCurrency(company.totalValue)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              ))
            )}

            {/* Grand Total */}
            {companies.length > 0 && (
              <div className="rounded-xl border-2 border-slate-300 bg-slate-100 p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-lg font-semibold text-slate-800 uppercase">Grand Total</span>
                  <div className="text-right">
                    <p className="text-sm text-slate-600">
                      {formatUnits(grandTotalUnits)} units at cost price
                    </p>
                    <span className="text-2xl font-bold text-slate-900">{formatCurrency(grandTotal)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </SectionCard>
  );
};

export default CompanyWiseStockCostPage;
