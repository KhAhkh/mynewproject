import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { PROFIT_BY_SALESMAN_QUERY } from '../src/profitCalculations.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database(path.join(__dirname, '../data/inventory.db'));

try {
  console.log('Running PROFIT_BY_SALESMAN_QUERY...\n');
  const result = db.prepare(PROFIT_BY_SALESMAN_QUERY).all();
  console.log('Success! Result:');
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error('Error:', error.message);
}

db.close();
