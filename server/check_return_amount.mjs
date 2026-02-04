import Database from 'better-sqlite3';

const db = new Database('./data/inventory.db');

// Check purchase items for invoice 741
console.log('=== PURCHASE ITEMS FOR INVOICE 741 ===');
const items = db.prepare(`
  SELECT pi.* FROM purchase_items pi
  JOIN purchases p ON p.id = pi.purchase_id
  WHERE p.invoice_no = '741'
`).all();
console.log(items);

// Check the specific return
console.log('\n=== RETURN DETAILS ===');
const returns = db.prepare(`
  SELECT pr.*, pi.unit_price, pi.item_id
  FROM purchase_returns pr
  JOIN purchase_items pi ON pi.id = pr.purchase_item_id
  WHERE pr.return_no = 'PR000001'
`).all();
console.log(returns);

db.close();
