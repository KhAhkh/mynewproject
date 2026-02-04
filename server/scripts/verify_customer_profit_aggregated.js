import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '../data/inventory.db');
const db = new Database(dbPath);

console.log('Verifying aggregated customer-level profit calculation...\n');

// Test data: DUBAI STORE
const testCustomer = db.prepare(`
  SELECT 
    c.id,
    c.code,
    c.name,
    ROUND(SUM(s.total_amount), 2) as total_sales,
    ROUND(SUM(s.amount_paid), 2) as total_paid,
    ROUND(SUM(COALESCE(si_cost.total_cost, 0)), 2) as total_cost
  FROM customers c
  LEFT JOIN sales s ON c.id = s.customer_id
  LEFT JOIN (
    SELECT si.sale_id, COALESCE(SUM(si.quantity * i.purchase_rate), 0) as total_cost
    FROM sale_items si
    LEFT JOIN items i ON si.item_id = i.id
    GROUP BY si.sale_id
  ) si_cost ON s.id = si_cost.sale_id
  WHERE c.name = 'DUBAI STORE'
  GROUP BY c.id
`).get();

if (testCustomer) {
  console.log(`=== ${testCustomer.name} ===`);
  console.log(`Total Sales: Rs ${testCustomer.total_sales}`);
  console.log(`Total Cost: Rs ${testCustomer.total_cost}`);
  console.log(`Total Paid: Rs ${testCustomer.total_paid}`);
  
  const totalProfit = testCustomer.total_sales - testCustomer.total_cost;
  const collectionRatio = testCustomer.total_sales > 0 ? testCustomer.total_paid / testCustomer.total_sales : 0;
  const realized = totalProfit * collectionRatio;
  const pending = totalProfit - realized;
  
  console.log(`\nCalculations:`);
  console.log(`Total Profit = ${testCustomer.total_sales} - ${testCustomer.total_cost} = Rs ${totalProfit.toFixed(2)}`);
  console.log(`Collection Ratio = ${testCustomer.total_paid} / ${testCustomer.total_sales} = ${(collectionRatio * 100).toFixed(2)}%`);
  console.log(`Realized Profit = ${totalProfit.toFixed(2)} × ${(collectionRatio * 100).toFixed(2)}% = Rs ${realized.toFixed(2)}`);
  console.log(`Pending Profit = ${totalProfit.toFixed(2)} - ${realized.toFixed(2)} = Rs ${pending.toFixed(2)}`);
  
  // Now check what the backend query returns
  console.log(`\n=== Comparing with Backend Query ===`);
  const backendResult = db.prepare(`
    SELECT 
      c.id,
      c.code,
      c.name,
      ROUND(SUM(s.total_amount), 2) as total_sales,
      ROUND(SUM(s.amount_paid), 2) as total_paid,
      ROUND(SUM(COALESCE(si_cost.total_cost, 0)), 2) as total_cost,
      ROUND(SUM(s.total_amount) - SUM(COALESCE(si_cost.total_cost, 0)), 2) as invoice_profit,
      CASE 
        WHEN SUM(s.total_amount) > 0 THEN 
          ROUND(
            (SUM(s.total_amount) - SUM(COALESCE(si_cost.total_cost, 0))) * 
            (SUM(s.amount_paid) / SUM(s.total_amount)), 
            2
          )
        ELSE 0
      END as realized_profit,
      CASE 
        WHEN SUM(s.total_amount) > 0 THEN 
          ROUND(
            (SUM(s.total_amount) - SUM(COALESCE(si_cost.total_cost, 0))) * 
            (1 - SUM(s.amount_paid) / SUM(s.total_amount)), 
            2
          )
        ELSE 0
      END as pending_profit
    FROM customers c
    LEFT JOIN sales s ON c.id = s.customer_id
    LEFT JOIN (
      SELECT si.sale_id, COALESCE(SUM(si.quantity * i.purchase_rate), 0) as total_cost
      FROM sale_items si
      LEFT JOIN items i ON si.item_id = i.id
      GROUP BY si.sale_id
    ) si_cost ON s.id = si_cost.sale_id
    WHERE c.name = 'DUBAI STORE'
    GROUP BY c.id
  `).get();
  
  if (backendResult) {
    console.log(`Backend Realized: Rs ${backendResult.realized_profit}`);
    console.log(`Expected Realized: Rs ${realized.toFixed(2)}`);
    console.log(`Backend Pending: Rs ${backendResult.pending_profit}`);
    console.log(`Expected Pending: Rs ${pending.toFixed(2)}`);
    
    if (Math.abs(backendResult.realized_profit - realized) < 0.01 && 
        Math.abs(backendResult.pending_profit - pending) < 0.01) {
      console.log(`\n✓ Backend query is CORRECT!`);
    } else {
      console.log(`\n⚠️ Backend query MISMATCH`);
    }
  }
}

db.close();
