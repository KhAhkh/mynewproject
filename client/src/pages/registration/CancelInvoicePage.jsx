import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FiAlertTriangle, FiCheckCircle, FiSearch, FiX } from "react-icons/fi";
import SectionCard from "../../components/SectionCard.jsx";
import FormField from "../../components/FormField.jsx";
import { api } from "../../api/client.js";

const formatCurrency = (value) =>
  `Rs ${Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const formatDate = (dateStr) => {
  if (!dateStr) return "—";
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-PK", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
};

const CancelInvoicePage = () => {
  const [invoiceType, setInvoiceType] = useState("purchase");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const queryClient = useQueryClient();

  const searchQuery = useQuery({
    queryKey: ["invoice-search", invoiceType, invoiceNumber],
    queryFn: async () => {
      if (!invoiceNumber.trim()) return null;
      const endpoint = invoiceType === "purchase" 
        ? `/purchases/${encodeURIComponent(invoiceNumber.trim())}`
        : `/sales/${encodeURIComponent(invoiceNumber.trim())}`;
      const response = await api.get(endpoint);
      return response.data;
    },
    enabled: false,
    retry: false
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const endpoint = invoiceType === "purchase"
        ? `/purchases/${encodeURIComponent(invoiceNumber.trim())}/cancel`
        : `/sales/${encodeURIComponent(invoiceNumber.trim())}/cancel`;
      const response = await api.post(endpoint);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-wise-stock-cost"] });
      queryClient.invalidateQueries({ queryKey: ["company-wise-stock-tp"] });
      queryClient.invalidateQueries({ queryKey: ["stock-report"] });
      queryClient.invalidateQueries({ queryKey: ["transaction-history"] });
      setSelectedInvoice(null);
      setInvoiceNumber("");
      setShowConfirmation(false);
    }
  });

  const handleSearch = () => {
    if (!invoiceNumber.trim()) {
      return;
    }
    searchQuery.refetch();
  };

  const handleCancelInvoice = () => {
    cancelMutation.mutate();
  };

  const invoice = searchQuery.data?.[invoiceType] || searchQuery.data?.purchase || searchQuery.data?.sale;
  const items = searchQuery.data?.items || [];

  return (
    <SectionCard
      title="Cancel Invoice"
      description="Search and cancel purchase or sales invoices. Canceled invoices will not be calculated in stock reports."
    >
      <div className="space-y-6">
        {/* Search Form */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormField label="Invoice Type" required>
            <select
              value={invoiceType}
              onChange={(e) => {
                setInvoiceType(e.target.value);
                setSelectedInvoice(null);
                setInvoiceNumber("");
                searchQuery.remove();
              }}
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="purchase">Purchase Invoice</option>
              <option value="sales">Sales Invoice</option>
            </select>
          </FormField>

          <FormField label="Invoice Number" required className="md:col-span-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSearch();
                  }
                }}
                placeholder="Enter invoice number"
                className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <button
                onClick={handleSearch}
                disabled={!invoiceNumber.trim() || searchQuery.isFetching}
                className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                <FiSearch />
                Search
              </button>
            </div>
          </FormField>
        </div>

        {/* Loading State */}
        {searchQuery.isFetching && (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-sm text-slate-600">Searching for invoice...</p>
          </div>
        )}

        {/* Error State */}
        {searchQuery.isError && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 flex items-start gap-3">
            <FiAlertTriangle className="text-rose-600 flex-shrink-0 mt-0.5" size={20} />
            <div>
              <p className="font-medium text-rose-900">Invoice Not Found</p>
              <p className="text-sm text-rose-700 mt-1">
                {searchQuery.error?.response?.data?.message || "Unable to find the specified invoice."}
              </p>
            </div>
          </div>
        )}

        {/* Success State */}
        {cancelMutation.isSuccess && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 flex items-start gap-3">
            <FiCheckCircle className="text-emerald-600 flex-shrink-0 mt-0.5" size={20} />
            <div>
              <p className="font-medium text-emerald-900">Invoice Canceled Successfully</p>
              <p className="text-sm text-emerald-700 mt-1">
                The invoice has been marked as canceled and will not be included in stock calculations.
              </p>
            </div>
          </div>
        )}

        {/* Cancel Error */}
        {cancelMutation.isError && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 flex items-start gap-3">
            <FiAlertTriangle className="text-rose-600 flex-shrink-0 mt-0.5" size={20} />
            <div>
              <p className="font-medium text-rose-900">Cancellation Failed</p>
              <p className="text-sm text-rose-700 mt-1">
                {cancelMutation.error?.response?.data?.message || "Failed to cancel the invoice. Please try again."}
              </p>
            </div>
          </div>
        )}

        {/* Invoice Details */}
        {invoice && !cancelMutation.isSuccess && (
          <div className="rounded-xl border-2 border-slate-200 bg-white overflow-hidden">
            <div className="bg-gradient-to-r from-slate-600 to-slate-700 text-white px-6 py-4">
              <h3 className="text-lg font-semibold">
                {invoiceType === "purchase" ? "Purchase" : "Sales"} Invoice Details
              </h3>
            </div>

            <div className="p-6 space-y-6">
              {/* Invoice Info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-slate-500 uppercase font-medium">Invoice No.</p>
                  <p className="text-sm font-semibold text-slate-900 mt-1">{invoice.invoice_no}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase font-medium">Date</p>
                  <p className="text-sm font-semibold text-slate-900 mt-1">{formatDate(invoice.invoice_date)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase font-medium">
                    {invoiceType === "purchase" ? "Supplier" : "Customer"}
                  </p>
                  <p className="text-sm font-semibold text-slate-900 mt-1">
                    {invoiceType === "purchase" 
                      ? `${invoice.supplier_code || ""} - ${invoice.supplier_name || ""}`.trim()
                      : `${invoice.customer_code || ""} - ${invoice.customer_name || ""}`.trim()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase font-medium">Total Amount</p>
                  <p className="text-sm font-semibold text-blue-600 mt-1">{formatCurrency(invoice.total_amount)}</p>
                </div>
              </div>

              {/* Status Warning */}
              {invoice.is_cancelled === 1 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
                  <FiAlertTriangle className="text-amber-600 flex-shrink-0 mt-0.5" size={20} />
                  <div>
                    <p className="font-medium text-amber-900">Already Canceled</p>
                    <p className="text-sm text-amber-700 mt-1">
                      This invoice has already been marked as canceled.
                    </p>
                  </div>
                </div>
              )}

              {/* Items Table */}
              {items.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-3">Invoice Items</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-slate-100 border-b border-slate-200">
                          <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700 uppercase">Code</th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700 uppercase">Item Name</th>
                          <th className="px-4 py-2 text-right text-xs font-semibold text-slate-700 uppercase">Quantity</th>
                          <th className="px-4 py-2 text-right text-xs font-semibold text-slate-700 uppercase">Bonus</th>
                          <th className="px-4 py-2 text-right text-xs font-semibold text-slate-700 uppercase">Rate</th>
                          <th className="px-4 py-2 text-right text-xs font-semibold text-slate-700 uppercase">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {items.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="px-4 py-2 text-sm font-medium text-slate-900">{item.item_code}</td>
                            <td className="px-4 py-2 text-sm text-slate-700">{item.item_name}</td>
                            <td className="px-4 py-2 text-sm text-right text-slate-900">{item.quantity || 0}</td>
                            <td className="px-4 py-2 text-sm text-right text-slate-900">{item.bonus || 0}</td>
                            <td className="px-4 py-2 text-sm text-right text-slate-900">
                              {formatCurrency(invoiceType === "purchase" ? item.purchase_rate : item.trade_price)}
                            </td>
                            <td className="px-4 py-2 text-sm text-right font-medium text-blue-600">
                              {formatCurrency(item.net_amount || (item.quantity * (invoiceType === "purchase" ? item.purchase_rate : item.trade_price)))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              {invoice.is_cancelled !== 1 && (
                <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                  <button
                    onClick={() => {
                      setSelectedInvoice(null);
                      setInvoiceNumber("");
                      searchQuery.remove();
                    }}
                    className="px-6 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 border border-slate-300 rounded-lg hover:bg-slate-200 transition-colors"
                  >
                    Clear
                  </button>
                  <button
                    onClick={() => setShowConfirmation(true)}
                    className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-white bg-rose-600 rounded-lg hover:bg-rose-700 transition-colors"
                  >
                    <FiX />
                    Cancel Invoice
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Confirmation Modal */}
        {showConfirmation && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 max-w-md mx-4 shadow-xl">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center">
                  <FiAlertTriangle className="text-rose-600" size={24} />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-slate-900">Cancel Invoice?</h3>
                  <p className="text-sm text-slate-600 mt-2">
                    Are you sure you want to cancel invoice <span className="font-semibold">{invoiceNumber}</span>?
                    This action will mark the invoice as canceled and it will be excluded from all stock calculations.
                  </p>
                  <p className="text-sm text-rose-600 font-medium mt-3">
                    This action cannot be undone.
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowConfirmation(false)}
                  disabled={cancelMutation.isPending}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 border border-slate-300 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-50"
                >
                  No, Keep It
                </button>
                <button
                  onClick={handleCancelInvoice}
                  disabled={cancelMutation.isPending}
                  className="px-4 py-2 text-sm font-medium text-white bg-rose-600 rounded-lg hover:bg-rose-700 transition-colors disabled:opacity-50"
                >
                  {cancelMutation.isPending ? "Canceling..." : "Yes, Cancel Invoice"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  );
};

export default CancelInvoicePage;
