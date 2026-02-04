import Database from "better-sqlite3";
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import { DB_FILE } from "../src/config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const backupDir = path.join(__dirname, "..", "data", "backups");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

const ensureBackup = async () => {
  await fs.ensureDir(backupDir);
  const backupFile = path.join(backupDir, `inventory-before-carton-${timestamp}.db`);
  await fs.copy(DB_FILE, backupFile);
  return backupFile;
};

const migrate = () => {
  const db = new Database(DB_FILE);
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'items'")
    .get();

  if (!row?.sql) {
    console.log("items table not found; nothing to migrate.");
    return;
  }

  if (row.sql.includes("'Carton'")) {
    console.log("items table already supports Carton unit; no migration needed.");
    return;
  }

  console.log("Applying Carton support to items.base_unit constraint...");

  const migrateTransaction = db.transaction(() => {
    db.exec(`
      CREATE TABLE items_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        company_id INTEGER NOT NULL,
        base_unit TEXT NOT NULL CHECK (base_unit IN ('Pieces','Pack','Carton')),
        pack_size REAL,
        min_quantity REAL NOT NULL,
        purchase_rate REAL NOT NULL,
        trade_rate REAL NOT NULL,
        retail_price REAL,
        sales_tax REAL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (company_id) REFERENCES companies(id)
      );

      INSERT INTO items_new (id, code, name, company_id, base_unit, pack_size, min_quantity, purchase_rate, trade_rate, retail_price, sales_tax, created_at, updated_at)
      SELECT id, code, name, company_id, base_unit, pack_size, min_quantity, purchase_rate, trade_rate, retail_price, sales_tax, created_at, updated_at
      FROM items;

      DROP TABLE items;
      ALTER TABLE items_new RENAME TO items;
    `);
  });

  db.pragma("foreign_keys = OFF");
  migrateTransaction();
  db.pragma("foreign_keys = ON");
  console.log("Migration complete.");
};

const run = async () => {
  if (!(await fs.pathExists(DB_FILE))) {
    console.log("Database file not found; nothing to migrate.");
    return;
  }

  const backup = await ensureBackup();
  console.log(`Backup created at ${backup}`);
  migrate();
};

run().catch((error) => {
  console.error("Migration failed", error);
  process.exitCode = 1;
});
