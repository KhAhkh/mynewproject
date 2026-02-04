import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = resolve(__dirname, '..', 'data', 'inventory.db');
const db = new Database(dbPath);

const username = 'saleem';
const newPassword = 'admin123';

try {
  const newPasswordHash = bcrypt.hashSync(newPassword, 10);
  const stmt = db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE username = ?');
  const result = stmt.run(newPasswordHash, new Date().toISOString(), username);
  
  if (result.changes > 0) {
    console.log(`✓ Password for user "${username}" has been reset to "${newPassword}"`);
    console.log(`  New hash: ${newPasswordHash}`);
  } else {
    console.log(`✗ User "${username}" not found`);
  }
} catch (error) {
  console.error('Error:', error.message);
} finally {
  db.close();
}
