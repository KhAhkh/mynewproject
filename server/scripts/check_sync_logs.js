import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = resolve(__dirname, "../data/inventory.db");
const db = new Database(dbPath);

console.log("=== Sync Logs ===\n");
const logs = db.prepare(`
  SELECT 
    id,
    client_reference,
    entity_type,
    status,
    salesman_id,
    last_error,
    updated_at
  FROM mobile_sync_logs
  ORDER BY updated_at DESC
  LIMIT 20
`).all();

console.log(`Total sync logs: ${logs.length}`);
logs.forEach(log => {
  console.log(`
    Reference: ${log.client_reference}
    Type: ${log.entity_type}
    Status: ${log.status}
    Salesman ID: ${log.salesman_id}
    Updated: ${log.updated_at}
    Error: ${log.last_error || "none"}
  `);
});

console.log("\n=== Sync Logs by Salesman ===\n");
const byCommitee = db.prepare(`
  SELECT 
    salesman_id,
    COUNT(*) as count
  FROM mobile_sync_logs
  GROUP BY salesman_id
`).all();

byCommitee.forEach(row => {
  console.log(`Salesman ${row.salesman_id}: ${row.count} logs`);
});

db.close();
