/**
 * Profit Calculation Module
 * Handles realized and unrealized profit calculations based on payment status
 */

/**
 * Calculate profit metrics for a single sale
 * Simplified Direct Cost Recovery Method:
 * Profit = TotalSale - TotalCost
 * GainedProfit = MIN(AmountPaid, TotalSale) - TotalCost (cap at invoice amount, excess is advance)
 * PendingProfit = Profit - GainedProfit (0 if advance payment)
 */
export function calculateProfitMetrics(totalSale, totalCost, amountPaid) {
  const invoiceProfit = totalSale - totalCost;
  // Cap amount paid at total sale for profit calculation - excess is advance payment
  const effectivePaid = Math.min(amountPaid, totalSale);
  const realizedProfit = effectivePaid - totalCost; // Direct: Paid (capped) - Cost
  const pendingProfit = Math.max(0, invoiceProfit - realizedProfit); // 0 if overpaid
  const collectionRatio = totalSale > 0 ? effectivePaid / totalSale : 0;
  const outstanding = Math.max(0, totalSale - amountPaid);

  return {
    invoiceProfit: Math.round(invoiceProfit * 100) / 100,
    collectionRatio: Math.round(collectionRatio * 10000) / 100, // percentage
    realizedProfit: Math.round(realizedProfit * 100) / 100,
    pendingProfit: Math.round(pendingProfit * 100) / 100,
    amountOutstanding: Math.round(outstanding * 100) / 100,
  };
}

/**
 * SQL Query to get profit summary with all metrics
 * Cap profit calculations at invoice amount - excess payments are advances
 */
export const PROFIT_SUMMARY_QUERY = `
  SELECT 
    s.id,
    s.invoice_no,
    s.invoice_date,
    c.name as customer_name,
    c.code as customer_code,
    s.total_amount as total_sale,
    s.amount_paid,
    COALESCE(SUM((si.quantity + COALESCE(si.bonus, 0)) * i.purchase_rate), 0) as total_cost,
    (s.total_amount - COALESCE(SUM((si.quantity + COALESCE(si.bonus, 0)) * i.purchase_rate), 0)) as invoice_profit,
    CASE 
      WHEN s.total_amount > 0 THEN ROUND((MAX(0, s.total_amount - s.amount_paid) / s.total_amount) * 100, 2)
      ELSE 0
    END as outstanding_calculation_ratio_percent,
    ROUND(MIN(s.amount_paid, s.total_amount) - COALESCE(SUM((si.quantity + COALESCE(si.bonus, 0)) * i.purchase_rate), 0), 2) as realized_profit,
    ROUND(MAX(0, (s.total_amount - COALESCE(SUM((si.quantity + COALESCE(si.bonus, 0)) * i.purchase_rate), 0)) - (MIN(s.amount_paid, s.total_amount) - COALESCE(SUM((si.quantity + COALESCE(si.bonus, 0)) * i.purchase_rate), 0))), 2) as pending_profit,
    MAX(0, s.total_amount - s.amount_paid) as amount_outstanding,
    sm.name as salesman_name
  FROM sales s
  LEFT JOIN customers c ON s.customer_id = c.id
  LEFT JOIN salesmen sm ON s.salesman_id = sm.id
  LEFT JOIN sale_items si ON s.id = si.sale_id
  LEFT JOIN items i ON si.item_id = i.id
  GROUP BY s.id
  ORDER BY s.invoice_date DESC
`;

/**
 * SQL Query to get NET PROFIT for entire period
 * Direct Cost Recovery Method: Realized Profit = Amount Paid (capped at invoice) - Purchase Cost
 * Shows loss if cost not recovered, profit once cost covered
 * NOTE: Advance payments (customer_receipts) are NOT included in profit calculations
 * Excess payments over invoice amount are advances and excluded from profit
 */
