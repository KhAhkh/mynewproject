import { Fragment, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import SectionCard from "../../components/SectionCard.jsx";
import { api } from "../../api/client.js";
import { toDisplay } from "../../utils/date.js";

const DEFAULT_TYPE = "purchase";

const formatCurrency = (value) =>
  `Rs ${Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const formatNumber = (value) => Number(value ?? 0).toLocaleString();

const formatPlainAmount = (value) => {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) return "0";
  const isWhole = Math.abs(number % 1) < 1e-6;
  if (isWhole) {
    if (number === 0) {
      return "0.00";
    }
    return number.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
  return number.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatTransactionType = (value) => {
  const text = (value || "").toString().trim().toLowerCase();
  if (!text) return "Deposit";
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const formatPaymentMode = (value) => {
  const text = (value || "").toString().trim().toLowerCase();
  if (text === "online") return "Online";
  if (text === "bank") return "Bank Transaction";
  return "Cash";
};

const deriveSaleLineAmounts = (item = {}) => {
  const quantity = Number(item.quantity ?? 0);
  const bonus = Number(item.bonus ?? 0);
  const tradePrice = Number(item.trade_price ?? item.tradePrice ?? 0);
  const discountPercent = Number(item.discount_percent ?? item.discountPercent ?? 0);
  const storedTradeOff = Number(item.trade_off_price ?? item.tradeOffPrice ?? 0);
  const unitRate = Number.isFinite(storedTradeOff) && storedTradeOff !== 0
    ? storedTradeOff
    : tradePrice * (1 - discountPercent / 100);
  const baseAmount = quantity * unitRate;
  const taxPercent = Number(item.tax_percent ?? item.taxPercent ?? item.sales_tax ?? 0) || 0;
  const taxAmount = baseAmount * (taxPercent / 100);
  const lineTotal = baseAmount + taxAmount;
  return {
    quantity,
    bonus,
    tradePrice,
    unitRate,
    discountPercent,
    baseAmount,
    taxPercent,
    taxAmount,
    lineTotal
  };
};

const OnScreenSalesDetail = ({ sale, items = [], row }) => {
  const totals = {
    amount: Number(sale.total_amount ?? 0),
    paid: Number(sale.amount_paid ?? 0),
    previous: Number(sale.previous_balance ?? 0)
  };
  const netBalance = totals.amount - totals.paid + totals.previous;
  const lineSummary = items.reduce(
    (accumulator, entry) => {
      const { quantity, bonus, baseAmount, taxAmount, lineTotal } = deriveSaleLineAmounts(entry);
      accumulator.quantity += quantity;
      accumulator.bonus += bonus;
      accumulator.subtotal += baseAmount;
      accumulator.tax += taxAmount;
      accumulator.total += lineTotal;
      return accumulator;
    },
    { quantity: 0, bonus: 0, subtotal: 0, tax: 0, total: 0 }
  );
  const aggregates = {
    quantity: lineSummary.quantity,
    bonus: lineSummary.bonus,
    lineTotal: lineSummary.total
  };
  const customerName = row?.entity || joinCodeName(sale.customer_code, sale.customer_name);
  const salesmanName = row?.salesman || joinCodeName(sale.salesman_code, sale.salesman_name);
  const contactPhone = sale.customer_phone || row?.customerPhone || "—";
  const contactAddress = sale.customer_address || row?.customerAddress || "—";

  const invoiceFacts = [
    { label: "Invoice No.", value: sale.invoice_no || "—" },
    { label: "Invoice Date", value: sale.invoice_date || "—" },
    { label: "Customer", value: customerName },
    { label: "Salesman", value: salesmanName },
    { label: "Contact Phone", value: contactPhone },
    { label: "Delivery Address", value: contactAddress }
  ];

  const summaryEntries = [
    { label: "Subtotal", value: formatCurrency(lineSummary.subtotal) },
    { label: "Tax Amount", value: formatCurrency(lineSummary.tax) },
    { label: "Total Amount", value: formatCurrency(totals.amount) },
    { label: "Amount Paid", value: formatCurrency(totals.paid) },
    { label: "Previous Balance", value: formatCurrency(totals.previous) }
  ];

  return (
    <div className="space-y-6 print:hidden">
      <section className="rounded-3xl border border-slate-200 bg-white px-6 py-5 shadow-[0_18px_40px_rgba(15,23,42,0.12)]">
        <header className="border-b border-slate-100 pb-4">
          <h4 className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
            Invoice Overview
          </h4>
        </header>
        <dl className="grid gap-x-6 gap-y-5 pt-4 text-sm text-slate-700 sm:grid-cols-2">
          {invoiceFacts.map((entry) => (
            <div key={entry.label} className="space-y-1">
              <dt className="text-[11px] uppercase tracking-[0.3em] text-slate-400">{entry.label}</dt>
              <dd className="text-base font-semibold text-slate-900">{entry.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.12)]">
        <header className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h4 className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
            Line Items
          </h4>
          <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">
            {items.length} {items.length === 1 ? "Item" : "Items"}
          </p>
        </header>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm text-slate-700">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-[0.28em] text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Item</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Pack</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">Quantity</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">Bonus</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">Trade Price</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">Discount %</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">Tax</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">Net Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                    No items recorded on this invoice.
                  </td>
                </tr>
              ) : (
                items.map((item) => {
                  const {
                    quantity,
                    bonus,
                    tradePrice,
                    discountPercent,
                    taxPercent,
                    taxAmount,
                    lineTotal
                  } = deriveSaleLineAmounts(item);
                  const packSizeRaw = item.pack_size ?? item.packSize ?? null;
                  const packSizeNumber = Number(packSizeRaw);
                  const unitLabelRaw = item.base_unit || "";
                  const packLabel =
                    unitLabelRaw && unitLabelRaw.toLowerCase() !== "pieces"
                      ? Number.isFinite(packSizeNumber) && packSizeNumber > 0
                        ? `${unitLabelRaw} (${formatNumber(packSizeNumber)})`
                        : unitLabelRaw
                      : "—";
                  const decoratedUnit =
                    /^(carton|pack)$/i.test(unitLabelRaw) && Number.isFinite(packSizeNumber)
                      ? `${unitLabelRaw}-${formatNumber(packSizeNumber)}`
                      : unitLabelRaw;
                  return (
                    <tr key={item.id ?? `${item.item_code}-${item.item_name}`} className="hover:bg-slate-50">
                      <td className="px-4 py-3 align-top">
                        <p className="font-semibold text-slate-800">{item.item_code} — {item.item_name}</p>
                        <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
                          {[item.company_name, decoratedUnit].filter(Boolean).join(" • ")}
                        </p>
                      </td>
                      <td className="px-4 py-3 align-top text-slate-700">{packLabel}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-800">{formatNumber(quantity)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-800">{formatNumber(bonus)}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{formatCurrency(tradePrice)}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{discountPercent.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-slate-700">
                        <div>{formatCurrency(taxAmount)}</div>
                        <div className="text-[10px] uppercase tracking-[0.25em] text-slate-400">{taxPercent.toFixed(2)}%</div>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-800">{formatCurrency(lineTotal)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {items.length > 0 ? (
              <tfoot className="bg-slate-100 text-sm font-semibold text-slate-700">
                <tr>
                  <td className="px-4 py-3" colSpan={2}>Totals</td>
                  <td className="px-4 py-3 text-right">{formatNumber(aggregates.quantity)}</td>
                  <td className="px-4 py-3 text-right">{formatNumber(aggregates.bonus)}</td>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3 text-right">{formatCurrency(lineSummary.tax)}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(aggregates.lineTotal)}</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-gradient-to-br from-emerald-500/10 via-white to-white px-6 py-5 shadow-[0_18px_40px_rgba(15,23,42,0.12)]">
        <header className="border-b border-slate-100 pb-4">
          <h4 className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
            Account Summary
          </h4>
        </header>
        <dl className="grid gap-4 pt-4 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-3">
          {[...summaryEntries, { label: "Net Balance", value: formatCurrency(netBalance), isNet: true }].map((entry) => (
            <div
              key={entry.label}
              className="rounded-2xl border border-emerald-100/70 bg-white/70 px-4 py-3 shadow-sm"
            >
              <dt className="text-[11px] uppercase tracking-[0.28em] text-emerald-500">
                {entry.label}
              </dt>
              <dd
                className={`mt-1 text-lg font-semibold leading-snug break-words ${
                  entry.isNet && netBalance < 0 ? "text-red-600" : "text-slate-900"
                }`}
              >
                {entry.value}
              </dd>
            </div>
          ))}
        </dl>
        <div className="mt-6 rounded-2xl border border-emerald-100 bg-white/80 px-5 py-4 text-slate-700">
          <p className="text-[11px] uppercase tracking-[0.3em] text-emerald-500">Net Balance</p>
          <p
            className={`text-2xl font-semibold ${netBalance < 0 ? "text-red-600" : "text-emerald-600"}`}
          >
            {formatCurrency(netBalance)}
          </p>
        </div>
      </section>
    </div>
  );
};

const OnScreenSaleReturnDetail = ({ entry, row }) => {
  const invoiceNo = entry?.invoice_no || row?.reference || "—";
  const returnDate = entry?.return_date || row?.date || "—";
  const customerName = joinCodeName(entry?.customer_code, entry?.customer_name) || row?.entity || "—";
  const recordedAt = formatDateTime(entry?.updated_at || entry?.created_at);
  const quantity = Number(entry?.quantity ?? row?.quantity ?? 0);
  const tradePriceRaw = entry?.trade_price ?? row?.trade_price ?? (quantity > 0 ? Number(row?.value ?? 0) / quantity : 0);
  const tradePrice = Number(tradePriceRaw ?? 0);
  const amount = quantity * tradePrice;
  const itemLabel = joinCodeName(entry?.item_code, entry?.item_name) || row?.item || "—";
  const unitLabel = entry?.base_unit || entry?.unit || "";

  const lineItems = [
    {
      id: entry?.sale_item_id || entry?.id || `${invoiceNo}-return`,
      label: itemLabel,
      unit: unitLabel,
      quantity,
      rate: tradePrice,
      value: amount
    }
  ];

  const totalQuantity = lineItems.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0);
  const totalValue = lineItems.reduce((sum, item) => sum + Number(item.value ?? 0), 0);
  const averageRate = totalQuantity > 0 ? totalValue / totalQuantity : tradePrice;

  return (
    <div className="space-y-6 print:hidden">
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Invoice</p>
          <p className="font-medium text-slate-800">{invoiceNo}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Return Date</p>
          <p className="font-medium text-slate-800">{returnDate}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Customer</p>
          <p className="font-medium text-slate-800">{customerName}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Recorded</p>
          <p className="font-medium text-slate-800">{recordedAt}</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm text-slate-700">
          <thead className="bg-slate-100 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left">Item</th>
              <th className="px-3 py-2 text-right">Quantity</th>
              <th className="px-3 py-2 text-right">Bonus</th>
              <th className="px-3 py-2 text-right">Trade Price</th>
              <th className="px-3 py-2 text-right">Discount %</th>
              <th className="px-3 py-2 text-right">Tax</th>
              <th className="px-3 py-2 text-right">Line Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-center text-slate-500">
                  No items recorded on this invoice.
                </td>
              </tr>
            ) : (
              items.map((item) => {
                const {
                  quantity,
                  bonus,
                  tradePrice,
                  discountPercent,
                  taxAmount,
                  lineTotal
                } = deriveSaleLineAmounts(item);
                return (
                  <tr key={item.id ?? `${item.item_code}-${item.item_name}`} className="hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <p className="font-medium text-slate-800">{item.item_code} — {item.item_name}</p>
                      <p className="text-xs text-slate-500">{item.base_unit || ""}</p>
                    </td>
                    <td className="px-3 py-2 text-right">{quantity}</td>
                    <td className="px-3 py-2 text-right">{bonus}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(tradePrice)}</td>
                    <td className="px-3 py-2 text-right">{discountPercent.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(taxAmount)}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(lineTotal)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
          {items.length > 0 ? (
            <tfoot className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">Totals</th>
                <th className="px-3 py-2 text-right">{formatNumber(lineSummary.quantity)}</th>
                <th className="px-3 py-2 text-right">{formatNumber(lineSummary.bonus)}</th>
                <th className="px-3 py-2" />
                <th className="px-3 py-2" />
                <th className="px-3 py-2 text-right">{formatCurrency(lineSummary.tax)}</th>
                <th className="px-3 py-2 text-right">{formatCurrency(lineSummary.total)}</th>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
};

const OnScreenBankTransactionDetail = ({ transaction, row }) => {
  const entryNo = transaction?.entry_no || row?.entryNo || "—";
  const slipDate = transaction?.slip_date || row?.date || "—";
  const slipNo =
    transaction?.supplier_payment_no ||
    row?.supplierPaymentNo ||
    transaction?.slip_no ||
    row?.slipNo ||
    row?.reference ||
    "—";
  const bankLabel = joinCodeName(transaction?.bank_code, transaction?.bank_name) || row?.entity || "—";
  const sourceLabel = transaction?.customer_receipt_no
    ? `From receipt ${transaction.customer_receipt_no}`
    : transaction?.supplier_payment_no
      ? `Supplier payment ${transaction.supplier_payment_no}`
      : row?.origin || "Manual Entry";
  const amountValue = Number(transaction?.cash_amount ?? row?.amount ?? 0);
  const typeLabel = formatTransactionType(transaction?.transaction_type || row?.transactionType);
  const transactionId = transaction?.id ?? row?.transactionId ?? "—";
  const createdAt = transaction?.created_at || null;
  const updatedAt = transaction?.updated_at || createdAt;
  const recordedLabel = formatDateTime(updatedAt || createdAt);
  const createdLabel = createdAt ? formatDateTime(createdAt) : "—";

  return (
    <div className="space-y-6 print:hidden">
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Entry No.</p>
          <p className="font-medium text-slate-800">{entryNo}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Transaction ID</p>
          <p className="font-medium text-slate-800">{transactionId}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Transaction Type</p>
          <p className="font-medium text-slate-800">{typeLabel}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Slip / Reference</p>
          <p className="font-medium text-slate-800">{slipNo}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Slip Date</p>
          <p className="font-medium text-slate-800">{slipDate}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Bank</p>
          <p className="font-medium text-slate-800">{bankLabel}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Source</p>
          <p className="font-medium text-slate-800">{sourceLabel}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Recorded</p>
          <p className="font-medium text-slate-800">{recordedLabel || "—"}</p>
        </div>
      </div>

      <div className="grid gap-4 rounded-3xl border border-slate-200 bg-gradient-to-r from-slate-50 via-white to-slate-50 px-6 py-5 shadow-[0_12px_35px_rgba(15,23,42,0.08)]">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 text-sm text-slate-700">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Amount</p>
            <p className="text-lg font-semibold text-emerald-600">{formatCurrency(amountValue)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Transaction Type</p>
            <p className="text-lg font-semibold text-slate-900">{typeLabel}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Source</p>
            <p className="text-lg font-semibold text-slate-900">{sourceLabel}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Created</p>
            <p className="text-lg font-semibold text-slate-900">{createdLabel}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

const BankTransactionPrintLayout = ({ transaction, row, title }) => {
  const entryNo = transaction?.entry_no || row?.entryNo || "—";
  const typeLabel = formatTransactionType(transaction?.transaction_type || row?.transactionType);
  const slipDate = transaction?.slip_date || row?.date || "—";
  const bankLabel = joinCodeName(transaction?.bank_code, transaction?.bank_name) || row?.entity || "—";
  const slipNo =
    transaction?.supplier_payment_no ||
    row?.supplierPaymentNo ||
    transaction?.slip_no ||
    row?.slipNo ||
    row?.reference ||
    "—";
  const sourceLabel = transaction?.customer_receipt_no
    ? `From receipt ${transaction.customer_receipt_no}`
    : transaction?.supplier_payment_no
      ? `Supplier payment ${transaction.supplier_payment_no}`
      : row?.origin || "Manual Entry";
  const amountValue = Number(transaction?.cash_amount ?? row?.amount ?? 0);
  const createdAt = transaction?.created_at || null;
  const updatedAt = transaction?.updated_at || createdAt;

  return (
    <section
      className="mx-auto w-full max-w-3xl space-y-6 text-slate-900 print:mx-0 print:w-full print:max-w-none print:h-[14.85cm] print:max-h-[14.85cm] print:space-y-3 print:overflow-hidden print:px-0 print:pt-1 print:pb-2"
      style={{ breakInside: "avoid" }}
    >
      <header className="flex flex-col gap-1 border-b border-slate-300 pb-2 print:pb-1">
        <h2 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h2>
        <p className="text-[0.65rem] text-slate-400">Official record of the bank transaction captured below.</p>
      </header>

      <div className="rounded-xl border border-slate-200 bg-white/90 p-4 shadow-sm backdrop-blur print:p-3 print:shadow-none">
        <dl className="grid gap-4 text-[0.75rem] sm:grid-cols-3">
          <div className="space-y-0.5">
            <dt className="text-[0.55rem] uppercase tracking-[0.3em] text-slate-500">Entry No.</dt>
            <dd className="text-sm font-semibold text-slate-900">{entryNo}</dd>
          </div>
          <div className="space-y-0.5">
            <dt className="text-[0.55rem] uppercase tracking-[0.3em] text-slate-500">Transaction Type</dt>
            <dd className="text-sm font-semibold text-slate-900">{typeLabel}</dd>
          </div>
          <div className="space-y-0.5">
            <dt className="text-[0.55rem] uppercase tracking-[0.3em] text-slate-500">Slip Date</dt>
            <dd className="text-sm font-semibold text-slate-900">{slipDate}</dd>
          </div>
        </dl>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white/90 p-4 shadow-sm backdrop-blur print:p-3 print:shadow-none">
        <dl className="grid gap-4 text-[0.75rem] sm:grid-cols-3">
          <div className="space-y-0.5">
            <dt className="text-[0.55rem] uppercase tracking-[0.3em] text-slate-500">Bank</dt>
            <dd className="text-sm font-semibold text-slate-900">{bankLabel}</dd>
          </div>
          <div className="space-y-0.5">
            <dt className="text-[0.55rem] uppercase tracking-[0.3em] text-slate-500">Slip / Reference</dt>
            <dd className="text-sm font-semibold text-slate-900">{slipNo}</dd>
          </div>
          <div className="space-y-0.5">
            <dt className="text-[0.55rem] uppercase tracking-[0.3em] text-slate-500">Source</dt>
            <dd className="text-sm font-semibold text-slate-900">{sourceLabel}</dd>
          </div>
        </dl>
      </div>

      <div className="flex justify-end">
        <div className="w-full max-w-sm overflow-hidden rounded-xl border border-slate-200 bg-white/85 shadow-sm print:max-w-sm print:shadow-none">
          <table className="w-full border-collapse text-[0.75rem] print:text-[0.7rem]">
            <tbody>
              <tr className="border-b border-slate-200 last:border-0">
                <td className="px-4 py-3 print:px-3 print:py-2 align-top">
                  <div className="text-[0.6rem] font-semibold uppercase tracking-[0.28em] text-slate-500">Amount</div>
                  <div className="text-sm font-semibold text-slate-900">{formatPlainAmount(amountValue)}</div>
                </td>
                <td className="border-l border-slate-200 px-4 py-3 print:px-3 print:py-2 align-top">
                  <div className="text-[0.6rem] font-semibold uppercase tracking-[0.28em] text-slate-500">Created</div>
                  <div className="text-sm font-semibold text-slate-900">{createdAt ? formatDateTime(createdAt) : "—"}</div>
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3 print:px-3 print:py-2 align-top">
                  <div className="text-[0.6rem] font-semibold uppercase tracking-[0.28em] text-slate-500">Updated</div>
                  <div className="text-sm font-semibold text-slate-900">{updatedAt ? formatDateTime(updatedAt) : "—"}</div>
                </td>
                <td className="border-l border-slate-200 px-4 py-3 print:px-3 print:py-2 align-top">
                  <div className="text-[0.6rem] font-semibold uppercase tracking-[0.28em] text-slate-500">Source</div>
                  <div className="text-sm font-semibold text-slate-900">{sourceLabel}</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

const PrintableDetail = ({ title, children, actions, showPrint = true }) => {
  const handlePrint = () => window.print();
  return (
    <div className="space-y-4 text-sm text-slate-600 print:no-bg print:shadow-none print:text-dark print:w-full print:max-w-none">
      <header className="flex items-start justify-between print:hidden">
        <div>
          <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
          <p className="text-xs text-slate-500">
            {showPrint ? "Review or print this transaction." : "Review this transaction."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {actions || null}
          {showPrint ? (
            <button type="button" className="secondary text-xs px-3 py-1" onClick={handlePrint}>
              Print
            </button>
          ) : null}
        </div>
      </header>
      <div className="grid grid-cols-1 gap-4 print:block print:text-dark">{children}</div>
    </div>
  );
};

const SalesInvoicePrintLayout = ({ sale, items = [], row }) => {
  const invoiceNo = sale?.invoice_no || row?.reference || "—";
  const invoiceDate = sale?.invoice_date || row?.date || "—";
  const customerName = joinCodeName(sale?.customer_code, sale?.customer_name) || row?.entity || "—";
  const salesmanName = joinCodeName(sale?.salesman_code, sale?.salesman_name) || row?.salesman || "—";
  const customerPhone = sale?.customer_phone || row?.customerPhone || "—";
  const customerAddress = sale?.customer_address || row?.customerAddress || "—";

  const totals = {
    amount: Number(sale?.total_amount ?? row?.amount ?? 0),
    paid: Number(sale?.amount_paid ?? row?.received ?? 0),
    previous: Number(sale?.previous_balance ?? 0)
  };
  const netBalance = totals.amount - totals.paid + totals.previous;
  const lineSummary = items.reduce(
    (accumulator, item) => {
      const { baseAmount, taxAmount, lineTotal } = deriveSaleLineAmounts(item);
      return {
        subtotal: accumulator.subtotal + baseAmount,
        tax: accumulator.tax + taxAmount,
        total: accumulator.total + lineTotal
      };
    },
    { subtotal: 0, tax: 0, total: 0 }
  );

  const detailRows = [
    { label: "Subtotal", value: lineSummary.subtotal },
    { label: "Amount Paid", value: totals.paid },
    { label: "Previous Balance", value: totals.previous },
    { label: "Net Balance", value: netBalance, highlight: true }
  ];

  const totalsByRow = [detailRows];

  return (
    <section
      className="w-full space-y-4 text-slate-900 print:mx-auto print:w-[19cm] print:max-w-[19cm] print:h-[14.85cm] print:max-h-[14.85cm] print:space-y-3 print:overflow-hidden print:px-3 print:pt-2 print:pb-3"
      style={{ breakInside: "avoid" }}
    >
      <header className="flex flex-col gap-1 border-b border-slate-300 pb-2 print:pb-1">
        <h2 className="text-lg sm:text-xl font-semibold tracking-tight text-slate-900">Sale Invoice</h2>
        <p className="text-[0.65rem] text-slate-400">
          Official summary of this transaction captured below.
        </p>
      </header>

      <div className="rounded-xl border border-slate-200 bg-white/90 p-3 sm:p-4 shadow-sm backdrop-blur print:p-3 print:shadow-none">
        <dl className="grid gap-3 sm:gap-4 text-[0.75rem] grid-cols-1 xs:grid-cols-2 sm:grid-cols-3">
          <div className="space-y-0.5">
            <dt className="text-[0.55rem] uppercase tracking-[0.3em] text-slate-500">No.</dt>
            <dd className="text-sm font-semibold text-slate-900 break-all">{invoiceNo}</dd>
          </div>
          <div className="space-y-0.5">
            <dt className="text-[0.55rem] uppercase tracking-[0.3em] text-slate-500">Date</dt>
            <dd className="text-sm font-semibold text-slate-900">{invoiceDate}</dd>
          </div>
          <div className="space-y-0.5">
            <dt className="text-[0.55rem] uppercase tracking-[0.3em] text-slate-500">Salesman</dt>
            <dd className="text-sm font-semibold text-slate-900 break-words">{salesmanName}</dd>
          </div>
        </dl>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white/90 p-3 sm:p-4 shadow-sm backdrop-blur print:p-3 print:shadow-none">
        <dl className="grid gap-3 sm:gap-4 text-[0.75rem] grid-cols-1 xs:grid-cols-2 sm:grid-cols-3">
          <div className="space-y-0.5">
            <dt className="text-[0.55rem] uppercase tracking-[0.3em] text-slate-500">To Customer</dt>
            <dd className="text-sm font-semibold text-slate-900 break-words">{customerName}</dd>
          </div>
          <div className="space-y-0.5">
            <dt className="text-[0.55rem] uppercase tracking-[0.3em] text-slate-500">Phone</dt>
            <dd className="text-sm font-semibold text-slate-900 break-all">{customerPhone || "—"}</dd>
          </div>
          <div className="space-y-0.5">
            <dt className="text-[0.55rem] uppercase tracking-[0.3em] text-slate-500">Address</dt>
            <dd className="text-sm font-semibold text-slate-900 break-words">{customerAddress || "—"}</dd>
          </div>
        </dl>
      </div>

      <div>
        <p className="text-[0.6rem] font-semibold uppercase tracking-[0.3em] text-slate-500">Description</p>
      </div>

      <div className="flex flex-col gap-4 print:mt-2">
        <div className="overflow-x-auto overflow-hidden rounded-xl border border-slate-200 bg-white/80 shadow-sm print:flex-1 print:w-full print:rounded-xl print:border print:border-slate-300 print:shadow-none">
          <table className="w-full table-auto border-collapse text-[0.75rem] print:text-[0.7rem] min-w-[640px]">
          <thead className="bg-gradient-to-r from-slate-50 to-slate-100 text-[0.6rem] uppercase tracking-[0.22em] text-slate-700">
            <tr>
              <th className="border border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">Item</th>
              <th className="border border-slate-200 px-2 py-2 text-center font-semibold text-slate-700 whitespace-nowrap print:px-1">Qty</th>
              <th className="border border-slate-200 px-2 py-2 text-center font-semibold text-slate-700 whitespace-nowrap print:px-1">Bonus</th>
              <th className="border border-slate-200 px-2 py-2 text-center font-semibold text-slate-700 whitespace-nowrap print:px-1.5">T.P</th>
              <th className="border border-slate-200 px-2 py-2 text-center font-semibold text-slate-700 whitespace-nowrap print:px-1">Dis%</th>
              <th className="border border-slate-200 px-2 py-2 text-center font-semibold text-slate-700 whitespace-nowrap print:px-1.5">Rate</th>
              <th className="border border-slate-200 px-2 py-2 text-center font-semibold text-slate-700 whitespace-nowrap print:px-1.5">Retail</th>
              <th className="border border-slate-200 px-2 py-2 text-center font-semibold text-slate-700 whitespace-nowrap print:px-1.5">Tax</th>
              <th className="border border-slate-200 px-2 py-2 text-right font-semibold text-slate-700 whitespace-nowrap print:px-1.5">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={9} className="border border-slate-300 px-3 py-4 text-center text-slate-500">
                  No items recorded on this invoice.
                </td>
              </tr>
            ) : (
              items.map((item) => {
                const {
                  quantity,
                  bonus,
                  tradePrice,
                  unitRate,
                  discountPercent,
                  taxPercent,
                  taxAmount,
                  lineTotal
                } = deriveSaleLineAmounts(item);
                const retailPriceRaw = item.retail_price ?? item.retailPrice ?? null;
                const retailPriceNumber = Number(retailPriceRaw);
                const retailPrice = Number.isFinite(retailPriceNumber)
                  ? formatPlainAmount(retailPriceNumber)
                  : "—";
                const companyLabel = item.company_name ?? item.companyName ?? "";
                const unitLabelRaw = item.base_unit || "";
                const packSizeRaw = item.pack_size ?? item.packSize ?? null;
                const packSizeNumber = Number(packSizeRaw);
                const decoratedUnit =
                  /^(carton|pack)$/i.test(unitLabelRaw) && Number.isFinite(packSizeNumber)
                    ? `${unitLabelRaw}-${formatNumber(packSizeNumber)}`
                    : unitLabelRaw;
                const descriptor = [companyLabel, decoratedUnit].filter(Boolean).join(" - ");
                const storedLineTotalRaw = Number(item.line_total ?? item.lineTotal ?? item.amount ?? NaN);
                const displayLineTotal = Number.isFinite(storedLineTotalRaw) ? storedLineTotalRaw : lineTotal;
                return (
                  <tr key={item.id ?? `${item.item_code}-${item.item_name}`} className="bg-white">
                    <td className="border border-slate-300 px-3 py-2 align-top print:py-1.5">
                      <div
                        className="font-semibold text-slate-900"
                        style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
                      >
                        {item.item_code} — {item.item_name}
                      </div>
                      <div
                        className="text-[0.55rem] uppercase tracking-[0.2em] text-slate-400"
                        style={{ display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden" }}
                      >
                        {descriptor}
                      </div>
                    </td>
                    <td className="border border-slate-300 px-2 py-2 text-center align-top text-slate-900 font-semibold whitespace-nowrap print:px-1 print:py-1.5">
                      {formatNumber(quantity)}
                    </td>
                    <td className="border border-slate-300 px-2 py-2 text-center align-top text-slate-900 font-semibold whitespace-nowrap print:px-1 print:py-1.5">
                      {formatNumber(bonus)}
                    </td>
                    <td className="border border-slate-300 px-2 py-2 text-center align-top text-slate-900 font-semibold whitespace-nowrap print:px-1.5 print:py-1.5">
                      {formatPlainAmount(tradePrice)}
                    </td>
                    <td className="border border-slate-300 px-2 py-2 text-center align-top text-slate-900 font-semibold whitespace-nowrap print:px-1 print:py-1.5">
                      {discountPercent.toFixed(2)}
                    </td>
                    <td className="border border-slate-300 px-2 py-2 text-center align-top text-slate-900 font-semibold whitespace-nowrap print:px-1.5 print:py-1.5">
                      {formatPlainAmount(unitRate)}
                    </td>
                    <td className="border border-slate-300 px-2 py-2 text-center align-top text-slate-900 font-semibold whitespace-nowrap print:px-1.5 print:py-1.5">
                      {retailPrice}
                    </td>
                    <td className="border border-slate-300 px-2 py-2 text-center align-top text-slate-900 font-semibold whitespace-nowrap print:px-1.5 print:py-1.5">
                      <div>{formatPlainAmount(taxAmount)}</div>
                      <div className="text-[0.55rem] uppercase tracking-[0.2em] text-slate-400">{taxPercent.toFixed(2)}%</div>
                    </td>
                    <td className="border border-slate-300 px-2 py-2 text-right align-top text-black font-semibold whitespace-nowrap print:px-1.5 print:py-1.5">
                      {formatPlainAmount(displayLineTotal)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        </div>

        <div className="w-full overflow-x-auto overflow-hidden rounded-xl border border-slate-200 bg-white/85 shadow-sm print:mt-0 print:w-full print:shadow-none">
          <table className="w-full border-collapse text-[0.75rem] print:text-[0.7rem] min-w-[400px]">
            <tbody>
              {totalsByRow.map((rowEntries, rowIdx) => (
                <tr key={`totals-row-${rowIdx}`} className="border-b border-slate-200 last:border-0">
                  {rowEntries.map((entry) => (
                    <td
                      key={entry.label}
                      className={`border-l border-slate-200 first:border-l-0 px-4 py-3 print:px-3 print:py-2 align-top ${
                        entry.highlight ? "bg-slate-900 text-white print:bg-slate-800" : ""
                      }`}
                    >
                      <div
                        className={`text-[0.6rem] font-semibold uppercase tracking-[0.28em] ${
                          entry.highlight ? "text-slate-200" : "text-slate-500"
                        }`}
                      >
                        {entry.label}
                      </div>
                      <div
                        className={`${
                          entry.highlight
                            ? "text-base font-bold print:text-[0.75rem]"
                            : "text-sm font-semibold text-slate-900"
                        }`}
                      >
                        {formatPlainAmount(entry.value)}
                      </div>
                    </td>
                  ))}
                  {rowEntries.length < 2 ? (
                    <td className="border-l border-slate-200 px-4 py-3 print:px-3 print:py-2" />
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="border-t border-slate-300" />
    </section>
  );
};

const SalesReturnPrintLayout = ({ entry, row }) => {
  const invoiceNo = entry?.invoice_no || row?.reference || "—";
  const returnDate = entry?.return_date || row?.date || "—";
  const recordedAt = formatDateTime(entry?.updated_at || entry?.created_at);
  const customerName = joinCodeName(entry?.customer_code, entry?.customer_name) || row?.entity || "—";
  const itemLabel = joinCodeName(entry?.item_code, entry?.item_name) || row?.item || "—";
  const quantity = Number(entry?.quantity ?? row?.quantity ?? 0);
  const tradePriceRaw = entry?.trade_price ?? row?.trade_price ?? (quantity > 0 ? Number(row?.value ?? 0) / quantity : 0);
  const tradePrice = Number(tradePriceRaw ?? 0);
  const amount = quantity * tradePrice;
  const totalQuantity = quantity;
  const totalValue = amount;
  const averageRate = totalQuantity > 0 ? totalValue / totalQuantity : tradePrice;

  return (
    <section
      className="mx-auto w-full max-w-2xl space-y-6 text-slate-900 print:mx-0 print:w-full print:h-[14.85cm] print:max-h-[14.85cm] print:space-y-3 print:overflow-hidden print:px-3 print:pt-2 print:pb-3"
      style={{ breakInside: "avoid" }}
    >
      <header className="flex flex-col gap-1 border-b border-slate-300 pb-2 print:pb-1">
        <h2 className="text-xl font-semibold tracking-tight text-slate-900">Sale Return</h2>
        <p className="text-[0.65rem] text-slate-400">Official summary of this return captured below.</p>
      </header>

      <div className="rounded-xl border border-slate-200 bg-white/90 p-4 shadow-sm backdrop-blur print:p-3 print:shadow-none">
        <dl className="grid gap-4 text-[0.75rem] sm:grid-cols-3">
          <div className="space-y-0.5">
            <dt className="text-[0.55rem] uppercase tracking-[0.3em] text-slate-500">Invoice</dt>
            <dd className="text-sm font-semibold text-slate-900">{invoiceNo}</dd>
          </div>
          <div className="space-y-0.5">
            <dt className="text-[0.55rem] uppercase tracking-[0.3em] text-slate-500">Return Date</dt>
            <dd className="text-sm font-semibold text-slate-900">{returnDate}</dd>
          </div>
          <div className="space-y-0.5">
            <dt className="text-[0.55rem] uppercase tracking-[0.3em] text-slate-500">Recorded</dt>
            <dd className="text-sm font-semibold text-slate-900">{recordedAt}</dd>
          </div>
        </dl>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white/90 p-4 shadow-sm backdrop-blur print:p-3 print:shadow-none">
        <dl className="grid gap-4 text-[0.75rem] sm:grid-cols-2">
          <div className="space-y-0.5">
            <dt className="text-[0.55rem] uppercase tracking-[0.3em] text-slate-500">Customer</dt>
            <dd className="text-sm font-semibold text-slate-900">{customerName}</dd>
          </div>
        </dl>
      </div>

      <div>
        <p className="text-[0.6rem] font-semibold uppercase tracking-[0.3em] text-slate-500">Returned Items</p>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white/80 shadow-sm print:shadow-none">
        <table className="w-full border-collapse text-[0.75rem] print:text-[0.7rem]">
          <thead className="bg-slate-300 text-[0.6rem] uppercase tracking-[0.22em] text-slate-900">
            <tr>
              <th className="border border-slate-400 px-3 py-2 text-left font-bold text-slate-900">Item</th>
              <th className="border border-slate-400 px-3 py-2 text-center font-bold text-slate-900 w-[70px]">Qty</th>
              <th className="border border-slate-400 px-3 py-2 text-center font-bold text-slate-900 w-[80px]">Rate</th>
              <th className="border border-slate-400 px-3 py-2 text-center font-bold text-slate-900 w-[90px]">Value</th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-white">
              <td className="border border-slate-300 px-3 py-2 align-top print:py-1.5">
                <div className="font-semibold text-slate-900">{itemLabel}</div>
              </td>
              <td className="border border-slate-300 px-3 py-2 text-center align-top text-slate-900 font-semibold print:py-1.5 w-[70px]">
                {formatNumber(quantity)}
              </td>
              <td className="border border-slate-300 px-3 py-2 text-center align-top text-slate-900 font-semibold print:py-1.5 w-[80px]">
                {formatPlainAmount(tradePrice)}
              </td>
              <td className="border border-slate-300 px-3 py-2 text-center align-top text-slate-900 font-semibold print:py-1.5 w-[90px]">
                {formatPlainAmount(amount)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex justify-end">
        <div className="w-full max-w-sm overflow-hidden rounded-xl border border-slate-200 bg-white/85 shadow-sm print:max-w-sm print:shadow-none">
          <table className="w-full border-collapse text-[0.75rem] print:text-[0.7rem]">
            <tbody>
              <tr className="border-b border-slate-200 last:border-0">
                <td className="border-l border-slate-200 px-4 py-3 print:px-3 print:py-2 align-top">
                  <div className="text-[0.6rem] font-semibold uppercase tracking-[0.28em] text-slate-500">Quantity Returned</div>
                  <div className="text-sm font-semibold text-slate-900">{formatNumber(totalQuantity)}</div>
                </td>
                <td className="border-l border-slate-200 px-4 py-3 print:px-3 print:py-2 align-top">
                  <div className="text-[0.6rem] font-semibold uppercase tracking-[0.28em] text-slate-500">Average Rate</div>
                  <div className="text-sm font-semibold text-slate-900">{formatPlainAmount(averageRate)}</div>
                </td>
              </tr>
              <tr>
                <td className="border-l border-slate-200 px-4 py-3 print:px-3 print:py-2 align-top">
                  <div className="text-[0.6rem] font-semibold uppercase tracking-[0.28em] text-slate-500">Estimated Value</div>
                  <div className="text-sm font-semibold text-slate-900">{formatPlainAmount(totalValue)}</div>
                </td>
                <td className="border-l border-slate-200 px-4 py-3 print:px-3 print:py-2 align-top">
                  <div className="text-[0.6rem] font-semibold uppercase tracking-[0.28em] text-slate-500">Recorded</div>
                  <div className="text-sm font-semibold text-slate-900">{recordedAt}</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="border-t border-slate-300" />
    </section>
  );
};

const PurchaseReturnPrintLayout = ({ entry, row }) => {
  const returnNo = entry?.return_no || row?.returnNo || "—";
  const invoiceNo = entry?.invoice_no || row?.reference || "—";
  const recordedRaw = entry?.updated_at || entry?.created_at || entry?.return_date;
  const supplierLabel = joinCodeName(entry?.supplier_code, entry?.supplier_name) || row?.entity || "—";
  const itemLabel = joinCodeName(entry?.item_code, entry?.item_name) || row?.item || "—";
  const baseUnit = entry?.base_unit || row?.unit || "";
  const quantity = Number(entry?.quantity ?? row?.quantity ?? 0);
  const purchaseRate = Number(entry?.purchase_rate ?? row?.purchase_rate ?? 0);
  const value = quantity * purchaseRate;

  const formatReportDate = (value) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${day}-${month}-${year}, ${hours}:${minutes}`;
  };

  const dateTimeLabel = formatReportDate(recordedRaw);

  const itemLine = baseUnit ? `${itemLabel} (${baseUnit})` : itemLabel;

  return (
    <section
      className="w-full max-w-3xl text-slate-900 print:w-full print:max-w-none"
      style={{ breakInside: "avoid" }}
    >
      <header className="mb-6 text-center">
        <h2 className="text-base font-semibold uppercase tracking-[0.18em] text-slate-900">Purchase Return Report</h2>
      </header>

      <div className="space-y-3 text-[0.8rem] leading-relaxed text-slate-900">
        <div className="flex flex-wrap items-center gap-x-10 gap-y-1">
          <span className="font-semibold uppercase text-slate-900">Return No. <span className="font-normal normal-case text-slate-800">{returnNo}</span></span>
          <span className="font-semibold uppercase text-slate-900">Invoice <span className="font-normal normal-case text-slate-800">{invoiceNo}</span></span>
        </div>
        <div className="flex flex-wrap items-center gap-x-10 gap-y-1">
          <span className="font-semibold text-slate-900">Date & Time <span className="font-normal text-slate-800">{dateTimeLabel}</span></span>
        </div>
        <div className="font-semibold uppercase text-slate-900">
          Supplier <span className="font-normal normal-case text-slate-800">{supplierLabel}</span>
        </div>
      </div>

      <div
        className="mt-6 overflow-hidden rounded-xl border border-slate-200 print:border-slate-200"
        style={{ borderWidth: "0.35px" }}
      >
        <table className="w-full border-collapse text-[0.75rem]">
          <thead>
            <tr
              className="bg-slate-100 text-[0.7rem] font-semibold uppercase tracking-wide text-slate-800 print:bg-slate-200"
              style={{ backgroundColor: "#f1f5f9", WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}
            >
              <th
                className="border border-slate-200 px-3 py-2 text-left print:border-slate-200"
                style={{ borderWidth: "0.35px" }}
              >
                Sr. No
              </th>
              <th
                className="border border-slate-200 px-3 py-2 text-left print:border-slate-200"
                style={{ borderWidth: "0.35px" }}
              >
                Items
              </th>
              <th
                className="border border-slate-200 px-3 py-2 text-center print:border-slate-200"
                style={{ borderWidth: "0.35px" }}
              >
                Returned
              </th>
              <th
                className="border border-slate-200 px-3 py-2 text-center print:border-slate-200"
                style={{ borderWidth: "0.35px" }}
              >
                Purchase Rate
              </th>
              <th
                className="border border-slate-200 px-3 py-2 text-center print:border-slate-200"
                style={{ borderWidth: "0.35px" }}
              >
                Value
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-white">
              <td
                className="border border-slate-200 px-3 py-2 text-center font-semibold text-slate-900 print:border-slate-200"
                style={{ borderWidth: "0.35px" }}
              >
                1
              </td>
              <td
                className="border border-slate-200 px-3 py-2 text-slate-900 print:border-slate-200"
                style={{ borderWidth: "0.35px" }}
              >
                <div className="font-semibold text-slate-900">{itemLine}</div>
              </td>
              <td
                className="border border-slate-200 px-3 py-2 text-center font-semibold text-slate-900 print:border-slate-200"
                style={{ borderWidth: "0.35px" }}
              >
                {formatNumber(quantity)}
              </td>
              <td
                className="border border-slate-200 px-3 py-2 text-center font-semibold text-slate-900 print:border-slate-200"
                style={{ borderWidth: "0.35px" }}
              >
                {formatPlainAmount(purchaseRate)}
              </td>
              <td
                className="border border-slate-200 px-3 py-2 text-center font-semibold text-slate-900 print:border-slate-200"
                style={{ borderWidth: "0.35px" }}
              >
                {formatPlainAmount(value)}
              </td>
            </tr>
            <tr className="bg-slate-50 font-semibold text-slate-900">
              <td
                className="border border-slate-200 px-3 py-2 text-right print:border-slate-200"
                style={{ borderWidth: "0.35px" }}
                colSpan={4}
              >
                Total Value
              </td>
              <td
                className="border border-slate-200 px-3 py-2 text-center print:border-slate-200"
                style={{ borderWidth: "0.35px" }}
              >
                {formatPlainAmount(value)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
};

const joinCodeName = (code, name) => {
  if (code && name) return `${code} — ${name}`;
  if (code) return code;
  if (name) return name;
  return "—";
};

const HISTORY_CONFIG = {
  purchase: {
    label: "Purchase Entries",
    title: "Saved Purchase Invoices",
    description: "Most recent supplier purchase invoices stored in the system.",
    endpoint: "/purchases",
    params: { limit: 200 },
    entryPath: "/transactions/purchase",
    search: {
      label: "Invoice",
      placeholder: "Invoice no.",
      fields: ["invoiceNo", "reference"]
    },
    columns: [
      { key: "reference", label: "Invoice" },
      { key: "entity", label: "Supplier" },
      { key: "date", label: "Invoice Date" },
      { key: "amount", label: "Total Amount", align: "right", format: formatCurrency },
      { key: "recorded", label: "Recorded", render: (row) => formatDateTime(row.recorded) }
    ],
    transform: (row) => ({
      id: row.id ?? `purchase-${row.invoice_no}`,
      reference: row.invoice_no || "—",
      entity: joinCodeName(row.supplier_code, row.supplier_name),
      date: row.invoice_date || "—",
      amount: Number(row.total_amount ?? 0),
      recorded: row.updated_at || row.created_at,
      invoiceNo: row.invoice_no || null
    }),
    detail: {
      makeQueryKey: (row) => ["purchase-detail", row.invoiceNo ?? row.reference],
      fetch: async (row) => {
        const invoice = row.invoiceNo || row.reference;
        if (!invoice || invoice === "—") return null;
        const response = await api.get(`/purchases/${encodeURIComponent(invoice)}`);
        return response.data;
      },
      render: ({ row, data }) => {
        if (!data?.purchase) {
          return <p className="text-sm text-slate-500">Details not available for this invoice.</p>;
        }

        const { purchase, items = [] } = data;
        const totals = {
          amount: Number(purchase.total_amount ?? 0),
          paid: Number(purchase.amount_paid ?? 0),
          previous: Number(purchase.previous_balance ?? 0)
        };

        return (
          <PrintableDetail title="Purchase Invoice">
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Invoice</p>
                <p className="font-medium text-slate-800">{purchase.invoice_no}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Invoice Date</p>
                <p className="font-medium text-slate-800">{purchase.invoice_date || "—"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Supplier</p>
                <p className="font-medium text-slate-800">{row?.entity || joinCodeName(purchase.supplier_code, purchase.supplier_name)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Recorded</p>
                <p className="font-medium text-slate-800">{formatDateTime(purchase.updated_at || purchase.created_at)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Total Amount</p>
                <p className="font-medium text-slate-800">{formatCurrency(totals.amount)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Amount Paid</p>
                <p className="font-medium text-slate-800">{formatCurrency(totals.paid)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Previous Balance</p>
                <p className="font-medium text-slate-800">{formatCurrency(totals.previous)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Net Payable</p>
                <p className="font-medium text-slate-800">{formatCurrency(totals.amount - totals.paid + totals.previous)}</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm text-slate-700">
                <thead className="bg-slate-100 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Item</th>
                    <th className="px-3 py-2 text-right">Quantity</th>
                    <th className="px-3 py-2 text-right">Bonus</th>
                    <th className="px-3 py-2 text-right">Purchase Rate</th>
                    <th className="px-3 py-2 text-right">Discount %</th>
                    <th className="px-3 py-2 text-right">Line Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-4 text-center text-slate-500">
                        No items recorded on this invoice.
                      </td>
                    </tr>
                  ) : (
                    items.map((item) => {
                      const quantity = Number(item.quantity ?? 0);
                      const bonus = Number(item.bonus ?? 0);
                      const rate = Number(item.rate ?? item.purchase_rate ?? 0);
                      const discountPercent = Number(item.discount_percent ?? 0);
                      const lineTotal = Number(item.net ?? item.net_amount ?? quantity * rate * (1 - discountPercent / 100));
                      return (
                        <tr key={item.id ?? `${item.item_code}-${item.item_name}`} className="hover:bg-slate-50">
                          <td className="px-3 py-2">
                            <p className="font-medium text-slate-800">{item.item_code} — {item.item_name}</p>
                            <p className="text-xs text-slate-500">{item.base_unit || ""}</p>
                          </td>
                          <td className="px-3 py-2 text-right">{quantity}</td>
                          <td className="px-3 py-2 text-right">{bonus}</td>
                          <td className="px-3 py-2 text-right">{formatCurrency(rate)}</td>
                          <td className="px-3 py-2 text-right">{discountPercent.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right">{formatCurrency(lineTotal)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </PrintableDetail>
        );
      }
    }
  },
  sales: {
    label: "Sales Entries",
    title: "Saved Sales Invoices",
    description: "Customer sales invoices and collected amounts.",
    endpoint: "/sales",
    params: { limit: 200 },
    entryPath: "/transactions/sales",
    search: {
      label: "Invoice",
      placeholder: "Invoice no.",
      fields: ["invoiceNo", "reference"]
    },
    columns: [
      { key: "reference", label: "Invoice" },
      { key: "entity", label: "Customer" },
      { key: "salesman", label: "Salesman" },
      { key: "date", label: "Invoice Date" },
      { key: "amount", label: "Total Amount", align: "right", format: formatCurrency },
      { key: "received", label: "Amount Paid", align: "right", format: formatCurrency }
    ],
    transform: (row) => ({
      id: row.id ?? `sale-${row.invoice_no}`,
      reference: row.invoice_no || "—",
      entity: joinCodeName(row.customer_code, row.customer_name),
      salesman: joinCodeName(row.salesman_code, row.salesman_name),
      date: row.invoice_date || "—",
      amount: Number(row.total_amount ?? 0),
      received: Number(row.amount_paid ?? 0),
      invoiceNo: row.invoice_no || null,
      customerPhone: row.customer_phone || row.customer_phone1 || null,
      customerAddress: row.customer_address || null
    }),
    detail: {
      makeQueryKey: (row) => ["sales-detail", row.invoiceNo ?? row.reference],
      fetch: async (row) => {
        const invoice = row.invoiceNo || row.reference;
        if (!invoice) return null;
        const response = await api.get(`/sales/${encodeURIComponent(invoice)}`);
        return response.data;
      },
      render: ({ row, data }) => {
        if (!data?.sale) {
          return <p className="text-sm text-slate-500">Details not available for this invoice.</p>;
        }

        const { sale, items = [] } = data;

        return (
          <PrintableDetail title="Sales Invoice">
            <OnScreenSalesDetail sale={sale} items={items} row={row} />
            <div className="hidden print:block">
              <SalesInvoicePrintLayout sale={sale} items={items} row={row} />
            </div>
          </PrintableDetail>
        );
      }
    }
  },
  "sale-return": {
    label: "Sale Returns",
    title: "Saved Sale Returns",
    description: "Returns recorded against customer invoices.",
    endpoint: "/sale-returns",
    params: { limit: 200 },
    entryPath: "/transactions/sale-return",
    search: {
      label: "Invoice",
      placeholder: "Invoice no.",
      fields: ["invoiceNo", "reference"]
    },
    columns: [
      { key: "reference", label: "Invoice" },
      { key: "entity", label: "Customer" },
      { key: "item", label: "Item" },
      { key: "date", label: "Return Date" },
      { key: "quantity", label: "Quantity", align: "right", format: formatNumber },
      { key: "value", label: "Estimated Value", align: "right", format: formatCurrency }
    ],
    transform: (row) => {
      const quantity = Number(row.quantity ?? 0);
      const tradePrice = Number(row.trade_price ?? 0);
      return {
        id: row.id ?? `sale-return-${row.invoice_no ?? ""}-${row.id ?? Math.random()}`,
        reference: row.invoice_no || "—",
        entity: joinCodeName(row.customer_code, row.customer_name),
        item: joinCodeName(row.item_code, row.item_name),
        date: row.return_date || "—",
        quantity,
        value: quantity * tradePrice,
        invoiceNo: row.invoice_no || null
      };
    },
    detail: {
      makeQueryKey: (row) => ["sale-return-detail", row.id],
      fetch: async (row) => row.raw || row,
      render: ({ row, data }) => {
        if (!data) {
          return <p className="text-sm text-slate-500">Details not available for this return.</p>;
        }
        const entry = data.raw || data;
        return (
          <PrintableDetail title="Sale Return">
            <OnScreenSaleReturnDetail entry={entry} row={row} />
            <div className="hidden print:block">
              <SalesReturnPrintLayout entry={entry} row={row} />
            </div>
          </PrintableDetail>
        );
      }
    }
  },
  "purchase-return": {
    label: "Purchase Returns",
    title: "Saved Purchase Returns",
    description: "Returns logged against supplier invoices.",
    endpoint: "/purchase-returns",
    params: { limit: 200 },
    entryPath: "/transactions/purchase-return",
    search: {
      label: "Invoice",
      placeholder: "Invoice no.",
      fields: ["returnNo", "invoiceNo", "reference"]
    },
    columns: [
      { key: "returnNo", label: "Return No." },
      { key: "reference", label: "Invoice" },
      { key: "entity", label: "Supplier" },
      { key: "item", label: "Item" },
      { key: "date", label: "Return Date" },
      { key: "quantity", label: "Quantity", align: "right", format: formatNumber },
      { key: "value", label: "Estimated Value", align: "right", format: formatCurrency }
    ],
    transform: (row) => {
      const quantity = Number(row.quantity ?? 0);
      const rate = Number(row.purchase_rate ?? 0);
      return {
        id: row.return_no || row.id || `purchase-return-${row.invoice_no ?? ""}-${row.id ?? Math.random()}`,
        returnNo: row.return_no || "—",
        reference: row.invoice_no || "—",
        entity: joinCodeName(row.supplier_code, row.supplier_name),
        item: joinCodeName(row.item_code, row.item_name),
        date: row.return_date || "—",
        quantity,
        value: quantity * rate,
        invoiceNo: row.invoice_no || null
      };
    },
    detail: {
      makeQueryKey: (row) => ["purchase-return-detail", row.id],
      fetch: async (row) => row.raw || row,
      render: ({ row, data }) => {
        if (!data) {
          return <p className="text-sm text-slate-500">Details not available for this return.</p>;
        }
        const quantity = Number(data.quantity ?? row.quantity ?? 0);
        const rate = Number(data.purchase_rate ?? row.purchase_rate ?? 0);
        const amount = quantity * rate;
        const returnNo = data.return_no || row.returnNo || "—";
        const invoiceNo = data.invoice_no || row.reference || "—";
        const recordedAt = formatDateTime(data.updated_at || data.created_at);
        const returnDateRaw = data.return_date || row.date || "";
        const returnDate = returnDateRaw ? toDisplay(returnDateRaw) : "—";
        const supplierLabel = joinCodeName(data.supplier_code, data.supplier_name) || row.entity;
        const itemLabel = joinCodeName(data.item_code, data.item_name) || row.item;
        const baseUnit = data.base_unit || row.unit || "";
        const itemLine = baseUnit ? `${itemLabel} (${baseUnit})` : itemLabel;
        return (
          <PrintableDetail title="Purchase Return">
            <div className="space-y-6 print:hidden">
              <div className="grid gap-4 text-sm text-slate-700 sm:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Return No.</p>
                  <p className="font-semibold text-slate-900">{returnNo}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Invoice</p>
                  <p className="font-semibold text-slate-900">{invoiceNo}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Return Date</p>
                  <p className="font-semibold text-slate-900">{returnDate}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Recorded</p>
                  <p className="font-semibold text-slate-900">{recordedAt}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Supplier</p>
                  <p className="font-semibold text-slate-900">{supplierLabel}</p>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-700">
                    <tr>
                      <th className="border-b border-slate-300 px-3 py-2 text-left">Sr. No</th>
                      <th className="border-b border-slate-300 px-3 py-2 text-left">Items</th>
                      <th className="border-b border-slate-300 px-3 py-2 text-right">Returned</th>
                      <th className="border-b border-slate-300 px-3 py-2 text-right">Purchase Rate</th>
                      <th className="border-b border-slate-300 px-3 py-2 text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="text-slate-900">
                      <td className="border-b border-slate-200 px-3 py-2 font-semibold">1</td>
                      <td className="border-b border-slate-200 px-3 py-2 font-semibold">{itemLine}</td>
                      <td className="border-b border-slate-200 px-3 py-2 text-right font-semibold">{formatNumber(quantity)}</td>
                      <td className="border-b border-slate-200 px-3 py-2 text-right font-semibold">{formatPlainAmount(rate)}</td>
                      <td className="border-b border-slate-200 px-3 py-2 text-right font-semibold">{formatPlainAmount(amount)}</td>
                    </tr>
                    <tr className="bg-slate-100 text-slate-900">
                      <td className="px-3 py-2 text-right font-semibold" colSpan={4}>Total Value</td>
                      <td className="px-3 py-2 text-right font-semibold">{formatPlainAmount(amount)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div className="hidden print:block">
              <PurchaseReturnPrintLayout entry={data} row={row} />
            </div>
          </PrintableDetail>
        );
      }
    }
  },
  expense: {
    label: "Expense Entries",
    title: "Saved Expenses",
    description: "Voucher-wise expense payments recorded.",
    endpoint: "/expense-entries",
    params: { limit: 200 },
    entryPath: "/transactions/expense-entry",
    search: {
      label: "Voucher",
      placeholder: "Voucher no.",
      fields: ["voucherNo", "reference"]
    },
    columns: [
      { key: "reference", label: "Voucher" },
      { key: "entity", label: "Expense" },
      { key: "date", label: "Voucher Date" },
      { key: "amount", label: "Cash Payment", align: "right", format: formatCurrency },
      { key: "recorded", label: "Recorded", render: (row) => formatDateTime(row.recorded) }
    ],
    transform: (row) => ({
      id: row.id ?? `expense-${row.voucher_no}`,
      reference: row.voucher_no || "—",
      entity: joinCodeName(row.expense_code, row.expense_description),
      date: row.voucher_date || "—",
      amount: Number(row.cash_payment ?? 0),
      recorded: row.updated_at || row.created_at,
      voucherNo: row.voucher_no || null
    }),
    detail: {
      makeQueryKey: (row) => ["expense-detail", row.voucherNo ?? row.reference],
      fetch: async (row) => {
        const voucher = row.voucherNo || row.reference;
        if (!voucher || voucher === "—") return null;
        const response = await api.get(`/expense-entries/${encodeURIComponent(voucher)}`);
        return response.data;
      },
      render: ({ row, data }) => {
        if (!data) {
          return <p className="text-sm text-slate-500">Details not available for this voucher.</p>;
        }
        return (
          <PrintableDetail title="Expense Voucher">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Voucher No.</p>
              <p className="font-medium text-slate-800">{data.voucher_no || row.reference}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Voucher Date</p>
              <p className="font-medium text-slate-800">{data.voucher_date || row.date || "—"}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs uppercase tracking-wide text-slate-500">Expense</p>
              <p className="font-medium text-slate-800">{joinCodeName(data.expense_code, data.expense_description) || row.entity}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Cash Payment</p>
              <p className="font-medium text-slate-800">{formatCurrency(data.cash_payment ?? row.amount)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Recorded</p>
              <p className="font-medium text-slate-800">{formatDateTime(data.updated_at || data.created_at)}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs uppercase tracking-wide text-slate-500">Details</p>
              <p className="font-medium text-slate-800 whitespace-pre-wrap">{data.details || "—"}</p>
            </div>
          </PrintableDetail>
        );
      }
    }
  },
  "customer-receipt": {
    label: "Customer Receipts",
    title: "Saved Customer Receipts",
    description: "Payments collected from customers across all modes.",
    endpoint: "/customer-receipts",
    params: { limit: 200 },
    entryPath: "/transactions/customer-receipt",
    search: {
      label: "Receipt",
      placeholder: "Receipt no.",
      fields: ["receiptNo", "reference"]
    },
    columns: [
      { key: "reference", label: "Receipt" },
      { key: "entity", label: "Customer" },
      { key: "mode", label: "Mode" },
      { key: "date", label: "Receipt Date" },
      { key: "bank", label: "Bank" },
      { key: "amount", label: "Amount", align: "right", format: formatCurrency }
    ],
    transform: (row) => ({
      id: row.id ?? `customer-receipt-${row.receipt_no}`,
      reference: row.receipt_no || "—",
      entity: joinCodeName(row.customer_code, row.customer_name),
      mode: (row.payment_mode || "").toUpperCase() || "—",
      date: row.receipt_date || "—",
      bank: joinCodeName(row.bank_code, row.bank_name),
      amount: Number(row.amount ?? 0),
      receiptNo: row.receipt_no || null
    }),
    detail: {
      makeQueryKey: (row) => ["customer-receipt-detail", row.receiptNo ?? row.reference],
      fetch: async (row) => {
        const receipt = row.receiptNo || row.reference;
        if (!receipt || receipt === "—") return null;
        const response = await api.get(`/customer-receipts/${encodeURIComponent(receipt)}`);
        return response.data;
      },
      render: ({ row, data }) => {
        if (!data) {
          return <p className="text-sm text-slate-500">Details not available for this receipt.</p>;
        }
        return (
          <PrintableDetail title="Customer Receipt">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Receipt No.</p>
              <p className="font-medium text-slate-800">{data.receiptNo || row.reference}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Receipt Date</p>
              <p className="font-medium text-slate-800">{data.receiptDate || row.date || "—"}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Customer</p>
              <p className="font-medium text-slate-800">{joinCodeName(data.customer?.code, data.customer?.name) || row.entity}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Salesman</p>
              <p className="font-medium text-slate-800">{joinCodeName(data.salesman?.code, data.salesman?.name) || "—"}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Payment Mode</p>
              <p className="font-medium text-slate-800">{(data.paymentMode || row.mode || "—").toUpperCase()}</p>
            </div>
            {(data.bank?.code || data.bank?.name) ? (
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Bank</p>
                <p className="font-medium text-slate-800">{joinCodeName(data.bank?.code, data.bank?.name) || row.bank || "—"}</p>
              </div>
            ) : null}
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Amount</p>
              <p className="font-medium text-slate-800">{formatCurrency(data.amount ?? row.amount)}</p>
            </div>
            {(data.slipNo || data.slipDate) ? (
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Reference</p>
                <p className="font-medium text-slate-800">{data.slipNo || "—"} {data.slipDate ? `• ${data.slipDate}` : ""}</p>
              </div>
            ) : null}
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Recorded</p>
              <p className="font-medium text-slate-800">{formatDateTime(data.updatedAt || data.createdAt)}</p>
            </div>
            {data.attachmentImage ? (
              <div className="sm:col-span-2 bg-slate-50 p-4 rounded-lg border border-slate-200">
                <p className="text-xs uppercase tracking-wide text-slate-500 mb-3">Attached Image</p>
                <img
                  src={data.attachmentImage}
                  alt="Receipt attachment"
                  className="h-40 w-auto rounded-lg border border-slate-200 cursor-pointer hover:opacity-80"
                  onClick={() => {
                    const modal = document.createElement('div');
                    modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4';
                    modal.onclick = () => modal.remove();
                    const img = document.createElement('img');
                    img.src = data.attachmentImage;
                    img.className = 'max-w-full max-h-full rounded-lg';
                    modal.appendChild(img);
                    document.body.appendChild(modal);
                  }}
                />
              </div>
            ) : null}
            <div className="sm:col-span-2">
              <p className="text-xs uppercase tracking-wide text-slate-500">Details</p>
              <p className="font-medium text-slate-800 whitespace-pre-wrap">{data.details || "—"}</p>
            </div>
          </PrintableDetail>
        );
      }
    }
  },
  "supplier-payment": {
    label: "Supplier Payments",
    title: "Recorded Supplier Payments",
    description: "Payments issued to suppliers against outstanding balances.",
    endpoint: "/supplier-payments",
    params: { limit: 200 },
    entryPath: "/transactions/supplier-payment",
    search: {
      label: "Payment",
      placeholder: "Payment no.",
      fields: ["paymentNo", "reference", "slipNo"]
    },
    columns: [
      { key: "reference", label: "Payment" },
      { key: "entity", label: "Supplier" },
      { key: "date", label: "Payment Date" },
      {
        key: "mode",
        label: "Mode",
        render: (row) => formatPaymentMode(row.mode)
      },
      { key: "bank", label: "Bank" },
      { key: "amount", label: "Amount", align: "right", format: formatCurrency }
    ],
    transform: (row) => ({
      id: row.id ?? `supplier-payment-${row.payment_no || row.created_at || ""}`,
      reference: row.payment_no || "—",
      entity: joinCodeName(row.supplier_code, row.supplier_name),
      date: row.payment_date || "—",
      amount: Number(row.amount ?? 0),
      paymentNo: row.payment_no || null,
      mode: (row.payment_mode || "cash").toLowerCase(),
      bank: joinCodeName(row.bank_code, row.bank_name),
      slipNo: row.slip_no || null,
      slipDate: row.slip_date || null,
      raw: row
    }),
    detail: {
      makeQueryKey: (row) => ["supplier-payment-detail", row.paymentNo ?? row.reference],
      fetch: async (row) => row.raw || row,
      render: ({ row, data }) => {
        const payment = data || row.raw || row;
        if (!payment) {
          return <p className="text-sm text-slate-500">Details not available for this payment.</p>;
        }
        const amount = Number(payment.amount ?? row.amount ?? 0);
        const paymentMode = formatPaymentMode(payment.payment_mode || row.mode);
        const bankLabel = joinCodeName(payment.bank_code, payment.bank_name) || row.bank || "—";
        const referenceValue = payment.slip_no || row.slipNo || "";
        const slipDateValue = payment.slip_date || row.slipDate || "";
        const showBank = paymentMode !== "Cash" && bankLabel !== "—";
        const showReference = paymentMode !== "Cash" && referenceValue;
        const showSlipDate = paymentMode === "Bank Transaction" && slipDateValue;
        const referenceLabel = paymentMode === "Online" ? "Transaction Reference" : "Slip No.";
        return (
          <PrintableDetail title="Supplier Payment">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Payment No.</p>
              <p className="font-medium text-slate-800">{payment.payment_no || row.reference}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Payment Date</p>
              <p className="font-medium text-slate-800">{payment.payment_date || row.date || "—"}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Supplier</p>
              <p className="font-medium text-slate-800">{joinCodeName(payment.supplier_code, payment.supplier_name) || row.entity}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Payment Mode</p>
              <p className="font-medium text-slate-800">{paymentMode}</p>
            </div>
            {showBank ? (
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Bank</p>
                <p className="font-medium text-slate-800">{bankLabel}</p>
              </div>
            ) : null}
            {showReference ? (
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">{referenceLabel}</p>
                <p className="font-medium text-slate-800">{referenceValue}</p>
              </div>
            ) : null}
            {showSlipDate ? (
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Slip Date</p>
                <p className="font-medium text-slate-800">{slipDateValue}</p>
              </div>
            ) : null}
            {payment.attachment_image ? (
              <div className="sm:col-span-2">
                <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">Attached Image</p>
                <img
                  src={payment.attachment_image}
                  alt="Payment attachment"
                  className="h-24 w-auto rounded-lg border border-slate-200 cursor-pointer hover:opacity-80"
                  onClick={() => {
                    const modal = document.createElement('div');
                    modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4';
                    modal.onclick = () => modal.remove();
                    const img = document.createElement('img');
                    img.src = payment.attachment_image;
                    img.className = 'max-w-full max-h-full rounded-lg';
                    modal.appendChild(img);
                    document.body.appendChild(modal);
                  }}
                />
              </div>
            ) : null}
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Recorded</p>
              <p className="font-medium text-slate-800">{formatDateTime(payment.updated_at || payment.created_at)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Amount Paid</p>
              <p className="font-medium text-slate-800">{formatCurrency(amount)}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs uppercase tracking-wide text-slate-500">Notes</p>
              <p className="font-medium text-slate-800 whitespace-pre-wrap">{payment.details || "—"}</p>
            </div>
          </PrintableDetail>
        );
      }
    }
  },
  "salesman-receipt": {
    label: "Salesman Receipts",
    title: "Saved Salesman Receipts",
    description: "Collections submitted by salesmen with customer tallies.",
    endpoint: "/salesman-receipts",
    params: { limit: 200 },
    entryPath: "/transactions/salesman-receipt",
    search: {
      label: "Receipt",
      placeholder: "Receipt no.",
      fields: ["receiptNo", "reference"]
    },
    columns: [
      { key: "reference", label: "Receipt" },
      { key: "entity", label: "Salesman" },
      { key: "date", label: "Receipt Date" },
      { key: "customers", label: "Customers", align: "right", format: formatNumber },
      { key: "amount", label: "Amount Received", align: "right", format: formatCurrency }
    ],
    transform: (row) => ({
      id: row.id ?? `salesman-receipt-${row.receipt_no}`,
      reference: row.receipt_no || "—",
      entity: joinCodeName(row.salesman_code, row.salesman_name),
      date: row.receipt_date || "—",
      customers: Number(row.customer_count ?? 0),
      amount: Number(row.total_received ?? 0),
      receiptNo: row.receipt_no || null
    }),
    detail: {
      makeQueryKey: (row) => ["salesman-receipt-detail", row.id],
      fetch: async (row) => row.raw || row,
      render: ({ row, data }) => {
        if (!data) {
          return <p className="text-sm text-slate-500">Details not available for this receipt.</p>;
        }
        return (
          <PrintableDetail title="Salesman Receipt">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Receipt No.</p>
              <p className="font-medium text-slate-800">{data.receipt_no || row.reference}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Receipt Date</p>
              <p className="font-medium text-slate-800">{data.receipt_date || row.date || "—"}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Salesman</p>
              <p className="font-medium text-slate-800">{joinCodeName(data.salesman_code, data.salesman_name) || row.entity}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Customers Covered</p>
              <p className="font-medium text-slate-800">{formatNumber(data.customer_count ?? row.customers ?? 0)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Total Received</p>
              <p className="font-medium text-slate-800">{formatCurrency(data.total_received ?? row.amount)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Recorded</p>
              <p className="font-medium text-slate-800">{formatDateTime(data.updated_at || data.created_at)}</p>
            </div>
          </PrintableDetail>
        );
      }
    }
  },
  "bank-deposit": {
    label: "Bank Statements",
    title: "Saved Bank Statements",
    description: "Bank statements showing deposits and drawings recorded against bank accounts.",
    endpoint: "/reports/bank-deposits",
    params: { limit: 200 },
    entryPath: "/transactions/bank",
    search: {
      label: "Entry",
      placeholder: "Entry / slip / reference",
      resolve: (row) => [
        row.entryNo || null,
        row.reference || null,
        row.transactionId != null ? String(row.transactionId) : null,
        row.slipNo || null,
        row.supplierPaymentNo || null
      ].filter(Boolean),
      emptyMessage: "Provide an entry, slip, or reference number to search.",
      noRowsMessage: "No bank statements are loaded yet.",
      notFoundMessage: (value) => `No bank statement matches ${value}.`
    },
    columns: [
      { key: "entryNo", label: "Entry No." },
      {
        key: "transactionType",
        label: "Type",
        render: (row) => formatTransactionType(row.transactionType)
      },
      { key: "reference", label: "Slip / Reference" },
      { key: "entity", label: "Bank" },
      { key: "date", label: "Date" },
      { key: "origin", label: "Source" },
      { key: "amount", label: "Amount", align: "right", format: formatCurrency }
    ],
    transform: (row) => ({
      id: row.id ?? `bank-deposit-${row.slip_no || row.id}`,
      entryNo: row.entry_no || null,
      reference: row.supplier_payment_no || row.slip_no || `Txn ${row.entry_no || row.id}`,
      slipNo: row.slip_no || null,
      entity: joinCodeName(row.bank_code, row.bank_name),
      date: row.transaction_date || row.slip_date || "—",
      origin: row.customer_receipt_no
        ? `Receipt ${row.customer_receipt_no}`
        : row.supplier_payment_no
          ? `Supplier payment ${row.supplier_payment_no}`
          : "Manual Entry",
      amount: Number(row.cash_amount ?? 0),
      transactionId: row.id ?? null,
      transactionType: (row.transaction_type || "deposit").toLowerCase(),
      supplierPaymentNo: row.supplier_payment_no || null
    }),
    detail: {
      makeQueryKey: (row) => ["bank-deposit-detail", row.id],
      fetch: async (row) => row.raw || row,
      render: ({ row, data }) => {
        if (!data) {
          return <p className="text-sm text-slate-500">Details not available for this deposit.</p>;
        }
        const detailType = formatTransactionType(data.transaction_type || row.transactionType);
        const detailTitle = detailType === "Drawing" ? "Bank Drawing" : "Bank Deposit";
        return (
          <PrintableDetail title={detailTitle}>
            <OnScreenBankTransactionDetail transaction={data} row={row} />
            <div className="hidden print:block">
              <BankTransactionPrintLayout transaction={data} row={row} title={detailTitle} />
            </div>
          </PrintableDetail>
        );
      }
    }
  }
};

const HISTORY_OPTIONS = Object.entries(HISTORY_CONFIG).map(([value, config]) => ({
  value,
  label: config.label
}));

const TransactionHistoryPage = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const rawType = (params.get("type") || DEFAULT_TYPE).toLowerCase();
  const config = HISTORY_CONFIG[rawType];
  const [expandedId, setExpandedId] = useState(null);
  const [searchValue, setSearchValue] = useState("");
  const [searchMessage, setSearchMessage] = useState(null);
  const detailConfig = config?.detail;
  const hasDetail = Boolean(detailConfig);
  const searchConfig = config?.search ?? null;
  const hasSearch = Boolean(searchConfig);

  const searchLabel = searchConfig?.label ?? "Reference";
  const searchPlaceholder = searchConfig?.placeholder ?? `${searchLabel} no.`;
  const searchEmptyMessage = hasSearch
    ? (typeof searchConfig?.emptyMessage === "function"
      ? searchConfig.emptyMessage()
      : searchConfig?.emptyMessage ?? `Enter a ${searchLabel.toLowerCase()} to search.`)
    : "";
  const typeLabel = config?.label ? config.label.toLowerCase() : "entries";
  const searchNoRowsMessage = hasSearch
    ? (typeof searchConfig?.noRowsMessage === "function"
      ? searchConfig.noRowsMessage()
      : searchConfig?.noRowsMessage ?? `No ${typeLabel} are loaded yet.`)
    : "";
  const makeNotFoundMessage = (value = "") => {
    if (!hasSearch) return "";
    if (typeof searchConfig?.notFoundMessage === "function") {
      return searchConfig.notFoundMessage(value);
    }
    if (typeof searchConfig?.notFoundMessage === "string") {
      if (searchConfig.notFoundMessage.includes("{value}")) {
        return searchConfig.notFoundMessage.replace("{value}", value);
      }
      return searchConfig.notFoundMessage;
    }
    return `${searchLabel} ${value} not found in recent records.`;
  };

  const getRowTokens = (row) => {
    if (!hasSearch || !row) return [];
    if (typeof searchConfig?.resolve === "function") {
      const resolved = searchConfig.resolve(row);
      if (Array.isArray(resolved)) return resolved;
      if (resolved == null) return [];
      return [resolved];
    }
    const fields = Array.isArray(searchConfig?.fields) && searchConfig.fields.length > 0
      ? searchConfig.fields
      : ["reference"];
    const tokens = [];
    fields.forEach((field) => {
      const value = row[field];
      if (Array.isArray(value)) {
        value.forEach((entry) => {
          if (entry != null && entry !== "") {
            tokens.push(entry);
          }
        });
      } else if (value != null && value !== "") {
        tokens.push(value);
      }
    });
    return tokens;
  };

  useEffect(() => {
    setExpandedId(null);
    setSearchValue("");
    setSearchMessage(null);
  }, [rawType]);

  const historyQuery = useQuery({
    queryKey: ["transaction-history", rawType, config?.endpoint, config?.params],
    enabled: Boolean(config),
    queryFn: async () => {
      const response = await api.get(config.endpoint, { params: config.params });
      const payload = Array.isArray(response.data) ? response.data : [];
      return payload.map((row, index) => {
        const transformed = config.transform ? config.transform(row, index) : row;
        const shaped = { ...transformed, raw: row };
        if (shaped.id == null) {
          shaped.id = `${rawType}-${index}`;
        }
        return shaped;
      });
    }
  });

  const rows = historyQuery.data ?? [];
  const columns = config?.columns ?? [];
  const columnCount = columns.length + (hasDetail ? 1 : 0);

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    if (!hasSearch) return;
    const query = searchValue.trim();
    if (!query) {
      setSearchMessage(searchEmptyMessage);
      return;
    }
    if (rows.length === 0) {
      setSearchMessage(searchNoRowsMessage);
      return;
    }
    const normalized = query.toLowerCase();
    const normalizeTokens = (row) =>
      getRowTokens(row)
        .map((value) => String(value).trim().toLowerCase())
        .filter(Boolean);

    const exactMatch = rows.find((row) => {
      const tokens = normalizeTokens(row);
      return tokens.some((token) => token === normalized);
    });
    if (exactMatch) {
      setExpandedId(exactMatch.id);
      setSearchMessage(null);
      return;
    }

    const partialMatch = rows.find((row) => {
      const tokens = normalizeTokens(row);
      return tokens.some((token) => token.includes(normalized));
    });
    if (partialMatch) {
      setExpandedId(partialMatch.id);
      setSearchMessage(null);
      return;
    }

    setSearchMessage(makeNotFoundMessage(query));
  };

  useEffect(() => {
    if (expandedId && !rows.some((row) => row.id === expandedId)) {
      setExpandedId(null);
    }
  }, [rows, expandedId]);

  const expandedRow = useMemo(() => rows.find((row) => row.id === expandedId), [rows, expandedId]);

  const detailQueryKey = useMemo(() => {
    if (!detailConfig || !expandedRow) return null;
    return detailConfig.makeQueryKey(expandedRow);
  }, [detailConfig, expandedRow]);

  const detailQuery = useQuery({
    queryKey: detailQueryKey ?? ["transaction-detail", rawType, "idle"],
    queryFn: async () => {
      if (!detailConfig || !expandedRow) return null;
      return detailConfig.fetch(expandedRow);
    },
    enabled: Boolean(detailQueryKey)
  });

  const detailElement = useMemo(() => {
    if (!detailConfig || !expandedRow) return null;
    const detailData = detailQuery.data ?? expandedRow.raw ?? null;
    const errorMessage = detailQuery.error
      ? detailQuery.error?.message || detailQuery.error?.toString?.() || "Unknown error"
      : null;

    if (detailQuery.isLoading && !detailData) {
      return <p className="text-sm text-slate-500">Loading full details…</p>;
    }

    if (!detailData) {
      if (errorMessage) {
        return <p className="text-sm text-rose-500">Unable to load details: {errorMessage}</p>;
      }
      return <p className="text-sm text-slate-500">No additional details available.</p>;
    }

    const rendered = detailConfig.render ? (
      detailConfig.render({ row: expandedRow, data: detailData, error: detailQuery.error })
    ) : (
      <pre className="text-xs bg-slate-900 text-slate-100 rounded-xl p-3 overflow-x-auto">
        {JSON.stringify(detailData, null, 2)}
      </pre>
    );

    if (errorMessage) {
      return (
        <div className="space-y-3">
          <p className="text-xs text-rose-500">Showing cached information due to an error: {errorMessage}</p>
          {rendered}
        </div>
      );
    }

    return rendered;
  }, [detailConfig, detailQuery.data, detailQuery.error, detailQuery.isLoading, expandedRow]);

  const handleToggleRow = (rowId) => {
    setExpandedId((current) => (current === rowId ? null : rowId));
  };

  const handleTypeChange = (event) => {
    const nextType = event.target.value;
    navigate(`/history/transactions?type=${nextType}`);
  };

  const actionControls = config ? (
    <div className="flex flex-wrap items-center gap-3 print:hidden">
      {hasSearch ? (
        <form className="flex items-center gap-2" onSubmit={handleSearchSubmit}>
          <input
            className="w-32 rounded-lg border border-slate-300 px-2 py-1 text-xs"
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(event) => {
              setSearchValue(event.target.value);
              if (searchMessage) {
                setSearchMessage(null);
              }
            }}
          />
          <button type="submit" className="secondary text-xs px-3 py-1">
            Search
          </button>
        </form>
      ) : null}
      <select
        className="text-xs border border-slate-300 rounded-lg px-2 py-1 bg-white"
        value={rawType}
        onChange={handleTypeChange}
      >
        {HISTORY_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <Link to={config.entryPath} className="secondary text-xs px-3 py-1">
        Go to entry
      </Link>
    </div>
  ) : null;

  if (!config) {
    return (
      <SectionCard title="Transaction History" description="Pick a transaction type to review saved entries.">
        <div className="space-y-3 text-sm text-slate-600">
          <p>Use the links below to open the available transaction histories:</p>
          <ul className="grid gap-2">
            {HISTORY_OPTIONS.map((option) => (
              <li key={option.value}>
                <Link className="primary inline-flex items-center justify-center px-3 py-2 text-xs" to={`/history/transactions?type=${option.value}`}>
                  {option.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-6">
      <SectionCard title={config.title} description={config.description} actions={actionControls}>
        {historyQuery.isLoading ? (
          <p className="text-sm text-slate-500">Loading saved transactions…</p>
        ) : historyQuery.error ? (
          <p className="text-sm text-rose-500">Unable to load transactions: {historyQuery.error.message}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-500">No records available yet.</p>
        ) : (
          <>
            {hasSearch && searchMessage ? (
              <p className="mb-2 text-xs text-rose-500">{searchMessage}</p>
            ) : null}
            <div className="overflow-x-auto print:hidden">
              <table className="min-w-full text-sm text-slate-700">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  {hasDetail ? <th className="px-3 py-2 w-12 text-center" /> : null}
                  {columns.map((column) => (
                    <th
                      key={column.key}
                      className={`px-3 py-2 ${column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : "text-left"}`}
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isExpanded = row.id === expandedId;
                  return (
                    <Fragment key={row.id}>
                      <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition">
                        {hasDetail ? (
                          <td className="px-3 py-2 text-center align-middle">
                            <button
                              type="button"
                              className="w-7 h-7 inline-flex items-center justify-center border border-slate-300 rounded-full text-base font-semibold text-slate-600 hover:bg-slate-100 transition"
                              aria-expanded={isExpanded}
                              aria-label={isExpanded ? "Collapse details" : "Expand details"}
                              title={isExpanded ? "Hide details" : "View full details"}
                              onClick={() => handleToggleRow(row.id)}
                            >
                              {isExpanded ? "−" : "+"}
                            </button>
                          </td>
                        ) : null}
                        {columns.map((column) => {
                          const value = column.render
                            ? column.render(row)
                            : column.format
                            ? column.format(row[column.key], row)
                            : row[column.key] ?? "—";
                          return (
                            <td
                              key={`${row.id}-${column.key}`}
                              className={`px-3 py-2 ${column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : "text-left"}`}
                            >
                              {value || value === 0 ? value : "—"}
                            </td>
                          );
                        })}
                      </tr>
                      {hasDetail && isExpanded ? (
                        <tr className="border-b border-slate-100 last:border-0 bg-slate-50/60">
                          <td colSpan={columnCount} className="px-4 py-4">
                            {detailElement}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rawType === "bank-deposit" && rows.length > 0 ? (
            <div className="mt-6 rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5 shadow-sm">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-600">Bank Summary</h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {(() => {
                  const deposits = rows.filter(r => r.transactionType === "deposit").reduce((sum, r) => sum + Number(r.amount || 0), 0);
                  const drawings = rows.filter(r => r.transactionType === "drawing").reduce((sum, r) => sum + Number(r.amount || 0), 0);
                  const cashInBank = deposits - drawings;
                  return (
                    <>
                      <div className="space-y-1">
                        <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Total Deposits</p>
                        <p className="text-xl font-bold text-emerald-600">{formatCurrency(deposits)}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Total Drawings</p>
                        <p className="text-xl font-bold text-rose-600">{formatCurrency(drawings)}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Net Change</p>
                        <p className={`text-xl font-bold ${cashInBank >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {formatCurrency(cashInBank)}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Current Balance</p>
                        <p className="text-xl font-bold text-slate-900">{formatCurrency(cashInBank)}</p>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          ) : null}
          {hasDetail ? (
            expandedRow ? (
              <div className="hidden print:block">
                {detailElement}
              </div>
            ) : (
              <p className="hidden print:block text-sm text-slate-500">
                Expand a transaction before printing to include its full detail.
              </p>
            )
          ) : null}
          </>
        )}
      </SectionCard>
    </div>
  );
};

export default TransactionHistoryPage;
