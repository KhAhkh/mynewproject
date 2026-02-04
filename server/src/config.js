import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const PORT = process.env.PORT || 4000;
export const DATA_DIR = path.join(__dirname, "..", "data");
export const DB_FILE = path.join(DATA_DIR, "inventory.db");
export const BACKUP_DIR = path.join(DATA_DIR, "backups");
export const AUTH_SECRET = process.env.AUTH_SECRET || "inventory-auth-secret";