export const NET_PROFIT_QUERY = `
  SELECT 
    ROUND(SUM(total_sales), 2) as total_sales,
    ROUND(SUM(total_cost), 2) as total_cost,
    ROUND(SUM(invoice_profit), 2) as invoice_profit,
    ROUND(SUM(amount_paid), 2) as total_amount_paid,
    ROUND(SUM(outstanding), 2) as total_outstanding,
    ROUND(CASE WHEN SUM(total_sales) > 0 THEN (SUM(CASE WHEN outstanding > 0 THEN outstanding ELSE 0 END) / SUM(total_sales)) * 100 ELSE 0 END, 2) as outstanding_calculation_ratio_percent,
    ROUND(SUM(realized_profit), 2) as realized_profit,
    ROUND(SUM(pending_profit), 2) as pending_profit
  FROM (
    SELECT 
      s.total_amount as total_sales,
      s.amount_paid,
      MAX(0, s.total_amount - s.amount_paid) as outstanding,
      COALESCE(SUM((si.quantity + COALESCE(si.bonus, 0)) * i.purchase_rate), 0) as total_cost,
      (s.total_amount - COALESCE(SUM((si.quantity + COALESCE(si.bonus, 0)) * i.purchase_rate), 0)) as invoice_profit,
      ROUND(MIN(s.amount_paid, s.total_amount) - COALESCE(SUM((si.quantity + COALESCE(si.bonus, 0)) * i.purchase_rate), 0), 2) as realized_profit,
      ROUND(MAX(0, (s.total_amount - COALESCE(SUM((si.quantity + COALESCE(si.bonus, 0)) * i.purchase_rate), 0)) - (MIN(s.amount_paid, s.total_amount) - COALESCE(SUM((si.quantity + COALESCE(si.bonus, 0)) * i.purchase_rate), 0))), 2) as pending_profit
    FROM sales s
    LEFT JOIN sale_items si ON s.id = si.sale_id
    LEFT JOIN items i ON si.item_id = i.id
    GROUP BY s.id
  )
`;

/**
 * SQL Query to get profit by item
 * Direct Cost Recovery Method: Realized Profit = Amount Paid - Cost
 */
export const PROFIT_BY_ITEM_QUERY = `
  SELECT 
    i.id,
    i.code,
    i.name,
    i.company_id,
    ROUND(SUM(si.quantity), 2) as total_quantity,
    ROUND(SUM((si.quantity + COALESCE(si.bonus, 0)) * i.purchase_rate), 2) as total_cost,
    ROUND(SUM(si.quantity * si.trade_price), 2) as total_sales,
    ROUND(SUM((si.quantity * si.trade_price) - ((si.quantity + COALESCE(si.bonus, 0)) * i.purchase_rate)), 2) as invoice_profit,
    ROUND(
      SUM(
        CASE 
          WHEN s.total_amount > 0 THEN (s.amount_paid / s.total_amount) * ((si.quantity * si.trade_price) - ((si.quantity + COALESCE(si.bonus, 0)) * i.purchase_rate))
          ELSE 0
        END
      ), 2
    ) as realized_profit,
    ROUND(
      SUM(
        CASE 
          WHEN s.total_amount > 0 THEN ((CASE WHEN s.amount_paid >= s.total_amount THEN 0 ELSE (s.total_amount - s.amount_paid) END) / s.total_amount) * ((si.quantity * si.trade_price) - ((si.quantity + COALESCE(si.bonus, 0)) * i.purchase_rate))
          ELSE 0
        END
      ), 2
    ) as pending_profit
  FROM sale_items si
  LEFT JOIN items i ON si.item_id = i.id
  LEFT JOIN sales s ON si.sale_id = s.id
  GROUP BY i.id
  ORDER BY invoice_profit DESC
`;

/**
 * SQL Query to get profit by customer
 */
