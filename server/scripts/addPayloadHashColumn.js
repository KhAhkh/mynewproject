import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import path from "path";

const dbPath = fileURLToPath(new URL("../data/inventory.db", import.meta.url));
const db = new Database(path.resolve(dbPath));

db.pragma("journal_mode = WAL");

const columns = db.prepare("PRAGMA table_info(salesman_pending_entries)").all();
const hasPayloadHash = columns.some((column) => column.name === "payload_hash");

if (hasPayloadHash) {
  console.log("payload_hash column already exists.");
  process.exit(0);
}

db.prepare("ALTER TABLE salesman_pending_entries ADD COLUMN payload_hash TEXT").run();
console.log("payload_hash column added to salesman_pending_entries.");
