import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import path from "path";

const dbPath = fileURLToPath(new URL("../data/inventory.db", import.meta.url));
const db = new Database(path.resolve(dbPath));
const rows = db
  .prepare(
    `SELECT client_reference AS reference,
            entity_type AS entityType,
            status,
            last_error AS lastError,
            updated_at AS updatedAt
     FROM mobile_sync_logs
     WHERE status = 'error'
     ORDER BY updated_at DESC
     LIMIT 20`
  )
  .all();

if (rows.length === 0) {
  console.log("No error rows found.");
  process.exit(0);
}

console.table(rows);
