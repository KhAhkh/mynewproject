import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = resolve(__dirname, "../data/inventory.db");
const db = new Database(dbPath);

console.log("=== Users and Salesmen ===\n");
const users = db.prepare(`
  SELECT 
    u.id,
    u.username,
    u.role,
    u.salesman_id,
    s.code,
    s.name
  FROM users u
  LEFT JOIN salesmen s ON s.id = u.salesman_id
  ORDER BY u.username
`).all();

users.forEach(user => {
  console.log(`
    Username: ${user.username}
    Role: ${user.role}
    Salesman ID: ${user.salesman_id || "none"}
    Salesman Code: ${user.code || "none"}
    Salesman Name: ${user.name || "none"}
  `);
});

db.close();
