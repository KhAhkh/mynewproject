import Database from 'better-sqlite3';

const db = new Database('./data/inventory.db');

// Check purchase_returns table structure
console.log('=== PURCHASE RETURNS TABLE STRUCTURE ===');
const prInfo = db.prepare("PRAGMA table_info(purchase_returns)").all();
console.log(prInfo.map(c => `${c.name} (${c.type})`).join('\n'));

// Check purchase returns for supplier id 1 (DN)
console.log('\n=== PURCHASE RETURNS FOR SUPPLIER DN (ID=1) ===');
const returns = db.prepare(`
  SELECT * FROM purchase_returns WHERE supplier_id = 1 LIMIT 10
`).all();
console.log(returns);

// Check purchase returns with invoice 741
console.log('\n=== PURCHASE RETURNS FOR INVOICE 741 ===');
const invoice741Returns = db.prepare(`
  SELECT * FROM purchase_returns 
  WHERE return_no LIKE '%741%' OR return_no = '741'
  LIMIT 10
`).all();
console.log(invoice741Returns);

db.close();
