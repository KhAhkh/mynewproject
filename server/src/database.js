import fs from "fs-extra";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import { DATA_DIR, DB_FILE, BACKUP_DIR } from "./config.js";
import { formatInvoiceNumber } from "./utils.js";

let dbInstance;
const PASSWORD_SALT_ROUNDS = 10;

const tableStatements = [
  `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      salesman_id INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (salesman_id) REFERENCES salesmen(id)
    )`,
  `CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      address TEXT NOT NULL,
      phone1 TEXT,
      phone2 TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
  `CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      contact_person TEXT,
      address TEXT NOT NULL,
      phone TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
  `CREATE TABLE IF NOT EXISTS areas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
  `CREATE TABLE IF NOT EXISTS salesmen (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      address TEXT NOT NULL,
      phone1 TEXT,
      phone2 TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
  `CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      address TEXT NOT NULL,
      area_id INTEGER,
      phone1 TEXT,
      phone2 TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (area_id) REFERENCES areas(id)
    )`,
  `CREATE TABLE IF NOT EXISTS expense_definitions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      description TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
  `CREATE TABLE IF NOT EXISTS banks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      account_no TEXT NOT NULL,
      name TEXT NOT NULL,
      address TEXT NOT NULL,
      phone1 TEXT,
      phone2 TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
  `CREATE TABLE IF NOT EXISTS items (
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
    )`,
  `CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_id INTEGER NOT NULL,
      invoice_no TEXT NOT NULL,
      last_invoice TEXT,
      invoice_date TEXT NOT NULL,
      total_amount REAL NOT NULL,
      amount_paid REAL NOT NULL,
      previous_balance REAL NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
    )`,
  `CREATE TABLE IF NOT EXISTS purchase_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      quantity REAL NOT NULL,
      base_unit TEXT NOT NULL,
      bonus REAL DEFAULT 0,
      discount_percent REAL DEFAULT 0,
      tax_percent REAL DEFAULT 0,
      purchase_rate REAL NOT NULL,
      net_amount REAL NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
      FOREIGN KEY (item_id) REFERENCES items(id)
    )`,
  `CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_no TEXT UNIQUE NOT NULL,
      customer_id INTEGER NOT NULL,
      salesman_id INTEGER,
      invoice_date TEXT NOT NULL,
      total_amount REAL NOT NULL,
      amount_paid REAL NOT NULL,
      previous_balance REAL NOT NULL,
      trade_off_total REAL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (salesman_id) REFERENCES salesmen(id)
    )`,
  `CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      quantity REAL NOT NULL,
      base_unit TEXT NOT NULL,
      bonus REAL DEFAULT 0,
      trade_off_price REAL DEFAULT 0,
      discount_percent REAL DEFAULT 0,
      tax_percent REAL DEFAULT 0,
      trade_price REAL NOT NULL,
      company_name TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
      FOREIGN KEY (item_id) REFERENCES items(id)
    )`,
  `CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_no TEXT UNIQUE NOT NULL,
      customer_id INTEGER NOT NULL,
      salesman_id INTEGER,
      order_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','fulfilled','cancelled')),
      remarks TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (salesman_id) REFERENCES salesmen(id)
    )`,
  `CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      quantity REAL NOT NULL,
      bonus REAL DEFAULT 0,
      base_unit TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (item_id) REFERENCES items(id)
    )`,
  `CREATE TABLE IF NOT EXISTS sale_returns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL,
      sale_item_id INTEGER NOT NULL,
      quantity REAL NOT NULL,
      return_date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (sale_id) REFERENCES sales(id),
      FOREIGN KEY (sale_item_id) REFERENCES sale_items(id)
    )`,
  `CREATE TABLE IF NOT EXISTS purchase_returns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_id INTEGER NOT NULL,
      purchase_item_id INTEGER NOT NULL,
      quantity REAL NOT NULL,
      return_date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (purchase_id) REFERENCES purchases(id),
      FOREIGN KEY (purchase_item_id) REFERENCES purchase_items(id)
    )`,
  `CREATE TABLE IF NOT EXISTS expense_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_code TEXT NOT NULL,
      voucher_no TEXT UNIQUE NOT NULL,
      voucher_date TEXT NOT NULL,
      cash_payment REAL NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (expense_code) REFERENCES expense_definitions(code)
    )`,
  `CREATE TABLE IF NOT EXISTS customer_receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      receipt_no TEXT UNIQUE NOT NULL,
      customer_id INTEGER NOT NULL,
      salesman_id INTEGER,
      receipt_date TEXT NOT NULL,
      amount REAL NOT NULL,
      details TEXT,
      payment_mode TEXT DEFAULT 'cash',
      bank_id INTEGER,
      slip_no TEXT,
      slip_date TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (salesman_id) REFERENCES salesmen(id),
      FOREIGN KEY (bank_id) REFERENCES banks(id)
    )`,
  `CREATE TABLE IF NOT EXISTS supplier_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_no TEXT UNIQUE NOT NULL,
      supplier_id INTEGER NOT NULL,
      payment_date TEXT NOT NULL,
      amount REAL NOT NULL,
      details TEXT,
      payment_mode TEXT DEFAULT 'cash',
      bank_id INTEGER,
      slip_no TEXT,
      slip_date TEXT,
      attachment_image TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
      FOREIGN KEY (bank_id) REFERENCES banks(id)
    )`,
  `CREATE TABLE IF NOT EXISTS customer_opening_balances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    )`,
  `CREATE TABLE IF NOT EXISTS supplier_opening_balances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
    )`,
  `CREATE TABLE IF NOT EXISTS bank_opening_balances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bank_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (bank_id) REFERENCES banks(id)
    )`,
  `CREATE TABLE IF NOT EXISTS salesman_receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      receipt_no TEXT UNIQUE NOT NULL,
      salesman_id INTEGER NOT NULL,
      receipt_date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (salesman_id) REFERENCES salesmen(id)
    )`,
  `CREATE TABLE IF NOT EXISTS salesman_receipt_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      receipt_id INTEGER NOT NULL,
      customer_id INTEGER NOT NULL,
      received_amount REAL NOT NULL,
      previous_balance REAL NOT NULL,
      net_balance REAL NOT NULL,
      remarks TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (receipt_id) REFERENCES salesman_receipts(id) ON DELETE CASCADE,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    )`,
  `CREATE TABLE IF NOT EXISTS salesman_bonuses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      voucher_no TEXT UNIQUE NOT NULL,
      salesman_id INTEGER NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      target_amount REAL NOT NULL,
      bonus_amount REAL DEFAULT 0,
      bonus_percent REAL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (salesman_id) REFERENCES salesmen(id)
    )`,
  `CREATE TABLE IF NOT EXISTS bank_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_type TEXT NOT NULL CHECK (transaction_type IN ('deposit','drawing')),
      bank_id INTEGER,
      slip_no TEXT,
      slip_date TEXT NOT NULL,
      cash_amount REAL NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (bank_id) REFERENCES banks(id)
    )`
  ,
  `CREATE TABLE IF NOT EXISTS mobile_sync_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      salesman_id INTEGER,
      client_reference TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      status TEXT NOT NULL,
      payload_hash TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(client_reference, entity_type),
      FOREIGN KEY (salesman_id) REFERENCES salesmen(id)
    )`
  ,
  `CREATE TABLE IF NOT EXISTS salesman_pending_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_type TEXT NOT NULL CHECK (entry_type IN ('order','recovery')),
      client_reference TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
      payload TEXT NOT NULL,
      customer_code TEXT NOT NULL,
      customer_name TEXT,
      salesman_code TEXT,
      salesman_name TEXT,
      salesman_id INTEGER,
      payload_hash TEXT,
      gps_latitude REAL,
      gps_longitude REAL,
      gps_accuracy REAL,
      gps_recorded_at TEXT,
      summary_amount REAL,
      summary_count INTEGER,
      entity_id INTEGER,
      reviewer_id INTEGER,
      reviewer_name TEXT,
      reviewed_at TEXT,
      rejection_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(entry_type, client_reference),
      FOREIGN KEY (salesman_id) REFERENCES salesmen(id)
    )`
  ,
  `CREATE TABLE IF NOT EXISTS damage_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      voucher_no TEXT UNIQUE NOT NULL,
      transaction_type TEXT NOT NULL CHECK (transaction_type IN ('in','out')),
      item_id INTEGER NOT NULL,
      supplier_id INTEGER NOT NULL,
      quantity REAL NOT NULL,
      transaction_date TEXT NOT NULL,
      notes TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (item_id) REFERENCES items(id),
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
    )`
];

export const getDb = () => {
  if (!dbInstance) {
    fs.ensureDirSync(DATA_DIR);
    fs.ensureDirSync(BACKUP_DIR);
    dbInstance = new Database(DB_FILE);
    dbInstance.pragma("foreign_keys = ON");
    const now = () => new Date().toISOString();

    const createStmt = dbInstance.transaction(() => {
      for (const statement of tableStatements) {
        dbInstance.prepare(statement).run();
      }
    });

    createStmt();

    const ensureColumn = (table, column, definition) => {
      const info = dbInstance.prepare(`PRAGMA table_info(${table})`).all();
      const hasColumn = info.some((col) => col.name === column);
      if (!hasColumn) {
        dbInstance.prepare(`ALTER TABLE ${table} ADD COLUMN ${definition}`).run();
      }
    };

    ensureColumn("purchase_items", "tax_percent", "tax_percent REAL DEFAULT 0");

    const ensureUserSchema = () => {
      const columnInfo = dbInstance.prepare(`PRAGMA table_info(users)`).all();
      const hasColumn = (name) => columnInfo.some((col) => col.name === name);
      const nowIsoString = now();

      if (!hasColumn("password_hash")) {
        dbInstance.prepare("ALTER TABLE users ADD COLUMN password_hash TEXT").run();
      }
      if (!hasColumn("is_active")) {
        dbInstance.prepare("ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1").run();
      }
      if (!hasColumn("role")) {
        dbInstance.prepare("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'viewer'").run();
      }
      if (!hasColumn("created_at")) {
        dbInstance.prepare("ALTER TABLE users ADD COLUMN created_at TEXT").run();
      }
      if (!hasColumn("updated_at")) {
        dbInstance.prepare("ALTER TABLE users ADD COLUMN updated_at TEXT").run();
      }
      if (!hasColumn("salesman_id")) {
        dbInstance.prepare("ALTER TABLE users ADD COLUMN salesman_id INTEGER").run();
      }

      dbInstance.prepare("UPDATE users SET is_active = COALESCE(is_active, 1)").run();
      dbInstance.prepare("UPDATE users SET role = COALESCE(role, 'viewer')").run();
      dbInstance
        .prepare("UPDATE users SET created_at = COALESCE(created_at, @now)")
        .run({ now: nowIsoString });
      dbInstance
        .prepare("UPDATE users SET updated_at = COALESCE(updated_at, @now)")
        .run({ now: nowIsoString });

      const hasPlainPassword = hasColumn("password");
      if (hasPlainPassword) {
        const legacyRows = dbInstance
          .prepare(
            `SELECT id, password, password_hash FROM users WHERE password IS NOT NULL AND TRIM(password) <> ''`
          )
          .all();
        if (legacyRows.length > 0) {
          const updateStmt = dbInstance.prepare(
            `UPDATE users SET password_hash = @password_hash, updated_at = @updated_at WHERE id = @id`
          );
          const applyHashes = dbInstance.transaction((rows) => {
            for (const row of rows) {
              if (!row.password) continue;
              const hash = bcrypt.hashSync(row.password, PASSWORD_SALT_ROUNDS);
              updateStmt.run({
                id: row.id,
                password_hash: hash,
                updated_at: now()
              });
            }
          });
          applyHashes(legacyRows);
        }
      }

      const missingHashes = dbInstance
        .prepare(`SELECT id FROM users WHERE password_hash IS NULL OR TRIM(password_hash) = ''`)
        .all();
      if (missingHashes.length > 0) {
        const updateStmt = dbInstance.prepare(
          `UPDATE users SET password_hash = @password_hash, updated_at = @updated_at WHERE id = @id`
        );
        const applyDefault = dbInstance.transaction((rows) => {
          for (const row of rows) {
            const hash = bcrypt.hashSync("Inspire31245", PASSWORD_SALT_ROUNDS);
            updateStmt.run({
              id: row.id,
              password_hash: hash,
              updated_at: now()
            });
          }
        });
        applyDefault(missingHashes);
      }
    };

    ensureUserSchema();

    const ensureDefaultAdmin = () => {
      const existing = dbInstance
        .prepare(`SELECT id FROM users WHERE username = ? COLLATE NOCASE LIMIT 1`)
        .get("Admin");
      if (existing) return;

      const nowIsoString = now();
      const passwordHash = bcrypt.hashSync("Inspire31245", PASSWORD_SALT_ROUNDS);
      dbInstance
        .prepare(
          `INSERT INTO users (username, password_hash, role, is_active, created_at, updated_at)
           VALUES (@username, @password_hash, @role, @is_active, @created_at, @updated_at)`
        )
        .run({
          username: "Admin",
          password_hash: passwordHash,
          role: "admin",
          is_active: 1,
          created_at: nowIsoString,
          updated_at: nowIsoString
        });
    };

    ensureDefaultAdmin();

    ensureColumn("sale_items", "quantity", "quantity REAL NOT NULL DEFAULT 0");
    ensureColumn("sale_items", "tax_percent", "tax_percent REAL DEFAULT 0");
    ensureColumn("customer_receipts", "payment_mode", "payment_mode TEXT DEFAULT 'cash'");
    ensureColumn("customer_receipts", "bank_id", "bank_id INTEGER");
    ensureColumn("customer_receipts", "slip_no", "slip_no TEXT");
    ensureColumn("customer_receipts", "slip_date", "slip_date TEXT");
    ensureColumn("customer_receipts", "attachment_image", "attachment_image TEXT");
    ensureColumn("supplier_payments", "payment_mode", "payment_mode TEXT DEFAULT 'cash'");
    ensureColumn("supplier_payments", "bank_id", "bank_id INTEGER");
    ensureColumn("supplier_payments", "slip_no", "slip_no TEXT");
    ensureColumn("supplier_payments", "slip_date", "slip_date TEXT");
    ensureColumn("purchase_returns", "return_no", "return_no TEXT");
    ensureColumn("bank_transactions", "customer_receipt_id", "customer_receipt_id INTEGER");
    ensureColumn("bank_transactions", "entry_no", "entry_no TEXT");
    ensureColumn("bank_transactions", "supplier_payment_id", "supplier_payment_id INTEGER");
    ensureColumn("damage_transactions", "voucher_no", "voucher_no TEXT");
    ensureColumn("mobile_sync_logs", "salesman_id", "salesman_id INTEGER");
    ensureColumn("salesman_pending_entries", "gps_latitude", "gps_latitude REAL");
    ensureColumn("salesman_pending_entries", "gps_longitude", "gps_longitude REAL");
    ensureColumn("salesman_pending_entries", "gps_accuracy", "gps_accuracy REAL");
    ensureColumn("salesman_pending_entries", "gps_recorded_at", "gps_recorded_at TEXT");
    ensureColumn("salesman_pending_entries", "payload_hash", "payload_hash TEXT");
    ensureColumn("salesman_pending_entries", "gps_latitude", "gps_latitude REAL");
    ensureColumn("salesman_pending_entries", "gps_longitude", "gps_longitude REAL");
    ensureColumn("salesman_pending_entries", "gps_accuracy", "gps_accuracy REAL");
    ensureColumn("salesman_pending_entries", "gps_recorded_at", "gps_recorded_at TEXT");

    const extractSequence = (value) => {
      if (!value) return "000000";
      const match = String(value).match(/(\d+)$/);
      return match ? match[1].padStart(6, "0") : "000000";
    };

    const assignMissingBankEntryNumbers = () => {
      const missing = dbInstance
        .prepare(`SELECT id FROM bank_transactions WHERE entry_no IS NULL ORDER BY id ASC`)
        .all();
      if (missing.length === 0) return;

      const last = dbInstance
        .prepare(`SELECT entry_no FROM bank_transactions WHERE entry_no IS NOT NULL ORDER BY id DESC LIMIT 1`)
        .get();
      let currentNumeric = extractSequence(last?.entry_no);
      const update = dbInstance.prepare(`UPDATE bank_transactions SET entry_no = ? WHERE id = ?`);

      const assignMany = dbInstance.transaction((rows) => {
        let running = currentNumeric;
        for (const row of rows) {
          running = formatInvoiceNumber("", running);
          update.run(`BT${running}`, row.id);
        }
        currentNumeric = running;
      });

      assignMany(missing);
    };

    assignMissingBankEntryNumbers();

    const assignMissingDamageVouchers = () => {
      const missing = dbInstance
        .prepare(`SELECT id FROM damage_transactions WHERE voucher_no IS NULL OR voucher_no = '' ORDER BY id ASC`)
        .all();
      if (missing.length === 0) return;

      const last = dbInstance
        .prepare(`SELECT voucher_no FROM damage_transactions WHERE voucher_no IS NOT NULL AND voucher_no <> '' ORDER BY id DESC LIMIT 1`)
        .get();

      let currentNumeric = extractSequence(last?.voucher_no);
      const update = dbInstance.prepare(`UPDATE damage_transactions SET voucher_no = ? WHERE id = ?`);

      const assignMany = dbInstance.transaction((rows) => {
        let running = currentNumeric;
        for (const row of rows) {
          running = formatInvoiceNumber("", running);
          update.run(`V${running}`, row.id);
        }
        currentNumeric = running;
      });

      assignMany(missing);
    };

    assignMissingDamageVouchers();

    // Add is_cancelled column to purchases and sales if not exists
    const addCancelledColumn = () => {
      const purchasesColumns = dbInstance.pragma("table_info(purchases)");
      const hasPurchaseCancelled = purchasesColumns.some(col => col.name === "is_cancelled");
      if (!hasPurchaseCancelled) {
        dbInstance.exec("ALTER TABLE purchases ADD COLUMN is_cancelled INTEGER NOT NULL DEFAULT 0");
        console.log("Added is_cancelled column to purchases table");
      }

      const salesColumns = dbInstance.pragma("table_info(sales)");
      const hasSaleCancelled = salesColumns.some(col => col.name === "is_cancelled");
      if (!hasSaleCancelled) {
        dbInstance.exec("ALTER TABLE sales ADD COLUMN is_cancelled INTEGER NOT NULL DEFAULT 0");
        console.log("Added is_cancelled column to sales table");
      }
    };

    addCancelledColumn();

    const assignMissingPurchaseReturnNumbers = () => {
      const missing = dbInstance
        .prepare(
          `SELECT id
           FROM purchase_returns
           WHERE return_no IS NULL
              OR return_no = ''
              OR SUBSTR(return_no, 3) GLOB '*[^0-9]*'
           ORDER BY id ASC`
        )
        .all();
      if (missing.length === 0) return;

      const last = dbInstance
        .prepare(
          `SELECT return_no
           FROM purchase_returns
           WHERE return_no GLOB 'PR[0-9][0-9][0-9][0-9][0-9][0-9]'
           ORDER BY id DESC LIMIT 1`
        )
        .get();

      let currentNumeric = extractSequence(last?.return_no);
      const update = dbInstance.prepare(`UPDATE purchase_returns SET return_no = ? WHERE id = ?`);

      const assignMany = dbInstance.transaction((rows) => {
        let runningNumeric = currentNumeric;
        for (const row of rows) {
          runningNumeric = formatInvoiceNumber("", runningNumeric);
          update.run(`PR${runningNumeric}`, row.id);
        }
        currentNumeric = runningNumeric;
      });

      assignMany(missing);
    };

    assignMissingPurchaseReturnNumbers();

    dbInstance.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_damage_transactions_voucher ON damage_transactions(voucher_no)`).run();

    dbInstance.prepare(`UPDATE customer_receipts SET payment_mode = 'cash' WHERE payment_mode IS NULL OR payment_mode = ''`).run();

    const backfillBankDeposits = () => {
      const rows = dbInstance
        .prepare(
          `SELECT cr.id,
                  cr.bank_id,
                  cr.slip_no,
                  cr.slip_date,
                  cr.receipt_date,
                  cr.amount,
                  cr.created_at,
                  cr.updated_at
           FROM customer_receipts cr
           WHERE cr.bank_id IS NOT NULL
             AND cr.payment_mode IN ('bank', 'online')
             AND NOT EXISTS (
               SELECT 1
               FROM bank_transactions bt
               WHERE bt.customer_receipt_id = cr.id
             )`
        )
        .all();

      if (rows.length === 0) return;

      const insert = dbInstance.prepare(
        `INSERT INTO bank_transactions (
            transaction_type,
            bank_id,
            slip_no,
            slip_date,
            cash_amount,
            customer_receipt_id,
            created_at,
            updated_at
         )
         VALUES ('deposit', ?, ?, ?, ?, ?, ?, ?)`
      );

      const insertMany = dbInstance.transaction((pending) => {
        const toDate = (value, fallback) => {
          if (value) return value;
          if (fallback) return fallback;
          return new Date().toISOString().slice(0, 10);
        };

        for (const row of pending) {
          const amount = Number(row.amount) || 0;
          if (!Number.isFinite(amount) || amount <= 0) {
            continue;
          }
          const slipDate = toDate(row.slip_date, row.receipt_date);
          const createdAt = row.created_at || new Date().toISOString();
          const updatedAt = row.updated_at || createdAt;
          insert.run(
            row.bank_id,
            row.slip_no || null,
            slipDate,
            amount,
            row.id,
            createdAt,
            updatedAt
          );
        }
      });

      insertMany(rows);
    };

    backfillBankDeposits();
    assignMissingBankEntryNumbers();

    // Seed data only if baseline tables empty
    const companyCount = dbInstance.prepare("SELECT COUNT(1) as count FROM companies").get().count;
    if (companyCount === 0) {
      const timestamp = now();
      const insertCompany = dbInstance.prepare(
        `INSERT INTO companies (code, name, address, phone1, phone2, created_at, updated_at)
         VALUES (@code, @name, @address, @phone1, @phone2, @created_at, @updated_at)`
      );
      insertCompany.run({
        code: "CMP001",
        name: "Demo Company",
        address: "123 Demo Street",
        phone1: "",
        phone2: "",
        created_at: timestamp,
        updated_at: timestamp
      });
    }
  }

  return dbInstance;
};

export const closeDb = () => {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = undefined;
  }
};
