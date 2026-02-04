import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database(path.join(__dirname, '../data/inventory.db'));

const query = `
  SELECT 
    s.id,
    s.invoice_no,
    s.total_amount as sale,
    s.amount_paid as paid,
    s.total_amount - s.amount_paid as outstanding,
    COALESCE(SUM(si.quantity * i.purchase_rate), 0) as cost,
    s.total_amount - COALESCE(SUM(si.quantity * i.purchase_rate), 0) as invoice_profit,
    s.amount_paid - COALESCE(SUM(si.quantity * i.purchase_rate), 0) as realized_profit,
    s.total_amount - s.amount_paid as pending_profit
  FROM sales s
  LEFT JOIN sale_items si ON s.id = si.sale_id
  LEFT JOIN items i ON si.item_id = i.id
  GROUP BY s.id
  ORDER BY s.id
`;

const results = db.prepare(query).all();

console.log('\n=== INDIVIDUAL INVOICES ===\n');
results.forEach(row => {
  console.log(`Invoice: ${row.invoice_no}`);
  console.log(`  Sale: Rs ${row.sale}`);
  console.log(`  Cost: Rs ${row.cost}`);
  console.log(`  Paid: Rs ${row.paid}`);
  console.log(`  Outstanding: Rs ${row.outstanding}`);
  console.log(`  Invoice Profit: Rs ${row.invoice_profit}`);
  console.log(`  Realized Profit: Rs ${row.realized_profit} ${row.realized_profit < 0 ? '(LOSS)' : '(PROFIT)'}`);
  console.log(`  Pending Profit: Rs ${row.pending_profit}`);
  console.log('');
});

const totals = {
  total_sale: results.reduce((sum, r) => sum + r.sale, 0),
  total_cost: results.reduce((sum, r) => sum + r.cost, 0),
  total_paid: results.reduce((sum, r) => sum + r.paid, 0),
  total_outstanding: results.reduce((sum, r) => sum + r.outstanding, 0),
  total_invoice_profit: results.reduce((sum, r) => sum + r.invoice_profit, 0),
  total_realized_profit: results.reduce((sum, r) => sum + r.realized_profit, 0),
  total_pending_profit: results.reduce((sum, r) => sum + r.pending_profit, 0),
};

console.log('=== TOTALS ===');
console.log(`Total Sales: Rs ${totals.total_sale}`);
console.log(`Total Cost: Rs ${totals.total_cost}`);
console.log(`Total Paid: Rs ${totals.total_paid}`);
console.log(`Total Outstanding: Rs ${totals.total_outstanding}`);
console.log(`Total Invoice Profit: Rs ${totals.total_invoice_profit}`);
console.log(`Total Realized Profit: Rs ${totals.total_realized_profit}`);
console.log(`Total Pending Profit: Rs ${totals.total_pending_profit}`);

console.log('\n=== VERIFICATION ===');
console.log(`Simple calculation: Paid (${totals.total_paid}) - Cost (${totals.total_cost}) = Rs ${totals.total_paid - totals.total_cost}`);
console.log(`Query result: Rs ${totals.total_realized_profit}`);
console.log(`Match: ${totals.total_realized_profit === (totals.total_paid - totals.total_cost) ? 'YES ✓' : 'NO ✗'}`);

db.close();
