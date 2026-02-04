import Database from "better-sqlite3";

const db = new Database("data/inventory.db", { readonly: true });

const purchases = db
  .prepare(`
    SELECT items.id AS item_id,
           items.code,
           items.name,
           items.base_unit,
           SUM(purchase_items.quantity + COALESCE(purchase_items.bonus, 0)) AS total_units,
           SUM(purchase_items.net_amount) AS total_amount
    FROM purchase_items
    INNER JOIN items ON items.id = purchase_items.item_id
    GROUP BY items.id
  `)
  .all();

const purchaseReturns = db
  .prepare(`
    SELECT purchase_items.item_id AS item_id,
           SUM(purchase_returns.quantity) AS return_units,
           SUM(
             CASE
               WHEN (purchase_items.quantity + COALESCE(purchase_items.bonus, 0)) = 0 THEN 0
               ELSE purchase_returns.quantity * (purchase_items.net_amount / (purchase_items.quantity + COALESCE(purchase_items.bonus, 0)))
             END
           ) AS return_amount
    FROM purchase_returns
    INNER JOIN purchase_items ON purchase_items.id = purchase_returns.purchase_item_id
    GROUP BY purchase_items.item_id
  `)
  .all();

const saleTotals = db
  .prepare(`
    SELECT sale_items.item_id AS item_id,
           SUM(sale_items.quantity + COALESCE(sale_items.bonus, 0)) AS total_units
    FROM sale_items
    GROUP BY sale_items.item_id
  `)
  .all();

const saleReturns = db
  .prepare(`
    SELECT sale_items.item_id AS item_id,
           SUM(sale_returns.quantity) AS return_units
    FROM sale_returns
    INNER JOIN sale_items ON sale_items.id = sale_returns.sale_item_id
    GROUP BY sale_items.item_id
  `)
  .all();

const mapById = (rows, mapper) => {
  const map = new Map();
  for (const row of rows) {
    map.set(row.item_id, mapper(row));
  }
  return map;
};

const returnsByItem = mapById(purchaseReturns, (row) => ({
  units: Number(row.return_units || 0),
  amount: Number(row.return_amount || 0)
}));
const salesByItem = mapById(saleTotals, (row) => Number(row.total_units || 0));
const saleReturnsByItem = mapById(saleReturns, (row) => Number(row.return_units || 0));

const results = purchases
  .map((row) => {
    const returnTotals = returnsByItem.get(row.item_id) || { units: 0, amount: 0 };
    const totalPurchased = Number(row.total_units || 0);
    const netUnits = totalPurchased - returnTotals.units;
    const netAmount = Number(row.total_amount || 0) - returnTotals.amount;
    if (netUnits <= 0) return null;

    const soldUnits = salesByItem.get(row.item_id) || 0;
    const returnedFromSales = saleReturnsByItem.get(row.item_id) || 0;
    const remaining = Math.max(netUnits - (soldUnits - returnedFromSales), 0);
    if (remaining <= 0) return null;

    const averageCost = netUnits > 0 ? Number((netAmount / netUnits).toFixed(2)) : 0;

    return {
      code: row.code,
      name: row.name,
      quantity: Number(remaining.toFixed(2)),
      totalValue: Number((averageCost * remaining).toFixed(2)),
      averageCost
    };
  })
  .filter(Boolean);

console.log(JSON.stringify({ purchases, purchaseReturns, saleTotals, saleReturns, results }, null, 2));
