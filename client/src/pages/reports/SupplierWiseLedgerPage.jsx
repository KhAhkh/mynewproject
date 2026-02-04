import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FiPrinter, FiDownload } from "react-icons/fi";
import SectionCard from "../../components/SectionCard.jsx";
import SearchSelect from "../../components/SearchSelect.jsx";
import FormField from "../../components/FormField.jsx";
import { api } from "../../api/client.js";

const formatCurrency = (value) =>
  `Rs ${Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const formatDate = (dateStr) => {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

const SupplierWiseLedgerPage = () => {
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Fetch all suppliers for dropdown
  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers-list"],
    queryFn: async () => {
      try {
        const response = await api.get("/suppliers");
        return response.data || [];
      } catch (error) {
        console.error("Error fetching suppliers:", error);
        return [];
      }
    }
  });

  const suppliersOptions = suppliers.map(s => ({
    value: s.id,
    label: `${s.code} - ${s.name}`
  }));

  const filteredSuppliers = suppliersOptions.filter(s =>
    s.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Fetch ledger for selected supplier
  const { data: ledgerData = null, isLoading } = useQuery({
    queryKey: ["supplier-ledger", selectedSupplier?.value, startDate, endDate],
    queryFn: async () => {
      if (!selectedSupplier?.value) return null;
      try {
        const params = new URLSearchParams();
        if (startDate) params.append("start_date", startDate);
        if (endDate) params.append("end_date", endDate);
        const response = await api.get(`/reports/supplier-ledger/${selectedSupplier.value}${params.toString() ? "?" + params.toString() : ""}`);
        return response.data;
      } catch (error) {
        console.error("Error fetching ledger:", error);
        return null;
      }
    },
    enabled: !!selectedSupplier?.value
  });

  const exportCsv = () => {
    if (!ledgerData || !ledgerData.transactions || ledgerData.transactions.length === 0) return;

    const rows = [
      ["Opening Balance", formatCurrency(ledgerData.opening_balance)],
      [""],
      ["S.#", "DATE", "DESCRIPTION", "INV/VO", "DEBIT", "CREDIT", "BALANCE"]
    ];

    ledgerData.transactions.forEach((tx, idx) => {
      rows.push([
        idx + 1,
        formatDate(tx.invoice_date),
        tx.description,
        tx.invoice_no || "",
        tx.debit || "",
        tx.credit || "",
        formatCurrency(tx.balance)
      ]);
    });

    rows.push(["", "", "", "", formatCurrency(ledgerData.total_debit), formatCurrency(ledgerData.total_credit), formatCurrency(ledgerData.closing_balance)]);

    const csv = rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `supplier-ledger-${selectedSupplier.label}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    if (!ledgerData) return;

    const html = `<!doctype html>
      <html>
      <head>
        <title>Supplier Wise Ledger</title>
        <style>
          @page { size: A4 landscape; margin: 16mm; }
          body { font-family: Arial, sans-serif; padding: 20px; color: #0f172a; }
          h1 { text-align: center; font-size: 24px; margin-bottom: 10px; text-transform: uppercase; }
          .supplier-name { text-align: center; font-size: 16px; margin-bottom: 20px; font-weight: bold; }
          .opening-balance { font-size: 14px; font-weight: bold; margin-bottom: 15px; background: #fffacd; padding: 8px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1px solid #333; padding: 10px; text-align: left; font-size: 12px; }
          th { background: #8B4513; color: white; font-weight: bold; text-transform: uppercase; }
          tr:nth-child(odd) { background: #f9f5ed; }
          tr:nth-child(even) { background: #d4a574; }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          .total-row { background: #8B4513; color: white; font-weight: bold; }
          .supplier-detail { margin-top: 20px; font-size: 12px; font-weight: bold; }
          .detail-row { display: flex; gap: 30px; }
          .detail-item { flex: 1; }
        </style>
      </head>
      <body>
        <h1>Supplier Wise Ledger</h1>
        <div class="supplier-name">Supplier: ${ledgerData.supplier_name}</div>
        <div class="opening-balance">OPENING BALANCE: ${formatCurrency(ledgerData.opening_balance)}</div>
        
        <table>
          <thead>
            <tr>
              <th class="text-center" style="width: 5%;">S.#</th>
              <th style="width: 12%;">DATE</th>
              <th style="width: 25%;">DESCRIPTION</th>
              <th style="width: 10%;">INV/VO</th>
              <th class="text-right" style="width: 12%;">DEBIT</th>
              <th class="text-right" style="width: 12%;">CREDIT</th>
              <th class="text-right" style="width: 12%;">BALANCE</th>
            </tr>
          </thead>
          <tbody>
            ${ledgerData.transactions.map((tx, idx) => `
              <tr>
                <td class="text-center">${idx + 1}</td>
                <td>${formatDate(tx.invoice_date)}</td>
                <td>${tx.description}</td>
                <td>${tx.invoice_no || ""}</td>
                <td class="text-right">${tx.debit ? formatCurrency(tx.debit) : ""}</td>
                <td class="text-right">${tx.credit ? formatCurrency(tx.credit) : ""}</td>
                <td class="text-right">${formatCurrency(tx.balance)}</td>
              </tr>
            `).join("")}
            <tr class="total-row">
              <td colspan="4" class="text-right">TOTAL</td>
              <td class="text-right">${formatCurrency(ledgerData.total_debit)}</td>
              <td class="text-right">${formatCurrency(ledgerData.total_credit)}</td>
              <td class="text-right">${formatCurrency(ledgerData.closing_balance)}</td>
            </tr>
          </tbody>
        </table>

        <div class="supplier-detail">
          <div>SUPPLIER DETAIL :</div>
          <div class="detail-row" style="margin-top: 10px;">
            <div class="detail-item">TOTAL DEBIT: ${formatCurrency(ledgerData.total_debit)}</div>
            <div class="detail-item">TOTAL CREDIT: ${formatCurrency(ledgerData.total_credit)}</div>
            <div class="detail-item">BALANCE: ${formatCurrency(ledgerData.closing_balance)}</div>
          </div>
        </div>

        <p style="text-align: center; color: #64748b; font-size: 11px; margin-top: 20px;">
          Generated on ${new Date().toLocaleString()}
        </p>
      </body>
      </html>`;

    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    setTimeout(() => {
      w.print();
    }, 250);
  };

  return (
    <SectionCard
      title="Supplier Wise Ledger"
      description="View detailed transaction history for a selected supplier"
    >
      <div className="space-y-6">
        <FormField
          label="Select Supplier"
          description="Choose a supplier to view their ledger"
          required
        >
          <SearchSelect
            placeholder="Search supplier by code or name"
            value={selectedSupplier}
            onSelect={(option) => setSelectedSupplier(option)}
            onSearch={setSearchTerm}
            results={filteredSuppliers}
            emptyMessage={searchTerm.trim() ? "No suppliers found." : "Start typing a supplier code or name."}
          />
        </FormField>

        {selectedSupplier && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                label="Start Date"
                description="Filter from this date"
              >
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </FormField>
              <FormField
                label="End Date"
                description="Filter until this date"
              >
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </FormField>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handlePrint}
                disabled={isLoading || !ledgerData}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-lg font-medium transition-colors"
              >
                <FiPrinter className="text-lg" />
                Print
              </button>
              <button
                type="button"
                onClick={exportCsv}
                disabled={isLoading || !ledgerData}
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-lg font-medium transition-colors"
              >
                <FiDownload className="text-lg" />
                Export CSV
              </button>
            </div>

            {isLoading ? (
              <div className="text-center py-12 text-slate-600">Loading supplier ledger...</div>
            ) : ledgerData ? (
              <div className="space-y-4">
                <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-4">
                  <p className="text-sm font-bold text-slate-800">
                    OPENING BALANCE: <span className="text-lg text-yellow-700">{formatCurrency(ledgerData.opening_balance)}</span>
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-amber-700 text-white">
                        <th className="border border-slate-400 px-4 py-3 text-center font-semibold text-xs" style={{width: "5%"}}>
                          S.#
                        </th>
                        <th className="border border-slate-400 px-4 py-3 text-left font-semibold text-xs" style={{width: "12%"}}>
                          DATE
                        </th>
                        <th className="border border-slate-400 px-4 py-3 text-left font-semibold text-xs" style={{width: "25%"}}>
                          DESCRIPTION
                        </th>
                        <th className="border border-slate-400 px-4 py-3 text-left font-semibold text-xs" style={{width: "10%"}}>
                          INV/VO
                        </th>
                        <th className="border border-slate-400 px-4 py-3 text-right font-semibold text-xs" style={{width: "12%"}}>
                          DEBIT
                        </th>
                        <th className="border border-slate-400 px-4 py-3 text-right font-semibold text-xs" style={{width: "12%"}}>
                          CREDIT
                        </th>
                        <th className="border border-slate-400 px-4 py-3 text-right font-semibold text-xs" style={{width: "12%"}}>
                          BALANCE
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledgerData.transactions.map((transaction, idx) => (
                        <tr key={idx} className={idx % 2 === 0 ? "bg-amber-50" : "bg-amber-100"}>
                          <td className="border border-slate-300 px-4 py-2 text-center text-sm">{idx + 1}</td>
                          <td className="border border-slate-300 px-4 py-2 text-sm">{formatDate(transaction.invoice_date)}</td>
                          <td className="border border-slate-300 px-4 py-2 text-sm">{transaction.description}</td>
                          <td className="border border-slate-300 px-4 py-2 text-sm">{transaction.invoice_no || ""}</td>
                          <td className="border border-slate-300 px-4 py-2 text-right text-sm font-medium">
                            {transaction.debit ? formatCurrency(transaction.debit) : ""}
                          </td>
                          <td className="border border-slate-300 px-4 py-2 text-right text-sm font-medium">
                            {transaction.credit ? formatCurrency(transaction.credit) : ""}
                          </td>
                          <td className="border border-slate-300 px-4 py-2 text-right text-sm font-bold">
                            {formatCurrency(transaction.balance)}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-amber-700 text-white font-bold">
                        <td colSpan="4" className="border border-slate-400 px-4 py-3 text-right">TOTAL</td>
                        <td className="border border-slate-400 px-4 py-3 text-right">{formatCurrency(ledgerData.total_debit)}</td>
                        <td className="border border-slate-400 px-4 py-3 text-right">{formatCurrency(ledgerData.total_credit)}</td>
                        <td className="border border-slate-400 px-4 py-3 text-right">{formatCurrency(ledgerData.closing_balance)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="rounded-lg bg-slate-100 border border-slate-300 p-4">
                  <p className="text-sm font-bold text-slate-800 mb-3">SUPPLIER DETAIL:</p>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs text-slate-600">TOTAL DEBIT</p>
                      <p className="text-lg font-bold text-slate-900">{formatCurrency(ledgerData.total_debit)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-600">TOTAL CREDIT</p>
                      <p className="text-lg font-bold text-slate-900">{formatCurrency(ledgerData.total_credit)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-600">BALANCE</p>
                      <p className={`text-lg font-bold ${ledgerData.closing_balance > 0 ? "text-red-600" : "text-green-600"}`}>
                        {formatCurrency(ledgerData.closing_balance)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-slate-600">No ledger data available</div>
            )}
          </>
        )}
      </div>
    </SectionCard>
  );
};

export default SupplierWiseLedgerPage;