// PROFIT BY CUSTOMER (Aggregated customer-level method)
// Aggregates all invoices per customer, then allocates profit proportionally to cash received:
//   total_sales = SUM(all invoice totals)
//   total_cost = SUM(all invoice costs)
//   amount_paid = SUM(cash received from customer)
//   total_profit = total_sales - total_cost
//   realized_profit = (amount_paid / total_sales) × total_profit
//   pending_profit = total_profit - realized_profit
// Profit allocation is based on CUSTOMER-LEVEL cash collection ratio, NOT per-invoice payment ratios
export const PROFIT_BY_CUSTOMER_QUERY = `
  SELECT 
    c.id,
    c.code,
    c.name,
    c.area_id,
    ROUND(COALESCE(t.total_sales, 0), 2) as total_sales,
    ROUND(COALESCE(t.total_paid, 0), 2) as total_paid,
    ROUND(COALESCE(t.outstanding, 0), 2) as outstanding,
    ROUND(COALESCE(t.advance_amount, 0), 2) as advance_amount,
    ROUND(COALESCE(t.total_cost, 0), 2) as total_cost,
    ROUND(COALESCE(t.invoice_profit, 0), 2) as invoice_profit,
    ROUND(
      CASE 
        WHEN COALESCE(t.total_sales, 0) > 0 THEN
          (CASE WHEN t.total_paid > t.total_sales THEN t.total_sales ELSE t.total_paid END) / t.total_sales * t.invoice_profit
        ELSE 0
      END,
      2
    ) as realized_profit,
    ROUND(
      CASE 
        WHEN COALESCE(t.total_sales, 0) > 0 THEN
          t.invoice_profit - ((CASE WHEN t.total_paid > t.total_sales THEN t.total_sales ELSE t.total_paid END) / t.total_sales * t.invoice_profit)
        ELSE 0
      END,
      2
    ) as pending_profit
  FROM customers c
  LEFT JOIN (
    SELECT 
      s.customer_id,
      SUM(s.total_amount) as total_sales,
      SUM(s.amount_paid) as total_paid,
      SUM(CASE WHEN s.amount_paid >= s.total_amount THEN 0 ELSE (s.total_amount - s.amount_paid) END) as outstanding,
      SUM(CASE WHEN s.amount_paid > s.total_amount THEN (s.amount_paid - s.total_amount) ELSE 0 END) as advance_amount,
      SUM(COALESCE(si_cost.total_cost, 0)) as total_cost,
      SUM(s.total_amount) - SUM(COALESCE(si_cost.total_cost, 0)) as invoice_profit
    FROM sales s
    LEFT JOIN (
      SELECT si.sale_id, COALESCE(SUM((si.quantity + COALESCE(si.bonus, 0)) * i.purchase_rate), 0) as total_cost
      FROM sale_items si
      LEFT JOIN items i ON si.item_id = i.id
      GROUP BY si.sale_id
    ) si_cost ON s.id = si_cost.sale_id
    GROUP BY s.customer_id
  ) t ON c.id = t.customer_id
  ORDER BY realized_profit DESC
`;

/**
 * SQL Query to get profit by company
 */
export const PROFIT_BY_COMPANY_QUERY = `
  SELECT 
    co.id,
    co.code,
    co.name,
    ROUND(SUM(sale_data.total_amount), 2) as total_sales,
    ROUND(SUM(sale_data.amount_paid), 2) as total_paid,
    ROUND(SUM(CASE WHEN sale_data.amount_paid >= sale_data.total_amount THEN 0 ELSE (sale_data.total_amount - sale_data.amount_paid) END), 2) as outstanding,
    ROUND(SUM(sale_data.total_cost), 2) as total_cost,
    ROUND(SUM(sale_data.invoice_profit), 2) as invoice_profit,
    ROUND(SUM(sale_data.realized_profit), 2) as realized_profit,
    ROUND(SUM(sale_data.pending_profit), 2) as pending_profit
  FROM companies co
  LEFT JOIN (
    SELECT 
      i.company_id,
      s.total_amount,
      s.amount_paid,
      COALESCE(SUM((si.quantity + COALESCE(si.bonus, 0)) * i.purchase_rate), 0) as total_cost,
      (s.total_amount - COALESCE(SUM((si.quantity + COALESCE(si.bonus, 0)) * i.purchase_rate), 0)) as invoice_profit,
      ROUND(MIN(s.amount_paid, s.total_amount) - COALESCE(SUM((si.quantity + COALESCE(si.bonus, 0)) * i.purchase_rate), 0), 2) as realized_profit,
      ROUND(MAX(0, (s.total_amount - COALESCE(SUM((si.quantity + COALESCE(si.bonus, 0)) * i.purchase_rate), 0)) - (MIN(s.amount_paid, s.total_amount) - COALESCE(SUM((si.quantity + COALESCE(si.bonus, 0)) * i.purchase_rate), 0))), 2) as pending_profit
    FROM sales s
    LEFT JOIN sale_items si ON s.id = si.sale_id
    LEFT JOIN items i ON si.item_id = i.id
    GROUP BY s.id
  ) sale_data ON co.id = sale_data.company_id
  GROUP BY co.id
  ORDER BY realized_profit DESC
`;

