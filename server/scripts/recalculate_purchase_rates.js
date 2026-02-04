import Database from "better-sqlite3";

const db = new Database("./server/data/inventory.db");

const items = db
  .prepare(
    `SELECT id
     FROM items
     ORDER BY id`
  )
  .all();

const fetchTotals = db.prepare(
  `SELECT
      COALESCE(SUM(pi.quantity * pi.purchase_rate), 0) AS total_paid,
      COALESCE(SUM(pi.quantity + COALESCE(pi.bonus, 0)), 0) AS total_units
   FROM purchase_items pi
   WHERE pi.item_id = ?`
);

const updateRate = db.prepare(
  `UPDATE items SET purchase_rate = ?, updated_at = ? WHERE id = ?`
);

const nowIso = () => new Date().toISOString();

let updated = 0;
for (const item of items) {
  const totals = fetchTotals.get(item.id);
  const totalPaid = Number(totals?.total_paid || 0);
  const totalUnits = Number(totals?.total_units || 0);
  if (totalUnits <= 0) continue;
  const effectiveRate = totalPaid / totalUnits;
  updateRate.run(effectiveRate, nowIso(), item.id);
  updated += 1;
}

console.log(`Updated purchase_rate for ${updated} item(s).`);

db.close();
