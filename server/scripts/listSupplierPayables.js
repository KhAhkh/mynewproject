import { getDb } from "../src/database.js";
import { computeSupplierPayable } from "../src/index.js";

const db = getDb();
const suppliers = db.prepare("SELECT id, code, name FROM suppliers ORDER BY name").all();

const rows = suppliers.map((supplier) => {
  const payable = computeSupplierPayable(db, supplier.id);
  return {
    code: supplier.code,
    name: supplier.name,
    payable: payable.payable,
    receivable: payable.receivable,
    net: payable.net
  };
});

console.log(JSON.stringify(rows, null, 2));
