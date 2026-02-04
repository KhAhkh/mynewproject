import React from "react";
import SectionCard from "./SectionCard.jsx";

/**
 * Component to display profit metrics in a formatted card layout
 */
const ProfitMetricsCard = ({ metrics, title = "Profit Metrics" }) => {
  if (!metrics) {
    return (
      <SectionCard title={title} description="No data available">
        <p className="text-slate-500">Unable to fetch profit metrics</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title={title} description="Complete profit analysis with payment status">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {/* Total Sales */}
        <div className="rounded-lg bg-gradient-to-br from-blue-50 to-blue-100 p-4">
          <p className="text-sm font-medium text-blue-900">Total Sales</p>
          <p className="mt-2 text-xl font-bold text-blue-700">
            {new Intl.NumberFormat("en-PK", {
              style: "currency",
              currency: "PKR",
              minimumFractionDigits: 2
            }).format(metrics.total_sale || metrics.total_sales || 0)}
          </p>
        </div>

        {/* Total Cost */}
        <div className="rounded-lg bg-gradient-to-br from-orange-50 to-orange-100 p-4">
          <p className="text-sm font-medium text-orange-900">Cost of Sales</p>
          <p className="mt-2 text-xl font-bold text-orange-700">
            {new Intl.NumberFormat("en-PK", {
              style: "currency",
              currency: "PKR",
              minimumFractionDigits: 2
            }).format(metrics.total_cost || 0)}
          </p>
        </div>

        {/* Profit (Total Sale - Cost of Sale) */}
        <div className="rounded-lg bg-gradient-to-br from-green-50 to-green-100 p-4">
          <p className="text-sm font-medium text-green-900">Profit</p>
          <p className="mt-2 text-xl font-bold text-green-700">
            {new Intl.NumberFormat("en-PK", {
              style: "currency",
              currency: "PKR",
              minimumFractionDigits: 2
            }).format(metrics.invoice_profit || 0)}
          </p>
          <p className="mt-1 text-xs text-green-600">
            {((metrics.total_cost > 0 && metrics.invoice_profit ? (metrics.invoice_profit / metrics.total_cost) * 100 : 0)).toFixed(2)}% profit
          </p>
        </div>

        {/* Amount Paid */}
        <div className="rounded-lg bg-gradient-to-br from-purple-50 to-purple-100 p-4">
          <p className="text-sm font-medium text-purple-900">Amount Paid</p>
          <p className="mt-2 text-xl font-bold text-purple-700">
            {new Intl.NumberFormat("en-PK", {
              style: "currency",
              currency: "PKR",
              minimumFractionDigits: 2
            }).format(metrics.total_amount_paid || metrics.amount_paid || 0)}
          </p>
        </div>

        {/* Outstanding Calculation Ratio */}
        <div className="rounded-lg bg-gradient-to-br from-cyan-50 to-cyan-100 p-4">
          <p className="text-sm font-medium text-cyan-900">Outstanding Calculation Ratio</p>
          <p className="mt-2 text-xl font-bold text-cyan-700">
            {(metrics.outstanding_calculation_ratio_percent || metrics.outstandingCalcRatio || 0).toFixed(2)}%
          </p>
        </div>

        {/* Outstanding Amount or Advance */}
        {(() => {
          const outstandingAmount = metrics.total_outstanding ?? metrics.amount_outstanding ?? 0;
          const advanceAmount = metrics.advance_amount ?? metrics.total_advance ?? 0;
          const showAdvance = advanceAmount > 0;
          const displayAmount = showAdvance ? advanceAmount : outstandingAmount;
          return (
            <div className={`rounded-lg bg-gradient-to-br p-4 ${showAdvance ? 'from-blue-50 to-blue-100' : 'from-red-50 to-red-100'}`}>
              <p className={`text-sm font-medium ${showAdvance ? 'text-blue-900' : 'text-red-900'}`}>
                {showAdvance ? 'Advance' : 'Outstanding'}
              </p>
              <p className={`mt-2 text-xl font-bold ${showAdvance ? 'text-blue-700' : 'text-red-700'}`}>
                {showAdvance ? 'Advance ' : ''}
                {new Intl.NumberFormat("en-PK", {
                  style: "currency",
                  currency: "PKR",
                  minimumFractionDigits: 2
                }).format(Math.abs(displayAmount || 0))}
              </p>
            </div>
          );
        })()}

        {/* Gained Profit/Loss (Amount Paid - Cost of Sale) */}
        <div className={`rounded-lg bg-gradient-to-br p-4 ${metrics.realized_profit >= 0 ? 'from-emerald-50 to-emerald-100' : 'from-red-50 to-red-100'}`}>
          <p className={`text-sm font-medium ${metrics.realized_profit >= 0 ? 'text-emerald-900' : 'text-red-900'}`}>
            {metrics.realized_profit >= 0 ? 'Gained Profit' : 'Gained Loss'}
          </p>
          <p className={`mt-2 text-xl font-bold ${metrics.realized_profit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
            {metrics.realized_profit >= 0 ? '' : 'Loss '}
            {new Intl.NumberFormat("en-PK", {
              style: "currency",
              currency: "PKR",
              minimumFractionDigits: 2
            }).format(Math.abs(metrics.realized_profit || 0))}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            From paid amounts
          </p>
          <p className="mt-1 text-xs text-emerald-700">
            {((metrics.total_cost > 0 && metrics.realized_profit ? (metrics.realized_profit / metrics.total_cost) * 100 : 0)).toFixed(2)}% profit
          </p>
        </div>

        {/* Pending Profit */}
        <div className="rounded-lg bg-gradient-to-br from-yellow-50 to-yellow-100 p-4">
          <p className="text-sm font-medium text-yellow-900">Pending Profit</p>
          <p className="mt-2 text-xl font-bold text-yellow-700">
            {new Intl.NumberFormat("en-PK", {
              style: "currency",
              currency: "PKR",
              minimumFractionDigits: 2
            }).format(metrics.pending_profit || 0)}
          </p>          <p className="mt-1 text-xs text-orange-600">
            {((metrics.total_sales > 0 && metrics.pending_profit ? (metrics.pending_profit / metrics.total_sales) * 100 : 0)).toFixed(2)}% of sales
          </p>        </div>
      </div>

      {/* Detailed Breakdown */}
      <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Calculation Details</h3>
        <div className="space-y-2 text-sm text-slate-600">
          <div className="flex justify-between">
            <span>Profit Formula:</span>
            <code className="font-mono text-xs bg-white px-2 py-1 rounded">Total Sale - Cost of Sale</code>
          </div>
          <div className="flex justify-between">
            <span>Gained Profit Formula:</span>
            <code className="font-mono text-xs bg-white px-2 py-1 rounded">Amount Paid - Cost of Sale</code>
          </div>
          <div className="flex justify-between">
            <span>Pending Profit Formula:</span>
            <code className="font-mono text-xs bg-white px-2 py-1 rounded">Profit - Gained Profit</code>
          </div>
          <div className="flex justify-between">
            <span>Note:</span>
            <span className="text-xs text-slate-500">If Gained Profit is negative, it shows as Loss</span>
          </div>
        </div>
      </div>
    </SectionCard>
  );
};

export default ProfitMetricsCard;
