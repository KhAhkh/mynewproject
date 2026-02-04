import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '../data/inventory.db');
const db = new Database(dbPath);

console.log('Checking customer profit calculations...\n');

// Get customer profit data
const rows = db.prepare(`
  SELECT 
    c.id,
    c.code,
    c.name,
    ROUND(SUM(sale_data.total_amount), 2) as total_sales,
    ROUND(SUM(sale_data.amount_paid), 2) as total_paid,
    ROUND(SUM(sale_data.total_cost), 2) as total_cost,
    ROUND(SUM(sale_data.invoice_profit), 2) as invoice_profit,
    ROUND(SUM(sale_data.realized_profit), 2) as realized_profit,
    ROUND(SUM(sale_data.pending_profit), 2) as pending_profit
  FROM customers c
  LEFT JOIN (
    SELECT 
      s.customer_id,
      s.total_amount,
      s.amount_paid,
      COALESCE(SUM(si.quantity * i.purchase_rate), 0) as total_cost,
      (s.total_amount - COALESCE(SUM(si.quantity * i.purchase_rate), 0)) as invoice_profit,
      CASE 
        WHEN s.total_amount > 0 THEN (s.total_amount - COALESCE(SUM(si.quantity * i.purchase_rate), 0)) * (s.amount_paid / s.total_amount)
        ELSE 0
      END as realized_profit,
      CASE 
        WHEN s.total_amount > 0 THEN (s.total_amount - COALESCE(SUM(si.quantity * i.purchase_rate), 0)) * ((s.total_amount - s.amount_paid) / s.total_amount)
        ELSE 0
      END as pending_profit
    FROM sales s
    LEFT JOIN sale_items si ON s.id = si.sale_id
    LEFT JOIN items i ON si.item_id = i.id
    GROUP BY s.id
  ) sale_data ON c.id = sale_data.customer_id
  WHERE c.name IN ('DUBAI STORE', 'ANEES', 'Navigator School')
  GROUP BY c.id
`).all();

rows.forEach(row => {
  console.log(`\n=== ${row.name} (${row.code}) ===`);
  console.log(`Total Sales: Rs ${row.total_sales}`);
  console.log(`Total Cost: Rs ${row.total_cost}`);
  console.log(`Total Paid: Rs ${row.total_paid}`);
  console.log(`Invoice Profit: Rs ${row.invoice_profit}`);
  console.log(`Realized Profit (DB): Rs ${row.realized_profit}`);
  console.log(`Pending Profit (DB): Rs ${row.pending_profit}`);
  
  // Calculate expected values
  const expectedRealized = row.invoice_profit * (row.total_paid / row.total_sales);
  const expectedPending = row.invoice_profit * ((row.total_sales - row.total_paid) / row.total_sales);
  
  console.log(`\nExpected Realized: Rs ${expectedRealized.toFixed(2)}`);
  console.log(`Expected Pending: Rs ${expectedPending.toFixed(2)}`);
  
  const realizedDiff = Math.abs(row.realized_profit - expectedRealized);
  const pendingDiff = Math.abs(row.pending_profit - expectedPending);
  
  if (realizedDiff > 0.01 || pendingDiff > 0.01) {
    console.log(`⚠️ MISMATCH! Diff: Realized=${realizedDiff.toFixed(2)}, Pending=${pendingDiff.toFixed(2)}`);
  } else {
    console.log('✓ Values match expected calculations');
  }
});

// Now check individual invoices for DUBAI STORE
console.log('\n\n=== DUBAI STORE Individual Invoices ===');
const invoices = db.prepare(`
  SELECT 
    s.id,
    s.invoice_no,
    s.total_amount,
    s.amount_paid,
    COALESCE(SUM(si.quantity * i.purchase_rate), 0) as total_cost,
    (s.total_amount - COALESCE(SUM(si.quantity * i.purchase_rate), 0)) as invoice_profit,
    CASE 
      WHEN s.total_amount > 0 THEN (s.total_amount - COALESCE(SUM(si.quantity * i.purchase_rate), 0)) * (s.amount_paid / s.total_amount)
      ELSE 0
    END as realized_profit,
    CASE 
      WHEN s.total_amount > 0 THEN (s.total_amount - COALESCE(SUM(si.quantity * i.purchase_rate), 0)) * ((s.total_amount - s.amount_paid) / s.total_amount)
      ELSE 0
    END as pending_profit
  FROM sales s
  LEFT JOIN sale_items si ON s.id = si.sale_id
  LEFT JOIN items i ON si.item_id = i.id
  LEFT JOIN customers c ON s.customer_id = c.id
  WHERE c.name = 'DUBAI STORE'
  GROUP BY s.id
`).all();

invoices.forEach(inv => {
  console.log(`\nInvoice ${inv.invoice_no}:`);
  console.log(`  Total: ${inv.total_amount}, Paid: ${inv.amount_paid}, Cost: ${inv.total_cost}`);
  console.log(`  Invoice Profit: ${inv.invoice_profit}`);
  console.log(`  Realized: ${inv.realized_profit}, Pending: ${inv.pending_profit}`);
});

const totalRealized = invoices.reduce((sum, inv) => sum + inv.realized_profit, 0);
const totalPending = invoices.reduce((sum, inv) => sum + inv.pending_profit, 0);
console.log(`\nSum of invoice realized: ${totalRealized.toFixed(2)}`);
console.log(`Sum of invoice pending: ${totalPending.toFixed(2)}`);

db.close();
