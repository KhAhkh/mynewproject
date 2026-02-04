import Database from 'better-sqlite3';
const db = new Database('data/inventory.db');

console.log('All tables:');
const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all();
console.log(JSON.stringify(tables, null, 2));

console.log('\nOpening stock tables:');
const opening = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%opening%'`).all();
console.log(JSON.stringify(opening, null, 2));

db.close();
