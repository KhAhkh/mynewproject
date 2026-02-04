import Database from 'better-sqlite3';
import { DB_FILE } from '../src/config.js';
import { NET_PROFIT_QUERY } from '../src/profitCalculations.js';

const db = new Database(DB_FILE);
const row = db.prepare(NET_PROFIT_QUERY).get();
console.log(JSON.stringify(row, null, 2));
