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
    COALESCE((SELECT SUM(cr.amount) FROM customer_receipts cr WHERE cr.sale_id = s.id), 0) as receipts,
    s.total_amount - s.amount_paid - COALESCE((SELECT SUM(cr.amount) FROM customer_receipts cr WHERE cr.sale_id = s.id), 0) as outstanding_after_receipts,
    COALESCE(SUM(si.quantity * i.purchase_rate), 0) as cost,
    s.amount_paid - COALESCE(SUM(si.quantity * i.purchase_rate), 0) as realized_profit,
    (s.total_amount - s.amount_paid) - COALESCE((SELECT SUM(cr.amount) FROM customer_receipts cr WHERE cr.sale_id = s.id), 0) as pending_profit
  FROM sales s
  LEFT JOIN sale_items si ON s.id = si.sale_id
  LEFT JOIN items i ON si.item_id = i.id
  GROUP BY s.id
  ORDER BY s.id
`;

const results = db.prepare(query).all();

console.log('\n=== INVOICES WITH RECEIPTS ===\n');
results.forEach(row => {
  console.log(`Invoice: ${row.invoice_no}`);
  console.log(`  Sale: Rs ${row.sale}`);
  console.log(`  Cost: Rs ${row.cost}`);
  console.log(`  Paid: Rs ${row.paid}`);
  console.log(`  Receipts: Rs ${row.receipts}`);
  console.log(`  Outstanding After Receipts: Rs ${row.outstanding_after_receipts}`);
  console.log(`  Realized Profit: Rs ${row.realized_profit}`);
  console.log(`  Pending Profit: Rs ${row.pending_profit}`);
  console.log('');
});

const totals = {
  total_sale: results.reduce((sum, r) => sum + r.sale, 0),
  total_cost: results.reduce((sum, r) => sum + r.cost, 0),
  total_paid: results.reduce((sum, r) => sum + r.paid, 0),
  total_receipts: results.reduce((sum, r) => sum + r.receipts, 0),
  total_outstanding: results.reduce((sum, r) => sum + r.outstanding_after_receipts, 0),
  total_realized_profit: results.reduce((sum, r) => sum + r.realized_profit, 0),
  total_pending_profit: results.reduce((sum, r) => sum + r.pending_profit, 0),
};

console.log('=== TOTALS ===');
console.log(`Total Sales: Rs ${totals.total_sale}`);
console.log(`Total Cost: Rs ${totals.total_cost}`);
console.log(`Total Paid: Rs ${totals.total_paid}`);
console.log(`Total Receipts: Rs ${totals.total_receipts}`);
console.log(`Total Amount Received: Rs ${totals.total_paid + totals.total_receipts}`);
console.log(`Total Outstanding: Rs ${totals.total_outstanding}`);
console.log(`Total Realized Profit: Rs ${totals.total_realized_profit}`);
console.log(`Total Pending Profit: Rs ${totals.total_pending_profit}`);

console.log('\n=== VERIFICATION ===');
console.log(`Outstanding matches Pending Profit: ${totals.total_outstanding === totals.total_pending_profit ? 'YES ✓' : 'NO ✗'}`);
console.log(`  Outstanding: Rs ${totals.total_outstanding}`);
console.log(`  Pending Profit: Rs ${totals.total_pending_profit}`);

db.close();
