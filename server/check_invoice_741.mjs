import Database from 'better-sqlite3';

const db = new Database('./data/inventory.db');

// Check purchases for invoice 741
console.log('=== PURCHASES WITH INVOICE 741 ===');
const purchases = db.prepare(`
  SELECT id, invoice_no, supplier_id, total_amount FROM purchases WHERE invoice_no = '741'
`).all();
console.log(purchases);

// Check purchase returns for invoice 741
console.log('\n=== PURCHASE RETURNS FOR INVOICE 741 ===');
const returns = db.prepare(`
  SELECT pr.*, p.invoice_no, p.supplier_id FROM purchase_returns pr
  JOIN purchases p ON p.id = pr.purchase_id
  WHERE p.invoice_no = '741'
`).all();
console.log(returns);

// Check if any purchase returns exist
console.log('\n=== TOTAL PURCHASE RETURNS COUNT ===');
const count = db.prepare(`SELECT COUNT(*) as cnt FROM purchase_returns`).get();
console.log(count);

db.close();