/**
 * SQL Query to get profit by date with return handling
 */
export const PROFIT_BY_DATE_QUERY = `
  SELECT 
    sale_date,
    ROUND(SUM(total_amount), 2) as total_sales,
    ROUND(SUM(amount_paid), 2) as total_paid,
    ROUND(SUM(CASE WHEN amount_paid >= total_amount THEN 0 ELSE (total_amount - amount_paid) END), 2) as outstanding,
    ROUND(SUM(total_cost), 2) as total_cost,
    ROUND(SUM(invoice_profit), 2) as invoice_profit,
    ROUND(SUM(realized_profit), 2) as realized_profit,
    ROUND(SUM(pending_profit), 2) as pending_profit,
    COUNT(*) as transaction_count
  FROM (
    SELECT 
      DATE(s.invoice_date) as sale_date,
      s.total_amount,
      s.amount_paid,
      COALESCE(SUM((si.quantity + COALESCE(si.bonus, 0)) * i.purchase_rate), 0) as total_cost,
      (s.total_amount - COALESCE(SUM((si.quantity + COALESCE(si.bonus, 0)) * i.purchase_rate), 0)) as invoice_profit,
      ROUND(MIN(s.amount_paid, s.total_amount) - COALESCE(SUM((si.quantity + COALESCE(si.bonus, 0)) * i.purchase_rate), 0), 2) as realized_profit,
      ROUND(MAX(0, (s.total_amount - COALESCE(SUM((si.quantity + COALESCE(si.bonus, 0)) * i.purchase_rate), 0)) - (MIN(s.amount_paid, s.total_amount) - COALESCE(SUM((si.quantity + COALESCE(si.bonus, 0)) * i.purchase_rate), 0))), 2) as pending_profit
    FROM sales s
    LEFT JOIN sale_items si ON s.id = si.sale_id
    LEFT JOIN items i ON si.item_id = i.id
    GROUP BY s.id
  )
  GROUP BY sale_date
  ORDER BY sale_date DESC
`;

/**
 * SQL Query to get profit by salesman
 */
export const PROFIT_BY_SALESMAN_QUERY = `
  SELECT 
    sm.id,
    sm.code,
    sm.name,
    ROUND(SUM(sale_data.total_amount), 2) as total_sales,
    ROUND(SUM(sale_data.amount_paid), 2) as total_paid,
    ROUND(SUM(CASE WHEN sale_data.amount_paid >= sale_data.total_amount THEN 0 ELSE (sale_data.total_amount - sale_data.amount_paid) END), 2) as outstanding,
    ROUND(SUM(sale_data.total_cost), 2) as total_cost,
    ROUND(SUM(sale_data.invoice_profit), 2) as invoice_profit,
    ROUND(SUM(sale_data.realized_profit), 2) as realized_profit,
    ROUND(SUM(sale_data.pending_profit), 2) as pending_profit
  FROM salesmen sm
  LEFT JOIN (
    SELECT 
      s.salesman_id,
      s.total_amount,
      s.amount_paid,
      COALESCE(SUM((si.quantity + COALESCE(si.bonus, 0)) * i.purchase_rate), 0) as total_cost,
      (s.total_amount - COALESCE(SUM((si.quantity + COALESCE(si.bonus, 0)) * i.purchase_rate), 0)) as invoice_profit,
      ROUND(MIN(s.amount_paid, s.total_amount) - COALESCE(SUM((si.quantity + COALESCE(si.bonus, 0)) * i.purchase_rate), 0), 2) as realized_profit,
      ROUND(MAX(0, (s.total_amount - COALESCE(SUM((si.quantity + COALESCE(si.bonus, 0)) * i.purchase_rate), 0)) - (MIN(s.amount_paid, s.total_amount) - COALESCE(SUM((si.quantity + COALESCE(si.bonus, 0)) * i.purchase_rate), 0))), 2) as pending_profit
    FROM sales s
    LEFT JOIN sale_items si ON s.id = si.sale_id
    LEFT JOIN items i ON si.item_id = i.id
    GROUP BY s.id
  ) sale_data ON sm.id = sale_data.salesman_id
  GROUP BY sm.id
  ORDER BY realized_profit DESC
`;
