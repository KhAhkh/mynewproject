import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs-extra";
import path from "path";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { PORT, DB_FILE, BACKUP_DIR, AUTH_SECRET } from "./config.js";
import { getDb } from "./database.js";
import { nowIso, toDisplayDate, toStorageDate, formatInvoiceNumber } from "./utils.js";
import {
  calculateProfitMetrics,
  NET_PROFIT_QUERY,
  PROFIT_SUMMARY_QUERY,
  PROFIT_BY_ITEM_QUERY,
  PROFIT_BY_CUSTOMER_QUERY,
  PROFIT_BY_COMPANY_QUERY,
  PROFIT_BY_DATE_QUERY,
  PROFIT_BY_SALESMAN_QUERY
} from "./profitCalculations.js";

const app = express();
app.use(cors());
// Increase body limits to accept mobile uploads with embedded base64 images
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

const upload = multer({ dest: path.join(BACKUP_DIR, "uploads") });

const TOKEN_EXPIRY = "12h";
const TOKEN_EXPIRY_SECONDS = 12 * 60 * 60;
const PASSWORD_SALT_ROUNDS = 10;

const ROLE_PRIVILEGES = {
  admin: [
    "users.manage",
    "master.manage",
    "transactions.process",
    "editing.modify",
    "reports.view",
    "history.view",
    "backups.manage"
  ],
  manager: ["master.manage", "transactions.process", "reports.view", "history.view"],
  viewer: ["reports.view", "history.view"]
};

const USER_ROLES = Object.keys(ROLE_PRIVILEGES);

const normalizeUsername = (value = "") => value.trim();

const mapUserAccount = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    salesmanId: row.salesman_id ?? null,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    privileges: ROLE_PRIVILEGES[row.role] ?? []
  };
};

const issueToken = (user) =>
  jwt.sign(
    {
      sub: user.id,
      username: user.username,
      role: user.role
    },
    AUTH_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );

const requirePrivilege = (privilege) => (req, res, next) => {
  if (!req.user?.privileges?.includes(privilege)) {
    return res.status(403).json({ message: "Insufficient privileges." });
  }
  next();
};

const authenticateRequest = (req, res, next) => {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Authentication required." });
  }

  const token = header.slice(7).trim();
  if (!token) {
    return res.status(401).json({ message: "Authentication required." });
  }

  try {
    const payload = jwt.verify(token, AUTH_SECRET);
    const db = getDb();
    const userRow = db
      .prepare(`SELECT * FROM users WHERE id = ? LIMIT 1`)
      .get(payload?.sub);
    if (!userRow || Number(userRow.is_active) === 0) {
      return res.status(401).json({ message: "Account is disabled." });
    }
    req.user = mapUserAccount(userRow);
    next();
  } catch (error) {
    console.error("Authentication failed:", error);
    return res.status(401).json({ message: "Invalid or expired session." });
  }
};

const listQuery = (table, searchableColumns = ["name"], extraWhere = "") => {
  const db = getDb();
  return (req, res) => {
    const { search = "", limit = 50, offset = 0 } = req.query;
    const like = `%${search.trim()}%`;
    const whereClauses = [];
    const params = { limit: Number(limit), offset: Number(offset) };
    if (search) {
      const clause = searchableColumns.map((col, idx) => {
        const key = `search${idx}`;
        params[key] = like;
        return `${col} LIKE @${key}`;
      }).join(" OR ");
      whereClauses.push(`(${clause})`);
    }
    if (extraWhere) {
      whereClauses.push(extraWhere.condition);
      Object.assign(params, extraWhere.params || {});
    }
    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";
    const orderColumn = extraWhere?.orderBy ?? searchableColumns[0] ?? "id";
    const rows = db.prepare(
      `SELECT * FROM ${table} ${whereSql} ORDER BY ${orderColumn} LIMIT @limit OFFSET @offset`
    ).all(params);
    res.json(rows.map(mapRowDates));
  };
};

const mapRowDates = (row) => {
  if (!row) return row;
  const mapped = { ...row };
  if (mapped.invoice_date) mapped.invoice_date = toDisplayDate(mapped.invoice_date);
  if (mapped.order_date) mapped.order_date = toDisplayDate(mapped.order_date);
  if (mapped.voucher_date) mapped.voucher_date = toDisplayDate(mapped.voucher_date);
  if (mapped.receipt_date) mapped.receipt_date = toDisplayDate(mapped.receipt_date);
  if (mapped.payment_date) mapped.payment_date = toDisplayDate(mapped.payment_date);
  if (mapped.transaction_date) mapped.transaction_date = toDisplayDate(mapped.transaction_date);
  if (mapped.slip_date) mapped.slip_date = toDisplayDate(mapped.slip_date);
  if (mapped.return_date) mapped.return_date = toDisplayDate(mapped.return_date);
  return mapped;
};

const ORDER_STATUSES = new Set(["pending", "confirmed", "fulfilled", "cancelled"]);

const MOBILE_SYNC_ENTITY_TYPES = {
  ORDER: "order",
  RECOVERY: "recovery"
};

const PENDING_ENTRY_STATUSES = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected"
};

const createHttpError = (status, message) => {
  const error = new Error(message);
  error.statusCode = status;
  return error;
};

const hashPayload = (payload) => {
  try {
    return crypto.createHash("sha256").update(JSON.stringify(payload ?? {})).digest("hex");
  } catch {
    return null;
  }
};

const serializeJson = (value) => {
  try {
    return JSON.stringify(value ?? null);
  } catch (error) {
    console.error("Failed to serialize payload", error);
    return null;
  }
};

const parseJson = (value) => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (error) {
    console.error("Failed to parse JSON", error);
    return null;
  }
};

const normalizeGeoPoint = (location) => {
  if (!location) return null;
  const latitudeInput = location.latitude ?? location.lat ?? location.latitud ?? null;
  const longitudeInput = location.longitude ?? location.lng ?? location.lon ?? null;
  const latitude = Number(latitudeInput);
  const longitude = Number(longitudeInput);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  const accuracyValue = location.accuracy ?? location.precision ?? null;
  const accuracy = Number(accuracyValue);
  const timestampInput = location.timestamp || location.recordedAt || location.capturedAt || null;
  let recordedAt = null;
  if (timestampInput) {
    const parsed = new Date(timestampInput);
    recordedAt = Number.isNaN(parsed.getTime()) ? nowIso() : parsed.toISOString();
  } else {
    recordedAt = nowIso();
  }
  return {
    latitude: Number(latitude.toFixed(6)),
    longitude: Number(longitude.toFixed(6)),
    accuracy: Number.isFinite(accuracy) ? Number(Number(accuracy).toFixed(2)) : null,
    recordedAt
  };
};

const defaultDisplayDate = () => toDisplayDate(nowIso().slice(0, 10));

const getCustomerOrThrow = (code) => {
  const normalized = (code || "").trim();
  if (!normalized) {
    throw createHttpError(400, "Customer code is required.");
  }
  const customer = findByCode("customers", normalized);
  if (!customer) {
    throw createHttpError(400, `Customer not found: ${normalized}`);
  }
  return customer;
};

const resolveSalesmanRecord = (salesmanCode, fallback) => {
  const normalized = (salesmanCode || "").trim();
  if (!normalized) {
    return fallback || null;
  }
  const salesman = findByCode("salesmen", normalized);
  if (!salesman) {
    throw createHttpError(400, `Salesman not found: ${normalized}`);
  }
  return salesman;
};

const normalizeOrderSubmission = (payload, fallbackSalesman) => {
  const working = payload ?? {};
  const customer = getCustomerOrThrow(working.customerCode);
  const salesman = resolveSalesmanRecord(working.salesmanCode, fallbackSalesman);
  if (!salesman) {
    throw createHttpError(400, "Salesman information is required.");
  }

  const dateInput = working.date || working.orderDate || working.invoiceDate || defaultDisplayDate();
  const storageDate = toStorageDate(dateInput);
  if (!storageDate) {
    throw createHttpError(400, "Invalid order date. Use DD-MM-YYYY.");
  }

  const rawItems = Array.isArray(working.items) ? working.items : [];
  if (rawItems.length === 0) {
    throw createHttpError(400, "At least one item is required.");
  }

  const normalizedItems = rawItems.map((entry, index) => {
    const itemCode = (entry?.itemCode || entry?.code || "").trim();
    if (!itemCode) {
      throw createHttpError(400, `Item code is required for row ${index + 1}.`);
    }
    const item = findByCode("items", itemCode);
    if (!item) {
      throw createHttpError(400, `Item not found: ${itemCode}.`);
    }
    const quantity = Number(entry.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw createHttpError(400, `Enter a quantity greater than zero for ${itemCode}.`);
    }
    const bonus = Number(entry.bonus || 0);
    if (!Number.isFinite(bonus) || bonus < 0) {
      throw createHttpError(400, `Bonus for ${itemCode} cannot be negative.`);
    }
    return {
      itemCode,
      itemName: item.name,
      baseUnit: item.base_unit,
      quantity,
      bonus,
      notes: typeof entry.notes === "string" ? entry.notes.trim() : ""
    };
  });

  const normalized = {
    customerCode: customer.code,
    salesmanCode: salesman.code,
    date: dateInput,
    remarks: typeof working.remarks === "string" ? working.remarks.trim() : "",
    items: normalizedItems
  };

  if (working.status) {
    const candidate = String(working.status).toLowerCase();
    if (ORDER_STATUSES.has(candidate)) {
      normalized.status = candidate;
    }
  }

  const totalQuantity = normalizedItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);

  return {
    payload: normalized,
    customer,
    salesman,
    summary: {
      count: normalizedItems.length,
      amount: Number(totalQuantity.toFixed(2))
    }
  };
};

const normalizeRecoverySubmission = (payload, fallbackSalesman) => {
  const working = payload ?? {};
  const customer = getCustomerOrThrow(working.customerCode);
  const amount = Number(working.amount ?? working.receivedAmount ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw createHttpError(400, "Amount must be greater than zero.");
  }

  const receiptDate = working.receiptDate || working.date || defaultDisplayDate();
  const storageDate = toStorageDate(receiptDate);
  if (!storageDate) {
    throw createHttpError(400, "Invalid receipt date. Use DD-MM-YYYY.");
  }

  const paymentMode = (working.paymentMode || "cash").toLowerCase();
  if (!["cash", "online", "bank"].includes(paymentMode)) {
    throw createHttpError(400, "Invalid payment mode.");
  }

  const bankCode = typeof working.bankCode === "string" ? working.bankCode.trim() : working.bank?.code || null;
  const slipNo = typeof working.slipNo === "string" ? working.slipNo.trim() : "";
  const slipDate = typeof working.slipDate === "string" ? working.slipDate.trim() : "";

  if (paymentMode !== "cash") {
    if (!bankCode) {
      throw createHttpError(400, "Bank code is required for this payment mode.");
    }
    const bank = findByCode("banks", bankCode);
    if (!bank) {
      throw createHttpError(400, `Bank not found: ${bankCode}.`);
    }
  }

  if (paymentMode === "online" && !slipNo) {
    throw createHttpError(400, "Transaction ID is required for online payments.");
  }

  if (paymentMode === "bank") {
    if (!slipNo) {
      throw createHttpError(400, "Slip number is required for bank deposits.");
    }
    if (!toStorageDate(slipDate)) {
      throw createHttpError(400, "Slip date must be DD-MM-YYYY.");
    }
  }

  const normalized = {
    customerCode: customer.code,
    amount: Number(amount.toFixed(2)),
    paymentMode,
    receiptDate,
    details: typeof working.details === "string" ? working.details.trim() : "",
    bankCode: bankCode || null,
    slipNo: slipNo || null,
    slipDate: slipDate || null,
    attachmentImage: working.attachmentImage || null
  };

  if (working.salesmanCode) {
    normalized.salesmanCode = String(working.salesmanCode).trim();
  }

  return {
    payload: normalized,
    customer,
    salesman: fallbackSalesman || null,
    summary: {
      count: 1,
      amount: Number(amount.toFixed(2))
    }
  };
};

const findPendingEntryByReference = (db, entryType, reference) => {
  if (!reference) return null;
  return db
    .prepare(
      `SELECT *
       FROM salesman_pending_entries
       WHERE entry_type = ? AND client_reference = ?`
    )
    .get(entryType, reference);
};

const findPendingEntryById = (db, id) => {
  if (!id) return null;
  return db.prepare(`SELECT * FROM salesman_pending_entries WHERE id = ?`).get(id);
};

const mapPendingEntryRow = (row) => {
  if (!row) return null;
  const location =
    row.gps_latitude === null || row.gps_longitude === null
      ? null
      : {
          latitude: Number(row.gps_latitude),
          longitude: Number(row.gps_longitude),
          accuracy: row.gps_accuracy === null ? null : Number(row.gps_accuracy),
          recordedAt: row.gps_recorded_at || null
        };
  return {
    id: row.id,
    entryType: row.entry_type,
    clientReference: row.client_reference,
    status: row.status,
    payload: parseJson(row.payload),
    customerCode: row.customer_code,
    customerName: row.customer_name,
    salesmanCode: row.salesman_code,
    salesmanName: row.salesman_name,
    salesmanId: row.salesman_id,
    summaryAmount: row.summary_amount === null ? null : Number(row.summary_amount),
    summaryCount: row.summary_count === null ? null : Number(row.summary_count),
    entityId: row.entity_id,
    reviewerId: row.reviewer_id,
    reviewerName: row.reviewer_name,
    reviewedAt: row.reviewed_at,
    rejectionReason: row.rejection_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    location
  };
};

const updatePendingEntryLocation = (db, pendingId, location) => {
  if (!pendingId || !location) {
    return;
  }
  const timestamp = nowIso();
  db
    .prepare(
      `UPDATE salesman_pending_entries
       SET gps_latitude = @latitude,
           gps_longitude = @longitude,
           gps_accuracy = @accuracy,
           gps_recorded_at = @recordedAt,
           updated_at = @updatedAt
       WHERE id = @id`
    )
    .run({
      latitude: location.latitude ?? null,
      longitude: location.longitude ?? null,
      accuracy: location.accuracy ?? null,
      recordedAt: location.recordedAt ?? timestamp,
      updatedAt: timestamp,
      id: pendingId
    });
};

const queuePendingEntry = (db, entry) => {
  const payloadText = serializeJson(entry.payload);
  if (!payloadText) {
    throw createHttpError(400, "Unable to serialize payload for approval queue.");
  }
  const timestamp = nowIso();
  const gpsLocation = entry.location ?? null;
  const stmt = db.prepare(
    `INSERT INTO salesman_pending_entries (
        entry_type,
        client_reference,
        status,
        payload,
        payload_hash,
        customer_code,
        customer_name,
        salesman_code,
        salesman_name,
        salesman_id,
        gps_latitude,
        gps_longitude,
        gps_accuracy,
        gps_recorded_at,
        summary_amount,
        summary_count,
        created_at,
        updated_at
     ) VALUES (@entryType, @clientReference, @status, @payload, @payloadHash, @customerCode, @customerName, @salesmanCode, @salesmanName, @salesmanId, @gpsLatitude, @gpsLongitude, @gpsAccuracy, @gpsRecordedAt, @summaryAmount, @summaryCount, @timestamp, @timestamp)`
  );

  try {
    const info = stmt.run({
      entryType: entry.entryType,
      clientReference: entry.reference,
      status: PENDING_ENTRY_STATUSES.PENDING,
      payload: payloadText,
      payloadHash: entry.payloadHash,
      customerCode: entry.customerCode,
      customerName: entry.customerName,
      salesmanCode: entry.salesmanCode,
      salesmanName: entry.salesmanName,
      salesmanId: entry.salesmanId ?? null,
      gpsLatitude: gpsLocation?.latitude ?? null,
      gpsLongitude: gpsLocation?.longitude ?? null,
      gpsAccuracy: gpsLocation?.accuracy ?? null,
      gpsRecordedAt: gpsLocation?.recordedAt ?? null,
      summaryAmount: entry.summaryAmount ?? null,
      summaryCount: entry.summaryCount ?? null,
      timestamp
    });
    return findPendingEntryById(db, info.lastInsertRowid);
  } catch (error) {
    if (error?.code === "SQLITE_CONSTRAINT_UNIQUE") {
      const duplicate = findPendingEntryByReference(db, entry.entryType, entry.reference);
      if (duplicate && gpsLocation) {
        updatePendingEntryLocation(db, duplicate.id, gpsLocation);
      }
      return duplicate;
    }
    throw error;
  }
};

const findSyncLog = (db, reference, entityType, salesmanId) => {
  if (!reference) return null;
  const params = [reference, entityType];
  let whereClause = "client_reference = ? AND entity_type = ?";
  if (salesmanId) {
    whereClause += " AND salesman_id = ?";
    params.push(salesmanId);
  }
  return db
    .prepare(
      `SELECT id, salesman_id, entity_id, status, payload_hash, last_error, updated_at
       FROM mobile_sync_logs
       WHERE ${whereClause}`
    )
    .get(...params);
};

const upsertSyncLog = (
  db,
  { reference, entityType, entityId, status, payloadHash, lastError, salesmanId }
) => {
  const timestamp = nowIso();
  const existing = findSyncLog(db, reference, entityType, salesmanId);
  if (existing) {
    db
      .prepare(
        `UPDATE mobile_sync_logs
         SET entity_id = @entityId,
             status = @status,
             payload_hash = @payloadHash,
             last_error = @lastError,
             salesman_id = COALESCE(@salesmanId, salesman_id),
             updated_at = @timestamp
         WHERE id = @id`
      )
      .run({
        entityId: entityId ?? existing.entity_id ?? null,
        status,
        payloadHash: payloadHash ?? existing.payload_hash ?? null,
        lastError: lastError ?? null,
        timestamp,
        id: existing.id,
        salesmanId: salesmanId ?? existing.salesman_id ?? null
      });
    return existing;
  }

  db
    .prepare(
      `INSERT INTO mobile_sync_logs (client_reference, entity_type, entity_id, status, payload_hash, last_error, salesman_id, created_at, updated_at)
       VALUES (@reference, @entityType, @entityId, @status, @payloadHash, @lastError, @salesmanId, @timestamp, @timestamp)`
    )
    .run({
      reference,
      entityType,
      entityId: entityId ?? null,
      status,
      payloadHash: payloadHash ?? null,
      lastError: lastError ?? null,
      salesmanId: salesmanId ?? null,
      timestamp
    });
  return null;
};

const fetchSyncStatusLog = (db, salesmanId, limit = 50) => {
  if (!salesmanId) {
    return [];
  }

  const rows = db
    .prepare(
      `SELECT client_reference,
              entity_type,
              status,
              last_error,
              updated_at
       FROM mobile_sync_logs
       WHERE salesman_id = ?
       ORDER BY updated_at DESC
       LIMIT ?`
    )
    .all(salesmanId, limit);

  if (!rows.length) {
    return rows;
  }

  const pendingLookup = db.prepare(
    `SELECT 1
     FROM salesman_pending_entries
     WHERE entry_type = ? AND client_reference = ?
     LIMIT 1`
  );

  return rows.filter((row) => {
    if (row.status !== PENDING_ENTRY_STATUSES.PENDING) {
      return true;
    }
    const stillPending = pendingLookup.get(row.entity_type, row.client_reference);
    return Boolean(stillPending);
  });
};

const extractNumericSequence = (value) => {
  if (!value) return "0";
  const match = String(value).match(/(\d+)$/);
  return match ? match[1] : "0";
};

const getAvailableUnits = (db, itemId) => {
  const purchasedRow = db
    .prepare(
      `SELECT COALESCE(SUM(quantity + COALESCE(bonus, 0)), 0) AS units
       FROM purchase_items
       WHERE item_id = ?`
    )
    .get(itemId);

  const purchaseReturnRow = db
    .prepare(
      `SELECT COALESCE(SUM(quantity), 0) AS units
       FROM purchase_returns
       WHERE purchase_item_id IN (SELECT id FROM purchase_items WHERE item_id = ?)`
    )
    .get(itemId);

  const soldRow = db
    .prepare(
      `SELECT COALESCE(SUM(quantity + COALESCE(bonus, 0)), 0) AS units
       FROM sale_items
       WHERE item_id = ?`
    )
    .get(itemId);

  const saleReturnRow = db
    .prepare(
      `SELECT COALESCE(SUM(quantity), 0) AS units
       FROM sale_returns
       WHERE sale_item_id IN (SELECT id FROM sale_items WHERE item_id = ?)`
    )
    .get(itemId);

  const purchasedUnits = Number(purchasedRow?.units || 0);
  const purchaseReturnUnits = Number(purchaseReturnRow?.units || 0);
  const soldUnits = Number(soldRow?.units || 0);
  const saleReturnUnits = Number(saleReturnRow?.units || 0);

  // Damage adjustments
  const damageOutRow = db
    .prepare(
      `SELECT COALESCE(SUM(quantity), 0) AS units
       FROM damage_transactions
       WHERE item_id = ? AND transaction_type = 'out'`
    )
    .get(itemId);

  const damageInRow = db
    .prepare(
      `SELECT COALESCE(SUM(quantity), 0) AS units
       FROM damage_transactions
       WHERE item_id = ? AND transaction_type = 'in'`
    )
    .get(itemId);

  const damageOutUnits = Number(damageOutRow?.units || 0);
  const damageInUnits = Number(damageInRow?.units || 0);

  const available = purchasedUnits - purchaseReturnUnits - soldUnits + saleReturnUnits - damageOutUnits + damageInUnits;
  return Number(available.toFixed(2));
};

const fetchPurchaseWithItems = (invoiceNo) => {
  const db = getDb();
  const purchase = db
    .prepare(
      `SELECT purchases.*, suppliers.code AS supplier_code, suppliers.name AS supplier_name
       FROM purchases
       INNER JOIN suppliers ON suppliers.id = purchases.supplier_id
       WHERE purchases.invoice_no = ?`
    )
    .get(invoiceNo);
  if (!purchase) return null;
  const items = db
    .prepare(
      `SELECT purchase_items.*, items.code AS item_code, items.name AS item_name
       FROM purchase_items
       INNER JOIN items ON items.id = purchase_items.item_id
       WHERE purchase_items.purchase_id = ?`
    )
    .all(purchase.id);
  return {
    purchase: mapRowDates(purchase),
    items
  };
};

const createOrderRecord = (db, payload) => {
  const {
    customerCode,
    salesmanCode,
    date,
    status = "pending",
    remarks = "",
    items = []
  } = payload ?? {};

  if (!customerCode) {
    throw createHttpError(400, "Customer code is required.");
  }

  const customer = findByCode("customers", customerCode);
  if (!customer) {
    throw createHttpError(400, "Customer not found.");
  }

  let salesman = null;
  if (salesmanCode) {
    salesman = findByCode("salesmen", salesmanCode);
    if (!salesman) {
      throw createHttpError(400, "Salesman not found.");
    }
  }

  if (!date) {
    throw createHttpError(400, "Order date is required.");
  }

  const storageDate = toStorageDate(date);
  if (!storageDate) {
    throw createHttpError(400, "Invalid date format. Use DD-MM-YYYY.");
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw createHttpError(400, "At least one item is required.");
  }

  const normalizedItems = items.map((entry) => {
    const itemCode = entry?.itemCode;
    if (!itemCode) {
      throw createHttpError(400, "Each item must include an item code.");
    }
    const item = findByCode("items", itemCode);
    if (!item) {
      throw createHttpError(400, `Item not found: ${itemCode}`);
    }
    const quantity = Number(entry.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw createHttpError(400, `Enter a quantity greater than zero for ${itemCode}.`);
    }
    const bonus = Number(entry.bonus || 0);
    if (!Number.isFinite(bonus) || bonus < 0) {
      throw createHttpError(400, `Bonus for ${itemCode} cannot be negative.`);
    }
    return {
      item,
      quantity,
      bonus,
      notes: (entry.notes || "").trim()
    };
  });

  const normalizedStatus = (() => {
    const candidate = String(status || "").toLowerCase();
    return ORDER_STATUSES.has(candidate) ? candidate : "pending";
  })();

  const timestamp = nowIso();

  try {
    const transaction = db.transaction(() => {
      const lastRow = db.prepare(`SELECT order_no FROM orders ORDER BY id DESC LIMIT 1`).get();
      const nextNumeric = extractNumericSequence(lastRow?.order_no);
      const orderNo = formatInvoiceNumber("ORD", nextNumeric);
      const insertOrder = db.prepare(
        `INSERT INTO orders (order_no, customer_id, salesman_id, order_date, status, remarks, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );
      const info = insertOrder.run(
        orderNo,
        customer.id,
        salesman?.id || null,
        storageDate,
        normalizedStatus,
        remarks ? remarks.trim() || null : null,
        timestamp,
        timestamp
      );

      const orderId = info.lastInsertRowid;
      const insertItem = db.prepare(
        `INSERT INTO order_items (order_id, item_id, quantity, bonus, base_unit, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );

      for (const entry of normalizedItems) {
        insertItem.run(
          orderId,
          entry.item.id,
          entry.quantity,
          entry.bonus,
          entry.item.base_unit,
          entry.notes || null,
          timestamp,
          timestamp
        );
      }

      return { orderId, orderNo };
    });

    const { orderId, orderNo } = transaction();
    const row = db
      .prepare(
        `SELECT orders.*,
                customers.code AS customer_code,
                customers.name AS customer_name,
                salesmen.code AS salesman_code,
                salesmen.name AS salesman_name
         FROM orders
         LEFT JOIN customers ON customers.id = orders.customer_id
         LEFT JOIN salesmen ON salesmen.id = orders.salesman_id
         WHERE orders.id = ?`
      )
      .get(orderId);

    const itemsRows = db
      .prepare(
        `SELECT order_items.*,
                items.code AS item_code,
                items.name AS item_name
         FROM order_items
         INNER JOIN items ON items.id = order_items.item_id
         WHERE order_items.order_id = ?
         ORDER BY order_items.id`
      )
      .all(orderId);

    const nextOrder = formatInvoiceNumber("ORD", extractNumericSequence(orderNo));

    return {
      order: mapRowDates(row),
      items: itemsRows.map((itemRow) => ({
        id: itemRow.id,
        itemCode: itemRow.item_code,
        itemName: itemRow.item_name,
        quantity: Number(itemRow.quantity || 0),
        bonus: Number(itemRow.bonus || 0),
        baseUnit: itemRow.base_unit,
        notes: itemRow.notes || ""
      })),
      orderNo,
      nextOrder
    };
  } catch (error) {
    throw createHttpError(400, error?.message || "Failed to create order.");
  }
};

const updateOrderRecord = (db, orderNo, payload) => {
  const existing = db
    .prepare(
      `SELECT orders.*,
              customers.code AS customer_code,
              customers.name AS customer_name,
              salesmen.code AS salesman_code,
              salesmen.name AS salesman_name
       FROM orders
       LEFT JOIN customers ON customers.id = orders.customer_id
       LEFT JOIN salesmen ON salesmen.id = orders.salesman_id
       WHERE orders.order_no = ?`
    )
    .get(orderNo);

  if (!existing) {
    throw createHttpError(404, "Order not found");
  }

  const {
    customerCode,
    salesmanCode,
    date,
    status = existing.status,
    remarks = existing.remarks || "",
    items = []
  } = payload ?? {};

  if (!customerCode) {
    throw createHttpError(400, "Customer code is required.");
  }

  const customer = findByCode("customers", customerCode);
  if (!customer) {
    throw createHttpError(400, "Customer not found.");
  }

  let salesman = null;
  if (salesmanCode) {
    salesman = findByCode("salesmen", salesmanCode);
    if (!salesman) {
      throw createHttpError(400, "Salesman not found.");
    }
  }

  if (!date) {
    throw createHttpError(400, "Order date is required.");
  }

  const storageDate = toStorageDate(date);
  if (!storageDate) {
    throw createHttpError(400, "Invalid date format. Use DD-MM-YYYY.");
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw createHttpError(400, "At least one item is required.");
  }

  const normalizedItems = items.map((entry) => {
    const itemCode = entry?.itemCode;
    if (!itemCode) {
      throw createHttpError(400, "Each item must include an item code.");
    }
    const item = findByCode("items", itemCode);
    if (!item) {
      throw createHttpError(400, `Item not found: ${itemCode}`);
    }
    const quantity = Number(entry.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw createHttpError(400, `Enter a quantity greater than zero for ${itemCode}.`);
    }
    const bonus = Number(entry.bonus || 0);
    if (!Number.isFinite(bonus) || bonus < 0) {
      throw createHttpError(400, `Bonus for ${itemCode} cannot be negative.`);
    }
    return {
      item,
      quantity,
      bonus,
      notes: (entry.notes || "").trim()
    };
  });

  const normalizedStatus = (() => {
    const candidate = String(status || "").toLowerCase();
    return ORDER_STATUSES.has(candidate) ? candidate : existing.status;
  })();

  const timestamp = nowIso();

  try {
    const transaction = db.transaction(() => {
      const updateOrder = db.prepare(
        `UPDATE orders
         SET customer_id = ?,
             salesman_id = ?,
             order_date = ?,
             status = ?,
             remarks = ?,
             updated_at = ?
         WHERE id = ?`
      );
      updateOrder.run(
        customer.id,
        salesman?.id || null,
        storageDate,
        normalizedStatus,
        remarks ? remarks.trim() || null : null,
        timestamp,
        existing.id
      );

      db.prepare(`DELETE FROM order_items WHERE order_id = ?`).run(existing.id);

      const insertItem = db.prepare(
        `INSERT INTO order_items (order_id, item_id, quantity, bonus, base_unit, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );

      for (const entry of normalizedItems) {
        insertItem.run(
          existing.id,
          entry.item.id,
          entry.quantity,
          entry.bonus,
          entry.item.base_unit,
          entry.notes || null,
          timestamp,
          timestamp
        );
      }
    });

    transaction();

    const row = db
      .prepare(
        `SELECT orders.*,
                customers.code AS customer_code,
                customers.name AS customer_name,
                salesmen.code AS salesman_code,
                salesmen.name AS salesman_name
         FROM orders
         LEFT JOIN customers ON customers.id = orders.customer_id
         LEFT JOIN salesmen ON salesmen.id = orders.salesman_id
         WHERE orders.id = ?`
      )
      .get(existing.id);

    const itemsRows = db
      .prepare(
        `SELECT order_items.*,
                items.code AS item_code,
                items.name AS item_name
         FROM order_items
         INNER JOIN items ON items.id = order_items.item_id
         WHERE order_items.order_id = ?
         ORDER BY order_items.id`
      )
      .all(existing.id);

    return {
      order: mapRowDates(row),
      items: itemsRows.map((itemRow) => ({
        id: itemRow.id,
        itemCode: itemRow.item_code,
        itemName: itemRow.item_name,
        quantity: Number(itemRow.quantity || 0),
        bonus: Number(itemRow.bonus || 0),
        baseUnit: itemRow.base_unit,
        notes: itemRow.notes || ""
      }))
    };
  } catch (error) {
    throw createHttpError(400, error?.message || "Failed to update order.");
  }
};

const createCustomerReceiptRecord = (db, payload) => {
  const {
    customerCode,
    receiptDate,
    amount,
    details,
    paymentMode,
    bankCode,
    slipNo,
    slipDate,
    salesmanCode,
    attachmentImage
  } = payload ?? {};

  const customer = findByCode("customers", customerCode);
  if (!customer) {
    throw createHttpError(400, "Customer not found");
  }

  let salesmanId = null;
  if (salesmanCode) {
    const salesman = findByCode("salesmen", salesmanCode);
    if (!salesman) {
      throw createHttpError(400, "Salesman not found");
    }
    salesmanId = salesman.id;
  }

  const storageDate = toStorageDate(receiptDate);
  if (!storageDate) {
    throw createHttpError(400, "Invalid date format");
  }

  const numericAmount = Number(amount ?? 0);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw createHttpError(400, "Amount must be greater than zero");
  }

  const normalizedMode = (paymentMode || "cash").toLowerCase();
  if (!["cash", "online", "bank"].includes(normalizedMode)) {
    throw createHttpError(400, "Invalid payment mode");
  }

  let bankId = null;
  let storageSlipDate = null;
  const trimmedSlipNo = typeof slipNo === "string" ? slipNo.trim() : "";

  if (normalizedMode !== "cash") {
    if (!bankCode) {
      throw createHttpError(400, "Bank code is required for this payment mode");
    }
    const bank = findByCode("banks", bankCode);
    if (!bank) {
      throw createHttpError(400, "Bank not found");
    }
    bankId = bank.id;

    if (normalizedMode === "online") {
      if (!trimmedSlipNo) {
        throw createHttpError(400, "Transaction ID is required for online receipts");
      }
      if (slipDate) {
        const maybeDate = toStorageDate(slipDate);
        if (!maybeDate) {
          throw createHttpError(400, "Invalid slip date");
        }
        storageSlipDate = maybeDate;
      }
      if (!storageSlipDate) {
        storageSlipDate = storageDate;
      }
    }

    if (normalizedMode === "bank") {
      storageSlipDate = toStorageDate(slipDate);
      if (!storageSlipDate) {
        throw createHttpError(400, "Valid slip date is required for bank transactions");
      }
    }
  }

  const timestamp = nowIso();
  const receiptRow = db.prepare(`SELECT receipt_no FROM customer_receipts ORDER BY id DESC LIMIT 1`).get();
  const lastReceipt = receiptRow?.receipt_no?.replace(/^R/, "") || "000000";
  const receiptNo = formatInvoiceNumber("R", lastReceipt);

  try {
    const insertReceipt = db.transaction(() => {
      const stmt = db.prepare(
        `INSERT INTO customer_receipts (receipt_no, customer_id, salesman_id, receipt_date, amount, details, payment_mode, bank_id, slip_no, slip_date, attachment_image, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      const info = stmt.run(
        receiptNo,
        customer.id,
        salesmanId,
        storageDate,
        numericAmount,
        details || null,
        normalizedMode,
        bankId,
        trimmedSlipNo || null,
        storageSlipDate,
        attachmentImage || null,
        timestamp,
        timestamp
      );

      if (normalizedMode !== "cash" && bankId) {
        const depositSlipDate = storageSlipDate || storageDate;
        const entryNo = nextBankTransactionEntryNo(db);
        db.prepare(
          `INSERT INTO bank_transactions (transaction_type, bank_id, slip_no, slip_date, cash_amount, entry_no, customer_receipt_id, created_at, updated_at)
           VALUES ('deposit', ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          bankId,
          trimmedSlipNo || null,
          depositSlipDate,
          numericAmount,
          entryNo,
          info.lastInsertRowid,
          timestamp,
          timestamp
        );
      }

      const row = db.prepare(`SELECT * FROM customer_receipts WHERE id = ?`).get(info.lastInsertRowid);
      let bankDetails = null;
      if (bankId) {
        const bankRow = db.prepare(`SELECT code, name FROM banks WHERE id = ?`).get(bankId);
        if (bankRow) {
          bankDetails = { code: bankRow.code, name: bankRow.name };
        }
      }

      return { row, bankDetails };
    });

    const { row, bankDetails } = insertReceipt();
    return { ...mapRowDates(row), receipt_no: receiptNo, bank: bankDetails };
  } catch (error) {
    throw createHttpError(400, error?.message || "Failed to create receipt.");
  }
};

const buildMobileSyncBundle = (db, salesmanId) => {
  const datasetVersion = nowIso();
  const salesman = salesmanId
    ? db
        .prepare(
          `SELECT id, code, name, address, phone1, phone2
           FROM salesmen
           WHERE id = ?`
        )
        .get(salesmanId)
    : null;

  const areas = db
    .prepare(`SELECT id, code, name FROM areas ORDER BY name COLLATE NOCASE`)
    .all()
    .map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name
    }));

  const customersRaw = db
    .prepare(
      `SELECT customers.id,
              customers.code,
              customers.name,
              customers.address,
              customers.phone1,
              customers.phone2,
              COALESCE(areas.code, '') AS area_code,
              COALESCE(areas.name, '') AS area_name
       FROM customers
       LEFT JOIN areas ON areas.id = customers.area_id
       ORDER BY customers.name COLLATE NOCASE`
    )
    .all();

  const customers = customersRaw.map((row) => {
    const outstanding = computeCustomerBalance(db, row.id);
    return {
      code: row.code,
      name: row.name,
      address: row.address,
      areaCode: row.area_code || null,
      areaName: row.area_name || null,
      phone1: row.phone1 || null,
      phone2: row.phone2 || null,
      outstanding
    };
  });

  const totalOutstanding = customers.reduce((sum, entry) => {
    return sum + (entry.outstanding > 0 ? entry.outstanding : 0);
  }, 0);

  const items = db
    .prepare(
      `SELECT code, name, base_unit, pack_size, min_quantity, purchase_rate, trade_rate, retail_price
       FROM items
       ORDER BY name COLLATE NOCASE`
    )
    .all()
    .map((row) => ({
      code: row.code,
      name: row.name,
      baseUnit: row.base_unit,
      packSize: row.pack_size === null ? null : Number(row.pack_size),
      minimumQuantity: Number(row.min_quantity ?? 0),
      purchaseRate: row.purchase_rate === null ? null : Number(row.purchase_rate),
      tradeRate: row.trade_rate === null ? null : Number(row.trade_rate),
      retailPrice: row.retail_price === null ? null : Number(row.retail_price)
    }));

  const banks = db
    .prepare(
      `SELECT code, name, account_no
       FROM banks
       ORDER BY name COLLATE NOCASE`
    )
    .all()
    .map((row) => ({
      code: row.code,
      name: row.name,
      accountNo: row.account_no || null
    }));

  const orderHistory = salesmanId
    ? db
        .prepare(
          `SELECT order_no, order_date, status, remarks
           FROM orders
           WHERE salesman_id = ?
           ORDER BY order_date DESC, id DESC
           LIMIT 25`
        )
        .all(salesmanId)
        .map((row) => ({
          orderNo: row.order_no,
          orderDate: toDisplayDate(row.order_date),
          status: row.status,
          remarks: row.remarks ?? null
        }))
    : [];

  const recoveryHistory = salesmanId
    ? db
        .prepare(
          `SELECT sr.receipt_no,
                  sr.receipt_date,
                  sri.received_amount,
                  customers.code AS customer_code,
                  customers.name AS customer_name
           FROM salesman_receipts sr
           INNER JOIN salesman_receipt_items sri ON sri.receipt_id = sr.id
           INNER JOIN customers ON customers.id = sri.customer_id
           WHERE sr.salesman_id = ?
           ORDER BY sr.receipt_date DESC, sr.id DESC
           LIMIT 25`
        )
        .all(salesmanId)
        .map((row) => ({
          receiptNo: row.receipt_no,
          receiptDate: toDisplayDate(row.receipt_date),
          amount: Number(row.received_amount || 0),
          customerCode: row.customer_code,
          customerName: row.customer_name
        }))
    : [];

  const syncLog = fetchSyncStatusLog(db, salesmanId);

  return {
    datasetVersion,
    serverTime: datasetVersion,
    salesman: salesman
      ? {
          id: salesman.id,
          code: salesman.code,
          name: salesman.name,
          address: salesman.address,
          phone1: salesman.phone1 || null,
          phone2: salesman.phone2 || null
        }
      : null,
    summary: {
      totalCustomers: customers.length,
      totalOutstanding: Number(totalOutstanding.toFixed(2)),
      totalItems: items.length
    },
    customers,
    items,
    banks,
    routes: areas,
    history: {
      orders: orderHistory,
      recoveries: recoveryHistory
    },
    syncStatus: syncLog
  };
};

const processMobileOrderSubmission = (db, submission, { salesman }) => {
  const reference = (submission?.clientReference || submission?.reference || "").trim();
  if (!reference) {
    return { status: "error", message: "clientReference is required" };
  }

  const submissionPayload = submission?.payload ?? submission?.order ?? {};
  const location = normalizeGeoPoint(submission?.location);

  try {
    const { payload, customer, salesman: resolvedSalesman, summary } = normalizeOrderSubmission(
      submissionPayload,
      salesman
    );
    const payloadHash = hashPayload({ type: MOBILE_SYNC_ENTITY_TYPES.ORDER, payload });
    const existingLog = findSyncLog(db, reference, MOBILE_SYNC_ENTITY_TYPES.ORDER, resolvedSalesman?.id);

    if (existingLog && existingLog.status === "success" && existingLog.payload_hash === payloadHash) {
      const existingOrder = existingLog.entity_id
        ? db.prepare(`SELECT order_no FROM orders WHERE id = ?`).get(existingLog.entity_id)
        : null;
      return {
        status: "duplicate",
        reference,
        orderNo: existingOrder?.order_no ?? null
      };
    }

    const existingPending = findPendingEntryByReference(
      db,
      MOBILE_SYNC_ENTITY_TYPES.ORDER,
      reference
    );

    if (existingPending) {
      if (location) {
        updatePendingEntryLocation(db, existingPending.id, location);
      }
      if (existingPending.status === PENDING_ENTRY_STATUSES.APPROVED && existingPending.entity_id) {
        const existingOrder = db.prepare(`SELECT order_no FROM orders WHERE id = ?`).get(
          existingPending.entity_id
        );
        return {
          status: "duplicate",
          reference,
          orderNo: existingOrder?.order_no ?? null
        };
      }
      if (existingPending.status === PENDING_ENTRY_STATUSES.REJECTED) {
        return {
          status: "rejected",
          reference,
          message: existingPending.rejection_reason || "Submission was rejected."
        };
      }
      upsertSyncLog(db, {
        reference,
        entityType: MOBILE_SYNC_ENTITY_TYPES.ORDER,
        entityId: existingPending.entity_id ?? null,
        status: PENDING_ENTRY_STATUSES.PENDING,
        payloadHash: existingPending.payload_hash ?? payloadHash,
        lastError: null,
        salesmanId: resolvedSalesman?.id ?? null
      });
      return {
        status: PENDING_ENTRY_STATUSES.PENDING,
        reference,
        pendingId: existingPending.id
      };
    }

    const queued = queuePendingEntry(db, {
      entryType: MOBILE_SYNC_ENTITY_TYPES.ORDER,
      reference,
      payload,
      payloadHash,
      customerCode: customer.code,
      customerName: customer.name,
      salesmanCode: resolvedSalesman?.code ?? null,
      salesmanName: resolvedSalesman?.name ?? null,
      salesmanId: resolvedSalesman?.id ?? null,
      summaryAmount: summary.amount,
      summaryCount: summary.count,
      location
    });

    upsertSyncLog(db, {
      reference,
      entityType: MOBILE_SYNC_ENTITY_TYPES.ORDER,
      entityId: null,
      status: PENDING_ENTRY_STATUSES.PENDING,
      payloadHash,
      lastError: null,
      salesmanId: resolvedSalesman?.id ?? null
    });

    return {
      status: PENDING_ENTRY_STATUSES.PENDING,
      reference,
      pendingId: queued?.id ?? null
    };
  } catch (error) {
    const message = error?.message || "Failed to queue order.";
    const payloadHash = hashPayload({ type: MOBILE_SYNC_ENTITY_TYPES.ORDER, payload: submissionPayload });
    upsertSyncLog(db, {
      reference,
      entityType: MOBILE_SYNC_ENTITY_TYPES.ORDER,
      entityId: null,
      status: "error",
      payloadHash,
      lastError: message,
      salesmanId: salesman?.id ?? null
    });
    return { status: "error", reference, message };
  }
};

const processMobileRecoverySubmission = (db, submission, { salesman }) => {
  const reference = (submission?.clientReference || submission?.reference || "").trim();
  if (!reference) {
    return { status: "error", message: "clientReference is required" };
  }

  const submissionPayload = submission?.payload ?? submission?.recovery ?? submission ?? {};
  const location = normalizeGeoPoint(submission?.location);

  try {
    const { payload, customer, salesman: resolvedSalesman, summary } = normalizeRecoverySubmission(
      submissionPayload,
      salesman
    );
    const payloadHash = hashPayload({ type: MOBILE_SYNC_ENTITY_TYPES.RECOVERY, payload });
    const existingLog = findSyncLog(db, reference, MOBILE_SYNC_ENTITY_TYPES.RECOVERY, resolvedSalesman?.id);

    if (existingLog && existingLog.status === "success" && existingLog.payload_hash === payloadHash) {
      const existingReceipt = existingLog.entity_id
        ? db.prepare(`SELECT receipt_no FROM customer_receipts WHERE id = ?`).get(existingLog.entity_id)
        : null;
      return {
        status: "duplicate",
        reference,
        receiptNo: existingReceipt?.receipt_no ?? null
      };
    }

    const existingPending = findPendingEntryByReference(
      db,
      MOBILE_SYNC_ENTITY_TYPES.RECOVERY,
      reference
    );

    if (existingPending) {
      if (location) {
        updatePendingEntryLocation(db, existingPending.id, location);
      }
      if (existingPending.status === PENDING_ENTRY_STATUSES.APPROVED && existingPending.entity_id) {
        const existingReceipt = db
          .prepare(`SELECT receipt_no FROM customer_receipts WHERE id = ?`)
          .get(existingPending.entity_id);
        return {
          status: "duplicate",
          reference,
          receiptNo: existingReceipt?.receipt_no ?? null
        };
      }
      if (existingPending.status === PENDING_ENTRY_STATUSES.REJECTED) {
        return {
          status: "rejected",
          reference,
          message: existingPending.rejection_reason || "Submission was rejected."
        };
      }
      upsertSyncLog(db, {
        reference,
        entityType: MOBILE_SYNC_ENTITY_TYPES.RECOVERY,
        entityId: existingPending.entity_id ?? null,
        status: PENDING_ENTRY_STATUSES.PENDING,
        payloadHash: existingPending.payload_hash ?? payloadHash,
        lastError: null,
        salesmanId: resolvedSalesman?.id ?? null
      });
      return {
        status: PENDING_ENTRY_STATUSES.PENDING,
        reference,
        pendingId: existingPending.id
      };
    }

    const queued = queuePendingEntry(db, {
      entryType: MOBILE_SYNC_ENTITY_TYPES.RECOVERY,
      reference,
      payload,
      payloadHash,
      customerCode: customer.code,
      customerName: customer.name,
      salesmanCode: resolvedSalesman?.code ?? null,
      salesmanName: resolvedSalesman?.name ?? null,
      salesmanId: resolvedSalesman?.id ?? null,
      summaryAmount: summary.amount,
      summaryCount: summary.count,
      location
    });

    upsertSyncLog(db, {
      reference,
      entityType: MOBILE_SYNC_ENTITY_TYPES.RECOVERY,
      entityId: null,
      status: PENDING_ENTRY_STATUSES.PENDING,
      payloadHash,
      lastError: null,
      salesmanId: resolvedSalesman?.id ?? null
    });

    return {
      status: PENDING_ENTRY_STATUSES.PENDING,
      reference,
      pendingId: queued?.id ?? null
    };
  } catch (error) {
    const message = error?.message || "Failed to queue recovery.";
    const payloadHash = hashPayload({ type: MOBILE_SYNC_ENTITY_TYPES.RECOVERY, payload: submissionPayload });
    upsertSyncLog(db, {
      reference,
      entityType: MOBILE_SYNC_ENTITY_TYPES.RECOVERY,
      entityId: null,
      status: "error",
      payloadHash,
      lastError: message,
      salesmanId: salesman?.id ?? null
    });
    return { status: "error", reference, message };
  }
};

const upsertFactory = (table, columns, uniqueField = "id") => {
  const db = getDb();
  const insertCols = columns.join(", ");
  const insertParams = columns.map((c) => `@${c}`).join(", ");
  const updateCols = columns
    .filter((c) => c !== uniqueField)
    .map((c) => `${c} = @${c}`)
    .join(", ");

  return (req, res) => {
    const payload = sanitizePayload(req.body, columns);
    const timestamp = nowIso();
    if (req.method === "POST") {
      payload.created_at = timestamp;
      payload.updated_at = timestamp;
      const stmt = db.prepare(
        `INSERT INTO ${table} (${insertCols}, created_at, updated_at) VALUES (${insertParams}, @created_at, @updated_at)`
      );
      try {
        const info = stmt.run(payload);
        const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(info.lastInsertRowid);
        res.status(201).json(row);
      } catch (error) {
        console.error(`Failed to insert into ${table}:`, error);
        const { status, message } = normalizeDatabaseError(error, table);
        res.status(status).json({ message });
      }
    } else {
      payload.updated_at = timestamp;
      payload[uniqueField] = req.params.id;
      try {
        const stmt = db.prepare(
          `UPDATE ${table} SET ${updateCols}, updated_at = @updated_at WHERE ${uniqueField} = @${uniqueField}`
        );
        const info = stmt.run(payload);
        if (info.changes === 0) {
          return res.status(404).json({ message: "Record not found" });
        }
        const row = db.prepare(`SELECT * FROM ${table} WHERE ${uniqueField} = ?`).get(req.params.id);
        res.json(row);
      } catch (error) {
        console.error(`Failed to update ${table}:`, error);
        const { status, message } = normalizeDatabaseError(error, table);
        res.status(status).json({ message });
      }
    }
  };
};

const normalizeDatabaseError = (error, table) => {
  const code = error?.code || "";
  if (code === "SQLITE_CONSTRAINT_UNIQUE") {
    return {
      status: 409,
      message: `${friendlyTableName(table)} already exists with the same unique value.`
    };
  }
  if (code === "SQLITE_CONSTRAINT_NOTNULL") {
    return {
      status: 400,
      message: "Required fields cannot be empty. Please fill in all mandatory fields."
    };
  }
  return {
    status: 400,
    message: error?.message || "Database error"
  };
};

const friendlyTableName = (value = "") => {
  if (!value) return "Record";
  const lookup = {
    companies: "Company",
    customers: "Customer",
    suppliers: "Supplier",
    items: "Item",
    areas: "Area",
    banks: "Bank",
    salesmen: "Salesman",
    expense_definitions: "Expense definition"
  };
  if (lookup[value]) return lookup[value];
  const normalized = value.replace(/_/g, " ");
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const sanitizePayload = (body, allowedKeys) => {
  return allowedKeys.reduce((acc, key) => {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      acc[key] = body[key] === "" ? null : body[key];
    }
    return acc;
  }, {});
};

const computeCustomerBalance = (db, customerId) => {
  const round = (value) => Number((value ?? 0).toFixed(2));

  const openingRow = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM customer_opening_balances
       WHERE customer_id = ?`
    )
    .get(customerId);
  const openingTotal = Number(openingRow?.total ?? 0);

  const salesRow = db
    .prepare(
      `SELECT
          COALESCE(SUM(total_amount), 0) AS total_amount,
          COALESCE(SUM(amount_paid), 0) AS total_paid
       FROM sales
       WHERE customer_id = ?`
    )
    .get(customerId);
  const salesTotal = Number(salesRow?.total_amount ?? 0);
  const salesPaid = Number(salesRow?.total_paid ?? 0);

  const receiptsRow = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM customer_receipts
       WHERE customer_id = ?`
    )
    .get(customerId);
  const receiptsTotal = Number(receiptsRow?.total ?? 0);

  const returnsRow = db
    .prepare(
      `SELECT COALESCE(SUM(
          sr.quantity * (
            COALESCE(si.trade_off_price, si.trade_price, 0) * (1 + (COALESCE(si.tax_percent, 0) / 100.0))
          )
        ), 0) AS total
       FROM sale_returns sr
       INNER JOIN sale_items si ON si.id = sr.sale_item_id
       INNER JOIN sales s ON s.id = sr.sale_id
       WHERE s.customer_id = ?`
    )
    .get(customerId);
  const returnsTotal = Number(returnsRow?.total ?? 0);

  const balance = openingTotal + (salesTotal - salesPaid) - receiptsTotal - returnsTotal;
  return round(balance);
};

const computeSupplierPayable = (db, supplierId) => {
  const toNumber = (value) => Number(value ?? 0);
  const round = (value) => Number(toNumber(value).toFixed(2));

  const openingRow = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM supplier_opening_balances
       WHERE supplier_id = ?`
    )
    .get(supplierId);

  const purchaseRow = db
    .prepare(
      `SELECT
          COALESCE(SUM(total_amount), 0) AS total_amount,
          COALESCE(SUM(amount_paid), 0) AS total_paid
       FROM purchases
       WHERE supplier_id = ?`
    )
    .get(supplierId);

  const returnsRow = db
    .prepare(
      `SELECT COALESCE(SUM(
          CASE
            WHEN (pi.quantity + COALESCE(pi.bonus, 0)) = 0 THEN 0
            ELSE pr.quantity * (pi.net_amount / (pi.quantity + COALESCE(pi.bonus, 0)))
          END
        ), 0) AS total
       FROM purchase_returns pr
       INNER JOIN purchase_items pi ON pi.id = pr.purchase_item_id
       INNER JOIN purchases p ON p.id = pr.purchase_id
       WHERE p.supplier_id = ?`
    )
    .get(supplierId);

  const paymentsRow = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM supplier_payments
       WHERE supplier_id = ?`
    )
    .get(supplierId);

  const opening = round(openingRow?.total);
  const purchaseTotal = round(purchaseRow?.total_amount);
  const purchasePaid = round(purchaseRow?.total_paid);
  const returnsTotal = round(returnsRow?.total);
  const paymentsTotal = round(paymentsRow?.total);

  const payableRaw = opening + purchaseTotal - purchasePaid - returnsTotal - paymentsTotal;
  const net = round(payableRaw);
  const payable = net > 0 ? net : 0;
  const receivable = net < 0 ? Math.abs(net) : 0;

  return {
    payable,
    receivable,
    net,
    components: {
      opening,
      purchaseTotal,
      purchasePaid,
      returnsTotal,
      paymentsTotal,
      net
    }
  };
};

const computeBankTotals = (db, bankId) => {
  const round = (value) => Number((value ?? 0).toFixed(2));
  const sums = db
    .prepare(
      `SELECT
          COALESCE((SELECT SUM(amount) FROM bank_opening_balances WHERE bank_id = ?), 0) AS opening,
          COALESCE((SELECT SUM(cash_amount) FROM bank_transactions WHERE bank_id = ? AND transaction_type = 'deposit'), 0) AS deposits,
          COALESCE((SELECT SUM(cash_amount) FROM bank_transactions WHERE bank_id = ? AND transaction_type = 'drawing'), 0) AS drawings`
    )
    .get(bankId, bankId, bankId);

  const opening = round(sums?.opening);
  const deposits = round(sums?.deposits);
  const drawings = round(sums?.drawings);
  const cashInBank = round(opening + deposits - drawings);

  return { opening, deposits, drawings, cashInBank };
};

const extractBankEntrySequence = (value) => {
  if (!value) return "000000";
  const match = String(value).match(/(\d+)$/);
  return match ? match[1].padStart(6, "0") : "000000";
};

const nextBankTransactionEntryNo = (db) => {
  const last = db
    .prepare(`SELECT entry_no FROM bank_transactions WHERE entry_no IS NOT NULL ORDER BY id DESC LIMIT 1`)
    .get();
  const numeric = extractBankEntrySequence(last?.entry_no);
  return formatInvoiceNumber("BT", numeric);
};

const nextDamageVoucherNo = (db) => {
  const last = db
    .prepare(`SELECT voucher_no FROM damage_transactions WHERE voucher_no IS NOT NULL AND voucher_no <> '' ORDER BY id DESC LIMIT 1`)
    .get();
  const numeric = extractBankEntrySequence(last?.voucher_no);
  const nextNumeric = formatInvoiceNumber("", numeric);
  return `V${nextNumeric}`;
};

const nextPurchaseReturnNo = (db) => {
  const last = db
    .prepare(
      `SELECT return_no
       FROM purchase_returns
       WHERE return_no GLOB 'PR[0-9][0-9][0-9][0-9][0-9][0-9]'
       ORDER BY id DESC LIMIT 1`
    )
    .get();
  const numeric = extractBankEntrySequence(last?.return_no);
  return formatInvoiceNumber("PR", numeric);
};

const findByCode = (table, code) => getDb().prepare(`SELECT * FROM ${table} WHERE code = ?`).get(code);
const findById = (table, id) => getDb().prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);

const BANK_TRANSACTION_BASE_QUERY = `
  SELECT
    bt.id,
    bt.entry_no,
    bt.transaction_type,
    bt.bank_id,
    bt.slip_no,
    bt.slip_date,
    bt.cash_amount,
    bt.customer_receipt_id,
    bt.supplier_payment_id,
    bt.created_at,
    bt.updated_at,
    banks.code AS bank_code,
    banks.name AS bank_name,
    banks.account_no AS bank_account_no,
    customer_receipts.receipt_no AS customer_receipt_no,
    supplier_payments.payment_no AS supplier_payment_no,
    supplier_payments.payment_mode AS supplier_payment_mode
  FROM bank_transactions bt
  LEFT JOIN banks ON banks.id = bt.bank_id
  LEFT JOIN customer_receipts ON customer_receipts.id = bt.customer_receipt_id
  LEFT JOIN supplier_payments ON supplier_payments.id = bt.supplier_payment_id
`;

const fetchBankTransactionById = (db, id) =>
  db.prepare(`${BANK_TRANSACTION_BASE_QUERY} WHERE bt.id = ?`).get(id);

const fetchBankTransactionByEntry = (db, entryNo) =>
  db.prepare(`${BANK_TRANSACTION_BASE_QUERY} WHERE bt.entry_no = ?`).get(entryNo);

const findBankTransactionRow = (db, identifier) => {
  if (!identifier) return null;
  const byEntry = fetchBankTransactionByEntry(db, identifier);
  if (byEntry) return byEntry;
  if (/^\d+$/.test(identifier)) {
    return fetchBankTransactionById(db, Number(identifier));
  }
  return null;
};

const mapBankTransactionDetail = (row) => {
  if (!row) return null;
  const mappedDates = mapRowDates(row);
  const sourceType = row.customer_receipt_id
    ? "customer-receipt"
    : row.supplier_payment_id
      ? "supplier-payment"
      : "manual";

  return {
    id: row.id,
    entryNo: row.entry_no || null,
    transactionType: String(row.transaction_type || "deposit").toLowerCase(),
    slipNo: row.slip_no || "",
    slipDate: row.slip_date || "",
    slipDateDisplay: mappedDates?.slip_date || "",
    amount: Number(row.cash_amount ?? 0),
    bank: {
      id: row.bank_id || null,
      code: row.bank_code || "",
      name: row.bank_name || "",
      accountNo: row.bank_account_no || ""
    },
    sourceType,
    sourceReference:
      sourceType === "customer-receipt"
        ? row.customer_receipt_no || null
        : sourceType === "supplier-payment"
          ? row.supplier_payment_no || null
          : null,
    supplierPaymentMode: row.supplier_payment_mode || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    isEditable: sourceType === "manual"
  };
};

const CUSTOMER_RECEIPT_BASE_QUERY = `
  SELECT
    cr.id,
    cr.receipt_no,
    cr.customer_id,
    cr.salesman_id,
    cr.receipt_date,
    cr.amount,
    cr.details,
    cr.payment_mode,
    cr.bank_id,
    cr.slip_no,
    cr.slip_date,
    cr.attachment_image,
    cr.created_at,
    cr.updated_at,
    customers.code AS customer_code,
    customers.name AS customer_name,
    salesmen.code AS salesman_code,
    salesmen.name AS salesman_name,
    banks.code AS bank_code,
    banks.name AS bank_name,
    bt.id AS bank_transaction_id,
    bt.entry_no AS bank_entry_no
  FROM customer_receipts cr
  INNER JOIN customers ON customers.id = cr.customer_id
  LEFT JOIN salesmen ON salesmen.id = cr.salesman_id
  LEFT JOIN banks ON banks.id = cr.bank_id
  LEFT JOIN bank_transactions bt ON bt.customer_receipt_id = cr.id
`;

const fetchCustomerReceiptById = (db, id) =>
  db.prepare(`${CUSTOMER_RECEIPT_BASE_QUERY} WHERE cr.id = ?`).get(id);

const fetchCustomerReceiptByReceiptNo = (db, receiptNo) =>
  db.prepare(`${CUSTOMER_RECEIPT_BASE_QUERY} WHERE cr.receipt_no = ?`).get(receiptNo);

const findCustomerReceiptRow = (db, reference) => {
  if (!reference) return null;
  const byReceipt = fetchCustomerReceiptByReceiptNo(db, reference);
  if (byReceipt) return byReceipt;
  if (/^\d+$/.test(reference)) {
    return fetchCustomerReceiptById(db, Number(reference));
  }
  return null;
};

const mapCustomerReceiptDetail = (row) => {
  if (!row) return null;
  const mapped = mapRowDates(row);
  return {
    id: row.id,
    receiptNo: row.receipt_no,
    receiptDate: mapped?.receipt_date || "",
    receiptDateRaw: row.receipt_date || "",
    amount: Number(row.amount ?? 0),
    details: row.details || "",
    paymentMode: String(row.payment_mode || "cash").toLowerCase(),
    customer: {
      id: row.customer_id,
      code: row.customer_code || "",
      name: row.customer_name || ""
    },
    salesman: row.salesman_id
      ? {
          id: row.salesman_id,
          code: row.salesman_code || "",
          name: row.salesman_name || ""
        }
      : null,
    bank: row.bank_id
      ? {
          id: row.bank_id,
          code: row.bank_code || "",
          name: row.bank_name || ""
        }
      : null,
    slipNo: row.slip_no || "",
    slipDate: row.slip_date || "",
    slipDateDisplay: mapped?.slip_date || "",
    bankTransactionId: row.bank_transaction_id || null,
    bankTransactionEntry: row.bank_entry_no || null,
    attachmentImage: row.attachment_image || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
};

const SUPPLIER_PAYMENT_BASE_QUERY = `
  SELECT
    sp.id,
    sp.payment_no,
    sp.supplier_id,
    sp.payment_date,
    sp.amount,
    sp.details,
    sp.payment_mode,
    sp.bank_id,
    sp.slip_no,
    sp.slip_date,
    sp.created_at,
    sp.updated_at,
    suppliers.code AS supplier_code,
    suppliers.name AS supplier_name,
    banks.code AS bank_code,
    banks.name AS bank_name,
    bt.id AS bank_transaction_id,
    bt.entry_no AS bank_entry_no
  FROM supplier_payments sp
  INNER JOIN suppliers ON suppliers.id = sp.supplier_id
  LEFT JOIN banks ON banks.id = sp.bank_id
  LEFT JOIN bank_transactions bt ON bt.supplier_payment_id = sp.id
`;

const fetchSupplierPaymentById = (db, id) =>
  db.prepare(`${SUPPLIER_PAYMENT_BASE_QUERY} WHERE sp.id = ?`).get(id);

const fetchSupplierPaymentByPaymentNo = (db, paymentNo) =>
  db.prepare(`${SUPPLIER_PAYMENT_BASE_QUERY} WHERE sp.payment_no = ?`).get(paymentNo);

const findSupplierPaymentRow = (db, reference) => {
  if (!reference) return null;
  const byPayment = fetchSupplierPaymentByPaymentNo(db, reference);
  if (byPayment) return byPayment;
  if (/^\d+$/.test(reference)) {
    return fetchSupplierPaymentById(db, Number(reference));
  }
  return null;
};

const mapSupplierPaymentDetail = (row) => {
  if (!row) return null;
  const mapped = mapRowDates(row);
  return {
    id: row.id,
    paymentNo: row.payment_no,
    paymentDate: mapped?.payment_date || "",
    paymentDateRaw: row.payment_date || "",
    amount: Number(row.amount ?? 0),
    details: row.details || "",
    paymentMode: String(row.payment_mode || "cash").toLowerCase(),
    supplier: {
      id: row.supplier_id,
      code: row.supplier_code || "",
      name: row.supplier_name || ""
    },
    bank: row.bank_id
      ? {
          id: row.bank_id,
          code: row.bank_code || "",
          name: row.bank_name || ""
        }
      : null,
    slipNo: row.slip_no || "",
    slipDate: row.slip_date || "",
    slipDateDisplay: mapped?.slip_date || "",
    bankTransactionId: row.bank_transaction_id || null,
    bankTransactionEntry: row.bank_entry_no || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
};

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/api/status", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime(), timestamp: new Date().toISOString() });
});

app.get("/", (req, res) => {
  res.json({ message: "Inventory API" });
});

app.post("/api/auth/login", (req, res) => {
  const { username = "", password = "" } = req.body ?? {};
  const normalized = normalizeUsername(username);

  if (!normalized || !password) {
    return res.status(400).json({ message: "Username and password are required." });
  }

  const db = getDb();
  const userRow = db
    .prepare(`SELECT * FROM users WHERE username = ? COLLATE NOCASE LIMIT 1`)
    .get(normalized);

  if (!userRow) {
    return res.status(401).json({ message: "Invalid username or password." });
  }

  if (Number(userRow.is_active) === 0) {
    return res.status(403).json({ message: "User account is disabled." });
  }

  let passwordMatches = false;
  if (userRow.password_hash) {
    passwordMatches = bcrypt.compareSync(password, userRow.password_hash);
  } else if (userRow.password) {
    passwordMatches = userRow.password === password;
    if (passwordMatches) {
      const passwordHash = bcrypt.hashSync(password, PASSWORD_SALT_ROUNDS);
      const timestamp = nowIso();
      db
        .prepare(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`)
        .run(passwordHash, timestamp, userRow.id);
      userRow.password_hash = passwordHash;
      userRow.updated_at = timestamp;
    }
  } else {
    console.error("User record missing credentials", { id: userRow.id, username: userRow.username });
    return res.status(500).json({ message: "User credentials are not configured. Please contact support." });
  }
  if (!passwordMatches) {
    return res.status(401).json({ message: "Invalid username or password." });
  }

  const token = issueToken(userRow);
  const account = mapUserAccount(userRow);
  const tokenPair = {
    access_token: token,
    refresh_token: null,
    token_type: "bearer",
    access_expires_in: TOKEN_EXPIRY_SECONDS,
    refresh_expires_in: 0
  };

  res.json({ token, tokens: tokenPair, user: account });
});

app.use("/api", (req, res, next) => {
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  if (req.path === "/auth/login") {
    return next();
  }
  return authenticateRequest(req, res, next);
});

app.get("/api/auth/profile", (req, res) => {
  res.json({ user: req.user });
});

app.get("/api/mobile/sync/bundle", (req, res) => {
  const db = getDb();
  const salesmanId = req.user?.salesmanId;
  if (!salesmanId) {
    return res.status(400).json({ message: "User is not linked to a salesman." });
  }

  const bundle = buildMobileSyncBundle(db, salesmanId);
  if (!bundle.salesman) {
    return res.status(404).json({ message: "Assigned salesman not found." });
  }

  res.json(bundle);
});

app.post("/api/mobile/sync/upload", (req, res) => {
  const db = getDb();
  const salesmanId = req.user?.salesmanId;
  if (!salesmanId) {
    return res.status(400).json({ message: "User is not linked to a salesman." });
  }

  const salesman = db
    .prepare(`SELECT id, code, name FROM salesmen WHERE id = ?`)
    .get(salesmanId);
  if (!salesman) {
    return res.status(404).json({ message: "Assigned salesman not found." });
  }

  const payload = req.body ?? {};
  const orders = Array.isArray(payload.orders) ? payload.orders : [];
  const recoveries = Array.isArray(payload.recoveries) ? payload.recoveries : [];
  const context = { salesman };

  const orderResults = orders.map((entry) => processMobileOrderSubmission(db, entry, context));
  const recoveryResults = recoveries.map((entry) =>
    processMobileRecoverySubmission(db, entry, context)
  );

  const updatedBalances = [];

  const syncStatus = fetchSyncStatusLog(db, salesman.id);

  res.json({
    datasetVersion: nowIso(),
    orders: orderResults,
    recoveries: recoveryResults,
    updatedBalances,
    syncStatus
  });
});

// User management
app.get("/api/users", requirePrivilege("users.manage"), (req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, username, role, is_active, created_at, updated_at
       FROM users
       ORDER BY username COLLATE NOCASE`
    )
    .all();
  res.json({ users: rows.map(mapUserAccount) });
});

app.post("/api/users", requirePrivilege("users.manage"), (req, res) => {
  const {
    username = "",
    password = "",
    role = "viewer",
    isActive = true,
    salesmanCode = null
  } = req.body ?? {};
  const normalizedUsername = normalizeUsername(username);
  const desiredRole = USER_ROLES.includes(role) ? role : "viewer";
  const activeValue = typeof isActive === "string" ? isActive === "true" : Boolean(isActive);

  if (!normalizedUsername) {
    return res.status(400).json({ message: "Username is required." });
  }

  if (password.length < 8) {
    return res.status(400).json({ message: "Password must be at least 8 characters." });
  }

  const db = getDb();
  const duplicate = db
    .prepare(`SELECT id FROM users WHERE username = ? COLLATE NOCASE LIMIT 1`)
    .get(normalizedUsername);
  if (duplicate) {
    return res.status(409).json({ message: "Username already exists." });
  }

  let salesmanId = null;
  if (salesmanCode) {
    const salesman = findByCode("salesmen", salesmanCode);
    if (!salesman) {
      return res.status(400).json({ message: "Salesman not found." });
    }
    salesmanId = salesman.id;
  }

  const timestamp = nowIso();
  const passwordHash = bcrypt.hashSync(password, PASSWORD_SALT_ROUNDS);

  const insert = db.prepare(
    `INSERT INTO users (username, password_hash, role, is_active, salesman_id, created_at, updated_at)
     VALUES (@username, @password_hash, @role, @is_active, @salesman_id, @created_at, @updated_at)`
  );

  const info = insert.run({
    username: normalizedUsername,
    password_hash: passwordHash,
    role: desiredRole,
    is_active: activeValue ? 1 : 0,
    salesman_id: salesmanId,
    created_at: timestamp,
    updated_at: timestamp
  });

  const row = db.prepare(`SELECT * FROM users WHERE id = ?`).get(info.lastInsertRowid);
  res.status(201).json({ user: mapUserAccount(row) });
});

app.put("/api/users/:id", requirePrivilege("users.manage"), (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId)) {
    return res.status(400).json({ message: "Invalid user id." });
  }

  const db = getDb();
  const existing = db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
  if (!existing) {
    return res.status(404).json({ message: "User not found." });
  }

  const { username, password, role, isActive, salesmanCode } = req.body ?? {};
  const updates = [];
  const params = { id: userId, updated_at: nowIso() };

  if (username !== undefined) {
    const normalized = normalizeUsername(username);
    if (!normalized) {
      return res.status(400).json({ message: "Username cannot be empty." });
    }
    const duplicate = db
      .prepare(`SELECT id FROM users WHERE username = ? COLLATE NOCASE AND id <> ? LIMIT 1`)
      .get(normalized, userId);
    if (duplicate) {
      return res.status(409).json({ message: "Username already exists." });
    }
    updates.push("username = @username");
    params.username = normalized;
  }

  if (role !== undefined) {
    if (!USER_ROLES.includes(role)) {
      return res.status(400).json({ message: "Invalid role selection." });
    }
    updates.push("role = @role");
    params.role = role;
  }

  if (isActive !== undefined) {
    const activeValue = typeof isActive === "string" ? isActive === "true" : Boolean(isActive);
    updates.push("is_active = @is_active");
    params.is_active = activeValue ? 1 : 0;
  }

  if (password) {
    if (password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters." });
    }
    updates.push("password_hash = @password_hash");
    params.password_hash = bcrypt.hashSync(password, PASSWORD_SALT_ROUNDS);
  }

  if (salesmanCode !== undefined) {
    if (!salesmanCode) {
      updates.push("salesman_id = @salesman_id");
      params.salesman_id = null;
    } else {
      const salesman = findByCode("salesmen", salesmanCode);
      if (!salesman) {
        return res.status(400).json({ message: "Salesman not found." });
      }
      updates.push("salesman_id = @salesman_id");
      params.salesman_id = salesman.id;
    }
  }

  if (updates.length === 0) {
    return res.status(400).json({ message: "No changes submitted." });
  }

  const isBecomingInactive =
    Object.prototype.hasOwnProperty.call(params, "is_active")
      ? params.is_active === 0
      : Number(existing.is_active) === 0;
  const isDemotingRole = Object.prototype.hasOwnProperty.call(params, "role") && params.role !== "admin";

  if (existing.role === "admin" && (isBecomingInactive || isDemotingRole)) {
    const otherAdmins = db
      .prepare(`SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND is_active = 1 AND id <> ?`)
      .get(userId);
    if (!otherAdmins?.count) {
      return res.status(400).json({ message: "At least one active administrator must remain." });
    }
  }

  const updateSql = `UPDATE users SET ${updates.join(", ")}, updated_at = @updated_at WHERE id = @id`;
  db.prepare(updateSql).run(params);

  const updatedRow = db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
  res.json({ user: mapUserAccount(updatedRow) });
});

// Salesman approval queue
app.get("/api/management/salesman-approvals", requirePrivilege("users.manage"), (req, res) => {
  const db = getDb();
  const {
    status = PENDING_ENTRY_STATUSES.PENDING,
    entryType,
    limit = 200,
    offset = 0
  } = req.query;

  const params = {
    limit: Number(limit) || 200,
    offset: Number(offset) || 0
  };
  const conditions = [];

  if (status) {
    conditions.push("spa.status = @status");
    params.status = String(status).toLowerCase();
  }

  if (entryType) {
    conditions.push("spa.entry_type = @entryType");
    params.entryType = String(entryType).toLowerCase();
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = db
    .prepare(
      `SELECT spa.*
       FROM salesman_pending_entries spa
       ${whereClause}
       ORDER BY spa.created_at DESC
       LIMIT @limit OFFSET @offset`
    )
    .all(params);

  res.json({ entries: rows.map(mapPendingEntryRow) });
});

app.get(
  "/api/management/salesman-approvals/:id",
  requirePrivilege("users.manage"),
  (req, res) => {
    const db = getDb();
    const entry = findPendingEntryById(db, req.params.id);
    if (!entry) {
      return res.status(404).json({ message: "Pending entry not found." });
    }
    res.json({ entry: mapPendingEntryRow(entry) });
  }
);

app.post(
  "/api/management/salesman-approvals/:id/approve",
  requirePrivilege("users.manage"),
  (req, res) => {
    const db = getDb();
    const entry = findPendingEntryById(db, req.params.id);
    if (!entry) {
      return res.status(404).json({ message: "Pending entry not found." });
    }
    if (entry.status !== PENDING_ENTRY_STATUSES.PENDING) {
      return res.status(400).json({ message: `Entry already ${entry.status}.` });
    }

    const payload = parseJson(entry.payload);
    if (!payload) {
      return res.status(400).json({ message: "Stored payload is not readable." });
    }

    try {
      let result;
      let entityId = null;
      if (entry.entry_type === MOBILE_SYNC_ENTITY_TYPES.ORDER) {
        result = createOrderRecord(db, payload);
        entityId = result.order?.id ?? null;
      } else if (entry.entry_type === MOBILE_SYNC_ENTITY_TYPES.RECOVERY) {
        result = createCustomerReceiptRecord(db, payload);
        entityId = result.id ?? null;
      } else {
        throw createHttpError(400, "Unsupported entry type.");
      }

      const timestamp = nowIso();
      db
        .prepare(
          `UPDATE salesman_pending_entries
           SET status = ?,
               entity_id = ?,
               reviewer_id = ?,
               reviewer_name = ?,
               reviewed_at = ?,
               updated_at = ?,
               rejection_reason = NULL
           WHERE id = ?`
        )
        .run(
          PENDING_ENTRY_STATUSES.APPROVED,
          entityId,
          req.user?.id ?? null,
          req.user?.username ?? null,
          timestamp,
          timestamp,
          entry.id
        );

      upsertSyncLog(db, {
        reference: entry.client_reference,
        entityType: entry.entry_type,
        entityId,
        status: "success",
        payloadHash: entry.payload_hash,
        lastError: null,
        salesmanId: entry.salesman_id ?? null
      });

      const updated = findPendingEntryById(db, entry.id);
      res.json({ entry: mapPendingEntryRow(updated), entity: result });
    } catch (error) {
      const message = error?.message || "Failed to approve entry.";
      res.status(400).json({ message });
    }
  }
);

app.post(
  "/api/management/salesman-approvals/:id/reject",
  requirePrivilege("users.manage"),
  (req, res) => {
    const db = getDb();
    const entry = findPendingEntryById(db, req.params.id);
    if (!entry) {
      return res.status(404).json({ message: "Pending entry not found." });
    }
    if (entry.status !== PENDING_ENTRY_STATUSES.PENDING) {
      return res.status(400).json({ message: `Entry already ${entry.status}.` });
    }

    const reasonRaw = typeof req.body?.reason === "string" ? req.body.reason : "";
    const reason = reasonRaw.trim() || "Rejected by supervisor.";
    const timestamp = nowIso();

    db
      .prepare(
        `UPDATE salesman_pending_entries
         SET status = ?,
             reviewer_id = ?,
             reviewer_name = ?,
             reviewed_at = ?,
             updated_at = ?,
             rejection_reason = ?
         WHERE id = ?`
      )
      .run(
        PENDING_ENTRY_STATUSES.REJECTED,
        req.user?.id ?? null,
        req.user?.username ?? null,
        timestamp,
        timestamp,
        reason,
        entry.id
      );

    upsertSyncLog(db, {
      reference: entry.client_reference,
      entityType: entry.entry_type,
      entityId: null,
      status: PENDING_ENTRY_STATUSES.REJECTED,
      payloadHash: entry.payload_hash,
      lastError: reason,
      salesmanId: entry.salesman_id ?? null
    });

    const updated = findPendingEntryById(db, entry.id);
    res.json({ entry: mapPendingEntryRow(updated) });
  }
);

// Registration endpoints
app.get("/api/companies", listQuery("companies", ["code", "name", "address"]));
app.post(
  "/api/companies",
  upsertFactory("companies", ["code", "name", "address", "phone1", "phone2"])
);
app.put(
  "/api/companies/:id",
  upsertFactory("companies", ["code", "name", "address", "phone1", "phone2"])
);

app.get("/api/companies/:id/items", (req, res) => {
  const companyId = Number(req.params.id);
  if (!Number.isInteger(companyId)) {
    return res.status(400).json({ message: "Invalid company id" });
  }

  const company = findById("companies", companyId);
  if (!company) {
    return res.status(404).json({ message: "Company not found" });
  }

  const db = getDb();
  const items = db
    .prepare(
      `SELECT id, code, name, purchase_rate, trade_rate, retail_price, base_unit
       FROM items
       WHERE company_id = ?
       ORDER BY name`
    )
    .all(companyId)
    .map((item) => ({
      id: item.id,
      code: item.code,
      name: item.name,
      base_unit: item.base_unit,
      purchase_rate: item.purchase_rate === null ? null : Number(item.purchase_rate),
      trade_rate: item.trade_rate === null ? null : Number(item.trade_rate),
      retail_price: item.retail_price === null ? null : Number(item.retail_price)
    }));

  res.json(items);
});

app.put("/api/companies/:id/item-rates", (req, res) => {
  const companyId = Number(req.params.id);
  if (!Number.isInteger(companyId)) {
    return res.status(400).json({ message: "Invalid company id" });
  }

  const company = findById("companies", companyId);
  if (!company) {
    return res.status(404).json({ message: "Company not found" });
  }

  const { updates } = req.body ?? {};
  if (!Array.isArray(updates) || updates.length === 0) {
    return res.status(400).json({ message: "At least one rate update is required" });
  }

  try {
    const normalized = updates.map((entry, index) => {
      const itemId = Number(entry.itemId ?? entry.id);
      if (!Number.isInteger(itemId)) {
        throw new Error(`Invalid item id at position ${index + 1}`);
      }

      const rawRate = entry.purchaseRate ?? entry.purchase_rate;
      let purchaseRate = null;
      if (rawRate !== null && rawRate !== undefined && rawRate !== "") {
        const numeric = Number(rawRate);
        if (!Number.isFinite(numeric)) {
          throw new Error(`Invalid purchase rate for item ${itemId}`);
        }
        purchaseRate = numeric;
      }

      return {
        itemId,
        purchase_rate: purchaseRate
      };
    });

    const db = getDb();
    const findItemStmt = db.prepare("SELECT company_id FROM items WHERE id = ?");
    const updateStmt = db.prepare(
      `UPDATE items
       SET purchase_rate = @purchase_rate,
           updated_at = @updated_at
       WHERE id = @item_id AND company_id = @company_id`
    );

    const transaction = db.transaction((entries) => {
      for (const entry of entries) {
        const owning = findItemStmt.get(entry.itemId);
        if (!owning || owning.company_id !== companyId) {
          throw new Error(`Item ${entry.itemId} does not belong to the selected company`);
        }

        updateStmt.run({
          purchase_rate: entry.purchase_rate,
          updated_at: nowIso(),
          item_id: entry.itemId,
          company_id: companyId
        });
      }
    });

    transaction(normalized);

    const items = db
      .prepare(
        `SELECT id, code, name, purchase_rate, trade_rate, retail_price, base_unit
         FROM items
         WHERE company_id = ?
         ORDER BY name`
      )
      .all(companyId)
      .map((item) => ({
        id: item.id,
        code: item.code,
        name: item.name,
        base_unit: item.base_unit,
        purchase_rate: item.purchase_rate === null ? null : Number(item.purchase_rate),
        trade_rate: item.trade_rate === null ? null : Number(item.trade_rate),
        retail_price: item.retail_price === null ? null : Number(item.retail_price)
      }));

    res.json({ updated: normalized.length, items });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.get("/api/suppliers", listQuery("suppliers", ["code", "name", "contact_person", "address"]));
app.post(
  "/api/suppliers",
  upsertFactory("suppliers", ["code", "name", "contact_person", "address", "phone"])
);
app.put(
  "/api/suppliers/:id",
  upsertFactory("suppliers", ["code", "name", "contact_person", "address", "phone"])
);

app.get("/api/suppliers/payables", (req, res) => {
  const db = getDb();
  const { search = "", limit = 100 } = req.query;
  const trimmed = search.trim();
  const resolvedLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);

  const params = { limit: resolvedLimit };
  let suppliers;

  if (trimmed) {
    params.like = `%${trimmed}%`;
    suppliers = db
      .prepare(
        `SELECT *
         FROM suppliers
         WHERE code LIKE @like OR name LIKE @like
         ORDER BY name
         LIMIT @limit`
      )
      .all(params);
  } else {
    suppliers = db
      .prepare(
        `SELECT *
         FROM suppliers
         ORDER BY name
         LIMIT @limit`
      )
      .all(params);
  }

  const results = [];
  for (const supplier of suppliers) {
    const payableInfo = computeSupplierPayable(db, supplier.id);
    if (payableInfo.payable > 0 || payableInfo.receivable > 0) {
      results.push({
        id: supplier.id,
        code: supplier.code,
        name: supplier.name,
        payable: payableInfo.payable,
        receivable: payableInfo.receivable,
        net: payableInfo.net,
        breakdown: payableInfo.components
      });
    }
  }

  res.json(results);
});

app.get("/api/suppliers/:code/payable", (req, res) => {
  const db = getDb();
  const supplier = findByCode("suppliers", req.params.code);
  if (!supplier) {
    return res.status(404).json({ message: "Supplier not found" });
  }

  const payableInfo = computeSupplierPayable(db, supplier.id);
  res.json({
    supplier: { code: supplier.code, name: supplier.name },
    payable: payableInfo.payable,
    receivable: payableInfo.receivable,
    net: payableInfo.net,
    breakdown: payableInfo.components
  });
});

app.get("/api/areas", listQuery("areas", ["code", "name"]));
app.post("/api/areas", upsertFactory("areas", ["code", "name"]));
app.put("/api/areas/:id", upsertFactory("areas", ["code", "name"]));

app.get("/api/salesmen", listQuery("salesmen", ["code", "name", "address"]));
app.post(
  "/api/salesmen",
  upsertFactory("salesmen", ["code", "name", "address", "phone1", "phone2"])
);
app.put(
  "/api/salesmen/:id",
  upsertFactory("salesmen", ["code", "name", "address", "phone1", "phone2"])
);

app.get("/api/salesmen/:code/total-sales", (req, res) => {
  const db = getDb();
  const salesman = findByCode("salesmen", req.params.code);
  if (!salesman) {
    return res.status(404).json({ message: "Salesman not found" });
  }

  const row = db
    .prepare(
      `SELECT COALESCE(SUM(total_amount), 0) AS total
       FROM sales
       WHERE salesman_id = ?`
    )
    .get(salesman.id);

  res.json({ salesmanCode: salesman.code, totalAmount: Number(row?.total ?? 0) });
});

app.get("/api/salesmen/:code/receivables", (req, res) => {
  const db = getDb();
  const salesman = findByCode("salesmen", req.params.code);
  if (!salesman) {
    return res.status(404).json({ message: "Salesman not found" });
  }

  const { date = "" } = req.query;
  let filterDate = "";
  if (date) {
    const storageDate = toStorageDate(date);
    if (!storageDate) {
      return res.status(400).json({ message: "Invalid date format" });
    }
    filterDate = storageDate;
  }

  const rows = db
    .prepare(
      `SELECT sales.invoice_no,
              sales.invoice_date,
              sales.amount_paid,
              sales.previous_balance,
              sales.trade_off_total,
              customers.id AS customer_id,
              customers.code AS customer_code,
              customers.name AS customer_name
       FROM sales
       INNER JOIN customers ON customers.id = sales.customer_id
       WHERE sales.salesman_id = @salesmanId
         AND (@filterDate = '' OR sales.invoice_date <= @filterDate)
       ORDER BY sales.invoice_date, sales.id`
    )
    .all({ salesmanId: salesman.id, filterDate });

  const mapped = rows.map((row) => {
    const previousBalance = Number(row.previous_balance || 0);
    const tradeOffTotal = Number(row.trade_off_total || 0);
    const receivedAmount = Number(row.amount_paid || 0);
    const netBalance = Number((previousBalance + tradeOffTotal - receivedAmount).toFixed(2));
    return {
      customerId: row.customer_id,
      customerCode: row.customer_code,
      customerName: row.customer_name,
      previousBalance: Number(previousBalance.toFixed(2)),
      tradeOffTotal: Number(tradeOffTotal.toFixed(2)),
      receivedAmount: Number(receivedAmount.toFixed(2)),
      netBalance,
      remarks: "",
      invoiceNo: row.invoice_no,
      invoiceDate: toDisplayDate(row.invoice_date)
    };
  });

  res.json({
    salesman: { code: salesman.code, name: salesman.name },
    rows: mapped
  });
});

app.get("/api/customers", (req, res) => {
  const db = getDb();
  const { search = "", limit = 50, offset = 0 } = req.query;
  const params = { limit: Number(limit), offset: Number(offset), search: `%${search.trim()}%` };
  const where = search
    ? "WHERE customers.code LIKE @search OR customers.name LIKE @search OR customers.address LIKE @search"
    : "";
  const rows = db.prepare(
    `SELECT customers.*, areas.name AS area_name
     FROM customers
     LEFT JOIN areas ON areas.id = customers.area_id
     ${where}
     ORDER BY customers.name
     LIMIT @limit OFFSET @offset`
  ).all(params);
  res.json(rows.map(mapRowDates));
});

app.get("/api/customers/:code/balance", (req, res) => {
  const db = getDb();
  const customer = db.prepare(`SELECT * FROM customers WHERE code = ?`).get(req.params.code);
  if (!customer) {
    return res.status(404).json({ message: "Customer not found" });
  }
  const balance = computeCustomerBalance(db, customer.id);
  res.json({ balance });
});

app.get("/api/dashboard/summary", (req, res) => {
  const db = getDb();

  const getCount = (table) => db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;

  const counts = {
    companies: getCount("companies"),
    customers: getCount("customers"),
    suppliers: getCount("suppliers"),
    items: getCount("items")
  };

  const salesSummary = db.prepare(
    `SELECT COUNT(*) AS invoiceCount,
            COALESCE(SUM(total_amount), 0) AS totalAmount,
            COALESCE(SUM(amount_paid), 0) AS totalPaid
     FROM sales`
  ).get();

  const purchaseSummary = db.prepare(
    `SELECT COUNT(*) AS invoiceCount,
            COALESCE(SUM(total_amount), 0) AS totalAmount,
            COALESCE(SUM(amount_paid), 0) AS totalPaid
     FROM purchases`
  ).get();

  // Calculate supplier payable using full payable logic (opening + purchases - payments - returns)
  const allSuppliers = db.prepare(`SELECT id FROM suppliers`).all();
  let totalSupplierPayable = 0;
  allSuppliers.forEach((supplier) => {
    const payableInfo = computeSupplierPayable(db, supplier.id);
    if (payableInfo.payable > 0) {
      totalSupplierPayable += Number(payableInfo.payable || 0);
    }
  });
  const supplierPayable = Number(totalSupplierPayable.toFixed(2));

  const receiptTotals = db.prepare(
    `SELECT COALESCE(SUM(amount), 0) AS totalAmount
     FROM customer_receipts`
  ).get();

  const expenseTotals = db.prepare(
    `SELECT COALESCE(SUM(cash_payment), 0) AS totalAmount
     FROM expense_entries`
  ).get();

  // Calculate outstanding receivable - sum only positive customer balances
  // This matches the receivable summary report logic
  const allCustomers = db.prepare(`SELECT id FROM customers`).all();
  let totalOutstanding = 0;
  allCustomers.forEach(customer => {
    const balance = computeCustomerBalance(db, customer.id);
    if (balance > 0) {
      totalOutstanding += Number(balance || 0);
    }
  });
  const outstanding = Number(totalOutstanding.toFixed(2));

  const recentSales = db.prepare(
    `SELECT sales.invoice_no,
            sales.invoice_date,
            sales.total_amount,
            sales.trade_off_total,
            sales.amount_paid,
            customers.name AS customer_name
     FROM sales
     INNER JOIN customers ON customers.id = sales.customer_id
     ORDER BY sales.invoice_date DESC, sales.id DESC
     LIMIT 5`
  ).all();

  const mappedRecentSales = recentSales.map((row) => {
    const mapped = mapRowDates(row);
    return {
      invoiceNo: mapped.invoice_no,
      invoiceDate: mapped.invoice_date,
      customer: mapped.customer_name,
      totalAmount: Number(row.total_amount || 0),
      tradeOffTotal: Number(row.trade_off_total || 0),
      amountPaid: Number(row.amount_paid || 0)
    };
  });

  res.json({
    counts: {
      companies: Number(counts.companies || 0),
      customers: Number(counts.customers || 0),
      suppliers: Number(counts.suppliers || 0),
      items: Number(counts.items || 0)
    },
    sales: {
      invoiceCount: Number(salesSummary.invoiceCount || 0),
      totalAmount: Number(salesSummary.totalAmount || 0),
      totalPaid: Number(salesSummary.totalPaid || 0),
      outstanding
    },
    purchases: {
      invoiceCount: Number(purchaseSummary.invoiceCount || 0),
      totalAmount: Number(purchaseSummary.totalAmount || 0),
      totalPaid: Number(purchaseSummary.totalPaid || 0),
      totalPayable: supplierPayable
    },
    receipts: {
      totalAmount: Number(receiptTotals.totalAmount || 0)
    },
    expenses: {
      totalAmount: Number(expenseTotals.totalAmount || 0)
    },
    recentSales: mappedRecentSales
  });
});

app.get("/api/dashboard/monthly-sales", (req, res) => {
  const db = getDb();

  // Get sales grouped by month for the current year
  const rows = db.prepare(`
    SELECT 
      CAST(STRFTIME('%m', invoice_date) AS INTEGER) AS month,
      COALESCE(SUM(total_amount), 0) AS sales
    FROM sales
    WHERE STRFTIME('%Y', invoice_date) = STRFTIME('%Y', 'now')
    GROUP BY CAST(STRFTIME('%m', invoice_date) AS INTEGER)
    ORDER BY month
  `).all();

  // Create a map for quick lookup
  const monthMap = {};
  rows.forEach(row => {
    monthMap[row.month] = Number(row.sales || 0);
  });

  // Build array with all 12 months
  const monthlyData = [];
  for (let i = 1; i <= 12; i++) {
    monthlyData.push({
      month: i,
      sales: monthMap[i] || 0
    });
  }

  res.json(monthlyData);
});

app.post(
  "/api/customers",
  (req, res) => {
    const db = getDb();
    const timestamp = nowIso();
    const payload = sanitizePayload(req.body, ["code", "name", "address", "area_id", "phone1", "phone2"]);
    payload.created_at = timestamp;
    payload.updated_at = timestamp;
    try {
      const stmt = db.prepare(
        `INSERT INTO customers (code, name, address, area_id, phone1, phone2, created_at, updated_at)
         VALUES (@code, @name, @address, @area_id, @phone1, @phone2, @created_at, @updated_at)`
      );
      const info = stmt.run(payload);
      const row = db.prepare(`SELECT * FROM customers WHERE id = ?`).get(info.lastInsertRowid);
      res.status(201).json(row);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  }
);
app.put(
  "/api/customers/:id",
  (req, res) => {
    const db = getDb();
    const timestamp = nowIso();
    const payload = sanitizePayload(req.body, ["code", "name", "address", "area_id", "phone1", "phone2"]);
    payload.updated_at = timestamp;
    payload.id = req.params.id;
    try {
      const stmt = db.prepare(
        `UPDATE customers
         SET code = @code,
             name = @name,
             address = @address,
             area_id = @area_id,
             phone1 = @phone1,
             phone2 = @phone2,
             updated_at = @updated_at
         WHERE id = @id`
      );
      const info = stmt.run(payload);
      if (info.changes === 0) return res.status(404).json({ message: "Record not found" });
      const row = db.prepare(`SELECT * FROM customers WHERE id = ?`).get(req.params.id);
      res.json(row);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  }
);

app.get("/api/expenses", listQuery("expense_definitions", ["code", "description"]));
app.post(
  "/api/expenses",
  upsertFactory("expense_definitions", ["code", "description"], "code")
);
app.put(
  "/api/expenses/:id",
  upsertFactory("expense_definitions", ["code", "description"], "id")
);

app.get("/api/banks", listQuery("banks", ["code", "name", "account_no", "address"]));
app.post(
  "/api/banks",
  upsertFactory("banks", ["code", "account_no", "name", "address", "phone1", "phone2"])
);
app.put(
  "/api/banks/:id",
  upsertFactory("banks", ["code", "account_no", "name", "address", "phone1", "phone2"])
);

app.get("/api/banks/:code/metrics", (req, res) => {
  const db = getDb();
  const bank = findByCode("banks", req.params.code);
  if (!bank) {
    return res.status(404).json({ message: "Bank not found" });
  }

  const totals = computeBankTotals(db, bank.id);
  res.json({
    bank: {
      code: bank.code,
      name: bank.name,
      accountNo: bank.account_no
    },
    totals
  });
});

app.get("/api/items", (req, res) => {
  const db = getDb();
  const { search = "", limit = 50, offset = 0, inStock } = req.query;
  const params = { limit: Number(limit), offset: Number(offset) };
  const whereClauses = [];

  if (search) {
    params.search = `%${search.trim()}%`;
    whereClauses.push(
      "(items.code LIKE @search OR items.name LIKE @search OR companies.name LIKE @search)"
    );
  }

  if (inStock === "true") {
    whereClauses.push(
      "EXISTS (SELECT 1 FROM purchase_items WHERE purchase_items.item_id = items.id)"
    );
  }

  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const rows = db.prepare(
    `SELECT items.*, companies.name AS company_name, companies.code AS company_code
     FROM items
     INNER JOIN companies ON companies.id = items.company_id
     ${whereSql}
     ORDER BY items.name
     LIMIT @limit OFFSET @offset`
  ).all(params);
  res.json(rows);
});

app.get("/api/items/:code/availability", (req, res) => {
  const db = getDb();
  const item = findByCode("items", req.params.code);
  if (!item) {
    return res.status(404).json({ message: "Item not found" });
  }
  const available = getAvailableUnits(db, item.id);
  res.json({ code: item.code, name: item.name, quantity: available });
});

// Items purchased from a supplier (for damage transactions validation)
app.get("/api/supplier-items", (req, res) => {
  const db = getDb();
  const { supplierCode, search = "", limit = 50, offset = 0, type } = req.query;
  if (!supplierCode) {
    return res.status(400).json({ message: "Supplier code is required" });
  }
  const supplier = findByCode("suppliers", supplierCode);
  if (!supplier) {
    return res.status(404).json({ message: "Supplier not found" });
  }

  const params = { supplierId: supplier.id, limit: Number(limit), offset: Number(offset) };
  let whereSql = "";
  if (search && search.trim()) {
    params.search = `%${search.trim()}%`;
    whereSql = "AND (items.code LIKE @search OR items.name LIKE @search)";
  }

  const filterType = String(type || "").toLowerCase();
  if (filterType === "in") {
    whereSql += `
      AND (
        SELECT COALESCE(SUM(CASE WHEN dt.transaction_type = 'out' THEN dt.quantity ELSE 0 END), 0)
             - COALESCE(SUM(CASE WHEN dt.transaction_type = 'in' THEN dt.quantity ELSE 0 END), 0)
        FROM damage_transactions dt
        WHERE dt.item_id = items.id
          AND dt.supplier_id = purchases.supplier_id
      ) > 0
    `;
  }

  const rows = db
    .prepare(
      `SELECT DISTINCT
          items.id AS id,
          items.code AS code,
          items.name AS name,
          items.base_unit,
          items.pack_size,
          companies.name AS company_name,
          (
            SELECT pi.purchase_rate
            FROM purchase_items pi
            INNER JOIN purchases p2 ON p2.id = pi.purchase_id
            WHERE p2.supplier_id = purchases.supplier_id
              AND pi.item_id = items.id
            ORDER BY p2.invoice_date DESC, p2.id DESC, pi.id DESC
            LIMIT 1
          ) AS last_purchase_rate,
          (
            SELECT pi.net_amount
            FROM purchase_items pi
            INNER JOIN purchases p3 ON p3.id = pi.purchase_id
            WHERE p3.supplier_id = purchases.supplier_id
              AND pi.item_id = items.id
            ORDER BY p3.invoice_date DESC, p3.id DESC, pi.id DESC
            LIMIT 1
          ) AS last_purchase_value
       FROM purchase_items
       INNER JOIN purchases ON purchases.id = purchase_items.purchase_id
       INNER JOIN items ON items.id = purchase_items.item_id
       LEFT JOIN companies ON companies.id = items.company_id
       WHERE purchases.supplier_id = @supplierId ${whereSql}
       ORDER BY items.name
       LIMIT @limit OFFSET @offset`
    )
    .all(params);

  res.json(rows);
});

// Damage transactions creation
app.post("/api/damage-transactions", (req, res) => {
  const db = getDb();
  const { type, supplierCode, itemCode, quantity, date, notes } = req.body;

  const txType = String(type || "").toLowerCase();
  if (!["in", "out"].includes(txType)) {
    return res.status(400).json({ message: "Invalid transaction type. Must be IN or OUT." });
  }
  const qty = Number(quantity) || 0;
  if (!Number.isFinite(qty) || qty <= 0) {
    return res.status(400).json({ message: "Enter a valid quantity greater than zero." });
  }
  if (!notes || !String(notes).trim()) {
    return res.status(400).json({ message: "Notes/reason is required for damage transactions." });
  }
  const supplier = findByCode("suppliers", supplierCode);
  if (!supplier) return res.status(404).json({ message: "Supplier not found" });
  const item = findByCode("items", itemCode);
  if (!item) return res.status(404).json({ message: "Item not found" });

  // Validate item belongs to supplier via purchase history
  const purchasedFromSupplier = db
    .prepare(
      `SELECT 1
       FROM purchase_items pi
       INNER JOIN purchases p ON p.id = pi.purchase_id
       WHERE p.supplier_id = ? AND pi.item_id = ?
       LIMIT 1`
    )
    .get(supplier.id, item.id);
  if (!purchasedFromSupplier) {
    return res.status(400).json({ message: "Selected item has no purchase history from this supplier." });
  }

  if (txType === "in") {
    const balanceRow = db
      .prepare(
        `SELECT COALESCE(SUM(CASE WHEN transaction_type = 'out' THEN quantity ELSE 0 END), 0)
              - COALESCE(SUM(CASE WHEN transaction_type = 'in' THEN quantity ELSE 0 END), 0) AS balance
         FROM damage_transactions
         WHERE supplier_id = ? AND item_id = ?`
      )
      .get(supplier.id, item.id);
    const remainingDamageOut = Number(balanceRow?.balance || 0);
    if (remainingDamageOut <= 0) {
      return res.status(409).json({
        code: "NO_DAMAGE_OUT",
        message: "Damage-In is only allowed for items with pending Damage-Out quantity."
      });
    }
    if (qty - remainingDamageOut > 1e-6) {
      return res.status(409).json({
        code: "EXCEEDS_DAMAGE_OUT",
        message: `Damage-In quantity exceeds pending Damage-Out (${Number(remainingDamageOut.toFixed(2))}).`
      });
    }
  }

  const storageDate = toStorageDate(date);
  if (!storageDate) {
    return res.status(400).json({ message: "Invalid date format" });
  }

  // Prevent negative stock on Damage-Out
  if (txType === "out") {
    const available = getAvailableUnits(db, item.id);
    if (qty - available > 1e-6) {
      return res.status(409).json({
        code: "LOW_STOCK",
        message: `Insufficient stock. Available: ${Number(available.toFixed(2))}, Requested: ${Number(qty.toFixed(2))}`
      });
    }
  }

  const timestamp = nowIso();
  const voucherNo = nextDamageVoucherNo(db);
  try {
    const info = db
      .prepare(
        `INSERT INTO damage_transactions (voucher_no, transaction_type, item_id, supplier_id, quantity, transaction_date, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        voucherNo,
        txType,
        item.id,
        supplier.id,
        qty,
        storageDate,
        String(notes).trim(),
        timestamp,
        timestamp
      );
    const row = db
      .prepare(
        `SELECT dt.*, items.code AS item_code, items.name AS item_name, suppliers.code AS supplier_code, suppliers.name AS supplier_name
         FROM damage_transactions dt
         INNER JOIN items ON items.id = dt.item_id
         INNER JOIN suppliers ON suppliers.id = dt.supplier_id
         WHERE dt.id = ?`
      )
      .get(info.lastInsertRowid);
    const nextVoucher = nextDamageVoucherNo(db);
    res.status(201).json({ ...mapRowDates(row), nextVoucher });
  } catch (error) {
    res.status(400).json({ message: error?.message || "Failed to record damage transaction" });
  }
});

// List damage transactions
app.get("/api/damage-transactions", (req, res) => {
  const db = getDb();
  const { supplierCode, type, startDate, endDate, voucher, search, limit: rawLimit = 200 } = req.query;
  const limit = Math.min(Math.max(Number(rawLimit) || 200, 1), 500);
  const params = { limit };
  const where = [];

  if (supplierCode) {
    const supplier = findByCode("suppliers", supplierCode);
    if (!supplier) return res.status(404).json({ message: "Supplier not found" });
    params.supplierId = supplier.id;
    where.push("dt.supplier_id = @supplierId");
  }
  const txType = String(type || "").toLowerCase();
  if (["in", "out"].includes(txType)) {
    params.type = txType;
    where.push("dt.transaction_type = @type");
  }
  if (startDate) {
    const s = toStorageDate(startDate);
    if (!s) return res.status(400).json({ message: "Invalid start date" });
    params.start = s;
    where.push("dt.transaction_date >= @start");
  }
  if (endDate) {
    const e = toStorageDate(endDate);
    if (!e) return res.status(400).json({ message: "Invalid end date" });
    params.end = e;
    where.push("dt.transaction_date <= @end");
  }
  if (voucher && String(voucher).trim()) {
    params.voucher = `%${voucher.trim()}%`;
    where.push("dt.voucher_no LIKE @voucher");
  }
  const searchTerm = String(search || "").trim();
  if (searchTerm) {
    params.search = `%${searchTerm}%`;
    where.push(
      "(dt.voucher_no LIKE @search OR items.code LIKE @search OR items.name LIKE @search OR suppliers.code LIKE @search OR suppliers.name LIKE @search)"
    );
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = db
    .prepare(
      `SELECT dt.*, items.code AS item_code, items.name AS item_name,
              suppliers.code AS supplier_code, suppliers.name AS supplier_name,
              (
                SELECT pi.purchase_rate
                FROM purchase_items pi
                INNER JOIN purchases p2 ON p2.id = pi.purchase_id
                WHERE p2.supplier_id = dt.supplier_id
                  AND pi.item_id = dt.item_id
                  AND p2.invoice_date <= dt.transaction_date
                ORDER BY p2.invoice_date DESC, p2.id DESC, pi.id DESC
                LIMIT 1
              ) AS last_purchase_rate
       FROM damage_transactions dt
       INNER JOIN items ON items.id = dt.item_id
       INNER JOIN suppliers ON suppliers.id = dt.supplier_id
       ${whereSql}
       ORDER BY dt.transaction_date DESC, dt.id DESC
       LIMIT @limit`
    )
    .all(params);
  const mapped = rows.map((row) => {
    const withDates = mapRowDates(row);
    return {
      ...withDates,
      last_purchase_rate:
        row.last_purchase_rate != null ? Number(row.last_purchase_rate) : null
    };
  });
  res.json(mapped);
});

const fetchDamageTransactionDetail = (voucherNo) => {
  const db = getDb();
  const trimmed = String(voucherNo || "").trim();
  if (!trimmed) return null;
  const row = db
    .prepare(
      `SELECT dt.*, items.code AS item_code, items.name AS item_name,
              suppliers.code AS supplier_code, suppliers.name AS supplier_name,
              (
                SELECT pi.purchase_rate
                FROM purchase_items pi
                INNER JOIN purchases p2 ON p2.id = pi.purchase_id
                WHERE p2.supplier_id = dt.supplier_id
                  AND pi.item_id = dt.item_id
                  AND p2.invoice_date <= dt.transaction_date
                ORDER BY p2.invoice_date DESC, p2.id DESC, pi.id DESC
                LIMIT 1
              ) AS last_purchase_rate
       FROM damage_transactions dt
       INNER JOIN items ON items.id = dt.item_id
       INNER JOIN suppliers ON suppliers.id = dt.supplier_id
       WHERE dt.voucher_no = ?`
    )
    .get(trimmed);
  if (!row) return null;
  const mapped = mapRowDates(row);
  return {
    ...mapped,
    last_purchase_rate: row.last_purchase_rate != null ? Number(row.last_purchase_rate) : null
  };
};

app.get("/api/damage-transactions/:voucherNo", (req, res) => {
  const detail = fetchDamageTransactionDetail(req.params.voucherNo);
  if (!detail) {
    return res.status(404).json({ message: "Damage transaction not found." });
  }
  res.json(detail);
});

app.put("/api/damage-transactions/:voucherNo", (req, res) => {
  const db = getDb();
  const existing = fetchDamageTransactionDetail(req.params.voucherNo);
  if (!existing) {
    return res.status(404).json({ message: "Damage transaction not found." });
  }

  const txType = String(req.body?.type || existing.transaction_type || "").toLowerCase();
  if (!["in", "out"].includes(txType)) {
    return res.status(400).json({ message: "Invalid transaction type. Must be IN or OUT." });
  }

  const qty = Number(req.body?.quantity ?? existing.quantity ?? 0);
  if (!Number.isFinite(qty) || qty <= 0) {
    return res.status(400).json({ message: "Enter a valid quantity greater than zero." });
  }

  const notes = String(req.body?.notes ?? existing.notes ?? "").trim();
  if (!notes) {
    return res.status(400).json({ message: "Notes/reason is required for damage transactions." });
  }

  const storageDate = toStorageDate(req.body?.date ?? existing.transaction_date);
  if (!storageDate) {
    return res.status(400).json({ message: "Invalid transaction date." });
  }

  const row = db
    .prepare(
      `SELECT dt.*
       FROM damage_transactions dt
       WHERE dt.voucher_no = ?`
    )
    .get(String(existing.voucher_no).trim());

  if (!row) {
    return res.status(404).json({ message: "Damage transaction not found." });
  }

  const itemId = Number(row.item_id);
  const existingQuantity = Number(row.quantity) || 0;
  const existingType = String(row.transaction_type || "").toLowerCase();
  let availableForOut = getAvailableUnits(db, itemId);
  if (existingType === "out") {
    availableForOut += existingQuantity;
  } else if (existingType === "in") {
    availableForOut -= existingQuantity;
  }

  const effectiveAvailable = Math.max(availableForOut, 0);

  if (txType === "out" && qty - effectiveAvailable > 1e-6) {
    return res.status(409).json({
      code: "LOW_STOCK",
      message: `Insufficient stock. Available: ${Number(effectiveAvailable.toFixed(2))}, Requested: ${Number(qty.toFixed(2))}`
    });
  }

  const timestamp = nowIso();
  try {
    db
      .prepare(
        `UPDATE damage_transactions
         SET transaction_type = ?, quantity = ?, transaction_date = ?, notes = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(txType, qty, storageDate, notes, timestamp, row.id);
  } catch (error) {
    return res.status(400).json({ message: error?.message || "Failed to update damage transaction." });
  }

  const updated = fetchDamageTransactionDetail(existing.voucher_no);
  res.json(updated);
});

// Damage-IN/Out monthly report per supplier
app.get("/api/reports/damage-transactions", (req, res) => {
  const db = getDb();
  const { supplierCode, startDate, endDate } = req.query;

  let supplierId = null;
  if (supplierCode) {
    const supplier = findByCode("suppliers", supplierCode);
    if (!supplier) return res.status(404).json({ message: "Supplier not found" });
    supplierId = supplier.id;
  }

  const s = startDate ? toStorageDate(startDate) : null;
  const e = endDate ? toStorageDate(endDate) : null;
  if (startDate && !s) return res.status(400).json({ message: "Invalid start date" });
  if (endDate && !e) return res.status(400).json({ message: "Invalid end date" });

  const params = {};
  const where = [];
  if (supplierId) {
    params.supplierId = supplierId;
    where.push("supplier_id = @supplierId");
  }
  if (s) {
    params.start = s;
    where.push("transaction_date >= @start");
  }
  if (e) {
    params.end = e;
    where.push("transaction_date <= @end");
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const rows = db
    .prepare(
      `SELECT suppliers.code AS supplier_code,
              suppliers.name AS supplier_name,
              items.code AS item_code,
              items.name AS item_name,
              strftime('%Y-%m', dt.transaction_date) AS month,
              SUM(CASE WHEN dt.transaction_type = 'out' THEN dt.quantity ELSE 0 END) AS total_out,
              SUM(CASE WHEN dt.transaction_type = 'in' THEN dt.quantity ELSE 0 END) AS total_in
       FROM damage_transactions dt
       INNER JOIN suppliers ON suppliers.id = dt.supplier_id
       INNER JOIN items ON items.id = dt.item_id
       ${whereSql}
       GROUP BY dt.supplier_id, dt.item_id, strftime('%Y-%m', dt.transaction_date)
       ORDER BY month DESC, suppliers.name, items.name`
    )
    .all(params);
  res.json(rows.map(mapRowDates));
});

app.get("/api/reports/bank-deposits", (req, res) => {
  const db = getDb();
  const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);
  const typeFilter = (req.query.type || "").toLowerCase();
  const params = { limit };
  const transactionDateExpr = `CASE
    WHEN bt.transaction_type = 'drawing' THEN COALESCE(supplier_payments.payment_date, bt.slip_date)
    ELSE bt.slip_date
  END`;

  let sql = `SELECT
          bt.entry_no,
          bt.id,
          bt.transaction_type,
          bt.bank_id,
          bt.slip_no,
          bt.slip_date,
          bt.cash_amount,
          bt.created_at,
          bt.updated_at,
          banks.code AS bank_code,
          banks.name AS bank_name,
          customer_receipts.receipt_no AS customer_receipt_no,
          supplier_payments.payment_no AS supplier_payment_no,
          supplier_payments.payment_mode AS supplier_payment_mode,
          supplier_payments.payment_date AS payment_date,
          ${transactionDateExpr} AS transaction_date
        FROM bank_transactions bt
        LEFT JOIN banks ON banks.id = bt.bank_id
        LEFT JOIN customer_receipts ON customer_receipts.id = bt.customer_receipt_id
        LEFT JOIN supplier_payments ON supplier_payments.id = bt.supplier_payment_id`;

  if (["deposit", "drawing"].includes(typeFilter)) {
    sql += " WHERE bt.transaction_type = @type";
    params.type = typeFilter;
  }

  sql += " ORDER BY transaction_date DESC, bt.id DESC LIMIT @limit";

  const rows = db.prepare(sql).all(params);

  const mapped = rows.map((row) => {
    const withDates = mapRowDates(row);
    const effectiveDate = withDates.transaction_date || withDates.slip_date || "";
    return {
      ...withDates,
      transaction_date: effectiveDate,
      slip_date: row.transaction_type === "drawing" ? effectiveDate : withDates.slip_date
    };
  });

  res.json(mapped);
});

app.get("/api/reports/supplier-payments-date-wise", (req, res) => {
  try {
    const db = getDb();
    const { startDate, endDate, supplierCode } = req.query;

    const params = {};
    let wherePayments = "WHERE 1=1";
    let wherePurchases = "WHERE 1=1";

    if (startDate) {
      const s = toStorageDate(startDate);
      if (s) {
        wherePayments += " AND sp.payment_date >= @startDate";
        wherePurchases += " AND p.invoice_date >= @startDate";
        params.startDate = s;
      }
    }
    if (supplierCode) {
      wherePayments += " AND s.code = @supplierCode";
      wherePurchases += " AND s.code = @supplierCode";
      params.supplierCode = String(supplierCode);
    }
    if (endDate) {
      const e = toStorageDate(endDate);
      if (e) {
        wherePayments += " AND sp.payment_date <= @endDate";
        wherePurchases += " AND p.invoice_date <= @endDate";
        params.endDate = e;
      }
    }

    const sql = `
      -- Payments entered via Supplier Payment screen
      SELECT 
        'supplier-payment' AS source,
        s.id AS supplier_id,
        s.code AS supplier_code,
        s.name AS supplier_name,
        sp.payment_no AS voucher_no,
        sp.payment_date AS voucher_date,
        CASE WHEN sp.payment_mode = 'cash' THEN sp.amount ELSE 0 END AS cash_amount,
        CASE WHEN sp.payment_mode IN ('bank','online','cheque') THEN sp.amount ELSE 0 END AS cheque_amount,
        COALESCE(sp.details, '') AS details,
        NULL AS invoice_balance,
        NULL AS invoice_total
      FROM supplier_payments sp
      INNER JOIN suppliers s ON s.id = sp.supplier_id
      ${wherePayments}

      UNION ALL

      -- Payments made at purchase time (amount_paid)
      SELECT 
        'purchase' AS source,
        s.id AS supplier_id,
        s.code AS supplier_code,
        s.name AS supplier_name,
        p.invoice_no AS voucher_no,
        p.invoice_date AS voucher_date,
        -- treat purchase-time payment as cash (no mode column in purchases)
        p.amount_paid AS cash_amount,
        0 AS cheque_amount,
        '' AS details,
        (p.total_amount - p.amount_paid) AS invoice_balance,
        p.total_amount AS invoice_total
      FROM purchases p
      INNER JOIN suppliers s ON s.id = p.supplier_id
      ${wherePurchases} AND p.amount_paid > 0

      ORDER BY voucher_date DESC, voucher_no DESC
    `;

    const rows = db.prepare(sql).all(params).map(mapRowDates);
    const supplierIds = [...new Set(rows.map((row) => row.supplier_id).filter(Boolean))];
    const supplierBalances = {};
    supplierIds.forEach((supplierId) => {
      const payableInfo = computeSupplierPayable(db, supplierId);
      supplierBalances[supplierId] = payableInfo?.payable ?? 0;
    });

    const enriched = rows.map((row) => ({
      ...row,
      supplier_balance: row.supplier_id ? supplierBalances[row.supplier_id] ?? 0 : null
    }));

    res.json(enriched);
  } catch (error) {
    console.error("Error in supplier-payments-date-wise:", error);
    res.status(500).json({ error: error.message });
  }
});

// Expense-wise payments report (date range + optional expense code)
app.get("/api/reports/expense-wise-payments", (req, res) => {
  try {
    const db = getDb();
    const { startDate, endDate, expenseCode } = req.query;

    const params = {};
    let where = "WHERE 1=1";

    if (startDate) {
      const s = toStorageDate(startDate);
      if (s) {
        where += " AND e.voucher_date >= @startDate";
        params.startDate = s;
      }
    }
    if (endDate) {
      const e = toStorageDate(endDate);
      if (e) {
        where += " AND e.voucher_date <= @endDate";
        params.endDate = e;
      }
    }
    if (expenseCode) {
      where += " AND e.expense_code = @expenseCode";
      params.expenseCode = String(expenseCode);
    }

    const sql = `
      SELECT 
        e.voucher_no,
        e.voucher_date,
        e.cash_payment AS cash_amount,
        COALESCE(e.details, '') AS details,
        e.expense_code,
        d.description AS expense_description
      FROM expense_entries e
      LEFT JOIN expense_definitions d ON d.code = e.expense_code
      ${where}
      ORDER BY e.voucher_date DESC, e.id DESC
      LIMIT 1000`;

    const rows = db
      .prepare(sql)
      .all(params)
      .map((row) => ({
        ...mapRowDates(row),
        cash_amount: Number(row.cash_amount || 0)
      }));

    res.json(rows);
  } catch (error) {
    console.error("Error in expense-wise-payments:", error);
    res.status(500).json({ error: error.message });
  }
});

// Date-wise expense report (date range required)
app.get("/api/reports/expense-date-wise", (req, res) => {
  try {
    const db = getDb();
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ message: "Start date and end date are required." });
    }

    const storageStart = toStorageDate(startDate);
    const storageEnd = toStorageDate(endDate);

    if (!storageStart || !storageEnd) {
      return res.status(400).json({ message: "Invalid date format. Use DD-MM-YYYY." });
    }

    if (storageStart > storageEnd) {
      return res.status(400).json({ message: "Start date must be on or before end date." });
    }

    const rows = db
      .prepare(
        `SELECT 
           e.voucher_no,
           e.voucher_date,
           e.cash_payment AS cash_amount,
           COALESCE(e.details, '') AS details,
           e.expense_code,
           d.description AS expense_description
         FROM expense_entries e
         LEFT JOIN expense_definitions d ON d.code = e.expense_code
         WHERE e.voucher_date >= @start AND e.voucher_date <= @end
         ORDER BY e.voucher_date DESC, e.id DESC`
      )
      .all({ start: storageStart, end: storageEnd })
      .map((row) => ({
        ...mapRowDates(row),
        cash_amount: Number(row.cash_amount || 0)
      }));

    res.json(rows);
  } catch (error) {
    console.error("Error in expense-date-wise:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/reports/sales/day-summary", (req, res) => {
  const db = getDb();
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({ message: "Start date and end date are required." });
  }

  const storageStart = toStorageDate(startDate);
  const storageEnd = toStorageDate(endDate);

  if (!storageStart || !storageEnd) {
    return res.status(400).json({ message: "Invalid date format. Use DD-MM-YYYY." });
  }

  if (storageStart > storageEnd) {
    return res.status(400).json({ message: "Start date must be on or before end date." });
  }

  const rows = db
    .prepare(
      `SELECT invoice_date,
              COUNT(*) AS invoice_count,
              COALESCE(SUM(total_amount), 0) AS total_amount,
              COALESCE(SUM(amount_paid), 0) AS total_paid
       FROM sales
       WHERE invoice_date >= @start AND invoice_date <= @end
       GROUP BY invoice_date
       ORDER BY invoice_date`
    )
    .all({ start: storageStart, end: storageEnd });

  const toNumber = (value) => Number(value ?? 0);

  const mappedRows = rows.map((row) => ({
    date: toDisplayDate(row.invoice_date),
    storageDate: row.invoice_date,
    invoiceCount: Number(row.invoice_count ?? 0),
    totalAmount: toNumber(row.total_amount),
    totalPaid: toNumber(row.total_paid),
    outstanding: toNumber(row.total_amount) - toNumber(row.total_paid)
  }));

  const totals = mappedRows.reduce(
    (acc, row) => {
      acc.totalAmount += row.totalAmount;
      acc.totalPaid += row.totalPaid;
      acc.outstanding += row.outstanding;
      acc.invoiceCount += row.invoiceCount;
      return acc;
    },
    { totalAmount: 0, totalPaid: 0, outstanding: 0, invoiceCount: 0 }
  );

  res.json({
    startDate: toDisplayDate(storageStart),
    endDate: toDisplayDate(storageEnd),
    rows: mappedRows,
    totals
  });
});

app.get("/api/reports/sales/salesman-summary", (req, res) => {
  const db = getDb();
  const { salesmanCode, startDate, endDate } = req.query;

  if (!salesmanCode) {
    return res.status(400).json({ message: "Salesman code is required." });
  }

  if (!startDate || !endDate) {
    return res.status(400).json({ message: "Start date and end date are required." });
  }

  const salesman = findByCode("salesmen", salesmanCode);
  if (!salesman) {
    return res.status(404).json({ message: "Salesman not found." });
  }

  const storageStart = toStorageDate(startDate);
  const storageEnd = toStorageDate(endDate);

  if (!storageStart || !storageEnd) {
    return res.status(400).json({ message: "Invalid date format. Use DD-MM-YYYY." });
  }

  if (storageStart > storageEnd) {
    return res.status(400).json({ message: "Start date must be on or before end date." });
  }

  const rows = db
    .prepare(
      `SELECT sales.id,
              sales.invoice_no,
              sales.invoice_date,
              sales.total_amount,
              sales.amount_paid,
              sales.total_amount - sales.amount_paid AS outstanding,
              customers.code AS customer_code,
              customers.name AS customer_name
       FROM sales
       INNER JOIN customers ON customers.id = sales.customer_id
       WHERE sales.salesman_id = @salesmanId
         AND sales.invoice_date >= @start
         AND sales.invoice_date <= @end
       ORDER BY sales.invoice_date, sales.id`
    )
    .all({ salesmanId: salesman.id, start: storageStart, end: storageEnd });

  const mapNumber = (value) => Number(value ?? 0);

  const saleIds = rows.map((row) => row.id);
  const taxBySaleId = new Map();

  if (saleIds.length > 0) {
    const placeholders = saleIds.map((_, index) => `@sale${index}`).join(", ");
    const params = saleIds.reduce((acc, id, index) => {
      acc[`sale${index}`] = id;
      return acc;
    }, {});

    const taxRows = db
      .prepare(
        `SELECT sale_id,
                SUM(quantity * COALESCE(trade_off_price, trade_price) * (tax_percent / 100.0)) AS tax_amount
         FROM sale_items
         WHERE sale_id IN (${placeholders})
         GROUP BY sale_id`
      )
      .all(params);

    for (const row of taxRows) {
      taxBySaleId.set(row.sale_id, mapNumber(row.tax_amount));
    }
  }

  const mappedRows = rows.map((row) => ({
    saleId: row.id,
    invoiceNo: row.invoice_no,
    invoiceDate: toDisplayDate(row.invoice_date),
    totalAmount: mapNumber(row.total_amount),
    amountPaid: mapNumber(row.amount_paid),
    outstanding: mapNumber(row.total_amount) - mapNumber(row.amount_paid),
    taxAmount: taxBySaleId.get(row.id) ?? 0,
    customerCode: row.customer_code,
    customerName: row.customer_name
  }));

  const totals = mappedRows.reduce(
    (acc, row) => {
      acc.totalAmount += row.totalAmount;
      acc.amountPaid += row.amountPaid;
      acc.outstanding += row.outstanding;
      acc.taxAmount += row.taxAmount;
      return acc;
    },
    { totalAmount: 0, amountPaid: 0, outstanding: 0, taxAmount: 0 }
  );

  const summary = {
    ...totals,
    count: mappedRows.length
  };

  res.json({
    salesman: { code: salesman.code, name: salesman.name },
    startDate: toDisplayDate(storageStart),
    endDate: toDisplayDate(storageEnd),
    rows: mappedRows.map(({ saleId, ...rest }) => rest),
    totals: summary
  });
});

app.get("/api/reports/sales/salesman-items-summary", (req, res) => {
  const db = getDb();
  const { salesmanCode, startDate, endDate } = req.query;

  if (!salesmanCode) {
    return res.status(400).json({ message: "Salesman code is required." });
  }

  if (!startDate || !endDate) {
    return res.status(400).json({ message: "Start date and end date are required." });
  }

  const salesman = findByCode("salesmen", salesmanCode);
  if (!salesman) {
    return res.status(404).json({ message: "Salesman not found." });
  }

  const storageStart = toStorageDate(startDate);
  const storageEnd = toStorageDate(endDate);

  if (!storageStart || !storageEnd) {
    return res.status(400).json({ message: "Invalid date format. Use DD-MM-YYYY." });
  }

  if (storageStart > storageEnd) {
    return res.status(400).json({ message: "Start date must be on or before end date." });
  }

  const rows = db
    .prepare(
      `SELECT items.id,
              items.code AS item_code,
              items.name AS item_name,
              SUM(sale_items.quantity) AS quantity,
              SUM(COALESCE(sale_items.bonus, 0)) AS bonus,
              SUM((sale_items.quantity + COALESCE(sale_items.bonus, 0)) * COALESCE(sale_items.trade_off_price, sale_items.trade_price)) AS net_amount,
              SUM((sale_items.quantity + COALESCE(sale_items.bonus, 0)) * COALESCE(sale_items.trade_off_price, sale_items.trade_price) * (COALESCE(sale_items.tax_percent, 0) / 100.0)) AS tax_amount
       FROM sale_items
       INNER JOIN sales ON sales.id = sale_items.sale_id
       INNER JOIN items ON items.id = sale_items.item_id
       WHERE sales.salesman_id = @salesmanId
         AND sales.invoice_date >= @start
         AND sales.invoice_date <= @end
       GROUP BY items.id
       ORDER BY item_name COLLATE NOCASE`
    )
    .all({ salesmanId: salesman.id, start: storageStart, end: storageEnd });

  const mapNumber = (value) => Number(value ?? 0);

  const mappedRows = rows.map((row) => {
    const quantity = mapNumber(row.quantity);
    const bonus = mapNumber(row.bonus);
    const totalUnits = quantity + bonus;
    const netAmount = mapNumber(row.net_amount);
    const taxAmount = mapNumber(row.tax_amount);
    const totalAmount = netAmount + taxAmount;

    const formatValue = (value) => Number(value.toFixed(2));

    return {
      itemCode: row.item_code,
      itemName: row.item_name,
      quantity: formatValue(quantity),
      bonus: formatValue(bonus),
      totalUnits: formatValue(totalUnits),
      netAmount: formatValue(netAmount),
      taxAmount: formatValue(taxAmount),
      totalAmount: formatValue(totalAmount)
    };
  });

  const totals = mappedRows.reduce(
    (acc, row) => {
      acc.totalUnits += row.totalUnits;
      acc.totalAmount += row.totalAmount;
      return acc;
    },
    { totalUnits: 0, totalAmount: 0 }
  );

  const format = (value) => Number(value.toFixed(2));

  res.json({
    salesman: { code: salesman.code, name: salesman.name },
    startDate: toDisplayDate(storageStart),
    endDate: toDisplayDate(storageEnd),
    rows: mappedRows,
    totals: {
      totalUnits: format(totals.totalUnits),
      totalAmount: format(totals.totalAmount),
      itemCount: mappedRows.length
    }
  });
});

app.get("/api/reports/sales/entire-status", (req, res) => {
  const db = getDb();
  const { type: rawType, startDate, endDate } = req.query;

  const type = (rawType || "").toLowerCase();

  if (!type) {
    return res.status(400).json({ message: "Report type is required." });
  }

  if (!startDate || !endDate) {
    return res.status(400).json({ message: "Start date and end date are required." });
  }

  const storageStart = toStorageDate(startDate);
  const storageEnd = toStorageDate(endDate);

  if (!storageStart || !storageEnd) {
    return res.status(400).json({ message: "Invalid date format. Use DD-MM-YYYY." });
  }

  if (storageStart > storageEnd) {
    return res.status(400).json({ message: "Start date must be on or before end date." });
  }

  const baseResponse = {
    type,
    startDate: toDisplayDate(storageStart),
    endDate: toDisplayDate(storageEnd),
    rows: [],
    totals: {
      totalAmount: 0,
      taxAmount: 0,
      count: 0
    }
  };

  const finalize = (value) => Number(Number(value ?? 0).toFixed(2));

  const params = { start: storageStart, end: storageEnd };

  if (type === "area-wise") {
    const rows = db
      .prepare(
        `SELECT customers.area_id AS area_id,
                COALESCE(areas.code, '') AS area_code,
                COALESCE(areas.name, '') AS area_name,
                SUM(sales.total_amount) AS total_amount
         FROM sales
         LEFT JOIN customers ON customers.id = sales.customer_id
         LEFT JOIN areas ON areas.id = customers.area_id
         WHERE sales.invoice_date >= @start AND sales.invoice_date <= @end
         GROUP BY customers.area_id
         ORDER BY area_name COLLATE NOCASE, area_code COLLATE NOCASE`
      )
      .all(params);

    if (rows.length === 0) {
      return res.json(baseResponse);
    }

    const mapped = rows.map((row) => {
      const areaName = row.area_name || "Unassigned Area";
      const areaCode = row.area_code || "";
      const totalAmount = finalize(row.total_amount);
      return {
        areaId: row.area_id ?? null,
        areaCode,
        areaName,
        totalAmount
      };
    });

    const totals = mapped.reduce(
      (acc, row) => {
        acc.totalAmount += row.totalAmount;
        return acc;
      },
      { totalAmount: 0 }
    );

    baseResponse.rows = mapped;
    baseResponse.totals = {
      totalAmount: finalize(totals.totalAmount),
      taxAmount: 0,
      count: mapped.length
    };

    return res.json(baseResponse);
  }

  if (type === "salesman-wise") {
    const rows = db
      .prepare(
        `SELECT sales.salesman_id AS salesman_id,
                COALESCE(salesmen.code, '') AS salesman_code,
                COALESCE(salesmen.name, '') AS salesman_name,
                SUM(sales.total_amount) AS total_amount
         FROM sales
         LEFT JOIN salesmen ON salesmen.id = sales.salesman_id
         WHERE sales.invoice_date >= @start AND sales.invoice_date <= @end
         GROUP BY sales.salesman_id
         ORDER BY salesman_name COLLATE NOCASE, salesman_code COLLATE NOCASE`
      )
      .all(params);

    if (rows.length === 0) {
      return res.json(baseResponse);
    }

    const mapped = rows.map((row) => {
      const name = row.salesman_name || "Unassigned Salesman";
      const code = row.salesman_code || "";
      const totalAmount = finalize(row.total_amount);
      return {
        salesmanId: row.salesman_id ?? null,
        salesmanCode: code,
        salesmanName: name,
        totalAmount
      };
    });

    const totals = mapped.reduce(
      (acc, row) => {
        acc.totalAmount += row.totalAmount;
        return acc;
      },
      { totalAmount: 0 }
    );

    baseResponse.rows = mapped;
    baseResponse.totals = {
      totalAmount: finalize(totals.totalAmount),
      taxAmount: 0,
      count: mapped.length
    };

    return res.json(baseResponse);
  }

  if (type === "day-wise") {
    const rows = db
      .prepare(
        `SELECT sales.invoice_date AS invoice_date,
                SUM(sales.total_amount) AS total_amount
         FROM sales
         WHERE sales.invoice_date >= @start AND sales.invoice_date <= @end
         GROUP BY sales.invoice_date
         ORDER BY sales.invoice_date`
      )
      .all(params);

    if (rows.length === 0) {
      return res.json(baseResponse);
    }

    const mapped = rows.map((row) => {
      const dateDisplay = toDisplayDate(row.invoice_date) || "";
      const totalAmount = finalize(row.total_amount);
      return {
        storageDate: row.invoice_date,
        date: dateDisplay,
        totalAmount
      };
    });

    const totals = mapped.reduce(
      (acc, row) => {
        acc.totalAmount += row.totalAmount;
        return acc;
      },
      { totalAmount: 0 }
    );

    baseResponse.rows = mapped;
    baseResponse.totals = {
      totalAmount: finalize(totals.totalAmount),
      taxAmount: 0,
      count: mapped.length
    };

    return res.json(baseResponse);
  }

  if (type === "customer-wise") {
    const rows = db
      .prepare(
        `WITH sale_tax AS (
           SELECT sale_items.sale_id AS sale_id,
                  SUM((sale_items.quantity + COALESCE(sale_items.bonus, 0)) *
                      COALESCE(sale_items.trade_off_price, sale_items.trade_price) *
                      (COALESCE(sale_items.tax_percent, 0) / 100.0)) AS tax_amount
           FROM sale_items
           GROUP BY sale_items.sale_id
         )
         SELECT customers.id AS customer_id,
                customers.code AS customer_code,
                customers.name AS customer_name,
                SUM(sales.total_amount) AS total_amount,
                SUM(COALESCE(sale_tax.tax_amount, 0)) AS tax_amount
         FROM sales
         INNER JOIN customers ON customers.id = sales.customer_id
         LEFT JOIN sale_tax ON sale_tax.sale_id = sales.id
         WHERE sales.invoice_date >= @start AND sales.invoice_date <= @end
         GROUP BY customers.id
         ORDER BY customer_name COLLATE NOCASE, customer_code COLLATE NOCASE`
      )
      .all(params);

    if (rows.length === 0) {
      return res.json(baseResponse);
    }

    const mapped = rows.map((row) => {
      const totalAmount = finalize(row.total_amount);
      const taxAmount = finalize(row.tax_amount);
      return {
        customerId: row.customer_id,
        customerCode: row.customer_code,
        customerName: row.customer_name,
        taxAmount,
        totalAmount
      };
    });

    const totals = mapped.reduce(
      (acc, row) => {
        acc.totalAmount += row.totalAmount;
        acc.taxAmount += row.taxAmount;
        return acc;
      },
      { totalAmount: 0, taxAmount: 0 }
    );

    baseResponse.rows = mapped;
    baseResponse.totals = {
      totalAmount: finalize(totals.totalAmount),
      taxAmount: finalize(totals.taxAmount),
      count: mapped.length
    };

    return res.json(baseResponse);
  }

  return res.status(400).json({ message: "Unsupported sales status type." });
});

app.get("/api/reports/sales/area-wise-item-summary", (req, res) => {
  const db = getDb();
  const { areaCode, startDate, endDate } = req.query;

  if (!areaCode) {
    return res.status(400).json({ message: "Area code is required." });
  }

  if (!startDate || !endDate) {
    return res.status(400).json({ message: "Start date and end date are required." });
  }

  const area = findByCode("areas", areaCode);
  if (!area) {
    return res.status(404).json({ message: "Area not found." });
  }

  const storageStart = toStorageDate(startDate);
  const storageEnd = toStorageDate(endDate);

  if (!storageStart || !storageEnd) {
    return res.status(400).json({ message: "Invalid date format. Use DD-MM-YYYY." });
  }

  if (storageStart > storageEnd) {
    return res.status(400).json({ message: "Start date must be on or before end date." });
  }

  const rows = db
    .prepare(
      `SELECT items.id,
              items.code AS item_code,
              items.name AS item_name,
              SUM(sale_items.quantity) AS quantity,
              SUM((sale_items.quantity * sale_items.trade_price) * (1 - COALESCE(sale_items.discount_percent, 0) / 100.0) + (COALESCE(sale_items.quantity * sale_items.trade_price * COALESCE(sale_items.tax_percent, 0) / 100.0, 0))) AS total_amount
       FROM sale_items
       INNER JOIN sales ON sales.id = sale_items.sale_id
       INNER JOIN customers ON customers.id = sales.customer_id
       INNER JOIN items ON items.id = sale_items.item_id
       WHERE customers.area_id = @areaId
         AND sales.invoice_date >= @start
         AND sales.invoice_date <= @end
       GROUP BY items.id
       ORDER BY item_name COLLATE NOCASE`
    )
    .all({ areaId: area.id, start: storageStart, end: storageEnd });

  const mapNumber = (value) => Number(value ?? 0);

  const mappedRows = rows.map((row, idx) => ({
    srNo: idx + 1,
    itemCode: row.item_code,
    itemName: row.item_name,
    quantity: Number(mapNumber(row.quantity).toFixed(2)),
    totalAmount: Number(mapNumber(row.total_amount).toFixed(2))
  }));

  const totals = mappedRows.reduce(
    (acc, row) => {
      acc.quantity += row.quantity;
      acc.totalAmount += row.totalAmount;
      return acc;
    },
    { quantity: 0, totalAmount: 0 }
  );

  res.json({
    area: { code: area.code, name: area.name },
    startDate: toDisplayDate(storageStart),
    endDate: toDisplayDate(storageEnd),
    rows: mappedRows,
    totals: {
      quantity: Number(totals.quantity.toFixed(2)),
      totalAmount: Number(totals.totalAmount.toFixed(2)),
      itemCount: mappedRows.length
    }
  });
});

app.get("/api/reports/sales/date-wise-damage-out", (req, res) => {
  const db = getDb();
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({ message: "Start date and end date are required." });
  }

  const storageStart = toStorageDate(startDate);
  const storageEnd = toStorageDate(endDate);

  if (!storageStart || !storageEnd) {
    return res.status(400).json({ message: "Invalid date format. Use DD-MM-YYYY." });
  }

  if (storageStart > storageEnd) {
    return res.status(400).json({ message: "Start date must be on or before end date." });
  }

  const rows = db
    .prepare(
      `SELECT dt.id,
              dt.transaction_date,
              items.id AS item_id,
              items.name AS item_name,
              items.company_id,
              companies.name AS company_name,
              dt.supplier_id,
              suppliers.code AS supplier_code,
              suppliers.name AS supplier_name,
              SUM(dt.quantity) AS quantity,
              (
                SELECT pi.purchase_rate
                FROM purchase_items pi
                INNER JOIN purchases p2 ON p2.id = pi.purchase_id
                WHERE p2.supplier_id = dt.supplier_id
                  AND pi.item_id = dt.item_id
                  AND p2.invoice_date <= dt.transaction_date
                ORDER BY p2.invoice_date DESC, p2.id DESC, pi.id DESC
                LIMIT 1
              ) AS last_purchase_rate
       FROM damage_transactions dt
       INNER JOIN items ON items.id = dt.item_id
       LEFT JOIN companies ON companies.id = items.company_id
       INNER JOIN suppliers ON suppliers.id = dt.supplier_id
       WHERE dt.transaction_type = 'out'
         AND dt.transaction_date >= @start
         AND dt.transaction_date <= @end
       GROUP BY dt.transaction_date, items.id, dt.supplier_id
       ORDER BY dt.transaction_date DESC, items.name COLLATE NOCASE`
    )
    .all({ start: storageStart, end: storageEnd });

  const mapNumber = (value) => Number(value ?? 0);

  const mappedRows = rows.map((row, idx) => ({
    srNo: idx + 1,
    itemName: row.item_name,
    companyName: row.company_name || "N/A",
    supplierCode: row.supplier_code || "",
    supplierName: row.supplier_name,
    quantity: Number(mapNumber(row.quantity).toFixed(2)),
    purchaseRate: row.last_purchase_rate != null ? Number(row.last_purchase_rate).toFixed(2) : "N/A",
    damageValue: row.last_purchase_rate != null ? Number((mapNumber(row.quantity) * Number(row.last_purchase_rate)).toFixed(2)) : 0,
    date: toDisplayDate(row.transaction_date)
  }));

  const totals = mappedRows.reduce(
    (acc, row) => {
      acc.quantity += row.quantity;
      acc.damageValue += typeof row.damageValue === 'number' ? row.damageValue : 0;
      return acc;
    },
    { quantity: 0, damageValue: 0 }
  );

  res.json({
    startDate: toDisplayDate(storageStart),
    endDate: toDisplayDate(storageEnd),
    rows: mappedRows,
    totals: {
      quantity: Number(totals.quantity.toFixed(2)),
      damageValue: Number(totals.damageValue.toFixed(2)),
      itemCount: mappedRows.length
    }
  });
});

app.get("/api/reports/sales/date-wise-damage-in", (req, res) => {
  const db = getDb();
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({ message: "Start date and end date are required." });
  }

  const storageStart = toStorageDate(startDate);
  const storageEnd = toStorageDate(endDate);

  if (!storageStart || !storageEnd) {
    return res.status(400).json({ message: "Invalid date format. Use DD-MM-YYYY." });
  }

  if (storageStart > storageEnd) {
    return res.status(400).json({ message: "Start date must be on or before end date." });
  }

  const rows = db
    .prepare(
      `SELECT dt.id,
              dt.transaction_date,
              items.id AS item_id,
              items.name AS item_name,
              items.company_id,
              companies.name AS company_name,
              dt.supplier_id,
              suppliers.code AS supplier_code,
              suppliers.name AS supplier_name,
              SUM(dt.quantity) AS quantity,
              (
                SELECT pi.purchase_rate
                FROM purchase_items pi
                INNER JOIN purchases p2 ON p2.id = pi.purchase_id
                WHERE p2.supplier_id = dt.supplier_id
                  AND pi.item_id = dt.item_id
                  AND p2.invoice_date <= dt.transaction_date
                ORDER BY p2.invoice_date DESC, p2.id DESC, pi.id DESC
                LIMIT 1
              ) AS last_purchase_rate
       FROM damage_transactions dt
       INNER JOIN items ON items.id = dt.item_id
       LEFT JOIN companies ON companies.id = items.company_id
       INNER JOIN suppliers ON suppliers.id = dt.supplier_id
       WHERE dt.transaction_type = 'in'
         AND dt.transaction_date >= @start
         AND dt.transaction_date <= @end
       GROUP BY dt.transaction_date, items.id, dt.supplier_id
       ORDER BY dt.transaction_date DESC, items.name COLLATE NOCASE`
    )
    .all({ start: storageStart, end: storageEnd });

  const mapNumber = (value) => Number(value ?? 0);

  const mappedRows = rows.map((row, idx) => ({
    srNo: idx + 1,
    itemName: row.item_name,
    companyName: row.company_name || "N/A",
    supplierCode: row.supplier_code || "",
    supplierName: row.supplier_name,
    quantity: Number(mapNumber(row.quantity).toFixed(2)),
    purchaseRate: row.last_purchase_rate != null ? Number(row.last_purchase_rate).toFixed(2) : "N/A",
    damageValue: row.last_purchase_rate != null ? Number((mapNumber(row.quantity) * Number(row.last_purchase_rate)).toFixed(2)) : 0,
    date: toDisplayDate(row.transaction_date)
  }));

  const totals = mappedRows.reduce(
    (acc, row) => {
      acc.quantity += row.quantity;
      acc.damageValue += typeof row.damageValue === 'number' ? row.damageValue : 0;
      return acc;
    },
    { quantity: 0, damageValue: 0 }
  );

  res.json({
    startDate: toDisplayDate(storageStart),
    endDate: toDisplayDate(storageEnd),
    rows: mappedRows,
    totals: {
      quantity: Number(totals.quantity.toFixed(2)),
      damageValue: Number(totals.damageValue.toFixed(2)),
      itemCount: mappedRows.length
    }
  });
});

app.get("/api/reports/sales/area-summary", (req, res) => {
  const db = getDb();
  const { areaCode, startDate, endDate } = req.query;

  if (!areaCode) {
    return res.status(400).json({ message: "Area code is required." });
  }

  if (!startDate || !endDate) {
    return res.status(400).json({ message: "Start date and end date are required." });
  }

  const area = findByCode("areas", areaCode);
  if (!area) {
    return res.status(404).json({ message: "Area not found." });
  }

  const storageStart = toStorageDate(startDate);
  const storageEnd = toStorageDate(endDate);

  if (!storageStart || !storageEnd) {
    return res.status(400).json({ message: "Invalid date format. Use DD-MM-YYYY." });
  }

  if (storageStart > storageEnd) {
    return res.status(400).json({ message: "Start date must be on or before end date." });
  }

  const rows = db
    .prepare(
      `SELECT sales.invoice_no,
              sales.invoice_date,
              sales.total_amount,
              customers.code AS customer_code,
              customers.name AS customer_name
       FROM sales
       INNER JOIN customers ON customers.id = sales.customer_id
       WHERE customers.area_id = @areaId
         AND sales.invoice_date >= @start
         AND sales.invoice_date <= @end
       ORDER BY sales.invoice_date, sales.id`
    )
    .all({ areaId: area.id, start: storageStart, end: storageEnd });

  const mapNumber = (value) => Number(value ?? 0);

  const mappedRows = rows.map((row) => ({
    invoiceNo: row.invoice_no,
    invoiceDate: toDisplayDate(row.invoice_date),
    customerCode: row.customer_code,
    customerName: row.customer_name,
    totalAmount: mapNumber(row.total_amount)
  }));

  const totals = mappedRows.reduce(
    (acc, row) => {
      acc.totalAmount += row.totalAmount;
      return acc;
    },
    { totalAmount: 0 }
  );

  res.json({
    area: { code: area.code, name: area.name },
    startDate: toDisplayDate(storageStart),
    endDate: toDisplayDate(storageEnd),
    rows: mappedRows,
    totals: {
      totalAmount: totals.totalAmount,
      count: mappedRows.length
    }
  });
});

app.get("/api/reports/sales/company-area-summary", (req, res) => {
  const db = getDb();
  const { areaCode, startDate, endDate } = req.query;

  if (!areaCode) {
    return res.status(400).json({ message: "Area code is required." });
  }

  if (!startDate || !endDate) {
    return res.status(400).json({ message: "Start date and end date are required." });
  }

  const area = findByCode("areas", areaCode);
  if (!area) {
    return res.status(404).json({ message: "Area not found." });
  }

  const storageStart = toStorageDate(startDate);
  const storageEnd = toStorageDate(endDate);

  if (!storageStart || !storageEnd) {
    return res.status(400).json({ message: "Invalid date format. Use DD-MM-YYYY." });
  }

  if (storageStart > storageEnd) {
    return res.status(400).json({ message: "Start date must be on or before end date." });
  }

  const rows = db
    .prepare(
      `SELECT companies.id AS company_id,
              companies.code AS company_code,
              companies.name AS company_name,
              items.id AS item_id,
              items.code AS item_code,
              items.name AS item_name,
              SUM(sale_items.quantity + COALESCE(sale_items.bonus, 0)) AS total_units,
              SUM(
                (sale_items.trade_price * (sale_items.quantity + COALESCE(sale_items.bonus, 0))) *
                (1 - COALESCE(sale_items.discount_percent, 0) / 100.0)
              ) AS total_amount
       FROM sale_items
       INNER JOIN sales ON sales.id = sale_items.sale_id
       INNER JOIN customers ON customers.id = sales.customer_id
       INNER JOIN items ON items.id = sale_items.item_id
       INNER JOIN companies ON companies.id = items.company_id
       WHERE customers.area_id = @areaId
         AND sales.invoice_date >= @start
         AND sales.invoice_date <= @end
       GROUP BY companies.id, items.id
       ORDER BY company_name COLLATE NOCASE, item_name COLLATE NOCASE`
    )
    .all({ areaId: area.id, start: storageStart, end: storageEnd });

  const companyMap = new Map();

  rows.forEach((row) => {
    const quantity = Number(row.total_units ?? 0);
    const amount = Number(row.total_amount ?? 0);
    const companyId = row.company_id;

    if (!companyMap.has(companyId)) {
      companyMap.set(companyId, {
        company: { code: row.company_code, name: row.company_name },
        items: [],
        totals: { quantity: 0, amount: 0 }
      });
    }

    const group = companyMap.get(companyId);
    const quantityRounded = Number(quantity.toFixed(2));
    const amountRounded = Number(amount.toFixed(2));

    group.items.push({
      itemCode: row.item_code,
      itemName: row.item_name,
      quantity: quantityRounded,
      amount: amountRounded
    });

    group.totals.quantity += quantityRounded;
    group.totals.amount += amountRounded;
  });

  let totalQuantity = 0;
  let totalAmount = 0;
  let totalItems = 0;

  const companies = Array.from(companyMap.values()).map((group) => {
    totalQuantity += group.totals.quantity;
    totalAmount += group.totals.amount;
    totalItems += group.items.length;
    return {
      company: group.company,
      items: group.items,
      totals: {
        quantity: Number(group.totals.quantity.toFixed(2)),
        amount: Number(group.totals.amount.toFixed(2)),
        itemCount: group.items.length
      }
    };
  });

  res.json({
    area: { code: area.code, name: area.name },
    startDate: toDisplayDate(storageStart),
    endDate: toDisplayDate(storageEnd),
    companies,
    totals: {
      quantity: Number(totalQuantity.toFixed(2)),
      amount: Number(totalAmount.toFixed(2)),
      companyCount: companies.length,
      itemCount: totalItems
    }
  });
});

app.get("/api/reports/sales/company-statement", (req, res) => {
  const db = getDb();
  const { companyCode, startDate, endDate } = req.query;

  if (!companyCode) {
    return res.status(400).json({ message: "Company code is required." });
  }

  if (!startDate || !endDate) {
    return res.status(400).json({ message: "Start date and end date are required." });
  }

  const company = findByCode("companies", companyCode);
  if (!company) {
    return res.status(404).json({ message: "Company not found." });
  }

  const storageStart = toStorageDate(startDate);
  const storageEnd = toStorageDate(endDate);

  if (!storageStart || !storageEnd) {
    return res.status(400).json({ message: "Invalid date format. Use DD-MM-YYYY." });
  }

  if (storageStart > storageEnd) {
    return res.status(400).json({ message: "Start date must be on or before end date." });
  }

  const items = db
    .prepare(
      `SELECT id, code, name, trade_rate, base_unit, pack_size
       FROM items
       WHERE company_id = @companyId
       ORDER BY name COLLATE NOCASE`
    )
    .all({ companyId: company.id });

  const makeRound = (value) => Number(Number(value ?? 0).toFixed(2));

  const baseResponse = {
    company: { code: company.code, name: company.name },
    startDate: toDisplayDate(storageStart),
    endDate: toDisplayDate(storageEnd),
    rows: [],
    totals: {
      openingQty: 0,
      purchaseQty: 0,
      purchaseBonus: 0,
      purchaseAmount: 0,
      totalQty: 0,
      totalAmount: 0,
      salesQty: 0,
      salesBonus: 0,
      salesAmount: 0,
      purchaseReturnQty: 0,
      damageInQty: 0,
      damageOutQty: 0,
      saleReturnQty: 0,
      closingQty: 0,
      closingAmount: 0,
      closingCartons: 0,
      closingPieces: 0,
      packingQty: 0
    }
  };

  if (items.length === 0) {
    return res.json(baseResponse);
  }

  const aggregateQtyBonus = (rows) => {
    const map = new Map();
    for (const row of rows) {
      map.set(row.item_id, {
        quantity: Number(row.quantity ?? 0),
        bonus: Number(row.bonus ?? 0)
      });
    }
    return map;
  };

  const aggregateQtyOnly = (rows) => {
    const map = new Map();
    for (const row of rows) {
      map.set(row.item_id, Number(row.quantity ?? 0));
    }
    return map;
  };

  const beforeParams = { companyId: company.id, start: storageStart };
  const rangeParams = { companyId: company.id, start: storageStart, end: storageEnd };

  const purchaseBefore = aggregateQtyBonus(
    db
      .prepare(
        `SELECT purchase_items.item_id,
                SUM(purchase_items.quantity) AS quantity,
                SUM(COALESCE(purchase_items.bonus, 0)) AS bonus
         FROM purchase_items
         INNER JOIN purchases ON purchases.id = purchase_items.purchase_id
         INNER JOIN items ON items.id = purchase_items.item_id
         WHERE items.company_id = @companyId
           AND purchases.invoice_date < @start
         GROUP BY purchase_items.item_id`
      )
      .all(beforeParams)
  );

  const purchaseRange = aggregateQtyBonus(
    db
      .prepare(
        `SELECT purchase_items.item_id,
                SUM(purchase_items.quantity) AS quantity,
                SUM(COALESCE(purchase_items.bonus, 0)) AS bonus
         FROM purchase_items
         INNER JOIN purchases ON purchases.id = purchase_items.purchase_id
         INNER JOIN items ON items.id = purchase_items.item_id
         WHERE items.company_id = @companyId
           AND purchases.invoice_date >= @start
           AND purchases.invoice_date <= @end
         GROUP BY purchase_items.item_id`
      )
      .all(rangeParams)
  );

  const purchaseReturnsBefore = aggregateQtyOnly(
    db
      .prepare(
        `SELECT purchase_items.item_id,
                SUM(purchase_returns.quantity) AS quantity
         FROM purchase_returns
         INNER JOIN purchase_items ON purchase_items.id = purchase_returns.purchase_item_id
         INNER JOIN items ON items.id = purchase_items.item_id
         WHERE items.company_id = @companyId
           AND purchase_returns.return_date < @start
         GROUP BY purchase_items.item_id`
      )
      .all(beforeParams)
  );

  const purchaseReturnsRange = aggregateQtyOnly(
    db
      .prepare(
        `SELECT purchase_items.item_id,
                SUM(purchase_returns.quantity) AS quantity
         FROM purchase_returns
         INNER JOIN purchase_items ON purchase_items.id = purchase_returns.purchase_item_id
         INNER JOIN items ON items.id = purchase_items.item_id
         WHERE items.company_id = @companyId
           AND purchase_returns.return_date >= @start
           AND purchase_returns.return_date <= @end
         GROUP BY purchase_items.item_id`
      )
      .all(rangeParams)
  );

  const salesBefore = aggregateQtyBonus(
    db
      .prepare(
        `SELECT sale_items.item_id,
                SUM(sale_items.quantity) AS quantity,
                SUM(COALESCE(sale_items.bonus, 0)) AS bonus
         FROM sale_items
         INNER JOIN sales ON sales.id = sale_items.sale_id
         INNER JOIN items ON items.id = sale_items.item_id
         WHERE items.company_id = @companyId
           AND sales.invoice_date < @start
         GROUP BY sale_items.item_id`
      )
      .all(beforeParams)
  );

  const salesRange = aggregateQtyBonus(
    db
      .prepare(
        `SELECT sale_items.item_id,
                SUM(sale_items.quantity) AS quantity,
                SUM(COALESCE(sale_items.bonus, 0)) AS bonus
         FROM sale_items
         INNER JOIN sales ON sales.id = sale_items.sale_id
         INNER JOIN items ON items.id = sale_items.item_id
         WHERE items.company_id = @companyId
           AND sales.invoice_date >= @start
           AND sales.invoice_date <= @end
         GROUP BY sale_items.item_id`
      )
      .all(rangeParams)
  );

  const saleReturnsBefore = aggregateQtyOnly(
    db
      .prepare(
        `SELECT sale_items.item_id,
                SUM(sale_returns.quantity) AS quantity
         FROM sale_returns
         INNER JOIN sale_items ON sale_items.id = sale_returns.sale_item_id
         INNER JOIN items ON items.id = sale_items.item_id
         WHERE items.company_id = @companyId
           AND sale_returns.return_date < @start
         GROUP BY sale_items.item_id`
      )
      .all(beforeParams)
  );

  const saleReturnsRange = aggregateQtyOnly(
    db
      .prepare(
        `SELECT sale_items.item_id,
                SUM(sale_returns.quantity) AS quantity
         FROM sale_returns
         INNER JOIN sale_items ON sale_items.id = sale_returns.sale_item_id
         INNER JOIN items ON items.id = sale_items.item_id
         WHERE items.company_id = @companyId
           AND sale_returns.return_date >= @start
           AND sale_returns.return_date <= @end
         GROUP BY sale_items.item_id`
      )
      .all(rangeParams)
  );

  const damageInBefore = aggregateQtyOnly(
    db
      .prepare(
        `SELECT damage_transactions.item_id,
                SUM(damage_transactions.quantity) AS quantity
         FROM damage_transactions
         INNER JOIN items ON items.id = damage_transactions.item_id
         WHERE items.company_id = @companyId
           AND damage_transactions.transaction_type = 'in'
           AND damage_transactions.transaction_date < @start
         GROUP BY damage_transactions.item_id`
      )
      .all(beforeParams)
  );

  const damageOutBefore = aggregateQtyOnly(
    db
      .prepare(
        `SELECT damage_transactions.item_id,
                SUM(damage_transactions.quantity) AS quantity
         FROM damage_transactions
         INNER JOIN items ON items.id = damage_transactions.item_id
         WHERE items.company_id = @companyId
           AND damage_transactions.transaction_type = 'out'
           AND damage_transactions.transaction_date < @start
         GROUP BY damage_transactions.item_id`
      )
      .all(beforeParams)
  );

  const damageInRange = aggregateQtyOnly(
    db
      .prepare(
        `SELECT damage_transactions.item_id,
                SUM(damage_transactions.quantity) AS quantity
         FROM damage_transactions
         INNER JOIN items ON items.id = damage_transactions.item_id
         WHERE items.company_id = @companyId
           AND damage_transactions.transaction_type = 'in'
           AND damage_transactions.transaction_date >= @start
           AND damage_transactions.transaction_date <= @end
         GROUP BY damage_transactions.item_id`
      )
      .all(rangeParams)
  );

  const damageOutRange = aggregateQtyOnly(
    db
      .prepare(
        `SELECT damage_transactions.item_id,
                SUM(damage_transactions.quantity) AS quantity
         FROM damage_transactions
         INNER JOIN items ON items.id = damage_transactions.item_id
         WHERE items.company_id = @companyId
           AND damage_transactions.transaction_type = 'out'
           AND damage_transactions.transaction_date >= @start
           AND damage_transactions.transaction_date <= @end
         GROUP BY damage_transactions.item_id`
      )
      .all(rangeParams)
  );

  const totals = { ...baseResponse.totals };
  const rows = [];

  for (const item of items) {
    const purchaseBeforeEntry = purchaseBefore.get(item.id) || { quantity: 0, bonus: 0 };
    const salesBeforeEntry = salesBefore.get(item.id) || { quantity: 0, bonus: 0 };

    const openingPurchaseReturns = purchaseReturnsBefore.get(item.id) || 0;
    const openingSaleReturns = saleReturnsBefore.get(item.id) || 0;
    const openingDamageIn = damageInBefore.get(item.id) || 0;
    const openingDamageOut = damageOutBefore.get(item.id) || 0;

    let openingQty =
      purchaseBeforeEntry.quantity +
      purchaseBeforeEntry.bonus +
      openingSaleReturns +
      openingDamageIn -
      (salesBeforeEntry.quantity + salesBeforeEntry.bonus) -
      openingPurchaseReturns -
      openingDamageOut;

    openingQty = Math.max(makeRound(openingQty), 0);

    const purchaseRangeEntry = purchaseRange.get(item.id) || { quantity: 0, bonus: 0 };
    const salesRangeEntry = salesRange.get(item.id) || { quantity: 0, bonus: 0 };

    const purchaseQty = makeRound(purchaseRangeEntry.quantity);
    const purchaseBonus = makeRound(purchaseRangeEntry.bonus);
    const purchaseUnits = purchaseQty + purchaseBonus;

    const purchaseReturnQty = makeRound(purchaseReturnsRange.get(item.id));
    const saleReturnQty = makeRound(saleReturnsRange.get(item.id));
    const damageInQty = makeRound(damageInRange.get(item.id));
    const damageOutQty = makeRound(damageOutRange.get(item.id));

    const salesQty = makeRound(salesRangeEntry.quantity);
    const salesBonus = makeRound(salesRangeEntry.bonus);
    const salesUnits = salesQty + salesBonus;

    const tradePrice = makeRound(item.trade_rate);
    const packSize = Number(item.pack_size ?? 0);

    const totalQty = makeRound(openingQty + purchaseUnits + saleReturnQty + damageInQty);
    const totalAmount = makeRound(totalQty * tradePrice);

    const purchaseAmount = makeRound(purchaseUnits * tradePrice);
    const salesAmount = makeRound(salesUnits * tradePrice);

    const closingQtyRaw = totalQty - salesUnits - purchaseReturnQty - damageOutQty;
    const closingQty = Math.max(makeRound(closingQtyRaw), 0);
    const closingAmount = makeRound(closingQty * tradePrice);

    let closingCartons = 0;
    let closingPieces = 0;

    if (packSize > 0) {
      closingCartons = Math.floor(closingQty / packSize);
      const remainder = closingQty - closingCartons * packSize;
      closingPieces = makeRound(remainder);
    } else if ((item.base_unit || "").toLowerCase() === "carton") {
      closingCartons = closingQty;
      closingPieces = 0;
    } else {
      closingCartons = 0;
      closingPieces = closingQty;
    }

    closingCartons = makeRound(closingCartons);
    closingPieces = makeRound(closingPieces);

    const baseUnitRaw = (item.base_unit || "").trim();
    const baseUnitLower = baseUnitRaw.toLowerCase();

    let packingLabel = baseUnitRaw || (packSize > 0 ? "Pack" : "Unit");
    let packingQty = closingCartons;

    if (!baseUnitRaw) {
      packingQty = packSize > 0 ? closingCartons : closingQty;
    } else if (["piece", "pieces", "pcs", "pc", "unit", "each"].includes(baseUnitLower)) {
      packingLabel = "Piece";
      packingQty = closingQty;
    } else if (["carton", "ctn", "case"].includes(baseUnitLower)) {
      packingLabel = "Carton";
      packingQty = packSize > 0 ? closingCartons : closingQty;
    } else if (baseUnitLower.includes("pack")) {
      packingLabel = "Pack";
      packingQty = packSize > 0 ? closingCartons : closingQty;
    }

    packingQty = makeRound(packingQty);

    rows.push({
      itemCode: item.code,
      itemName: item.name,
      baseUnit: item.base_unit,
      packSize,
      tradePrice,
      openingQty,
      purchaseQty,
      purchaseBonus,
      purchaseAmount,
      totalQty,
      totalAmount,
      salesQty,
      salesBonus,
      salesAmount,
      purchaseReturnQty,
      saleReturnQty,
      damageInQty,
      damageOutQty,
      closingQty,
      closingCartons,
      closingPieces,
      closingAmount,
      packingLabel,
      packingQty
    });

    totals.openingQty += openingQty;
    totals.purchaseQty += purchaseQty;
    totals.purchaseBonus += purchaseBonus;
    totals.purchaseAmount += purchaseAmount;
    totals.totalQty += totalQty;
    totals.totalAmount += totalAmount;
    totals.salesQty += salesQty;
    totals.salesBonus += salesBonus;
    totals.salesAmount += salesAmount;
    totals.purchaseReturnQty += purchaseReturnQty;
    totals.saleReturnQty += saleReturnQty;
    totals.damageInQty += damageInQty;
    totals.damageOutQty += damageOutQty;
    totals.closingQty += closingQty;
    totals.closingAmount += closingAmount;
    totals.closingCartons += closingCartons;
    totals.closingPieces += closingPieces;
    totals.packingQty += packingQty;
  }

  const finalize = (value) => Number(value.toFixed(2));

  baseResponse.rows = rows;
  baseResponse.totals = {
    openingQty: finalize(totals.openingQty),
    purchaseQty: finalize(totals.purchaseQty),
    purchaseBonus: finalize(totals.purchaseBonus),
    purchaseAmount: finalize(totals.purchaseAmount),
    totalQty: finalize(totals.totalQty),
    totalAmount: finalize(totals.totalAmount),
    salesQty: finalize(totals.salesQty),
    salesBonus: finalize(totals.salesBonus),
    salesAmount: finalize(totals.salesAmount),
    purchaseReturnQty: finalize(totals.purchaseReturnQty),
    saleReturnQty: finalize(totals.saleReturnQty),
    damageInQty: finalize(totals.damageInQty),
    damageOutQty: finalize(totals.damageOutQty),
    closingQty: finalize(totals.closingQty),
    closingAmount: finalize(totals.closingAmount),
    closingCartons: finalize(totals.closingCartons),
    closingPieces: finalize(totals.closingPieces),
    packingQty: finalize(totals.packingQty)
  };

  res.json(baseResponse);
});

app.get("/api/reports/sales/date-cash-credit", (req, res) => {
  const db = getDb();
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({ message: "Start date and end date are required." });
  }

  const storageStart = toStorageDate(startDate);
  const storageEnd = toStorageDate(endDate);

  if (!storageStart || !storageEnd) {
    return res.status(400).json({ message: "Invalid date format. Use DD-MM-YYYY." });
  }

  if (storageStart > storageEnd) {
    return res.status(400).json({ message: "Start date must be on or before end date." });
  }

  const rows = db
    .prepare(
      `SELECT sales.invoice_no,
              sales.invoice_date,
              sales.total_amount,
              sales.amount_paid,
              customers.code AS customer_code,
              customers.name AS customer_name
       FROM sales
       INNER JOIN customers ON customers.id = sales.customer_id
       WHERE sales.invoice_date >= @start AND sales.invoice_date <= @end
       ORDER BY sales.invoice_date, sales.id`
    )
    .all({ start: storageStart, end: storageEnd });

  const toNumber = (value) => Number(value ?? 0);

  const mappedRows = rows.map((row) => {
    const totalAmount = toNumber(row.total_amount);
    const amountPaid = toNumber(row.amount_paid);
    const credit = Number((totalAmount - amountPaid).toFixed(2));
    return {
      invoiceNo: row.invoice_no,
      invoiceDate: toDisplayDate(row.invoice_date),
      customerCode: row.customer_code,
      customerName: row.customer_name,
      cash: Number(amountPaid.toFixed(2)),
      credit,
      total: Number(totalAmount.toFixed(2))
    };
  });

  const totals = mappedRows.reduce(
    (acc, row) => {
      acc.cash += row.cash;
      acc.credit += row.credit;
      acc.total += row.total;
      return acc;
    },
    { cash: 0, credit: 0, total: 0 }
  );

  res.json({
    startDate: toDisplayDate(storageStart),
    endDate: toDisplayDate(storageEnd),
    rows: mappedRows,
    totals: {
      cash: Number(totals.cash.toFixed(2)),
      credit: Number(totals.credit.toFixed(2)),
      total: Number(totals.total.toFixed(2)),
      count: mappedRows.length
    }
  });
});

app.get("/api/reports/sales/item-summary", (req, res) => {
  const db = getDb();
  const { itemCode, startDate, endDate } = req.query;

  if (!itemCode) {
    return res.status(400).json({ message: "Item code is required." });
  }

  if (!startDate || !endDate) {
    return res.status(400).json({ message: "Start date and end date are required." });
  }

  const item = findByCode("items", itemCode);
  if (!item) {
    return res.status(404).json({ message: "Item not found." });
  }

  const storageStart = toStorageDate(startDate);
  const storageEnd = toStorageDate(endDate);

  if (!storageStart || !storageEnd) {
    return res.status(400).json({ message: "Invalid date format. Use DD-MM-YYYY." });
  }

  if (storageStart > storageEnd) {
    return res.status(400).json({ message: "Start date must be on or before end date." });
  }

  const rows = db
    .prepare(
      `SELECT sales.invoice_no,
              sales.invoice_date,
              sale_items.trade_price,
              sale_items.base_unit,
              sale_items.quantity,
              sale_items.discount_percent,
              items.sales_tax
       FROM sale_items
       INNER JOIN sales ON sales.id = sale_items.sale_id
       INNER JOIN items ON items.id = sale_items.item_id
       WHERE items.code = @itemCode
         AND sales.invoice_date >= @start
         AND sales.invoice_date <= @end
       ORDER BY sales.invoice_date, sales.id`
    )
    .all({ itemCode, start: storageStart, end: storageEnd });

  const toNumber = (value) => Number(value ?? 0);

  const mappedRows = rows.map((row) => {
    const rate = toNumber(row.trade_price);
    const quantity = toNumber(row.quantity);
    const discount = toNumber(row.discount_percent);
    const value = Number((rate * quantity * (1 - discount / 100)).toFixed(2));
    return {
      invoiceNo: row.invoice_no,
      invoiceDate: toDisplayDate(row.invoice_date),
      rate: Number(rate.toFixed(2)),
      baseUnit: row.base_unit,
      quantity: Number(quantity.toFixed(2)),
      discountPercent: Number(discount.toFixed(2)),
      taxPercent: Number(toNumber(row.sales_tax).toFixed(2)),
      value
    };
  });

  const totals = mappedRows.reduce(
    (acc, row) => {
      acc.quantity += row.quantity;
      acc.value += row.value;
      return acc;
    },
    { quantity: 0, value: 0 }
  );

  res.json({
    item: { code: item.code, name: item.name },
    startDate: toDisplayDate(storageStart),
    endDate: toDisplayDate(storageEnd),
    rows: mappedRows,
    totals: {
      quantity: Number(totals.quantity.toFixed(2)),
      value: Number(totals.value.toFixed(2)),
      count: mappedRows.length
    }
  });
});

app.get("/api/reports/sales/item-customer-summary", (req, res) => {
  const db = getDb();
  const { itemCode, customerCode, startDate, endDate } = req.query;

  if (!itemCode || !customerCode) {
    return res.status(400).json({ message: "Item code and customer code are required." });
  }

  if (!startDate || !endDate) {
    return res.status(400).json({ message: "Start date and end date are required." });
  }

  const item = findByCode("items", itemCode);
  if (!item) {
    return res.status(404).json({ message: "Item not found." });
  }

  const customer = findByCode("customers", customerCode);
  if (!customer) {
    return res.status(404).json({ message: "Customer not found." });
  }

  const storageStart = toStorageDate(startDate);
  const storageEnd = toStorageDate(endDate);

  if (!storageStart || !storageEnd) {
    return res.status(400).json({ message: "Invalid date format. Use DD-MM-YYYY." });
  }

  if (storageStart > storageEnd) {
    return res.status(400).json({ message: "Start date must be on or before end date." });
  }

  const rows = db
    .prepare(
      `SELECT sales.invoice_no,
              sales.invoice_date,
              sale_items.trade_price,
              sale_items.base_unit,
              sale_items.quantity,
              sale_items.discount_percent,
              items.sales_tax,
              customers.name AS customer_name
       FROM sale_items
       INNER JOIN sales ON sales.id = sale_items.sale_id
       INNER JOIN items ON items.id = sale_items.item_id
       INNER JOIN customers ON customers.id = sales.customer_id
       WHERE items.code = @itemCode
         AND customers.code = @customerCode
         AND sales.invoice_date >= @start
         AND sales.invoice_date <= @end
       ORDER BY sales.invoice_date, sales.id`
    )
    .all({ itemCode, customerCode, start: storageStart, end: storageEnd });

  const toNumber = (value) => Number(value ?? 0);

  const mappedRows = rows.map((row) => {
    const rate = toNumber(row.trade_price);
    const quantity = toNumber(row.quantity);
    const discount = toNumber(row.discount_percent);
    const value = Number((rate * quantity * (1 - discount / 100)).toFixed(2));
    return {
      invoiceNo: row.invoice_no,
      invoiceDate: toDisplayDate(row.invoice_date),
      customerName: row.customer_name,
      baseUnit: row.base_unit,
      rate: Number(rate.toFixed(2)),
      quantity: Number(quantity.toFixed(2)),
      discountPercent: Number(discount.toFixed(2)),
      taxPercent: Number(toNumber(row.sales_tax).toFixed(2)),
      value
    };
  });

  const totals = mappedRows.reduce(
    (acc, row) => {
      acc.quantity += row.quantity;
      acc.value += row.value;
      return acc;
    },
    { quantity: 0, value: 0 }
  );

  res.json({
    item: { code: item.code, name: item.name },
    customer: { code: customer.code, name: customer.name },
    startDate: toDisplayDate(storageStart),
    endDate: toDisplayDate(storageEnd),
    rows: mappedRows,
    totals: {
      quantity: Number(totals.quantity.toFixed(2)),
      value: Number(totals.value.toFixed(2)),
      count: mappedRows.length
    }
  });
});

// DATE WISE ITEMS SUMMARY - All items sold within date range
app.get("/api/reports/sales/date-wise-items-summary", (req, res) => {
  const db = getDb();
  const { startDate, endDate, itemCode } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({ message: "Start date and end date are required." });
  }

  const storageStart = toStorageDate(startDate);
  const storageEnd = toStorageDate(endDate);

  if (!storageStart || !storageEnd) {
    return res.status(400).json({ message: "Invalid date format. Use DD-MM-YYYY." });
  }

  if (storageStart > storageEnd) {
    return res.status(400).json({ message: "Start date must be on or before end date." });
  }

  // Build WHERE clause based on whether itemCode is provided
  let whereClause = "sales.invoice_date >= @start AND sales.invoice_date <= @end";
  const params = { start: storageStart, end: storageEnd };
  
  if (itemCode) {
    whereClause += " AND items.code = @itemCode";
    params.itemCode = itemCode;
  }

  // Group by item to get summary
  const rows = db
    .prepare(
      `SELECT items.code,
              items.name,
              items.sales_tax,
              SUM(sale_items.quantity) as total_quantity,
              SUM(CAST(sale_items.trade_price AS REAL) * sale_items.quantity * (1 - sale_items.discount_percent / 100.0)) as total_value,
              COUNT(DISTINCT sales.id) as invoice_count,
              items.base_unit
       FROM sale_items
       INNER JOIN sales ON sales.id = sale_items.sale_id
       INNER JOIN items ON items.id = sale_items.item_id
       WHERE ${whereClause}
       GROUP BY items.id, items.code, items.name, items.sales_tax, items.base_unit
       ORDER BY items.name`
    )
    .all(params);

  const toNumber = (value) => Number(value ?? 0);

  const mappedRows = rows.map((row, index) => ({
    sr: index + 1,
    itemCode: row.code,
    itemName: row.name,
    baseUnit: row.base_unit,
    quantity: Number(toNumber(row.total_quantity).toFixed(2)),
    amount: Number(toNumber(row.total_value).toFixed(2)),
    invoiceCount: row.invoice_count || 0,
    taxPercent: Number(toNumber(row.sales_tax).toFixed(2))
  }));

  const totals = mappedRows.reduce(
    (acc, row) => {
      acc.quantity += row.quantity;
      acc.amount += row.amount;
      acc.count = mappedRows.length;
      return acc;
    },
    { quantity: 0, amount: 0, count: 0 }
  );

  res.json({
    startDate: toDisplayDate(storageStart),
    endDate: toDisplayDate(storageEnd),
    rows: mappedRows,
    totals: {
      quantity: Number(totals.quantity.toFixed(2)),
      amount: Number(totals.amount.toFixed(2)),
      itemCount: totals.count
    }
  });
});

// COMPANY WISE ENTIRE AREA SALES - All items and areas for a company
app.get("/api/reports/sales/company-entire-area-sales", (req, res) => {
  const db = getDb();
  const { companyCode, startDate, endDate } = req.query;

  if (!companyCode) {
    return res.status(400).json({ message: "Company code is required." });
  }

  if (!startDate || !endDate) {
    return res.status(400).json({ message: "Start date and end date are required." });
  }

  const company = findByCode("companies", companyCode);
  if (!company) {
    return res.status(404).json({ message: "Company not found." });
  }

  const storageStart = toStorageDate(startDate);
  const storageEnd = toStorageDate(endDate);

  if (!storageStart || !storageEnd) {
    return res.status(400).json({ message: "Invalid date format. Use DD-MM-YYYY." });
  }

  if (storageStart > storageEnd) {
    return res.status(400).json({ message: "Start date must be on or before end date." });
  }

  try {
    // Get all sales for the company within date range, grouped by area and item
    const rows = db
      .prepare(
        `SELECT COALESCE(areas.name, 'Unknown Area') as area_name,
                items.code as item_code,
                items.name as item_name,
                items.base_unit,
                SUM(CAST(sale_items.quantity AS REAL)) as total_quantity,
                AVG(CAST(sale_items.trade_price AS REAL)) as avg_rate,
                SUM(CAST(COALESCE(sale_items.bonus, 0) AS REAL)) as total_bonus,
                SUM(CAST(sale_items.trade_price AS REAL) * CAST(sale_items.quantity AS REAL) * (1 - CAST(sale_items.discount_percent AS REAL) / 100.0)) as total_value,
                items.sales_tax
         FROM sale_items
         INNER JOIN sales ON sales.id = sale_items.sale_id
         INNER JOIN items ON items.id = sale_items.item_id
         INNER JOIN customers ON customers.id = sales.customer_id
         LEFT JOIN areas ON areas.id = customers.area_id
         WHERE items.company_id = @companyId
           AND sales.invoice_date >= @start
           AND sales.invoice_date <= @end
         GROUP BY COALESCE(areas.id, -1), COALESCE(areas.name, 'Unknown Area'), items.id, items.code, items.name, items.base_unit, items.sales_tax
         ORDER BY COALESCE(areas.name, 'Unknown Area'), items.name`
      )
      .all({ companyId: company.id, start: storageStart, end: storageEnd });

    const toNumber = (value) => Number(value ?? 0);

    const mappedRows = rows.map((row, index) => ({
      sr: index + 1,
      areaName: row.area_name,
      itemCode: row.item_code,
      itemName: row.item_name,
      baseUnit: row.base_unit,
      quantity: Number(toNumber(row.total_quantity).toFixed(2)),
      rate: Number(toNumber(row.avg_rate).toFixed(2)),
      bonus: Number(toNumber(row.total_bonus).toFixed(2)),
      amount: Number(toNumber(row.total_value).toFixed(2)),
      taxPercent: Number(toNumber(row.sales_tax).toFixed(2))
    }));

    const totals = mappedRows.reduce(
      (acc, row) => {
        acc.quantity += row.quantity;
        acc.bonus += row.bonus;
        acc.amount += row.amount;
        return acc;
      },
      { quantity: 0, bonus: 0, amount: 0 }
    );

    res.json({
      company: { code: company.code, name: company.name },
      startDate: toDisplayDate(storageStart),
      endDate: toDisplayDate(storageEnd),
      rows: mappedRows,
      totals: {
        quantity: Number(totals.quantity.toFixed(2)),
        bonus: Number(totals.bonus.toFixed(2)),
        amount: Number(totals.amount.toFixed(2)),
        rowCount: mappedRows.length
      }
    });
  } catch (error) {
    console.error("Error generating company entire area sales:", error.message);
    res.status(500).json({ message: "Failed to generate company entire area sales", error: error.message });
  }
});

// COMPANY + PERCENTAGE DETAILS - Invoices showing company items sold on discount
app.get("/api/reports/sales/company-percentage-details", (req, res) => {
  const db = getDb();
  const { companyCode, startDate, endDate } = req.query;

  if (!companyCode) {
    return res.status(400).json({ message: "Company code is required." });
  }

  if (!startDate || !endDate) {
    return res.status(400).json({ message: "Start date and end date are required." });
  }

  const company = findByCode("companies", companyCode);
  if (!company) {
    return res.status(404).json({ message: "Company not found." });
  }

  const storageStart = toStorageDate(startDate);
  const storageEnd = toStorageDate(endDate);

  if (!storageStart || !storageEnd) {
    return res.status(400).json({ message: "Invalid date format. Use DD-MM-YYYY." });
  }

  if (storageStart > storageEnd) {
    return res.status(400).json({ message: "Start date must be on or before end date." });
  }

  try {
    // Get all sale items where company items are sold on discount (discount_percent > 0)
    const rows = db
      .prepare(
        `SELECT sales.invoice_no,
                sales.invoice_date,
                customers.name AS customer_name,
                items.name AS item_name,
                items.base_unit,
                items.pack_size,
                sale_items.trade_price AS rate,
                sale_items.quantity AS full_qty,
                sale_items.bonus AS bonus_qty,
                sale_items.discount_percent,
                sale_items.tax_percent,
                (sale_items.quantity * sale_items.trade_price) AS gross_value,
                (sale_items.quantity * sale_items.trade_price * (1 - sale_items.discount_percent / 100.0)) AS net_value
         FROM sale_items
         INNER JOIN sales ON sales.id = sale_items.sale_id
         INNER JOIN customers ON customers.id = sales.customer_id
         INNER JOIN items ON items.id = sale_items.item_id
         WHERE items.company_id = @companyId
           AND sales.invoice_date >= @start
           AND sales.invoice_date <= @end
           AND sale_items.discount_percent > 0
         ORDER BY sales.invoice_date, sales.invoice_no, items.name`
      )
      .all({ companyId: company.id, start: storageStart, end: storageEnd });

    const toNumber = (value) => Number(value ?? 0);

    const mappedRows = rows.map((row) => {
      const baseUnitLower = (row.base_unit || "").toLowerCase();
      const packSize = Number(row.pack_size ?? 0);
      const isPack = baseUnitLower.includes("pack") || baseUnitLower.includes("carton") || packSize > 0;
      
      return {
        invoiceNo: row.invoice_no,
        invoiceDate: toDisplayDate(row.invoice_date),
        customerName: row.customer_name,
        itemName: row.item_name,
        baseUnit: row.base_unit,
        packSize: packSize,
        isPack: isPack,
        rate: Number(toNumber(row.rate).toFixed(2)),
        fullQty: Number(toNumber(row.full_qty).toFixed(2)),
        bonusQty: Number(toNumber(row.bonus_qty).toFixed(2)),
        discountPercent: Number(toNumber(row.discount_percent).toFixed(2)),
        taxPercent: Number(toNumber(row.tax_percent).toFixed(2)),
        grossValue: Number(toNumber(row.gross_value).toFixed(2)),
        netValue: Number(toNumber(row.net_value).toFixed(2))
      };
    });

    const totals = mappedRows.reduce(
      (acc, row) => {
        acc.fullQty += row.fullQty;
        acc.grossValue += row.grossValue;
        acc.netValue += row.netValue;
        return acc;
      },
      { fullQty: 0, grossValue: 0, netValue: 0 }
    );

    res.json({
      company: { code: company.code, name: company.name },
      startDate: toDisplayDate(storageStart),
      endDate: toDisplayDate(storageEnd),
      rows: mappedRows,
      totals: {
        fullQty: Number(totals.fullQty.toFixed(2)),
        grossValue: Number(totals.grossValue.toFixed(2)),
        netValue: Number(totals.netValue.toFixed(2)),
        rowCount: mappedRows.length
      }
    });
  } catch (error) {
    console.error("Error generating company percentage details:", error.message);
    res.status(500).json({ message: "Failed to generate company percentage details", error: error.message });
  }
});

app.get("/api/reports/receivables/summary", (req, res) => {
  const db = getDb();

  try {
    const customers = db.prepare(`SELECT id, code, name FROM customers ORDER BY name`).all();

    const customersWithBalance = customers.map((customer) => {
      const balance = computeCustomerBalance(db, customer.id);
      return {
        code: customer.code,
        name: customer.name,
        balance: Number(balance ?? 0)
      };
    });

    // Only sum positive balances for total receivable
    const totalBalance = customersWithBalance.reduce((sum, c) => {
      return sum + (c.balance > 0 ? c.balance : 0);
    }, 0);

    res.json({
      customers: customersWithBalance,
      totalBalance: Number(totalBalance.toFixed(2))
    });
  } catch (error) {
    console.error("Error generating receivable summary:", error.message);
    res.status(500).json({ message: "Failed to generate receivable summary" });
  }
});

app.get("/api/reports/receivables/salesman-wise-balance", (req, res) => {
  const db = getDb();
  const { salesmanCode } = req.query;

  try {
    let salesmen = [];

    if (salesmanCode) {
      // Filter by specific salesman
      const salesman = findByCode("salesmen", salesmanCode);
      if (!salesman) {
        return res.status(404).json({ message: "Salesman not found" });
      }
      salesmen = [salesman];
    } else {
      // Get all salesmen
      salesmen = db.prepare(`
        SELECT id, code, name 
        FROM salesmen 
        ORDER BY name
      `).all();
    }

    const salesmenWithBalances = salesmen.map((salesman) => {
      // Get customers who have made purchases with this salesman
      const customerIds = db.prepare(`
        SELECT DISTINCT customer_id 
        FROM sales 
        WHERE salesman_id = ?
      `).all(salesman.id).map(row => row.customer_id);

      const customersWithBalance = customerIds.map((customerId) => {
        const customer = db.prepare(`SELECT code, name FROM customers WHERE id = ?`).get(customerId);
        if (!customer) return null;
        
        // Calculate this salesman's contribution to the customer's total sales
        const salesmanSalesTotal = db.prepare(`
          SELECT COALESCE(SUM(total_amount), 0) AS total
          FROM sales
          WHERE customer_id = ? AND salesman_id = ?
        `).get(customerId, salesman.id).total ?? 0;

        // Calculate all salesmen's contribution to this customer
        const allSalesTotal = db.prepare(`
          SELECT COALESCE(SUM(total_amount), 0) AS total
          FROM sales
          WHERE customer_id = ?
        `).get(customerId).total ?? 0;

        // Get the full customer balance (accounts for all receipts and returns)
        const fullBalance = computeCustomerBalance(db, customerId);

        // Allocate the balance proportionally based on this salesman's sales contribution
        let allocatedBalance = 0;
        if (allSalesTotal > 0) {
          const proportion = salesmanSalesTotal / allSalesTotal;
          allocatedBalance = fullBalance * proportion;
        }
        
        return {
          code: customer.code,
          name: customer.name,
          balance: Number(allocatedBalance.toFixed(2))
        };
      }).filter(c => c !== null && Math.abs(c.balance) > 0.01)
        .sort((a, b) => a.name.localeCompare(b.name));

      const totalBalance = customersWithBalance.reduce((sum, c) => sum + c.balance, 0);

      return {
        salesmanCode: salesman.code,
        salesmanName: salesman.name,
        customers: customersWithBalance,
        totalBalance: Number(totalBalance.toFixed(2))
      };
    }).filter(s => s.customers.length > 0);

    // Add customers with no sales history or unassigned salesmen (only if no specific salesman filter)
    if (!salesmanCode) {
      const assignedCustomerIds = salesmenWithBalances.flatMap(s => 
        s.customers.map(c => c.code)
      );

      const allCustomers = db.prepare(`SELECT id, code, name FROM customers ORDER BY name`).all();
      const unassignedCustomers = allCustomers.filter(c => {
        const hasBalance = Math.abs(computeCustomerBalance(db, c.id)) > 0.01;
        const isAssigned = assignedCustomerIds.includes(c.code);
        return hasBalance && !isAssigned;
      });

      if (unassignedCustomers.length > 0) {
        const customersWithBalance = unassignedCustomers.map((customer) => {
          const balance = computeCustomerBalance(db, customer.id);
          return {
            code: customer.code,
            name: customer.name,
            balance: Number(balance ?? 0)
          };
        });

        const totalBalance = customersWithBalance.reduce((sum, c) => sum + c.balance, 0);

        salesmenWithBalances.push({
          salesmanCode: null,
          salesmanName: "Unassigned",
          customers: customersWithBalance,
          totalBalance: Number(totalBalance.toFixed(2))
        });
      }
    }

    const grandTotal = salesmenWithBalances.reduce((sum, s) => sum + s.totalBalance, 0);

    res.json({
      salesmen: salesmenWithBalances,
      grandTotal: Number(grandTotal.toFixed(2))
    });
  } catch (error) {
    console.error("Error generating salesman-wise balance:", error.message);
    res.status(500).json({ message: "Failed to generate salesman-wise balance" });
  }
});

app.get("/api/reports/receivables/area-wise-balance", (req, res) => {
  const db = getDb();
  const { areaCode } = req.query;

  try {
    let areas = [];

    if (areaCode) {
      // Filter by specific area
      const area = findByCode("areas", areaCode);
      if (!area) {
        return res.status(404).json({ message: "Area not found" });
      }
      areas = [area];
    } else {
      // Get all areas
      areas = db.prepare(`
        SELECT id, code, name 
        FROM areas 
        ORDER BY name
      `).all();
    }

    const areasWithBalances = areas.map((area) => {
      // Get customers in this area
      const customers = db.prepare(`
        SELECT id, code, name 
        FROM customers 
        WHERE area_id = ?
        ORDER BY name
      `).all(area.id);

      const customersWithBalance = customers.map((customer) => {
        const balance = computeCustomerBalance(db, customer.id);
        return {
          code: customer.code,
          name: customer.name,
          balance: Number(balance ?? 0)
        };
      }).filter(c => Math.abs(c.balance) > 0.01);

      const totalBalance = customersWithBalance.reduce((sum, c) => sum + c.balance, 0);

      return {
        areaCode: area.code,
        areaName: area.name,
        customers: customersWithBalance,
        totalBalance: Number(totalBalance.toFixed(2))
      };
    }).filter(a => a.customers.length > 0);

    // Add customers with no area or unassigned (only if no specific area filter)
    if (!areaCode) {
      const unassignedCustomers = db.prepare(`
        SELECT id, code, name 
        FROM customers 
        WHERE area_id IS NULL OR area_id = 0
        ORDER BY name
      `).all();

      if (unassignedCustomers.length > 0) {
        const customersWithBalance = unassignedCustomers.map((customer) => {
          const balance = computeCustomerBalance(db, customer.id);
          return {
            code: customer.code,
            name: customer.name,
            balance: Number(balance ?? 0)
          };
        }).filter(c => Math.abs(c.balance) > 0.01);

        if (customersWithBalance.length > 0) {
          const totalBalance = customersWithBalance.reduce((sum, c) => sum + c.balance, 0);

          areasWithBalances.push({
            areaCode: null,
            areaName: "Unassigned",
            customers: customersWithBalance,
            totalBalance: Number(totalBalance.toFixed(2))
          });
        }
      }
    }

    const grandTotal = areasWithBalances.reduce((sum, a) => sum + a.totalBalance, 0);

    res.json({
      areas: areasWithBalances,
      grandTotal: Number(grandTotal.toFixed(2))
    });
  } catch (error) {
    console.error("Error generating area-wise balance:", error.message);
    res.status(500).json({ message: "Failed to generate area-wise balance" });
  }
});

app.get("/api/reports/receivables/salesman-area-wise-balance", (req, res) => {
  const db = getDb();
  const { salesmanCode, areaCode } = req.query;

  try {
    let salesmen = [];
    let areas = [];

    // Get salesmen (filtered or all)
    if (salesmanCode) {
      const salesman = findByCode("salesmen", salesmanCode);
      if (!salesman) {
        return res.status(404).json({ message: "Salesman not found" });
      }
      salesmen = [salesman];
    } else {
      salesmen = db.prepare(`SELECT id, code, name FROM salesmen ORDER BY name`).all();
    }

    // Get areas (filtered or all)
    if (areaCode) {
      const area = findByCode("areas", areaCode);
      if (!area) {
        return res.status(404).json({ message: "Area not found" });
      }
      areas = [area];
    } else {
      areas = db.prepare(`SELECT id, code, name FROM areas ORDER BY name`).all();
    }

    const groups = [];

    // Generate combinations of salesman + area
    for (const salesman of salesmen) {
      for (const area of areas) {
        // Get customers in this area who have bought from this salesman
        const customerIds = db.prepare(`
          SELECT DISTINCT s.customer_id 
          FROM sales s
          INNER JOIN customers c ON c.id = s.customer_id
          WHERE s.salesman_id = ? AND c.area_id = ?
        `).all(salesman.id, area.id).map(row => row.customer_id);

        if (customerIds.length === 0) continue;

        const customersWithBalance = customerIds.map((customerId) => {
          const customer = db.prepare(`SELECT code, name FROM customers WHERE id = ?`).get(customerId);
          if (!customer) return null;

          // Get the full customer balance (accounts for all receipts and returns)
          const balance = computeCustomerBalance(db, customerId);

          return {
            code: customer.code,
            name: customer.name,
            balance: balance
          };
        }).filter(c => c !== null && Math.abs(c.balance) > 0.01)
          .sort((a, b) => a.name.localeCompare(b.name));

        if (customersWithBalance.length > 0) {
          const totalBalance = customersWithBalance.reduce((sum, c) => sum + c.balance, 0);

          groups.push({
            salesmanCode: salesman.code,
            salesmanName: salesman.name,
            areaCode: area.code,
            areaName: area.name,
            customers: customersWithBalance,
            totalBalance: Number(totalBalance.toFixed(2))
          });
        }
      }
    }

    const grandTotal = groups.reduce((sum, g) => sum + g.totalBalance, 0);

    res.json({
      groups: groups,
      grandTotal: Number(grandTotal.toFixed(2))
    });
  } catch (error) {
    console.error("Error generating salesman-area-wise balance:", error.message);
    res.status(500).json({ message: "Failed to generate salesman-area-wise balance" });
  }
});

// Salesman wise item summary (quantity by item within a date range)
app.get("/api/reports/salesman/items-summary", (req, res) => {
  const db = getDb();
  const { salesmanCode, startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({ message: "Start date and end date are required." });
  }

  const storageStart = toStorageDate(startDate);
  const storageEnd = toStorageDate(endDate);
  if (!storageStart || !storageEnd) {
    return res.status(400).json({ message: "Invalid date format." });
  }

  let salesman = null;
  if (salesmanCode) {
    salesman = findByCode("salesmen", salesmanCode);
    if (!salesman) {
      return res.status(404).json({ message: "Salesman not found" });
    }
  }

  try {
    const baseParams = { start: storageStart, end: storageEnd };
    const params = salesman ? { ...baseParams, salesmanId: salesman.id } : baseParams;

    const items = db
      .prepare(
        `SELECT items.code AS code,
                items.name AS name,
                SUM(si.quantity + COALESCE(si.bonus, 0)) AS quantity
         FROM sale_items si
         INNER JOIN sales s ON s.id = si.sale_id
         INNER JOIN items ON items.id = si.item_id
         WHERE s.invoice_date >= @start
           AND s.invoice_date <= @end
           AND COALESCE(s.is_cancelled, 0) = 0
           ${salesman ? "AND s.salesman_id = @salesmanId" : ""}
         GROUP BY items.id
         ORDER BY items.name`
      )
      .all(params)
      .map((row) => ({
        code: row.code,
        name: row.name,
        quantity: Number(row.quantity || 0)
      }));

    const totalQuantity = items.reduce((sum, item) => sum + (item.quantity || 0), 0);

    res.json({
      salesman: salesman
        ? { code: salesman.code, name: salesman.name }
        : { code: null, name: "All Salesmen" },
      period: {
        start: toDisplayDate(storageStart),
        end: toDisplayDate(storageEnd)
      },
      items,
      totalQuantity: Number(totalQuantity.toFixed(2))
    });
  } catch (error) {
    console.error("Error generating salesman item summary:", error.message);
    res.status(500).json({ message: "Failed to generate salesman item summary", error: error.message });
  }
});

app.get("/api/reports/stock/company-wise-cost", (req, res) => {
  const db = getDb();
  const { companyCode } = req.query;

  console.log(`[Stock Report] Request received - companyCode: ${companyCode || 'ALL'}`);

  try {
    let companies = [];

    // Get companies (filtered or all)
    if (companyCode) {
      const company = findByCode("companies", companyCode);
      if (!company) {
        return res.status(404).json({ message: "Company not found" });
      }
      companies = [company];
    } else {
      companies = db.prepare(`SELECT id, code, name FROM companies ORDER BY name`).all();
    }

    console.log(`[Stock Report] Processing ${companies.length} companies`);

    const groupedCompanies = [];
    let totalValue = 0;
    let totalUnits = 0;

    for (const company of companies) {
      // Get all items for this company
      const items = db.prepare(`
        SELECT id, code, name, purchase_rate, base_unit
        FROM items
        WHERE company_id = ?
        ORDER BY code
      `).all(company.id);

      if (!items || items.length === 0) {
        console.log(`[Stock Report] Company ${company.code} has no items, skipping`);
        continue;
      }

      console.log(`[Stock Report] Company ${company.code} (${company.name}) - processing ${items.length} items`);

      // Get all item IDs for batch queries
      const itemIds = items.map(i => i.id);
      if (itemIds.length === 0) continue;
      
      const placeholders = itemIds.map(() => '?').join(',');

      // Get purchases
      const purchases = new Map();
      db.prepare(`
        SELECT pi.item_id, COALESCE(SUM(pi.quantity + COALESCE(pi.bonus, 0)), 0) AS qty
        FROM purchase_items pi
        WHERE pi.item_id IN (${placeholders})
        GROUP BY pi.item_id
      `).all(...itemIds).forEach(row => purchases.set(row.item_id, Number(row.qty)));

      // Get purchase returns
      const purchaseReturns = new Map();
      db.prepare(`
        SELECT pi.item_id, COALESCE(SUM(pr.quantity), 0) AS qty
        FROM purchase_returns pr
        INNER JOIN purchase_items pi ON pi.id = pr.purchase_item_id
        WHERE pi.item_id IN (${placeholders})
        GROUP BY pi.item_id
      `).all(...itemIds).forEach(row => purchaseReturns.set(row.item_id, Number(row.qty)));

      // Get sales
      const sales = new Map();
      db.prepare(`
        SELECT item_id, COALESCE(SUM(quantity + COALESCE(bonus, 0)), 0) AS qty
        FROM sale_items
        WHERE item_id IN (${placeholders})
        GROUP BY item_id
      `).all(...itemIds).forEach(row => sales.set(row.item_id, Number(row.qty)));

      // Get sale returns
      const saleReturns = new Map();
      db.prepare(`
        SELECT si.item_id, COALESCE(SUM(sr.quantity), 0) AS qty
        FROM sale_returns sr
        INNER JOIN sale_items si ON si.id = sr.sale_item_id
        WHERE si.item_id IN (${placeholders})
        GROUP BY si.item_id
      `).all(...itemIds).forEach(row => saleReturns.set(row.item_id, Number(row.qty)));

      // Get damage transactions
      const damageOut = new Map();
      const damageIn = new Map();
      db.prepare(`
        SELECT item_id, transaction_type, COALESCE(SUM(quantity), 0) AS qty
        FROM damage_transactions
        WHERE item_id IN (${placeholders})
        GROUP BY item_id, transaction_type
      `).all(...itemIds).forEach(row => {
        if (row.transaction_type === 'out') {
          damageOut.set(row.item_id, Number(row.qty));
        } else if (row.transaction_type === 'in') {
          damageIn.set(row.item_id, Number(row.qty));
        }
      });

      const itemsWithStock = [];

      for (const item of items) {
        const purchased = purchases.get(item.id) || 0;
        const purchaseRet = purchaseReturns.get(item.id) || 0;
        const sold = sales.get(item.id) || 0;
        const saleRet = saleReturns.get(item.id) || 0;
        const dmgOut = damageOut.get(item.id) || 0;
        const dmgIn = damageIn.get(item.id) || 0;

        const quantity = purchased - purchaseRet - sold + saleRet - dmgOut + dmgIn;
        const availableQty = Math.max(quantity, 0);
        const costPrice = Number(item.purchase_rate ?? 0);
        const itemValue = availableQty * costPrice;

        if (availableQty > 0.01) {
          itemsWithStock.push({
            code: item.code,
            name: item.name,
            quantity: Number(availableQty.toFixed(2)),
            costPrice: costPrice,
            totalValue: Number(itemValue.toFixed(2))
          });

          totalValue += itemValue;
          totalUnits += availableQty;
        }
      }

      if (itemsWithStock.length > 0) {
        const companyTotal = itemsWithStock.reduce((sum, item) => sum + item.totalValue, 0);
        const companyUnits = itemsWithStock.reduce((sum, item) => sum + item.quantity, 0);

        groupedCompanies.push({
          companyCode: company.code,
          companyName: company.name,
          items: itemsWithStock,
          totalValue: Number(companyTotal.toFixed(2)),
          totalQuantity: Number(companyUnits.toFixed(2))
        });
      }
    }

    console.log(`Company-wise stock: ${groupedCompanies.length} companies, ${totalUnits.toFixed(2)} units, Rs ${totalValue.toFixed(2)}`);
    
    res.json({
      companies: groupedCompanies,
      grandTotal: Number(totalValue.toFixed(2)),
      grandTotalUnits: Number(totalUnits.toFixed(2))
    });
  } catch (error) {
    console.error("Error generating company-wise stock cost:", error.message);
    console.error(error.stack);
    res.status(500).json({ message: "Failed to generate company-wise stock cost", error: error.message });
  }
});

app.get("/api/reports/stock/company-wise-tp", (req, res) => {
  const db = getDb();
  const { companyCode } = req.query;

  console.log(`[Stock Report] Request received - companyCode: ${companyCode || 'ALL'}`);

  try {
    let companies = [];

    // Get companies (filtered or all)
    if (companyCode) {
      const company = findByCode("companies", companyCode);
      if (!company) {
        return res.status(404).json({ message: "Company not found" });
      }
      companies = [company];
    } else {
      companies = db.prepare(`SELECT id, code, name FROM companies ORDER BY name`).all();
    }

    console.log(`[Stock Report] Processing ${companies.length} companies`);

    const groupedCompanies = [];
    let totalValue = 0;
    let totalUnits = 0;

    for (const company of companies) {
      // Get all items for this company
      const items = db.prepare(`
        SELECT id, code, name, trade_rate, base_unit
        FROM items
        WHERE company_id = ?
        ORDER BY code
      `).all(company.id);

      if (!items || items.length === 0) {
        console.log(`[Stock Report] Company ${company.code} has no items, skipping`);
        continue;
      }

      console.log(`[Stock Report] Company ${company.code} (${company.name}) - processing ${items.length} items`);

      // Get all item IDs for batch queries
      const itemIds = items.map(i => i.id);
      if (itemIds.length === 0) continue;
      
      const placeholders = itemIds.map(() => '?').join(',');

      // Get purchases
      const purchases = new Map();
      db.prepare(`
        SELECT pi.item_id, COALESCE(SUM(pi.quantity + COALESCE(pi.bonus, 0)), 0) AS qty
        FROM purchase_items pi
        WHERE pi.item_id IN (${placeholders})
        GROUP BY pi.item_id
      `).all(...itemIds).forEach(row => purchases.set(row.item_id, Number(row.qty)));

      // Get purchase returns
      const purchaseReturns = new Map();
      db.prepare(`
        SELECT pi.item_id, COALESCE(SUM(pr.quantity), 0) AS qty
        FROM purchase_returns pr
        INNER JOIN purchase_items pi ON pi.id = pr.purchase_item_id
        WHERE pi.item_id IN (${placeholders})
        GROUP BY pi.item_id
      `).all(...itemIds).forEach(row => purchaseReturns.set(row.item_id, Number(row.qty)));

      // Get sales
      const sales = new Map();
      db.prepare(`
        SELECT item_id, COALESCE(SUM(quantity + COALESCE(bonus, 0)), 0) AS qty
        FROM sale_items
        WHERE item_id IN (${placeholders})
        GROUP BY item_id
      `).all(...itemIds).forEach(row => sales.set(row.item_id, Number(row.qty)));

      // Get sale returns
      const saleReturns = new Map();
      db.prepare(`
        SELECT si.item_id, COALESCE(SUM(sr.quantity), 0) AS qty
        FROM sale_returns sr
        INNER JOIN sale_items si ON si.id = sr.sale_item_id
        WHERE si.item_id IN (${placeholders})
        GROUP BY si.item_id
      `).all(...itemIds).forEach(row => saleReturns.set(row.item_id, Number(row.qty)));

      // Get damage transactions
      const damageOut = new Map();
      const damageIn = new Map();
      db.prepare(`
        SELECT item_id, transaction_type, COALESCE(SUM(quantity), 0) AS qty
        FROM damage_transactions
        WHERE item_id IN (${placeholders})
        GROUP BY item_id, transaction_type
      `).all(...itemIds).forEach(row => {
        if (row.transaction_type === 'out') {
          damageOut.set(row.item_id, Number(row.qty));
        } else if (row.transaction_type === 'in') {
          damageIn.set(row.item_id, Number(row.qty));
        }
      });

      const itemsWithStock = [];

      for (const item of items) {
        const purchased = purchases.get(item.id) || 0;
        const purchaseRet = purchaseReturns.get(item.id) || 0;
        const sold = sales.get(item.id) || 0;
        const saleRet = saleReturns.get(item.id) || 0;
        const dmgOut = damageOut.get(item.id) || 0;
        const dmgIn = damageIn.get(item.id) || 0;

        const quantity = purchased - purchaseRet - sold + saleRet - dmgOut + dmgIn;
        const availableQty = Math.max(quantity, 0);
        const tpPrice = Number(item.trade_rate ?? 0);
        const itemValue = availableQty * tpPrice;

        if (availableQty > 0.01) {
          itemsWithStock.push({
            code: item.code,
            name: item.name,
            quantity: Number(availableQty.toFixed(2)),
            tpPrice: tpPrice,
            totalValue: Number(itemValue.toFixed(2))
          });

          totalValue += itemValue;
          totalUnits += availableQty;
        }
      }

      if (itemsWithStock.length > 0) {
        const companyTotal = itemsWithStock.reduce((sum, item) => sum + item.totalValue, 0);
        const companyUnits = itemsWithStock.reduce((sum, item) => sum + item.quantity, 0);

        groupedCompanies.push({
          companyCode: company.code,
          companyName: company.name,
          items: itemsWithStock,
          totalValue: Number(companyTotal.toFixed(2)),
          totalQuantity: Number(companyUnits.toFixed(2))
        });
      }
    }

    console.log(`Company-wise stock on T.P.: ${groupedCompanies.length} companies, ${totalUnits.toFixed(2)} units, Rs ${totalValue.toFixed(2)}`);
    
    res.json({
      companies: groupedCompanies,
      grandTotal: Number(totalValue.toFixed(2)),
      grandTotalUnits: Number(totalUnits.toFixed(2))
    });
  } catch (error) {
    console.error("Error generating company-wise stock on T.P.:", error.message);
    console.error(error.stack);
    res.status(500).json({ message: "Failed to generate company-wise stock on T.P.", error: error.message });
  }
});

app.get("/api/reports/receivables/customer-ledger", (req, res) => {
  const db = getDb();
  const { startDate, endDate, customerCode, mode } = req.query;
  const normalizedMode = (mode || "detail").toLowerCase();
  const includeDetails = normalizedMode === "detail";
  const includeInvoices = normalizedMode === "detail";

  if (!startDate || !endDate) {
    return res.status(400).json({ message: "Start date and end date are required." });
  }

  const storageStart = toStorageDate(startDate);
  const storageEnd = toStorageDate(endDate);

  if (!storageStart || !storageEnd) {
    return res.status(400).json({ message: "Invalid date format. Use DD-MM-YYYY." });
  }

  if (storageStart > storageEnd) {
    return res.status(400).json({ message: "Start date must be on or before end date." });
  }

  let customers;
  if (customerCode) {
    const customer = findByCode("customers", customerCode);
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }
    customers = [{ id: customer.id, code: customer.code, name: customer.name }];
  } else {
    customers = db.prepare(`SELECT id, code, name FROM customers ORDER BY name`).all();
  }

  const emptyResponse = {
    startDate: toDisplayDate(storageStart),
    endDate: toDisplayDate(storageEnd),
    rows: [],
    totals: { opening: 0, sales: 0, returns: 0, receipts: 0, closing: 0 }
  };

  if (customers.length === 0) {
    return res.json(emptyResponse);
  }

  const filtered = Boolean(customerCode);

  const toNumberMap = (rows) => {
    const map = new Map();
    for (const row of rows) {
      if (!row?.customer_id) continue;
      map.set(row.customer_id, Number(row.total ?? 0));
    }
    return map;
  };

  const openingByCustomer = toNumberMap(
    db
      .prepare(
        `SELECT customer_id, COALESCE(SUM(amount), 0) AS total
         FROM customer_opening_balances
         GROUP BY customer_id`
      )
      .all()
  );

  const salesBeforeStart = toNumberMap(
    db
      .prepare(
        `SELECT customer_id, COALESCE(SUM(total_amount - amount_paid), 0) AS total
         FROM sales
         WHERE invoice_date < @start
         GROUP BY customer_id`
      )
      .all({ start: storageStart })
  );

  const salesOutstandingWithinRange = toNumberMap(
    db
      .prepare(
        `SELECT customer_id, COALESCE(SUM(total_amount - amount_paid), 0) AS total
         FROM sales
         WHERE invoice_date >= @start AND invoice_date <= @end
         GROUP BY customer_id`
      )
      .all({ start: storageStart, end: storageEnd })
  );

  const salesTotalsWithinRange = toNumberMap(
    db
      .prepare(
        `SELECT customer_id, COALESCE(SUM(total_amount), 0) AS total
         FROM sales
         WHERE invoice_date >= @start AND invoice_date <= @end
         GROUP BY customer_id`
      )
      .all({ start: storageStart, end: storageEnd })
  );

  const saleReturnsBeforeStart = toNumberMap(
    db
      .prepare(
        `SELECT sales.customer_id, COALESCE(SUM(sr.quantity * COALESCE(sale_items.trade_price, 0)), 0) AS total
         FROM sale_returns sr
         INNER JOIN sales ON sales.id = sr.sale_id
         INNER JOIN sale_items ON sale_items.id = sr.sale_item_id
         WHERE sr.return_date < @start
         GROUP BY sales.customer_id`
      )
      .all({ start: storageStart })
  );

  const saleReturnsWithinRange = toNumberMap(
    db
      .prepare(
        `SELECT sales.customer_id, COALESCE(SUM(sr.quantity * COALESCE(sale_items.trade_price, 0)), 0) AS total
         FROM sale_returns sr
         INNER JOIN sales ON sales.id = sr.sale_id
         INNER JOIN sale_items ON sale_items.id = sr.sale_item_id
         WHERE sr.return_date >= @start AND sr.return_date <= @end
         GROUP BY sales.customer_id`
      )
      .all({ start: storageStart, end: storageEnd })
  );

  const receiptsBeforeStart = toNumberMap(
    db
      .prepare(
        `SELECT customer_id, COALESCE(SUM(amount), 0) AS total
         FROM customer_receipts
         WHERE receipt_date < @start
         GROUP BY customer_id`
      )
      .all({ start: storageStart })
  );

  const receiptsWithinRange = toNumberMap(
    db
      .prepare(
        `SELECT customer_id, COALESCE(SUM(amount), 0) AS total
         FROM customer_receipts
         WHERE receipt_date >= @start AND receipt_date <= @end
         GROUP BY customer_id`
      )
      .all({ start: storageStart, end: storageEnd })
  );

  const round = (value) => Number((Number(value ?? 0)).toFixed(2));

  const rows = [];
  const detailedRows = [];
  const invoiceSummaries = [];
  const totals = { opening: 0, sales: 0, returns: 0, receipts: 0, closing: 0 };

  for (const customer of customers) {
    const openingBase = openingByCustomer.get(customer.id) ?? 0;
    const preSales = salesBeforeStart.get(customer.id) ?? 0;
    const preReceipts = receiptsBeforeStart.get(customer.id) ?? 0;
    const preReturns = saleReturnsBeforeStart.get(customer.id) ?? 0;
    const openingBalance = round(openingBase + preSales - preReceipts - preReturns);

    const salesOutstanding = round(salesOutstandingWithinRange.get(customer.id) ?? 0);
    const salesAmount = round(salesTotalsWithinRange.get(customer.id) ?? 0);
    const receiptsAmountRaw = receiptsWithinRange.get(customer.id) ?? 0;
    const receiptsAmount = round(receiptsAmountRaw);
    const returnsAmount = round(saleReturnsWithinRange.get(customer.id) ?? 0);
    const closingBalance = round(openingBalance + salesOutstanding - receiptsAmount - returnsAmount);

    const hasActivity =
      Math.abs(openingBalance) > 0.005 ||
      Math.abs(salesAmount) > 0.005 ||
      Math.abs(returnsAmount) > 0.005 ||
      Math.abs(receiptsAmount) > 0.005 ||
      Math.abs(closingBalance) > 0.005;

    if (!hasActivity && !filtered) continue;

    totals.opening += openingBalance;
    totals.sales += salesAmount;
    totals.returns += returnsAmount;
    totals.receipts += receiptsAmount;
    totals.closing += closingBalance;

    rows.push({
      customerCode: customer.code,
      customerName: customer.name,
      openingBalance,
      salesAmount,
      returnsAmount,
      receiptsAmount,
      closingBalance
    });

    if (includeInvoices) {
      const invoiceList = db
        .prepare(
          `SELECT invoice_no,
                  invoice_date,
                  total_amount,
                  amount_paid,
                  total_amount - amount_paid AS outstanding
           FROM sales
           WHERE customer_id = @customerId
             AND invoice_date >= @start
             AND invoice_date <= @end
           ORDER BY invoice_date, id`
        )
        .all({ customerId: customer.id, start: storageStart, end: storageEnd })
        .map((invoice) => ({
          invoiceNo: invoice.invoice_no,
          invoiceDate: toDisplayDate(invoice.invoice_date),
          amount: round(invoice.total_amount),
          amountPaid: round(invoice.amount_paid),
          outstanding: round(invoice.outstanding)
        }));

      if (invoiceList.length > 0) {
        invoiceSummaries.push({
          customerCode: customer.code,
          customerName: customer.name,
          invoices: invoiceList
        });
      }
    }

    if (includeDetails) {
      const ledgerEntries = [];

      const saleEntries = db
        .prepare(
          `SELECT invoice_no AS reference,
                  invoice_date AS reference_date,
                  total_amount AS amount,
                  amount_paid AS paid,
                  total_amount - amount_paid AS outstanding
           FROM sales
           WHERE customer_id = @customerId
             AND invoice_date >= @start
             AND invoice_date <= @end
           ORDER BY invoice_date, id`
        )
        .all({ customerId: customer.id, start: storageStart, end: storageEnd });

      for (const entry of saleEntries) {
        ledgerEntries.push({
          type: "sale",
          reference: entry.reference,
          referenceDate: entry.reference_date,
          date: toDisplayDate(entry.reference_date),
          amount: round(entry.amount),
          paid: round(entry.paid),
          outstanding: round(entry.outstanding),
          delta: round(entry.amount)
        });

        // Add immediate payment as separate credit entry if paid at invoice time
        if (round(entry.paid) > 0) {
          ledgerEntries.push({
            type: "immediate-payment",
            reference: entry.reference,
            referenceDate: entry.reference_date,
            date: toDisplayDate(entry.reference_date),
            amount: round(entry.paid),
            delta: round(entry.paid) * -1
          });
        }
      }

      const saleReturnEntries = db
        .prepare(
          `SELECT sales.invoice_no AS reference,
                  MIN(sr.return_date) AS reference_date,
                  MIN(sr.return_date) AS date,
                  SUM(sr.quantity * COALESCE(sale_items.trade_price, 0)) AS amount,
                  MIN(sr.id) AS row_id
           FROM sale_returns sr
           INNER JOIN sales ON sales.id = sr.sale_id
           INNER JOIN sale_items ON sale_items.id = sr.sale_item_id
           WHERE sales.customer_id = @customerId
             AND sr.return_date >= @start AND sr.return_date <= @end
           GROUP BY sales.invoice_no, sr.return_date
           ORDER BY reference_date, row_id`
        )
        .all({ customerId: customer.id, start: storageStart, end: storageEnd });

      for (const entry of saleReturnEntries) {
        ledgerEntries.push({
          type: "sale-return",
          reference: entry.reference ? `SR-${entry.reference}` : "SR",
          referenceDate: entry.reference_date,
          date: toDisplayDate(entry.date),
          amount: round(entry.amount),
          delta: round(entry.amount) * -1
        });
      }

      const receiptEntries = db
        .prepare(
          `SELECT receipt_no AS reference,
                  receipt_date AS reference_date,
                  amount
           FROM customer_receipts
           WHERE customer_id = @customerId
             AND receipt_date >= @start
             AND receipt_date <= @end
           ORDER BY receipt_date, id`
        )
        .all({ customerId: customer.id, start: storageStart, end: storageEnd });

      for (const entry of receiptEntries) {
        ledgerEntries.push({
          type: "receipt",
          reference: entry.reference,
          referenceDate: entry.reference_date,
          date: toDisplayDate(entry.reference_date),
          amount: round(entry.amount),
          delta: round(entry.amount) * -1
        });
      }

      ledgerEntries.sort((a, b) => {
        const aDate = a.referenceDate || "";
        const bDate = b.referenceDate || "";
        if (aDate === bDate) {
          if (a.type === b.type) {
            return (a.reference || "").localeCompare(b.reference || "");
          }
          return a.type.localeCompare(b.type);
        }
        return aDate.localeCompare(bDate);
      });

      let runningBalance = openingBalance;
      const formattedEntries = ledgerEntries.map(({ referenceDate, delta, ...rest }) => {
        runningBalance = round(runningBalance + (delta ?? 0));
        return { ...rest, balanceAfter: runningBalance };
      });

      detailedRows.push({
        customerCode: customer.code,
        customerName: customer.name,
        openingBalance,
        entries: formattedEntries
      });
    }
  }

  if (rows.length === 0) {
    return res.json(emptyResponse);
  }

  rows.sort((a, b) => a.customerName.localeCompare(b.customerName));

  totals.opening = round(totals.opening);
  totals.sales = round(totals.sales);
  totals.returns = round(totals.returns);
  totals.receipts = round(totals.receipts);
  totals.closing = round(totals.closing);

  const payload = {
    startDate: toDisplayDate(storageStart),
    endDate: toDisplayDate(storageEnd),
    rows,
    totals
  };

  if (includeDetails) {
    payload.details = detailedRows;
  }
  if (includeInvoices) {
    payload.invoices = invoiceSummaries;
  }

  res.json(payload);
});

// Salesman + Customer-wise ledger within a date range
app.get("/api/reports/receivables/salesman-customer-ledger", (req, res) => {
  const db = getDb();
  const { startDate, endDate, salesmanCode, customerCode } = req.query;

  if (!startDate || !endDate || !salesmanCode || !customerCode) {
    return res.status(400).json({ message: "Start/end date, salesman, and customer are required." });
  }

  const salesman = findByCode("salesmen", salesmanCode);
  if (!salesman) return res.status(404).json({ message: "Salesman not found" });
  const customer = findByCode("customers", customerCode);
  if (!customer) return res.status(404).json({ message: "Customer not found" });

  const storageStart = toStorageDate(startDate);
  const storageEnd = toStorageDate(endDate);

  if (!storageStart || !storageEnd) {
    return res.status(400).json({ message: "Invalid date format. Use DD-MM-YYYY." });
  }
  if (storageStart > storageEnd) {
    return res.status(400).json({ message: "Start date must be on or before end date." });
  }

  const round = (value) => Number((Number(value ?? 0)).toFixed(2));

  try {
    // Opening balance scope: salesman + customer before start
    const preSales = db
      .prepare(
        `SELECT COALESCE(SUM(total_amount - amount_paid), 0) AS total
         FROM sales
         WHERE salesman_id = @salesmanId AND customer_id = @customerId AND invoice_date < @start`
      )
      .get({ salesmanId: salesman.id, customerId: customer.id, start: storageStart })?.total ?? 0;

    const preReturns = db
      .prepare(
        `SELECT COALESCE(SUM(sr.quantity * COALESCE(si.trade_price, 0)), 0) AS total
         FROM sale_returns sr
         INNER JOIN sales s ON s.id = sr.sale_id
         INNER JOIN sale_items si ON si.id = sr.sale_item_id
         WHERE s.salesman_id = @salesmanId AND s.customer_id = @customerId AND sr.return_date < @start`
      )
      .get({ salesmanId: salesman.id, customerId: customer.id, start: storageStart })?.total ?? 0;

    const preReceipts = db
      .prepare(
        `SELECT COALESCE(SUM(items.received_amount), 0) AS total
         FROM salesman_receipt_items items
         INNER JOIN salesman_receipts sr ON sr.id = items.receipt_id
         WHERE sr.salesman_id = @salesmanId AND items.customer_id = @customerId AND sr.receipt_date < @start`
      )
      .get({ salesmanId: salesman.id, customerId: customer.id, start: storageStart })?.total ?? 0;

    const preCustomerReceipts = db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) AS total
         FROM customer_receipts
         WHERE salesman_id = @salesmanId AND customer_id = @customerId AND receipt_date < @start`
      )
      .get({ salesmanId: salesman.id, customerId: customer.id, start: storageStart })?.total ?? 0;

    const openingBalance = round(Number(preSales) - Number(preReceipts) - Number(preCustomerReceipts) - Number(preReturns));

    // Detailed entries within range for the pair
    const ledgerEntries = [];

    // Sales by this salesman to this customer
    const saleEntries = db
      .prepare(
        `SELECT invoice_no AS reference,
                invoice_date AS reference_date,
                total_amount AS amount,
                amount_paid AS paid,
                total_amount - amount_paid AS outstanding
         FROM sales
         WHERE salesman_id = @salesmanId AND customer_id = @customerId
           AND invoice_date >= @start AND invoice_date <= @end
         ORDER BY invoice_date, id`
      )
      .all({ salesmanId: salesman.id, customerId: customer.id, start: storageStart, end: storageEnd });

    for (const entry of saleEntries) {
      ledgerEntries.push({
        type: "sale",
        reference: entry.reference,
        referenceDate: entry.reference_date,
        date: toDisplayDate(entry.reference_date),
        amount: round(entry.amount),
        paid: round(entry.paid),
        outstanding: round(entry.outstanding),
        delta: round(entry.outstanding)
      });
    }

    // Sale returns associated with this salesman's sales to this customer
    const saleReturnEntries = db
      .prepare(
        `SELECT s.invoice_no AS reference,
                MIN(sr.return_date) AS reference_date,
                MIN(sr.return_date) AS date,
                SUM(sr.quantity * COALESCE(si.trade_price, 0)) AS amount,
                MIN(sr.id) AS row_id
         FROM sale_returns sr
         INNER JOIN sales s ON s.id = sr.sale_id
         INNER JOIN sale_items si ON si.id = sr.sale_item_id
         WHERE s.salesman_id = @salesmanId AND s.customer_id = @customerId
           AND sr.return_date >= @start AND sr.return_date <= @end
         GROUP BY s.invoice_no, sr.return_date
         ORDER BY reference_date, row_id`
      )
      .all({ salesmanId: salesman.id, customerId: customer.id, start: storageStart, end: storageEnd });

    for (const entry of saleReturnEntries) {
      ledgerEntries.push({
        type: "sale-return",
        reference: entry.reference ? `SR-${entry.reference}` : "SR",
        referenceDate: entry.reference_date,
        date: toDisplayDate(entry.date),
        amount: round(entry.amount),
        delta: round(entry.amount) * -1
      });
    }

    // Salesman receipts for this customer
    const receiptEntries = db
      .prepare(
        `SELECT sr.receipt_no AS reference,
                sr.receipt_date AS reference_date,
                items.received_amount AS amount
         FROM salesman_receipt_items items
         INNER JOIN salesman_receipts sr ON sr.id = items.receipt_id
         WHERE sr.salesman_id = @salesmanId AND items.customer_id = @customerId
           AND sr.receipt_date >= @start AND sr.receipt_date <= @end
         ORDER BY sr.receipt_date, sr.id, items.id`
      )
      .all({ salesmanId: salesman.id, customerId: customer.id, start: storageStart, end: storageEnd });

    for (const entry of receiptEntries) {
      ledgerEntries.push({
        type: "salesman-receipt",
        reference: entry.reference,
        referenceDate: entry.reference_date,
        date: toDisplayDate(entry.reference_date),
        amount: round(entry.amount),
        delta: round(entry.amount) * -1
      });
    }

    // Customer receipts collected by this salesman for this customer
    const customerReceiptEntries = db
      .prepare(
        `SELECT receipt_no AS reference,
                receipt_date AS reference_date,
                amount
         FROM customer_receipts
         WHERE salesman_id = @salesmanId AND customer_id = @customerId
           AND receipt_date >= @start AND receipt_date <= @end
         ORDER BY receipt_date, id`
      )
      .all({ salesmanId: salesman.id, customerId: customer.id, start: storageStart, end: storageEnd });

    for (const entry of customerReceiptEntries) {
      ledgerEntries.push({
        type: "customer-receipt",
        reference: entry.reference,
        referenceDate: entry.reference_date,
        date: toDisplayDate(entry.reference_date),
        amount: round(entry.amount),
        delta: round(entry.amount) * -1
      });
    }

    // Sort and compute running balance
    ledgerEntries.sort((a, b) => {
      const aDate = a.referenceDate || "";
      const bDate = b.referenceDate || "";
      if (aDate === bDate) {
        if (a.type === b.type) {
          return (a.reference || "").localeCompare(b.reference || "");
        }
        return a.type.localeCompare(b.type);
      }
      return aDate.localeCompare(bDate);
    });

    let runningBalance = openingBalance;
    const formattedEntries = ledgerEntries.map(({ referenceDate, delta, ...rest }) => {
      runningBalance = round(runningBalance + (delta ?? 0));
      return { ...rest, balanceAfter: runningBalance };
    });

    return res.json({
      startDate: toDisplayDate(storageStart),
      endDate: toDisplayDate(storageEnd),
      salesman: { code: salesman.code, name: salesman.name },
      customer: { code: customer.code, name: customer.name },
      openingBalance,
      entries: formattedEntries,
      closingBalance: runningBalance
    });
  } catch (error) {
    console.error("Error generating salesman+customer ledger:", error.message);
    return res.status(500).json({ message: "Failed to generate salesman+customer ledger" });
  }
});

app.post("/api/items", (req, res) => {
  const db = getDb();
  const timestamp = nowIso();
  const payload = sanitizePayload(req.body, [
    "code",
    "name",
    "company_id",
    "base_unit",
    "pack_size",
    "min_quantity",
    "purchase_rate",
    "trade_rate",
    "retail_price",
    "sales_tax"
  ]);
  payload.created_at = timestamp;
  payload.updated_at = timestamp;
  try {
    const stmt = db.prepare(
      `INSERT INTO items
       (code, name, company_id, base_unit, pack_size, min_quantity, purchase_rate, trade_rate, retail_price, sales_tax, created_at, updated_at)
       VALUES
       (@code, @name, @company_id, @base_unit, @pack_size, @min_quantity, @purchase_rate, @trade_rate, @retail_price, @sales_tax, @created_at, @updated_at)`
    );
    const info = stmt.run(payload);
    const row = db.prepare(`SELECT * FROM items WHERE id = ?`).get(info.lastInsertRowid);
    res.status(201).json(row);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.put("/api/items/:id", (req, res) => {
  const db = getDb();
  const timestamp = nowIso();
  const payload = sanitizePayload(req.body, [
    "code",
    "name",
    "company_id",
    "base_unit",
    "pack_size",
    "min_quantity",
    "purchase_rate",
    "trade_rate",
    "retail_price",
    "sales_tax"
  ]);
  payload.updated_at = timestamp;
  payload.id = req.params.id;
  try {
    const stmt = db.prepare(
      `UPDATE items SET
        code = @code,
        name = @name,
        company_id = @company_id,
        base_unit = @base_unit,
        pack_size = @pack_size,
        min_quantity = @min_quantity,
        purchase_rate = @purchase_rate,
        trade_rate = @trade_rate,
        retail_price = @retail_price,
        sales_tax = @sales_tax,
        updated_at = @updated_at
       WHERE id = @id`
    );
    const info = stmt.run(payload);
    if (info.changes === 0) return res.status(404).json({ message: "Record not found" });
    const row = db.prepare(`SELECT * FROM items WHERE id = ?`).get(req.params.id);
    res.json(row);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.post("/api/purchases", (req, res) => {
  const db = getDb();
  const {
    supplierCode,
    invoiceNo,
    lastInvoice,
    date,
    items = [],
    amountPaid,
    previousBalance
  } = req.body;

  const supplier = findByCode("suppliers", supplierCode);
  if (!supplier) return res.status(400).json({ message: "Supplier not found" });
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: "At least one item is required" });
  }

  const timestamp = nowIso();
  const storageDate = toStorageDate(date);
  if (!storageDate) return res.status(400).json({ message: "Invalid date format" });

  const transaction = db.transaction(() => {
    if (invoiceNo) {
      const duplicate = db
        .prepare(`SELECT id FROM purchases WHERE supplier_id = ? AND invoice_no = ? LIMIT 1`)
        .get(supplier.id, invoiceNo);
      if (duplicate) {
        throw new Error("Duplicate invoice for this supplier");
      }
    }

    let totalAmount = 0;
    const insertPurchase = db.prepare(
      `INSERT INTO purchases (supplier_id, invoice_no, last_invoice, invoice_date, total_amount, amount_paid, previous_balance, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const purchaseInfo = insertPurchase.run(
      supplier.id,
      invoiceNo,
      lastInvoice || null,
      storageDate,
      0,
      amountPaid ?? 0,
      previousBalance ?? 0,
      timestamp,
      timestamp
    );

    const purchaseId = purchaseInfo.lastInsertRowid;
    const insertItem = db.prepare(
      `INSERT INTO purchase_items (purchase_id, item_id, quantity, base_unit, bonus, discount_percent, tax_percent, purchase_rate, net_amount, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const updateItemRate = db.prepare(
      `UPDATE items SET purchase_rate = ?, updated_at = ? WHERE id = ?`
    );

    for (const entry of items) {
      const item = findByCode("items", entry.itemCode);
      if (!item) throw new Error(`Item not found: ${entry.itemCode}`);
      const quantity = Number(entry.quantity) || 0;
      const bonus = Number(entry.bonus) || 0;
      const discountPercent = Number(entry.discountPercent) || 0;
      const taxPercent = Number(entry.taxPercent) || 0;
      const rate = Number(entry.purchaseRate ?? item.purchase_rate);
      const net = (quantity + bonus) * rate * (1 - discountPercent / 100) * (1 + taxPercent / 100);
      totalAmount += net;
      insertItem.run(
        purchaseId,
        item.id,
        quantity,
        item.base_unit,
        bonus,
        discountPercent,
        taxPercent,
        rate,
        net,
        timestamp,
        timestamp
      );
      updateItemRate.run(rate, timestamp, item.id);
    }

    db.prepare(`UPDATE purchases SET total_amount = ?, updated_at = ? WHERE id = ?`).run(totalAmount, timestamp, purchaseId);
    return purchaseId;
  });

  try {
    const purchaseId = transaction();
    const row = db.prepare(`SELECT * FROM purchases WHERE id = ?`).get(purchaseId);
    res.status(201).json(mapRowDates(row));
  } catch (error) {
    const message =
      error.message === "Duplicate invoice for this supplier"
        ? "A purchase with this invoice number already exists for the selected supplier."
        : error.message;
    res.status(400).json({ message });
  }
});

app.get("/api/salesman-receipts", (req, res) => {
  const db = getDb();
  const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);
  const rows = db
    .prepare(
      `SELECT sr.id,
              sr.receipt_no,
              sr.receipt_date,
              sr.created_at,
              salesmen.code AS salesman_code,
              salesmen.name AS salesman_name,
              COALESCE(SUM(items.received_amount), 0) AS total_received,
              COUNT(items.id) AS customer_count
       FROM salesman_receipts sr
       INNER JOIN salesmen ON salesmen.id = sr.salesman_id
       LEFT JOIN salesman_receipt_items items ON items.receipt_id = sr.id
       GROUP BY sr.id
       ORDER BY sr.receipt_date DESC, sr.id DESC
       LIMIT @limit`
    )
    .all({ limit });

  const mapped = rows.map((row) => ({
    ...mapRowDates(row),
    total_received: Number(row.total_received || 0),
    customer_count: Number(row.customer_count || 0)
  }));

  res.json(mapped);
});

app.get("/api/purchases", (req, res) => {
  const db = getDb();
  const { search = "", limit: rawLimit } = req.query;
  const trimmed = search.trim();
  const like = `%${trimmed}%`;
  const limit = Math.min(Math.max(Number(rawLimit) || 200, 1), 500);
  const params = { limit };

  let whereClause = "";
  if (trimmed) {
    whereClause = "WHERE purchases.invoice_no LIKE @like OR suppliers.name LIKE @like";
    params.like = like;
  }

  const rows = db
    .prepare(
      `SELECT purchases.*, suppliers.name AS supplier_name, suppliers.code AS supplier_code
       FROM purchases
       INNER JOIN suppliers ON suppliers.id = purchases.supplier_id
       ${whereClause}
       ORDER BY purchases.invoice_date DESC, purchases.id DESC
       LIMIT @limit`
    )
    .all(params);

  res.json(rows.map(mapRowDates));
});

app.get("/api/purchases/last-invoice", (req, res) => {
  const db = getDb();
  const { supplierCode } = req.query;

  let row;
  if (supplierCode) {
    const supplier = findByCode("suppliers", supplierCode);
    if (!supplier) {
      return res.status(404).json({ message: "Supplier not found" });
    }
    row = db.prepare(
      `SELECT invoice_no
       FROM purchases
       WHERE supplier_id = ?
       ORDER BY invoice_date DESC, id DESC
       LIMIT 1`
    ).get(supplier.id);
  } else {
    row = db.prepare(
      `SELECT invoice_no
       FROM purchases
       ORDER BY invoice_date DESC, id DESC
       LIMIT 1`
    ).get();
  }

  res.json({ invoiceNo: row?.invoice_no ?? "" });
});

app.get("/api/orders", (req, res) => {
  const db = getDb();
  const { search = "", limit: rawLimit } = req.query;
  const trimmed = search.trim();
  const like = `%${trimmed}%`;
  const limit = Math.min(Math.max(Number(rawLimit) || 200, 1), 500);
  const params = { limit };

  let whereClause = "";
  if (trimmed) {
    whereClause =
      "WHERE orders.order_no LIKE @like OR customers.name LIKE @like OR customers.code LIKE @like";
    params.like = like;
  }

  const rows = db
    .prepare(
      `SELECT orders.id,
              orders.order_no,
              orders.order_date,
              orders.status,
              orders.remarks,
              orders.created_at,
              orders.updated_at,
              customers.id AS customer_id,
              customers.code AS customer_code,
              customers.name AS customer_name,
              salesmen.id AS salesman_id,
              salesmen.code AS salesman_code,
              salesmen.name AS salesman_name,
              COUNT(items.id) AS item_count,
              COALESCE(SUM(items.quantity + COALESCE(items.bonus, 0)), 0) AS total_units
       FROM orders
       LEFT JOIN customers ON customers.id = orders.customer_id
       LEFT JOIN salesmen ON salesmen.id = orders.salesman_id
       LEFT JOIN order_items items ON items.order_id = orders.id
       ${whereClause}
       GROUP BY orders.id
       ORDER BY orders.order_date DESC, orders.id DESC
       LIMIT @limit`
    )
    .all(params);

  const mapped = rows.map((row) => {
    const totalUnits = Number(row.total_units ?? 0);
    return {
      orderNo: row.order_no,
      orderDate: toDisplayDate(row.order_date),
      orderDateRaw: row.order_date,
      status: row.status,
      remarks: row.remarks || "",
      customer: row.customer_id
        ? {
            id: row.customer_id,
            code: row.customer_code || "",
            name: row.customer_name || ""
          }
        : null,
      salesman: row.salesman_id
        ? {
            id: row.salesman_id,
            code: row.salesman_code || "",
            name: row.salesman_name || ""
          }
        : null,
      itemCount: Number(row.item_count || 0),
      totalUnits: Number(totalUnits.toFixed(2)),
      createdAt: row.created_at || null,
      updatedAt: row.updated_at || null
    };
  });

  res.json(mapped);
});

app.get("/api/orders/:orderNo", (req, res) => {
  const db = getDb();
  const order = db
    .prepare(
      `SELECT orders.*,
              customers.code AS customer_code,
              customers.name AS customer_name,
              salesmen.code AS salesman_code,
              salesmen.name AS salesman_name
       FROM orders
       LEFT JOIN customers ON customers.id = orders.customer_id
       LEFT JOIN salesmen ON salesmen.id = orders.salesman_id
       WHERE orders.order_no = ?`
    )
    .get(req.params.orderNo);

  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }

  const items = db
    .prepare(
      `SELECT order_items.*,
              items.code AS item_code,
              items.name AS item_name
       FROM order_items
       INNER JOIN items ON items.id = order_items.item_id
       WHERE order_items.order_id = ?
       ORDER BY order_items.id`
    )
    .all(order.id);

  const mappedItems = items.map((item) => ({
    id: item.id,
    itemId: item.item_id,
    itemCode: item.item_code,
    itemName: item.item_name,
    baseUnit: item.base_unit,
    quantity: Number(item.quantity || 0),
    bonus: Number(item.bonus || 0),
    notes: item.notes || ""
  }));

  res.json({
    order: mapRowDates(order),
    items: mappedItems
  });
});

app.post("/api/orders", (req, res) => {
  const db = getDb();
  try {
    const result = createOrderRecord(db, req.body);
    res.status(201).json(result);
  } catch (error) {
    const status = error?.statusCode || 400;
    res.status(status).json({ message: error?.message || "Failed to create order." });
  }
});

app.put("/api/orders/:orderNo", (req, res) => {
  const db = getDb();
  try {
    const result = updateOrderRecord(db, req.params.orderNo, req.body);
    res.json(result);
  } catch (error) {
    const status = error?.statusCode || 400;
    res.status(status).json({ message: error?.message || "Failed to update order." });
  }
});

app.post("/api/sales", (req, res) => {
  const db = getDb();
  const {
    customerCode,
    salesmanCode,
    date,
    items = [],
    amountPaid,
    previousBalance,
    allowNegativeStock
  } = req.body;

  const negativeStockAllowed = Boolean(allowNegativeStock);

  const customer = findByCode("customers", customerCode);
  if (!customer) return res.status(400).json({ message: "Customer not found" });

  const salesman = salesmanCode ? findByCode("salesmen", salesmanCode) : null;
  if (salesmanCode && !salesman) return res.status(400).json({ message: "Salesman not found" });

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: "At least one item is required" });
  }

  const itemInfos = [];
  const requiredByItem = new Map();
  const itemById = new Map();

  for (const entry of items) {
    const item = findByCode("items", entry.itemCode);
    if (!item) return res.status(400).json({ message: `Item not found: ${entry.itemCode}` });

    const quantity = Number(entry.quantity) || 0;
    const bonus = Number(entry.bonus) || 0;
    const discountPercent = Number(entry.discountPercent) || 0;
    const tradePrice = Number(entry.tradePrice ?? item.trade_rate);
    const rawTradeOff = Number(entry.tradeOffPrice);
    const hasExplicitTradeOff = entry.tradeOffPrice !== undefined && entry.tradeOffPrice !== "";
    const tradeOffPrice = Number.isFinite(rawTradeOff) && (hasExplicitTradeOff || rawTradeOff > 0)
      ? rawTradeOff
      : null;
    const taxPercent = Number(entry.taxPercent ?? item.sales_tax ?? 0) || 0;

    const requiredUnits = quantity + bonus;
    const currentRequired = requiredByItem.get(item.id) || 0;
    requiredByItem.set(item.id, currentRequired + requiredUnits);
    itemById.set(item.id, item);

    itemInfos.push({
      item,
      quantity,
      bonus,
      discountPercent,
      tradePrice,
      tradeOffPrice,
      taxPercent,
      companyName: entry.companyName || null
    });
  }

  const lowStockWarnings = [];
  const blockingWarnings = [];

  for (const [itemId, requiredUnits] of requiredByItem.entries()) {
    const availableUnits = getAvailableUnits(db, itemId);
    const shortage = requiredUnits - availableUnits;
    if (shortage > 1e-6) {
      const item = itemById.get(itemId);
      const warning = {
        itemCode: item?.code,
        itemName: item?.name,
        available: Number(availableUnits.toFixed(2)),
        required: Number(requiredUnits.toFixed(2)),
        shortage: Number(shortage.toFixed(2))
      };
      lowStockWarnings.push(warning);
      if (!negativeStockAllowed) {
        blockingWarnings.push(warning);
      }
    }
  }

  if (!negativeStockAllowed && blockingWarnings.length > 0) {
    const summary =
      blockingWarnings.length === 1
        ? `Insufficient stock for ${blockingWarnings[0].itemCode}.`
        : `Insufficient stock for ${blockingWarnings.length} items.`;
    return res.status(409).json({
      code: "LOW_STOCK",
      message: `${summary} Review quantities or confirm to proceed with negative stock.`,
      details: blockingWarnings
    });
  }

  const negativeStockWarnings = lowStockWarnings.length > 0 ? lowStockWarnings : null;

  const timestamp = nowIso();
  const storageDate = toStorageDate(date);
  if (!storageDate) return res.status(400).json({ message: "Invalid date format" });

  const invoiceInfo = db.prepare(`SELECT invoice_no FROM sales ORDER BY id DESC LIMIT 1`).get();
  const lastInvoiceNumeric = invoiceInfo?.invoice_no ?? "0000000";
  const invoiceNo = formatInvoiceNumber("", lastInvoiceNumeric);

  const amountPaidNumber = Number(amountPaid) || 0;
  const previousBalanceNumber = Number(previousBalance) || 0;

  const transaction = db.transaction(() => {
    let totalAmount = 0;
    const insertSale = db.prepare(
      `INSERT INTO sales (invoice_no, customer_id, salesman_id, invoice_date, total_amount, amount_paid, previous_balance, trade_off_total, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const saleInfo = insertSale.run(
      invoiceNo,
      customer.id,
      salesman?.id || null,
      storageDate,
      0,
      amountPaidNumber,
      previousBalanceNumber,
      0,
      timestamp,
      timestamp
    );

    const saleId = saleInfo.lastInsertRowid;
    const insertItem = db.prepare(
      `INSERT INTO sale_items (sale_id, item_id, base_unit, quantity, bonus, trade_off_price, discount_percent, tax_percent, trade_price, company_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const companyNameCache = new Map();

    for (const info of itemInfos) {
      const { item, quantity, bonus, discountPercent, tradePrice, tradeOffPrice, taxPercent } = info;
      const effectiveRate = tradeOffPrice ?? tradePrice * (1 - discountPercent / 100);
      const baseAmount = quantity * effectiveRate;
      const taxAmount = baseAmount * (taxPercent / 100);
      const lineAmount = baseAmount + taxAmount;
      totalAmount += lineAmount;
      let companyName = info.companyName;
      if (!companyName) {
        if (!companyNameCache.has(item.company_id)) {
          const companyRow = db.prepare(`SELECT name FROM companies WHERE id = ?`).get(item.company_id);
          companyNameCache.set(item.company_id, companyRow?.name || null);
        }
        companyName = companyNameCache.get(item.company_id);
      }
      insertItem.run(
        saleId,
        item.id,
        item.base_unit,
        quantity,
        bonus,
        tradeOffPrice ?? effectiveRate,
        discountPercent,
        taxPercent,
        tradePrice,
        companyName,
        timestamp,
        timestamp
      );
    }

    const tradeOff = Number((totalAmount - amountPaidNumber + previousBalanceNumber).toFixed(2));
    db.prepare(`UPDATE sales SET total_amount = ?, trade_off_total = ?, updated_at = ? WHERE id = ?`).run(
      totalAmount,
      tradeOff,
      timestamp,
      saleId
    );
    return { saleId, invoiceNo };
  });

  try {
    const { saleId, invoiceNo } = transaction();
    const row = db.prepare(`SELECT * FROM sales WHERE id = ?`).get(saleId);
    const nextInvoice = formatInvoiceNumber("", invoiceNo);
    res.status(201).json({
      ...mapRowDates(row),
      invoiceNo,
      nextInvoice,
      warnings: negativeStockWarnings
        ? {
            type: "NEGATIVE_STOCK",
            items: negativeStockWarnings
          }
        : null
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.get("/api/sales", (req, res) => {
  const db = getDb();
  const { search = "", limit: rawLimit } = req.query;
  const trimmed = search.trim();
  const like = `%${trimmed}%`;
  const limit = Math.min(Math.max(Number(rawLimit) || 200, 1), 500);
  const params = { limit };

  let whereClause = "";
  if (trimmed) {
    whereClause = "WHERE sales.invoice_no LIKE @like OR customers.name LIKE @like";
    params.like = like;
  }

  const rows = db
    .prepare(
            `SELECT sales.*, customers.name AS customer_name, customers.code AS customer_code,
              customers.address AS customer_address, customers.phone1 AS customer_phone,
              salesmen.name AS salesman_name, salesmen.code AS salesman_code
       FROM sales
       INNER JOIN customers ON customers.id = sales.customer_id
       LEFT JOIN salesmen ON salesmen.id = sales.salesman_id
       ${whereClause}
       ORDER BY sales.invoice_date DESC, sales.id DESC
       LIMIT @limit`
    )
    .all(params);

  res.json(rows.map(mapRowDates));
});

app.get("/api/sales/:invoiceNo", (req, res) => {
  const db = getDb();
  const sale = db
    .prepare(
            `SELECT sales.*, customers.code AS customer_code, customers.name AS customer_name,
              customers.address AS customer_address, customers.phone1 AS customer_phone,
              salesmen.code AS salesman_code, salesmen.name AS salesman_name
       FROM sales
       INNER JOIN customers ON customers.id = sales.customer_id
       LEFT JOIN salesmen ON salesmen.id = sales.salesman_id
       WHERE sales.invoice_no = ?`
    )
    .get(req.params.invoiceNo);
  if (!sale) return res.status(404).json({ message: "Sale not found" });
  const items = db.prepare(
    `SELECT sale_items.*, items.code AS item_code, items.name AS item_name, items.pack_size AS pack_size, items.retail_price AS retail_price, items.sales_tax AS sales_tax
     FROM sale_items
     INNER JOIN items ON items.id = sale_items.item_id
     WHERE sale_items.sale_id = ?`
  ).all(sale.id);
  res.json({ sale: mapRowDates(sale), items });
});

app.put("/api/sales/:invoiceNo", (req, res) => {
  const db = getDb();
  const invoiceNo = req.params.invoiceNo;
  const existing = db
    .prepare(
      `SELECT sales.*, customers.code AS customer_code, customers.name AS customer_name,
              salesmen.code AS salesman_code, salesmen.name AS salesman_name
       FROM sales
       INNER JOIN customers ON customers.id = sales.customer_id
       LEFT JOIN salesmen ON salesmen.id = sales.salesman_id
       WHERE sales.invoice_no = ?`
    )
    .get(invoiceNo);

  if (!existing) {
    return res.status(404).json({ message: "Sale not found" });
  }

  const existingItems = db
    .prepare(`SELECT * FROM sale_items WHERE sale_id = ?`)
    .all(existing.id);

  const previousByItem = new Map();
  for (const item of existingItems) {
    const quantity = Number(item.quantity || 0);
    const bonus = Number(item.bonus || 0);
    const current = previousByItem.get(item.item_id) || 0;
    previousByItem.set(item.item_id, current + quantity + bonus);
  }

  const {
    customerCode,
    salesmanCode,
    date,
    items = [],
    amountPaid,
    previousBalance,
    allowNegativeStock
  } = req.body;

  const negativeStockAllowed = Boolean(allowNegativeStock);

  if (!customerCode) {
    return res.status(400).json({ message: "Customer code is required" });
  }

  const customer = findByCode("customers", customerCode);
  if (!customer) {
    return res.status(400).json({ message: "Customer not found" });
  }

  const salesman = salesmanCode ? findByCode("salesmen", salesmanCode) : null;
  if (salesmanCode && !salesman) {
    return res.status(400).json({ message: "Salesman not found" });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: "At least one item is required" });
  }

  const itemInfos = [];
  const requiredByItem = new Map();
  const itemById = new Map();

  for (const entry of items) {
    const item = findByCode("items", entry.itemCode);
    if (!item) return res.status(400).json({ message: `Item not found: ${entry.itemCode}` });

    const quantity = Number(entry.quantity) || 0;
    const bonus = Number(entry.bonus) || 0;
    const discountPercent = Number(entry.discountPercent) || 0;
    const tradePrice = Number(entry.tradePrice ?? item.trade_rate);
    const rawTradeOff = Number(entry.tradeOffPrice);
    const hasExplicitTradeOff = entry.tradeOffPrice !== undefined && entry.tradeOffPrice !== "";
    const tradeOffPrice = Number.isFinite(rawTradeOff) && (hasExplicitTradeOff || rawTradeOff > 0)
      ? rawTradeOff
      : null;
    const taxPercent = Number(entry.taxPercent ?? item.sales_tax ?? 0) || 0;

    const requiredUnits = quantity + bonus;
    const currentRequired = requiredByItem.get(item.id) || 0;
    requiredByItem.set(item.id, currentRequired + requiredUnits);
    itemById.set(item.id, item);

    itemInfos.push({
      item,
      quantity,
      bonus,
      discountPercent,
      tradePrice,
      tradeOffPrice,
      taxPercent,
      companyName: entry.companyName || null
    });
  }

  const lowStockWarnings = [];

  for (const [itemId, requiredUnits] of requiredByItem.entries()) {
    const availableUnits = getAvailableUnits(db, itemId) + (previousByItem.get(itemId) || 0);
    const shortage = requiredUnits - availableUnits;
    if (!negativeStockAllowed && shortage > 1e-6) {
      const item = itemById.get(itemId);
      lowStockWarnings.push({
        itemCode: item?.code,
        itemName: item?.name,
        available: Number(availableUnits.toFixed(2)),
        required: Number(requiredUnits.toFixed(2)),
        shortage: Number(shortage.toFixed(2))
      });
    }
  }

  if (!negativeStockAllowed && lowStockWarnings.length > 0) {
    const summary =
      lowStockWarnings.length === 1
        ? `Insufficient stock for ${lowStockWarnings[0].itemCode}.`
        : `Insufficient stock for ${lowStockWarnings.length} items.`;
    return res.status(409).json({
      code: "LOW_STOCK",
      message: `${summary} Review quantities or confirm to proceed with negative stock.`,
      details: lowStockWarnings
    });
  }

  const storageDate = toStorageDate(date);
  if (!storageDate) {
    return res.status(400).json({ message: "Invalid date format" });
  }

  const timestamp = nowIso();
  const amountPaidNumber = Number(amountPaid) || 0;
  const previousBalanceNumber = Number(previousBalance) || 0;

  const transaction = db.transaction(() => {
    const updateSale = db.prepare(
      `UPDATE sales
       SET customer_id = ?, salesman_id = ?, invoice_date = ?, amount_paid = ?, previous_balance = ?, trade_off_total = ?, updated_at = ?
       WHERE id = ?`
    );
    updateSale.run(
      customer.id,
      salesman?.id || null,
      storageDate,
      amountPaidNumber,
      previousBalanceNumber,
      0,
      timestamp,
      existing.id
    );

    db.prepare(`DELETE FROM sale_items WHERE sale_id = ?`).run(existing.id);

    const insertItem = db.prepare(
      `INSERT INTO sale_items (sale_id, item_id, base_unit, quantity, bonus, trade_off_price, discount_percent, tax_percent, trade_price, company_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const companyNameCache = new Map();
    let totalAmount = 0;

    for (const info of itemInfos) {
      const { item, quantity, bonus, discountPercent, tradePrice, tradeOffPrice, taxPercent } = info;
      const effectiveRate = tradeOffPrice ?? tradePrice * (1 - discountPercent / 100);
      const baseAmount = quantity * effectiveRate;
      const taxAmount = baseAmount * (taxPercent / 100);
      const lineAmount = baseAmount + taxAmount;
      totalAmount += lineAmount;
      let companyName = info.companyName;
      if (!companyName) {
        if (!companyNameCache.has(item.company_id)) {
          const companyRow = db.prepare(`SELECT name FROM companies WHERE id = ?`).get(item.company_id);
          companyNameCache.set(item.company_id, companyRow?.name || null);
        }
        companyName = companyNameCache.get(item.company_id);
      }
      insertItem.run(
        existing.id,
        item.id,
        item.base_unit,
        quantity,
        bonus,
        tradeOffPrice ?? effectiveRate,
        discountPercent,
        taxPercent,
        tradePrice,
        companyName,
        timestamp,
        timestamp
      );
    }

    const tradeOff = Number((totalAmount - amountPaidNumber + previousBalanceNumber).toFixed(2));
    db.prepare(`UPDATE sales SET total_amount = ?, trade_off_total = ?, updated_at = ? WHERE id = ?`).run(
      totalAmount,
      tradeOff,
      timestamp,
      existing.id
    );
  });

  try {
    transaction();
    const updated = db
      .prepare(
        `SELECT sales.*, customers.code AS customer_code, customers.name AS customer_name,
                salesmen.code AS salesman_code, salesmen.name AS salesman_name
         FROM sales
         INNER JOIN customers ON customers.id = sales.customer_id
         LEFT JOIN salesmen ON salesmen.id = sales.salesman_id
         WHERE sales.invoice_no = ?`
      )
      .get(invoiceNo);
    const updatedItems = db.prepare(
      `SELECT sale_items.*, items.code AS item_code, items.name AS item_name, items.pack_size AS pack_size, items.retail_price AS retail_price
       FROM sale_items
       INNER JOIN items ON items.id = sale_items.item_id
       WHERE sale_items.sale_id = ?`
    ).all(updated.id);
    res.json({ sale: mapRowDates(updated), items: updatedItems });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.post("/api/sales/:invoiceNo/returns", (req, res) => {
  const db = getDb();
  const { invoiceNo } = req.params;
  const { saleItemId, quantity, date } = req.body;
  const sale = db.prepare(`SELECT * FROM sales WHERE invoice_no = ?`).get(invoiceNo);
  if (!sale) return res.status(404).json({ message: "Sale not found" });
  const saleItem = db.prepare(`SELECT * FROM sale_items WHERE id = ? AND sale_id = ?`).get(saleItemId, sale.id);
  if (!saleItem) return res.status(404).json({ message: "Sale item not found" });
  const numericQuantity = Number(quantity);
  if (!Number.isFinite(numericQuantity) || numericQuantity <= 0) {
    return res.status(400).json({ message: "Enter a quantity greater than zero" });
  }
  const soldUnits = Number(saleItem.quantity || 0) + Number(saleItem.bonus || 0);
  const saleReturnRow = db
    .prepare(`SELECT COALESCE(SUM(quantity), 0) AS total FROM sale_returns WHERE sale_item_id = ?`)
    .get(saleItem.id);
  const returnedSoFar = Number(saleReturnRow?.total || 0);
  const remainingUnits = soldUnits - returnedSoFar;
  if (remainingUnits <= 0) {
    return res.status(400).json({ message: "All units for this sale have already been returned." });
  }
  if (numericQuantity > remainingUnits) {
    return res.status(400).json({ message: `Only ${remainingUnits} unit(s) can be returned for this sale.` });
  }
  const storageDate = toStorageDate(date);
  if (!storageDate) return res.status(400).json({ message: "Invalid date format" });
  const timestamp = nowIso();

  try {
    const stmt = db.prepare(
      `INSERT INTO sale_returns (sale_id, sale_item_id, quantity, return_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    const info = stmt.run(sale.id, saleItem.id, numericQuantity, storageDate, timestamp, timestamp);
    const row = db.prepare(`SELECT * FROM sale_returns WHERE id = ?`).get(info.lastInsertRowid);
    res.status(201).json(mapRowDates(row));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.get("/api/sale-returns", (req, res) => {
  const db = getDb();
  const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);
  const rows = db
    .prepare(
      `SELECT sr.id,
              sr.quantity,
              sr.return_date,
              sr.created_at,
              sales.invoice_no,
              sales.invoice_date,
              customers.code AS customer_code,
              customers.name AS customer_name,
              items.code AS item_code,
              items.name AS item_name,
              sale_items.trade_price
       FROM sale_returns sr
       INNER JOIN sales ON sales.id = sr.sale_id
       INNER JOIN customers ON customers.id = sales.customer_id
       INNER JOIN sale_items ON sale_items.id = sr.sale_item_id
       INNER JOIN items ON items.id = sale_items.item_id
       ORDER BY sr.return_date DESC, sr.id DESC
       LIMIT @limit`
    )
    .all({ limit });

  const mapped = rows.map((row) => ({
    ...mapRowDates(row),
    quantity: Number(row.quantity || 0),
    trade_price: Number(row.trade_price || 0)
  }));

  res.json(mapped);
});

app.get("/api/sale-returns/:id", (req, res) => {
  const db = getDb();
  const { id } = req.params;
  const row = db
    .prepare(
      `SELECT sr.id,
              sr.sale_id,
              sr.sale_item_id,
              sr.quantity,
              sr.return_date,
              sr.created_at,
              sr.updated_at,
              sales.invoice_no,
              sales.invoice_date,
              customers.code AS customer_code,
              customers.name AS customer_name,
              items.code AS item_code,
              items.name AS item_name,
              items.id AS item_id,
              sale_items.trade_price
       FROM sale_returns sr
       INNER JOIN sales ON sales.id = sr.sale_id
       INNER JOIN customers ON customers.id = sales.customer_id
       INNER JOIN sale_items ON sale_items.id = sr.sale_item_id
       INNER JOIN items ON items.id = sale_items.item_id
       WHERE sr.id = ?`
    )
    .get(id);

  if (!row) return res.status(404).json({ message: "Return not found" });

  res.json({
    ...mapRowDates(row),
    quantity: Number(row.quantity || 0),
    trade_price: Number(row.trade_price || 0)
  });
});

app.put("/api/sale-returns/:id", (req, res) => {
  const db = getDb();
  const { id } = req.params;
  const { quantity, date } = req.body;

  const saleReturn = db.prepare(`SELECT * FROM sale_returns WHERE id = ?`).get(id);
  if (!saleReturn) return res.status(404).json({ message: "Return not found" });

  const numericQuantity = Number(quantity);
  if (!Number.isFinite(numericQuantity) || numericQuantity <= 0) {
    return res.status(400).json({ message: "Enter a quantity greater than zero" });
  }

  const saleItem = db.prepare(`SELECT * FROM sale_items WHERE id = ?`).get(saleReturn.sale_item_id);
  if (!saleItem) return res.status(400).json({ message: "Sale item not found" });

  const soldUnits = Number(saleItem.quantity || 0) + Number(saleItem.bonus || 0);
  const otherReturnsRow = db
    .prepare(
      `SELECT COALESCE(SUM(quantity), 0) AS total FROM sale_returns WHERE sale_item_id = ? AND id != ?`
    )
    .get(saleReturn.sale_item_id, id);
  const otherReturnsTotal = Number(otherReturnsRow?.total || 0);
  const maxAllowedQuantity = soldUnits - otherReturnsTotal;

  if (numericQuantity > maxAllowedQuantity) {
    return res.status(400).json({
      message: `Maximum quantity allowed is ${maxAllowedQuantity} (${soldUnits} sold - ${otherReturnsTotal} other returns)`
    });
  }

  const storageDate = toStorageDate(date);
  if (!storageDate) return res.status(400).json({ message: "Invalid date format" });

  const timestamp = nowIso();

  try {
    const stmt = db.prepare(
      `UPDATE sale_returns SET quantity = ?, return_date = ?, updated_at = ? WHERE id = ?`
    );
    stmt.run(numericQuantity, storageDate, timestamp, id);

    const updatedRow = db.prepare(`SELECT * FROM sale_returns WHERE id = ?`).get(id);
    res.json(mapRowDates(updatedRow));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.delete("/api/sale-returns/:id", (req, res) => {
  const db = getDb();
  const { id } = req.params;

  const saleReturn = db.prepare(`SELECT * FROM sale_returns WHERE id = ?`).get(id);
  if (!saleReturn) return res.status(404).json({ message: "Return not found" });

  try {
    const stmt = db.prepare(`DELETE FROM sale_returns WHERE id = ?`);
    stmt.run(id);
    res.json({ message: "Return deleted successfully", id });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.post("/api/purchases/:invoiceNo/returns", (req, res) => {
  const db = getDb();
  const { invoiceNo } = req.params;
  const { purchaseItemId, quantity, date } = req.body;
  const purchase = db.prepare(`SELECT * FROM purchases WHERE invoice_no = ?`).get(invoiceNo);
  if (!purchase) return res.status(404).json({ message: "Purchase not found" });
  const purchaseItem = db.prepare(`SELECT * FROM purchase_items WHERE id = ? AND purchase_id = ?`).get(purchaseItemId, purchase.id);
  if (!purchaseItem) return res.status(404).json({ message: "Purchase item not found" });
  const numericQuantity = Number(quantity);
  if (!Number.isFinite(numericQuantity) || numericQuantity <= 0) {
    return res.status(400).json({ message: "Enter a quantity greater than zero" });
  }
  const purchasedUnits = Number(purchaseItem.quantity || 0) + Number(purchaseItem.bonus || 0);
  const purchaseReturnRow = db
    .prepare(`SELECT COALESCE(SUM(quantity), 0) AS total FROM purchase_returns WHERE purchase_item_id = ?`)
    .get(purchaseItem.id);
  const returnedSoFar = Number(purchaseReturnRow?.total || 0);
  const remainingUnits = purchasedUnits - returnedSoFar;
  if (remainingUnits <= 0) {
    return res.status(400).json({ message: "All units have already been returned for this item." });
  }
  if (numericQuantity > remainingUnits) {
    return res.status(400).json({ message: `Only ${remainingUnits} unit(s) can be returned for this item.` });
  }
  const storageDate = toStorageDate(date);
  if (!storageDate) return res.status(400).json({ message: "Invalid date format" });
  const timestamp = nowIso();
  const returnNo = nextPurchaseReturnNo(db);

  try {
    const stmt = db.prepare(
      `INSERT INTO purchase_returns (return_no, purchase_id, purchase_item_id, quantity, return_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    const info = stmt.run(
      returnNo,
      purchase.id,
      purchaseItem.id,
      numericQuantity,
      storageDate,
      timestamp,
      timestamp
    );

    const inserted = db
      .prepare(
        `SELECT pr.*, purchases.invoice_no, suppliers.code AS supplier_code, suppliers.name AS supplier_name,
                purchase_items.base_unit, purchase_items.discount_percent, purchase_items.purchase_rate,
                items.code AS item_code, items.name AS item_name
         FROM purchase_returns pr
         INNER JOIN purchases ON purchases.id = pr.purchase_id
         INNER JOIN suppliers ON suppliers.id = purchases.supplier_id
         INNER JOIN purchase_items ON purchase_items.id = pr.purchase_item_id
         INNER JOIN items ON items.id = purchase_items.item_id
         WHERE pr.id = ?`
      )
      .get(info.lastInsertRowid);

    res.status(201).json(mapRowDates(inserted));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.get("/api/purchase-returns", (req, res) => {
  const db = getDb();
  const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);
  const rows = db
    .prepare(
            `SELECT pr.id,
              pr.return_no,
              pr.quantity,
              pr.return_date,
              pr.created_at,
              purchases.invoice_no,
              purchases.invoice_date,
              suppliers.code AS supplier_code,
              suppliers.name AS supplier_name,
              items.code AS item_code,
              items.name AS item_name,
              purchase_items.purchase_rate,
              purchase_items.base_unit
       FROM purchase_returns pr
       INNER JOIN purchases ON purchases.id = pr.purchase_id
       INNER JOIN suppliers ON suppliers.id = purchases.supplier_id
       INNER JOIN purchase_items ON purchase_items.id = pr.purchase_item_id
       INNER JOIN items ON items.id = purchase_items.item_id
       ORDER BY pr.return_date DESC, pr.id DESC
       LIMIT @limit`
    )
    .all({ limit });

  const mapped = rows.map((row) => ({
    ...mapRowDates(row),
    quantity: Number(row.quantity || 0),
    purchase_rate: Number(row.purchase_rate || 0)
  }));

  res.json(mapped);
});

app.get("/api/purchases/:invoiceNo", (req, res) => {
  const data = fetchPurchaseWithItems(req.params.invoiceNo);
  if (!data) return res.status(404).json({ message: "Purchase not found" });
  res.json(data);
});

app.put("/api/purchases/:invoiceNo", (req, res) => {
  const db = getDb();
  const { invoiceNo } = req.params;
  const existing = db.prepare(`SELECT * FROM purchases WHERE invoice_no = ?`).get(invoiceNo);
  if (!existing) return res.status(404).json({ message: "Purchase not found" });

  const {
    supplierCode,
    lastInvoice,
    date,
    items = [],
    amountPaid,
    previousBalance
  } = req.body;

  if (!supplierCode) {
    return res.status(400).json({ message: "Supplier code is required." });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: "At least one item is required." });
  }

  const supplier = findByCode("suppliers", supplierCode);
  if (!supplier) return res.status(400).json({ message: "Supplier not found" });

  const storageDate = toStorageDate(date);
  if (!storageDate) return res.status(400).json({ message: "Invalid date format" });

  const timestamp = nowIso();
  const transaction = db.transaction(() => {
    db.prepare(
      `UPDATE purchases SET supplier_id = ?, last_invoice = ?, invoice_date = ?, amount_paid = ?, previous_balance = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      supplier.id,
      lastInvoice || null,
      storageDate,
      amountPaid ?? 0,
      previousBalance ?? 0,
      timestamp,
      existing.id
    );

    db.prepare(`DELETE FROM purchase_items WHERE purchase_id = ?`).run(existing.id);

    let totalAmount = 0;
    const insertItem = db.prepare(
      `INSERT INTO purchase_items (purchase_id, item_id, quantity, base_unit, bonus, discount_percent, purchase_rate, net_amount, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const entry of items) {
      const item = findByCode("items", entry.itemCode);
      if (!item) throw new Error(`Item not found: ${entry.itemCode}`);
      const quantity = Number(entry.quantity) || 0;
      const bonus = Number(entry.bonus) || 0;
      const discountPercent = Number(entry.discountPercent) || 0;
      const rate = Number(entry.purchaseRate ?? item.purchase_rate);
      const net = (quantity + bonus) * rate * (1 - discountPercent / 100);
      totalAmount += net;
      insertItem.run(
        existing.id,
        item.id,
        quantity,
        item.base_unit,
        bonus,
        discountPercent,
        rate,
        net,
        timestamp,
        timestamp
      );
    }

    db.prepare(`UPDATE purchases SET total_amount = ?, updated_at = ? WHERE id = ?`).run(
      totalAmount,
      timestamp,
      existing.id
    );
  });

  try {
    transaction();
    const data = fetchPurchaseWithItems(invoiceNo);
    res.json(data);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Cancel Purchase Invoice
app.post("/api/purchases/:invoiceNo/cancel", (req, res) => {
  const db = getDb();
  const { invoiceNo } = req.params;
  
  const purchase = db.prepare("SELECT * FROM purchases WHERE invoice_no = ?").get(invoiceNo);
  if (!purchase) {
    return res.status(404).json({ message: "Purchase invoice not found" });
  }

  if (purchase.is_cancelled === 1) {
    return res.status(400).json({ message: "Invoice is already canceled" });
  }

  try {
    const timestamp = nowIso();
    db.prepare("UPDATE purchases SET is_cancelled = 1, updated_at = ? WHERE id = ?").run(timestamp, purchase.id);
    res.json({ message: "Purchase invoice canceled successfully", invoice_no: invoiceNo });
  } catch (error) {
    res.status(500).json({ message: "Failed to cancel invoice", error: error.message });
  }
});

// Cancel Sales Invoice
app.post("/api/sales/:invoiceNo/cancel", (req, res) => {
  const db = getDb();
  const { invoiceNo } = req.params;
  
  const sale = db.prepare("SELECT * FROM sales WHERE invoice_no = ?").get(invoiceNo);
  if (!sale) {
    return res.status(404).json({ message: "Sales invoice not found" });
  }

  if (sale.is_cancelled === 1) {
    return res.status(400).json({ message: "Invoice is already canceled" });
  }

  try {
    const timestamp = nowIso();
    db.prepare("UPDATE sales SET is_cancelled = 1, updated_at = ? WHERE id = ?").run(timestamp, sale.id);
    res.json({ message: "Sales invoice canceled successfully", invoice_no: invoiceNo });
  } catch (error) {
    res.status(500).json({ message: "Failed to cancel invoice", error: error.message });
  }
});

app.get("/api/expense-entries", (req, res) => {
  const db = getDb();
  const { search = "", limit = 50, offset = 0 } = req.query;
  const params = {
    limit: Number(limit),
    offset: Number(offset)
  };
  const trimmed = search.trim();
  let whereClause = "";
  if (trimmed) {
    params.search = `%${trimmed}%`;
    whereClause =
      "WHERE expense_entries.voucher_no LIKE @search " +
      "OR expense_entries.expense_code LIKE @search " +
      "OR expense_definitions.description LIKE @search";
  }

  const rows = db
    .prepare(
      `SELECT expense_entries.*, expense_definitions.description AS expense_description
       FROM expense_entries
       LEFT JOIN expense_definitions ON expense_definitions.code = expense_entries.expense_code
       ${whereClause}
       ORDER BY expense_entries.voucher_date DESC, expense_entries.id DESC
       LIMIT @limit OFFSET @offset`
    )
    .all(params);

  res.json(
    rows.map((row) => ({
      ...mapRowDates(row),
      cash_payment: Number(row.cash_payment ?? 0),
      expense_description: row.expense_description
    }))
  );
});

app.get("/api/expense-entries/:voucherNo", (req, res) => {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT expense_entries.*, expense_definitions.description AS expense_description
       FROM expense_entries
       LEFT JOIN expense_definitions ON expense_definitions.code = expense_entries.expense_code
       WHERE expense_entries.voucher_no = ?`
    )
    .get(req.params.voucherNo);

  if (!row) {
    return res.status(404).json({ message: "Expense entry not found" });
  }

  res.json({
    ...mapRowDates(row),
    cash_payment: Number(row.cash_payment ?? 0),
    expense_description: row.expense_description
  });
});

app.post("/api/expense-entries", (req, res) => {
  const db = getDb();
  const { expenseCode, voucherDate, cashPayment, details } = req.body;
  const def = findByCode("expense_definitions", expenseCode);
  if (!def) return res.status(400).json({ message: "Expense code not found" });
  const storageDate = toStorageDate(voucherDate);
  if (!storageDate) return res.status(400).json({ message: "Invalid date format" });
  const timestamp = nowIso();
  const voucherRow = db.prepare(`SELECT voucher_no FROM expense_entries ORDER BY id DESC LIMIT 1`).get();
  const lastVoucher = (voucherRow?.voucher_no || "").replace(/\D/g, "") || "000000";
  const voucherNo = formatInvoiceNumber("EX", lastVoucher);
  try {
    const stmt = db.prepare(
      `INSERT INTO expense_entries (expense_code, voucher_no, voucher_date, cash_payment, details, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    const info = stmt.run(expenseCode, voucherNo, storageDate, cashPayment ?? 0, details || null, timestamp, timestamp);
    const row = db.prepare(`SELECT * FROM expense_entries WHERE id = ?`).get(info.lastInsertRowid);
    res.status(201).json({ ...mapRowDates(row), voucher_no: voucherNo });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.put("/api/expense-entries/:voucherNo", (req, res) => {
  const db = getDb();
  const { expenseCode, voucherDate, cashPayment, details } = req.body;
  const existing = db
    .prepare(`SELECT * FROM expense_entries WHERE voucher_no = ?`)
    .get(req.params.voucherNo);

  if (!existing) {
    return res.status(404).json({ message: "Expense entry not found" });
  }

  if (!expenseCode) {
    return res.status(400).json({ message: "Expense code is required" });
  }

  const def = findByCode("expense_definitions", expenseCode);
  if (!def) {
    return res.status(400).json({ message: "Expense code not found" });
  }

  const storageDate = toStorageDate(voucherDate);
  if (!storageDate) {
    return res.status(400).json({ message: "Invalid date format" });
  }

  const timestamp = nowIso();

  try {
    db.prepare(
      `UPDATE expense_entries
       SET expense_code = ?, voucher_date = ?, cash_payment = ?, details = ?, updated_at = ?
       WHERE voucher_no = ?`
    ).run(expenseCode, storageDate, Number(cashPayment ?? 0), details || null, timestamp, req.params.voucherNo);

    const row = db
      .prepare(
        `SELECT expense_entries.*, expense_definitions.description AS expense_description
         FROM expense_entries
         LEFT JOIN expense_definitions ON expense_definitions.code = expense_entries.expense_code
         WHERE expense_entries.voucher_no = ?`
      )
      .get(req.params.voucherNo);

    res.json({
      ...mapRowDates(row),
      cash_payment: Number(row.cash_payment ?? 0),
      expense_description: row.expense_description
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.get("/api/salesman-bonuses", (req, res) => {
  const db = getDb();
  const { salesmanCode, startDate, endDate, limit = 50, offset = 0 } = req.query;
  const params = {
    limit: Number(limit),
    offset: Number(offset)
  };
  const whereClauses = [];

  if (salesmanCode) {
    const salesman = findByCode("salesmen", salesmanCode);
    if (!salesman) {
      return res.status(404).json({ message: "Salesman not found" });
    }
    params.salesmanId = salesman.id;
    whereClauses.push("sb.salesman_id = @salesmanId");
  }

  if (startDate || endDate) {
    if (!startDate || !endDate) {
      return res.status(400).json({ message: "Start date and end date are required." });
    }
    const storageStart = toStorageDate(startDate);
    const storageEnd = toStorageDate(endDate);
    if (!storageStart || !storageEnd) {
      return res.status(400).json({ message: "Invalid date format." });
    }
    params.startDate = storageStart;
    params.endDate = storageEnd;
    whereClauses.push("sb.start_date >= @startDate AND sb.end_date <= @endDate");
  }

  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";
  const rows = db
    .prepare(
      `SELECT sb.*, s.code AS salesman_code, s.name AS salesman_name,
              (SELECT COALESCE(SUM(total_amount), 0)
               FROM sales
               WHERE salesman_id = sb.salesman_id) AS achieved_sales
       FROM salesman_bonuses sb
       LEFT JOIN salesmen s ON s.id = sb.salesman_id
       ${whereSql}
       ORDER BY sb.start_date DESC, sb.id DESC
       LIMIT @limit OFFSET @offset`
    )
    .all(params);

  const round = (value) => Number((Number(value ?? 0)).toFixed(2));

  res.json(
    rows.map((row) => {
      const totalSales = round(row.achieved_sales);
      const targetAmount = round(row.target_amount);
      const bonusPercent = round(row.bonus_percent);
      const targetMet = targetAmount > 0 ? totalSales >= targetAmount : false;
      const bonusEarned = targetMet ? round(totalSales * (bonusPercent / 100)) : 0;

      return {
        id: row.id,
        voucher_no: row.voucher_no,
        salesman_code: row.salesman_code,
        salesman_name: row.salesman_name,
        start_date: toDisplayDate(row.start_date),
        end_date: toDisplayDate(row.end_date),
        target_amount: targetAmount,
        bonus_amount: totalSales,
        bonus_percent: bonusPercent,
        achieved_sales: totalSales,
        target_met: targetMet,
        bonus_earned: bonusEarned,
        notes: row.notes || null,
        created_at: row.created_at,
        updated_at: row.updated_at
      };
    })
  );
});

app.post("/api/salesman-bonuses", (req, res) => {
  const db = getDb();
  const { salesmanCode, startDate, endDate, targetAmount, bonusPercent, notes } = req.body;

  if (!salesmanCode) {
    return res.status(400).json({ message: "Salesman code is required" });
  }

  const salesman = findByCode("salesmen", salesmanCode);
  if (!salesman) {
    return res.status(404).json({ message: "Salesman not found" });
  }

  if (!startDate || !endDate) {
    return res.status(400).json({ message: "Start date and end date are required." });
  }

  const storageStart = toStorageDate(startDate);
  const storageEnd = toStorageDate(endDate);
  if (!storageStart || !storageEnd) {
    return res.status(400).json({ message: "Invalid date format." });
  }

  if (storageStart > storageEnd) {
    return res.status(400).json({ message: "Start date must be on or before end date." });
  }

  const target = Number(targetAmount ?? 0);
  if (!Number.isFinite(target) || target <= 0) {
    return res.status(400).json({ message: "Target amount must be greater than zero." });
  }

  const bonusPct = Number(bonusPercent ?? 0);
  if (!Number.isFinite(bonusPct) || bonusPct < 0) {
    return res.status(400).json({ message: "Bonus percent must be zero or greater." });
  }
  if (bonusPct <= 0) {
    return res.status(400).json({ message: "Bonus percent must be greater than zero." });
  }

  const timestamp = nowIso();
  const voucherRow = db.prepare(`SELECT voucher_no FROM salesman_bonuses ORDER BY id DESC LIMIT 1`).get();
  const lastVoucher = voucherRow?.voucher_no?.replace(/^SB/, "") || "000000";
  const voucherNo = formatInvoiceNumber("SB", lastVoucher);

  try {
    const achievedRow = db
      .prepare(
        `SELECT COALESCE(SUM(total_amount), 0) AS total
         FROM sales
         WHERE salesman_id = ?`
      )
      .get(salesman.id);
    const achievedSales = Number(achievedRow?.total ?? 0);

    const stmt = db.prepare(
      `INSERT INTO salesman_bonuses (voucher_no, salesman_id, start_date, end_date, target_amount, bonus_amount, bonus_percent, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const info = stmt.run(
      voucherNo,
      salesman.id,
      storageStart,
      storageEnd,
      target,
      achievedSales,
      bonusPct,
      notes || null,
      timestamp,
      timestamp
    );

    const row = db
      .prepare(
        `SELECT sb.*, s.code AS salesman_code, s.name AS salesman_name,
                (SELECT COALESCE(SUM(total_amount), 0)
                 FROM sales
                 WHERE salesman_id = sb.salesman_id
                   AND invoice_date >= sb.start_date
                   AND invoice_date <= sb.end_date) AS achieved_sales
         FROM salesman_bonuses sb
         LEFT JOIN salesmen s ON s.id = sb.salesman_id
         WHERE sb.id = ?`
      )
      .get(info.lastInsertRowid);

    const round = (value) => Number((Number(value ?? 0)).toFixed(2));
    const totalSales = round(row.achieved_sales);
    const targetAmountValue = round(row.target_amount);
    const bonusPercentValue = round(row.bonus_percent);
    const targetMet = targetAmountValue > 0 ? totalSales >= targetAmountValue : false;
    const bonusEarned = targetMet ? round(totalSales * (bonusPercentValue / 100)) : 0;

    res.status(201).json({
      id: row.id,
      voucher_no: row.voucher_no,
      salesman_code: row.salesman_code,
      salesman_name: row.salesman_name,
      start_date: toDisplayDate(row.start_date),
      end_date: toDisplayDate(row.end_date),
      target_amount: targetAmountValue,
      bonus_amount: totalSales,
      bonus_percent: bonusPercentValue,
      achieved_sales: totalSales,
      target_met: targetMet,
      bonus_earned: bonusEarned,
      notes: row.notes || null,
      created_at: row.created_at,
      updated_at: row.updated_at
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.post("/api/customer-receipts", (req, res) => {
  const db = getDb();
  try {
    const receipt = createCustomerReceiptRecord(db, req.body);
    res.status(201).json(receipt);
  } catch (error) {
    const status = error?.statusCode || 400;
    res.status(status).json({ message: error?.message || "Failed to create receipt." });
  }
});

app.get("/api/customer-receipts/:reference", (req, res) => {
  const db = getDb();
  const reference = req.params.reference;
  const row = findCustomerReceiptRow(db, reference);
  if (!row) {
    return res.status(404).json({ message: "Customer receipt not found." });
  }
  res.json(mapCustomerReceiptDetail(row));
});

app.put("/api/customer-receipts/:reference", (req, res) => {
  const db = getDb();
  const reference = req.params.reference;
  const existingRow = findCustomerReceiptRow(db, reference);
  if (!existingRow) {
    return res.status(404).json({ message: "Customer receipt not found." });
  }

  const existing = mapCustomerReceiptDetail(existingRow);
  const {
    receiptDate = existing.receiptDate,
    amount,
    details,
    paymentMode = existing.paymentMode,
    bankCode,
    slipNo,
    slipDate,
    salesmanCode,
    attachmentImage
  } = req.body;

  const storageDate = toStorageDate(receiptDate);
  if (!storageDate) {
    return res.status(400).json({ message: "Invalid date format." });
  }

  const numericAmount = Number(amount ?? existing.amount ?? 0);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ message: "Amount must be greater than zero." });
  }

  const normalizedMode = String(paymentMode || "cash").toLowerCase();
  if (!["cash", "online", "bank"].includes(normalizedMode)) {
    return res.status(400).json({ message: "Invalid payment mode." });
  }

  const trimmedDetails = typeof details === "string" ? details.trim() : "";
  const trimmedSlipNo = typeof slipNo === "string" ? slipNo.trim() : "";

  let bankId = null;
  let storageSlipDate = null;
  let bankRow = null;

  if (normalizedMode !== "cash") {
    const resolvedBankCode = (bankCode || existing.bank?.code || "").trim();
    if (!resolvedBankCode) {
      return res.status(400).json({ message: "Bank code is required for this payment mode." });
    }
    bankRow = findByCode("banks", resolvedBankCode);
    if (!bankRow) {
      return res.status(400).json({ message: "Bank not found." });
    }
    bankId = bankRow.id;

    if (normalizedMode === "online") {
      if (!trimmedSlipNo) {
        return res.status(400).json({ message: "Transaction reference is required for online receipts." });
      }
      if (slipDate) {
        const maybeDate = toStorageDate(slipDate);
        if (!maybeDate) {
          return res.status(400).json({ message: "Invalid slip date." });
        }
        storageSlipDate = maybeDate;
      }
      if (!storageSlipDate) {
        storageSlipDate = storageDate;
      }
    }

    if (normalizedMode === "bank") {
      storageSlipDate = toStorageDate(slipDate);
      if (!storageSlipDate) {
        return res.status(400).json({ message: "Valid slip date is required for bank transactions." });
      }
    }
  }

  const timestamp = nowIso();
  const previousBankId = existingRow.bank_id || null;
  const existingBankTransactionId = existingRow.bank_transaction_id || null;

  let salesmanId = null;
  if (salesmanCode) {
    const salesman = findByCode("salesmen", salesmanCode);
    if (!salesman) {
      return res.status(400).json({ message: "Salesman not found." });
    }
    salesmanId = salesman.id;
  } else if (existingRow.salesman_id) {
    salesmanId = existingRow.salesman_id;
  }

  try {
    const runUpdate = db.transaction(() => {
      db.prepare(
        `UPDATE customer_receipts
         SET receipt_date = ?, amount = ?, details = ?, payment_mode = ?, bank_id = ?, slip_no = ?, slip_date = ?, salesman_id = ?, attachment_image = ?, updated_at = ?
         WHERE id = ?`
      ).run(
        storageDate,
        numericAmount,
        trimmedDetails || null,
        normalizedMode,
        bankId,
        normalizedMode === "cash" ? null : trimmedSlipNo || null,
        normalizedMode === "cash" ? null : (storageSlipDate || storageDate),
        salesmanId,
        attachmentImage || null,
        timestamp,
        existingRow.id
      );

      let bankTransaction = null;
      let totals = null;
      let previousTotals = null;

      if (normalizedMode === "cash") {
        if (existingBankTransactionId) {
          db.prepare(`DELETE FROM bank_transactions WHERE id = ?`).run(existingBankTransactionId);
          if (previousBankId) {
            totals = computeBankTotals(db, previousBankId);
          }
        }
      } else if (bankId) {
        const effectiveSlipDate = storageSlipDate || storageDate;
        if (existingBankTransactionId) {
          db.prepare(
            `UPDATE bank_transactions
             SET bank_id = ?, slip_no = ?, slip_date = ?, cash_amount = ?, updated_at = ?
             WHERE id = ?`
          ).run(
            bankId,
            trimmedSlipNo || null,
            effectiveSlipDate,
            numericAmount,
            timestamp,
            existingBankTransactionId
          );
          bankTransaction = fetchBankTransactionById(db, existingBankTransactionId);
          totals = computeBankTotals(db, bankId);
          if (bankId !== previousBankId && previousBankId) {
            previousTotals = computeBankTotals(db, previousBankId);
          }
        } else {
          const entryNo = nextBankTransactionEntryNo(db);
          const info = db
            .prepare(
              `INSERT INTO bank_transactions (transaction_type, bank_id, slip_no, slip_date, cash_amount, entry_no, customer_receipt_id, created_at, updated_at)
               VALUES ('deposit', ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .run(
              bankId,
              trimmedSlipNo || null,
              effectiveSlipDate,
              numericAmount,
              entryNo,
              existingRow.id,
              timestamp,
              timestamp
            );
          bankTransaction = fetchBankTransactionById(db, info.lastInsertRowid);
          totals = computeBankTotals(db, bankId);
          if (previousBankId && previousBankId !== bankId) {
            previousTotals = computeBankTotals(db, previousBankId);
          }
        }
      }

      const updatedRow = fetchCustomerReceiptById(db, existingRow.id);
      return {
        updatedRow,
        bankTransaction,
        totals,
        previousTotals
      };
    });

    const { updatedRow, bankTransaction, totals, previousTotals } = runUpdate();
    res.json({
      receipt: mapCustomerReceiptDetail(updatedRow),
      bankTransaction: bankTransaction ? mapBankTransactionDetail(bankTransaction) : null,
      totals,
      previousTotals
    });
  } catch (error) {
    res.status(400).json({ message: error.message || "Failed to update customer receipt." });
  }
});

app.post("/api/supplier-payments", (req, res) => {
  const db = getDb();
  const {
    supplierCode,
    paymentDate,
    amount,
    details,
    paymentMode = "cash",
    bankCode,
    slipNo,
    slipDate,
    attachmentImage
  } = req.body;

  if (!supplierCode) {
    return res.status(400).json({ message: "Supplier code is required" });
  }

  const supplier = findByCode("suppliers", supplierCode);
  if (!supplier) {
    return res.status(400).json({ message: "Supplier not found" });
  }

  const storageDate = toStorageDate(paymentDate);
  if (!storageDate) {
    return res.status(400).json({ message: "Invalid date format" });
  }

  const numericAmount = Number(amount ?? 0);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ message: "Amount must be greater than zero" });
  }

  const before = computeSupplierPayable(db, supplier.id);
  if (before.payable <= 0) {
    return res.status(400).json({ message: "Supplier has no outstanding payable." });
  }

  if (numericAmount - before.payable > 0.01) {
    return res.status(400).json({ message: "Amount exceeds outstanding payable." });
  }

  const normalizedMode = (paymentMode || "cash").toLowerCase();
  if (!["cash", "online", "bank"].includes(normalizedMode)) {
    return res.status(400).json({ message: "Invalid payment mode" });
  }

  const cleanedDetails = typeof details === "string" ? details.trim() : "";
  const trimmedSlipNo = typeof slipNo === "string" ? slipNo.trim() : "";

  let bankId = null;
  let storageSlipDate = null;

  if (normalizedMode !== "cash") {
    if (!bankCode) {
      return res.status(400).json({ message: "Bank code is required for this payment mode" });
    }
    const bank = findByCode("banks", bankCode);
    if (!bank) {
      return res.status(400).json({ message: "Bank not found" });
    }
    bankId = bank.id;

    if (normalizedMode === "online") {
      if (!trimmedSlipNo) {
        return res.status(400).json({ message: "Transaction ID is required for online payments" });
      }
      if (slipDate) {
        const maybeDate = toStorageDate(slipDate);
        if (!maybeDate) {
          return res.status(400).json({ message: "Invalid slip date" });
        }
        storageSlipDate = maybeDate;
      }
      if (!storageSlipDate) {
        storageSlipDate = storageDate;
      }
    }

    if (normalizedMode === "bank") {
      storageSlipDate = toStorageDate(slipDate);
      if (!storageSlipDate) {
        return res.status(400).json({ message: "Valid slip date is required for bank payments" });
      }
    }
  }

  const timestamp = nowIso();
  const row = db.prepare(`SELECT payment_no FROM supplier_payments ORDER BY id DESC LIMIT 1`).get();
  const lastPaymentNumber = row?.payment_no?.replace(/^SP/, "") || "000000";
  const paymentNo = formatInvoiceNumber("SP", lastPaymentNumber);

  try {
    const insertPayment = db.transaction(() => {
      const stmt = db.prepare(
        `INSERT INTO supplier_payments (payment_no, supplier_id, payment_date, amount, details, payment_mode, bank_id, slip_no, slip_date, attachment_image, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      const info = stmt.run(
        paymentNo,
        supplier.id,
        storageDate,
        numericAmount,
        cleanedDetails || null,
        normalizedMode,
        bankId,
        trimmedSlipNo || null,
        storageSlipDate,
        attachmentImage || null,
        timestamp,
        timestamp
      );

      if (normalizedMode !== "cash" && bankId) {
        const drawingSlipDate = storageSlipDate || storageDate;
        const entryNo = nextBankTransactionEntryNo(db);
        db.prepare(
          `INSERT INTO bank_transactions (transaction_type, bank_id, slip_no, slip_date, cash_amount, entry_no, supplier_payment_id, created_at, updated_at)
           VALUES ('drawing', ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          bankId,
          trimmedSlipNo || null,
          drawingSlipDate,
          numericAmount,
          entryNo,
          info.lastInsertRowid,
          timestamp,
          timestamp
        );
      }

      return info.lastInsertRowid;
    });

    const paymentId = insertPayment();

    const inserted = db
      .prepare(
        `SELECT sp.*, suppliers.code AS supplier_code, suppliers.name AS supplier_name,
                banks.code AS bank_code, banks.name AS bank_name
         FROM supplier_payments sp
         INNER JOIN suppliers ON suppliers.id = sp.supplier_id
         LEFT JOIN banks ON banks.id = sp.bank_id
         WHERE sp.id = ?`
      )
      .get(paymentId);

    const after = computeSupplierPayable(db, supplier.id);

    res.status(201).json({
      payment: {
        ...mapRowDates(inserted),
        amount: Number(inserted.amount ?? 0),
        supplier_code: inserted.supplier_code,
        supplier_name: inserted.supplier_name,
        payment_no: paymentNo,
        payment_mode: inserted.payment_mode,
        bank_code: inserted.bank_code,
        bank_name: inserted.bank_name
      },
      payableBefore: before.payable,
      payableAfter: after.payable,
      receivableBefore: before.receivable,
      receivableAfter: after.receivable,
      netBefore: before.net,
      netAfter: after.net
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.get("/api/supplier-payments/:reference", (req, res) => {
  const db = getDb();
  const reference = req.params.reference;
  const row = findSupplierPaymentRow(db, reference);
  if (!row) {
    return res.status(404).json({ message: "Supplier payment not found." });
  }
  const detail = mapSupplierPaymentDetail(row);
  const payableSnapshot = detail.supplier?.id ? computeSupplierPayable(db, detail.supplier.id) : null;
  res.json({
    payment: detail,
    payable: payableSnapshot
  });
});

app.put("/api/supplier-payments/:reference", (req, res) => {
  const db = getDb();
  const reference = req.params.reference;
  const existingRow = findSupplierPaymentRow(db, reference);
  if (!existingRow) {
    return res.status(404).json({ message: "Supplier payment not found." });
  }

  const existing = mapSupplierPaymentDetail(existingRow);
  const supplierId = existing.supplier?.id;
  if (!supplierId) {
    return res.status(400).json({ message: "Supplier is missing for this payment." });
  }

  const {
    paymentDate = existing.paymentDate,
    amount,
    details,
    paymentMode = existing.paymentMode,
    bankCode,
    slipNo,
    slipDate
  } = req.body;

  const storageDate = toStorageDate(paymentDate);
  if (!storageDate) {
    return res.status(400).json({ message: "Invalid date format." });
  }

  const numericAmount = Number(amount ?? existing.amount ?? 0);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ message: "Amount must be greater than zero." });
  }

  const payableSnapshot = computeSupplierPayable(db, supplierId);
  const originalAmount = Number(existing.amount ?? 0);
  const maxPayable = payableSnapshot.payable + originalAmount;
  if (numericAmount - maxPayable > 0.01) {
    return res.status(400).json({ message: "Amount exceeds outstanding payable." });
  }

  const normalizedMode = String(paymentMode || "cash").toLowerCase();
  if (!["cash", "online", "bank"].includes(normalizedMode)) {
    return res.status(400).json({ message: "Invalid payment mode." });
  }

  const trimmedDetails = typeof details === "string" ? details.trim() : "";
  const trimmedSlipNo = typeof slipNo === "string" ? slipNo.trim() : "";

  let bankId = null;
  let storageSlipDate = null;
  let bankRow = null;

  if (normalizedMode !== "cash") {
    const resolvedBankCode = (bankCode || existing.bank?.code || "").trim();
    if (!resolvedBankCode) {
      return res.status(400).json({ message: "Bank code is required for this payment mode." });
    }
    bankRow = findByCode("banks", resolvedBankCode);
    if (!bankRow) {
      return res.status(400).json({ message: "Bank not found." });
    }
    bankId = bankRow.id;

    if (normalizedMode === "online") {
      if (!trimmedSlipNo) {
        return res.status(400).json({ message: "Transaction reference is required for online payments." });
      }
      if (slipDate) {
        const maybeDate = toStorageDate(slipDate);
        if (!maybeDate) {
          return res.status(400).json({ message: "Invalid slip date." });
        }
        storageSlipDate = maybeDate;
      }
      if (!storageSlipDate) {
        storageSlipDate = storageDate;
      }
    }

    if (normalizedMode === "bank") {
      storageSlipDate = toStorageDate(slipDate);
      if (!storageSlipDate) {
        return res.status(400).json({ message: "Valid slip date is required for bank payments." });
      }
    }
  }

  const timestamp = nowIso();
  const previousBankId = existingRow.bank_id || null;
  const existingBankTransactionId = existingRow.bank_transaction_id || null;

  try {
    const runUpdate = db.transaction(() => {
      db.prepare(
        `UPDATE supplier_payments
         SET payment_date = ?, amount = ?, details = ?, payment_mode = ?, bank_id = ?, slip_no = ?, slip_date = ?, updated_at = ?
         WHERE id = ?`
      ).run(
        storageDate,
        numericAmount,
        trimmedDetails || null,
        normalizedMode,
        bankId,
        normalizedMode === "cash" ? null : trimmedSlipNo || null,
        normalizedMode === "cash" ? null : (storageSlipDate || storageDate),
        timestamp,
        existingRow.id
      );

      let bankTransaction = null;
      let totals = null;
      let previousTotals = null;

      if (normalizedMode === "cash") {
        if (existingBankTransactionId) {
          db.prepare(`DELETE FROM bank_transactions WHERE id = ?`).run(existingBankTransactionId);
          if (previousBankId) {
            totals = computeBankTotals(db, previousBankId);
          }
        }
      } else if (bankId) {
        const effectiveSlipDate = storageSlipDate || storageDate;
        if (existingBankTransactionId) {
          db.prepare(
            `UPDATE bank_transactions
             SET bank_id = ?, slip_no = ?, slip_date = ?, cash_amount = ?, updated_at = ?
             WHERE id = ?`
          ).run(
            bankId,
            trimmedSlipNo || null,
            effectiveSlipDate,
            numericAmount,
            timestamp,
            existingBankTransactionId
          );
          bankTransaction = fetchBankTransactionById(db, existingBankTransactionId);
          totals = computeBankTotals(db, bankId);
          if (bankId !== previousBankId && previousBankId) {
            previousTotals = computeBankTotals(db, previousBankId);
          }
        } else {
          const entryNo = nextBankTransactionEntryNo(db);
          const info = db
            .prepare(
              `INSERT INTO bank_transactions (transaction_type, bank_id, slip_no, slip_date, cash_amount, entry_no, supplier_payment_id, created_at, updated_at)
               VALUES ('drawing', ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .run(
              bankId,
              trimmedSlipNo || null,
              effectiveSlipDate,
              numericAmount,
              entryNo,
              existingRow.id,
              timestamp,
              timestamp
            );
          bankTransaction = fetchBankTransactionById(db, info.lastInsertRowid);
          totals = computeBankTotals(db, bankId);
          if (previousBankId && previousBankId !== bankId) {
            previousTotals = computeBankTotals(db, previousBankId);
          }
        }
      }

      const updatedRow = fetchSupplierPaymentById(db, existingRow.id);
      const payableAfter = computeSupplierPayable(db, supplierId);
      return {
        updatedRow,
        bankTransaction,
        totals,
        previousTotals,
        payableAfter
      };
    });

    const { updatedRow, bankTransaction, totals, previousTotals, payableAfter } = runUpdate();
    res.json({
      payment: mapSupplierPaymentDetail(updatedRow),
      payableBefore: payableSnapshot,
      payableAfter,
      bankTransaction: bankTransaction ? mapBankTransactionDetail(bankTransaction) : null,
      totals,
      previousTotals
    });
  } catch (error) {
    res.status(400).json({ message: error.message || "Failed to update supplier payment." });
  }
});

app.post("/api/customer-opening-balances", (req, res) => {
  const db = getDb();
  const { customerCode, amount } = req.body;

  if (!customerCode) {
    return res.status(400).json({ message: "Customer code is required" });
  }

  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ message: "Amount must be greater than zero" });
  }

  const customer = findByCode("customers", customerCode);
  if (!customer) {
    return res.status(400).json({ message: "Customer not found" });
  }

  const timestamp = nowIso();

  try {
    const stmt = db.prepare(
      `INSERT INTO customer_opening_balances (customer_id, amount, created_at, updated_at)
       VALUES (?, ?, ?, ?)`
    );
    const info = stmt.run(customer.id, numericAmount, timestamp, timestamp);
    res.status(201).json({
      id: info.lastInsertRowid,
      customerCode: customer.code,
      customerName: customer.name,
      amount: numericAmount,
      createdAt: timestamp
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.get("/api/customer-opening-balances", (req, res) => {
  const db = getDb();
  const limit = Number(req.query.limit) || 20;
  const rows = db
    .prepare(
      `SELECT cob.id,
              cob.amount,
              cob.created_at,
              customers.code AS customer_code,
              customers.name AS customer_name
       FROM customer_opening_balances cob
       INNER JOIN customers ON customers.id = cob.customer_id
       ORDER BY cob.created_at DESC
       LIMIT @limit`
    )
    .all({ limit });

  const mapped = rows.map((row) => ({
    id: row.id,
    customerCode: row.customer_code,
    customerName: row.customer_name,
    entityCode: row.customer_code,
    entityName: row.customer_name,
    amount: Number(row.amount || 0),
    createdAt: row.created_at
  }));

  res.json(mapped);
});

app.get("/api/customer-opening-balances/summary", (req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT customers.id,
              customers.code,
              customers.name,
              COALESCE(SUM(cob.amount), 0) AS total
       FROM customers
       LEFT JOIN customer_opening_balances cob ON cob.customer_id = customers.id
       GROUP BY customers.id
       ORDER BY customers.name`
    )
    .all();

  const mapped = rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    entityCode: row.code,
    entityName: row.name,
    total: Number(row.total || 0)
  }));

  res.json(mapped);
});

app.post("/api/supplier-opening-balances", (req, res) => {
  const db = getDb();
  const { supplierCode, amount } = req.body;

  if (!supplierCode) {
    return res.status(400).json({ message: "Supplier code is required" });
  }

  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ message: "Amount must be greater than zero" });
  }

  const supplier = findByCode("suppliers", supplierCode);
  if (!supplier) {
    return res.status(400).json({ message: "Supplier not found" });
  }

  const timestamp = nowIso();

  try {
    const stmt = db.prepare(
      `INSERT INTO supplier_opening_balances (supplier_id, amount, created_at, updated_at)
       VALUES (?, ?, ?, ?)`
    );
    const info = stmt.run(supplier.id, numericAmount, timestamp, timestamp);
    res.status(201).json({
      id: info.lastInsertRowid,
      supplierCode: supplier.code,
      supplierName: supplier.name,
      entityCode: supplier.code,
      entityName: supplier.name,
      amount: numericAmount,
      createdAt: timestamp
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.get("/api/supplier-opening-balances", (req, res) => {
  const db = getDb();
  const limit = Number(req.query.limit) || 20;
  const rows = db
    .prepare(
      `SELECT sob.id,
              sob.amount,
              sob.created_at,
              suppliers.code AS supplier_code,
              suppliers.name AS supplier_name
       FROM supplier_opening_balances sob
       INNER JOIN suppliers ON suppliers.id = sob.supplier_id
       ORDER BY sob.created_at DESC
       LIMIT @limit`
    )
    .all({ limit });

  const mapped = rows.map((row) => ({
    id: row.id,
    supplierCode: row.supplier_code,
    supplierName: row.supplier_name,
    entityCode: row.supplier_code,
    entityName: row.supplier_name,
    amount: Number(row.amount || 0),
    createdAt: row.created_at
  }));

  res.json(mapped);
});

app.get("/api/supplier-opening-balances/summary", (req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT suppliers.id,
              suppliers.code,
              suppliers.name,
              COALESCE(SUM(sob.amount), 0) AS total
       FROM suppliers
       LEFT JOIN supplier_opening_balances sob ON sob.supplier_id = suppliers.id
       GROUP BY suppliers.id
       ORDER BY suppliers.name`
    )
    .all();

  const mapped = rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    entityCode: row.code,
    entityName: row.name,
    total: Number(row.total || 0)
  }));

  res.json(mapped);
});

app.post("/api/bank-opening-balances", (req, res) => {
  const db = getDb();
  const { bankCode, amount } = req.body;

  if (!bankCode) {
    return res.status(400).json({ message: "Bank code is required" });
  }

  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ message: "Amount must be greater than zero" });
  }

  const bank = findByCode("banks", bankCode);
  if (!bank) {
    return res.status(400).json({ message: "Bank not found" });
  }

  const timestamp = nowIso();

  try {
    const stmt = db.prepare(
      `INSERT INTO bank_opening_balances (bank_id, amount, created_at, updated_at)
       VALUES (?, ?, ?, ?)`
    );
    const info = stmt.run(bank.id, numericAmount, timestamp, timestamp);
    res.status(201).json({
      id: info.lastInsertRowid,
      bankCode: bank.code,
      bankName: bank.name,
      accountNo: bank.account_no,
      entityCode: bank.code,
      entityName: bank.name,
      entityAccount: bank.account_no,
      amount: numericAmount,
      createdAt: timestamp
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.get("/api/bank-opening-balances", (req, res) => {
  const db = getDb();
  const limit = Number(req.query.limit) || 20;
  const rows = db
    .prepare(
      `SELECT bob.id,
              bob.amount,
              bob.created_at,
              banks.code AS bank_code,
              banks.name AS bank_name,
              banks.account_no
       FROM bank_opening_balances bob
       INNER JOIN banks ON banks.id = bob.bank_id
       ORDER BY bob.created_at DESC
       LIMIT @limit`
    )
    .all({ limit });

  const mapped = rows.map((row) => ({
    id: row.id,
    bankCode: row.bank_code,
    bankName: row.bank_name,
    accountNo: row.account_no,
    entityCode: row.bank_code,
    entityName: row.bank_name,
    entityAccount: row.account_no,
    amount: Number(row.amount || 0),
    createdAt: row.created_at
  }));

  res.json(mapped);
});

app.get("/api/bank-opening-balances/summary", (req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT banks.id,
              banks.code,
              banks.name,
              banks.account_no,
              COALESCE(SUM(bob.amount), 0) AS total
       FROM banks
       LEFT JOIN bank_opening_balances bob ON bob.bank_id = banks.id
       GROUP BY banks.id
       ORDER BY banks.name`
    )
    .all();

  const mapped = rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    accountNo: row.account_no,
    entityCode: row.code,
    entityName: row.name,
    entityAccount: row.account_no,
    total: Number(row.total || 0)
  }));

  res.json(mapped);
});

app.get("/api/bank-transactions", (req, res) => {
  const db = getDb();
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const search = (req.query.search || "").trim();
  const typeFilter = (req.query.type || "").toLowerCase();

  const clauses = [];
  const params = { limit };

  if (search) {
    params.search = `%${search}%`;
    clauses.push(
      "(bt.entry_no LIKE @search OR bt.slip_no LIKE @search OR banks.code LIKE @search OR banks.name LIKE @search)"
    );
  }

  if (["deposit", "drawing"].includes(typeFilter)) {
    params.type = typeFilter;
    clauses.push("bt.transaction_type = @type");
  }

  const whereSql = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const rows = db
    .prepare(`${BANK_TRANSACTION_BASE_QUERY} ${whereSql} ORDER BY bt.slip_date DESC, bt.id DESC LIMIT @limit`)
    .all(params);

  res.json(rows.map(mapBankTransactionDetail));
});

app.post("/api/bank-transactions", (req, res) => {
  const db = getDb();
  const { type, mode, transactionType, bankCode, slipNo, slipDate, amount, cashInBank } = req.body;
  const resolvedType = (transactionType || type || mode || "deposit").toLowerCase();
  if (!["deposit", "drawing"].includes(resolvedType)) {
    return res.status(400).json({ message: "Invalid bank transaction type." });
  }

  const storageSlipDate = toStorageDate(slipDate);
  if (!storageSlipDate) {
    return res.status(400).json({ message: "Invalid slip date" });
  }

  const resolvedAmount = Number(amount ?? cashInBank ?? 0);
  if (!Number.isFinite(resolvedAmount) || resolvedAmount <= 0) {
    return res.status(400).json({ message: "Amount must be greater than zero" });
  }

  if (!bankCode) {
    return res.status(400).json({ message: "Bank code is required" });
  }

  const bank = findByCode("banks", bankCode);
  if (!bank) {
    return res.status(400).json({ message: "Bank not found" });
  }

  const timestamp = nowIso();
  const entryNo = nextBankTransactionEntryNo(db);

  try {
    const info = db
      .prepare(
        `INSERT INTO bank_transactions (transaction_type, bank_id, slip_no, slip_date, cash_amount, entry_no, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(resolvedType, bank.id, slipNo || null, storageSlipDate, resolvedAmount, entryNo, timestamp, timestamp);

    const row = db.prepare(`SELECT * FROM bank_transactions WHERE id = ?`).get(info.lastInsertRowid);
    const bankDetails = { code: bank.code, name: bank.name, accountNo: bank.account_no };
    const totalsAfter = computeBankTotals(db, bank.id);

    res.status(201).json({
      transaction: mapRowDates(row),
      bank: bankDetails,
      totals: totalsAfter
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.get("/api/bank-transactions/:reference", (req, res) => {
  const db = getDb();
  const reference = req.params.reference;
  const row = findBankTransactionRow(db, reference);
  if (!row) {
    return res.status(404).json({ message: "Bank transaction not found." });
  }
  res.json(mapBankTransactionDetail(row));
});

app.put("/api/bank-transactions/:reference", (req, res) => {
  const db = getDb();
  const reference = req.params.reference;
  const existingRow = findBankTransactionRow(db, reference);
  if (!existingRow) {
    return res.status(404).json({ message: "Bank transaction not found." });
  }

  const existing = mapBankTransactionDetail(existingRow);
  if (!existing.isEditable) {
    return res.status(409).json({ message: "Entries linked to receipts or supplier payments cannot be edited manually." });
  }

  const { transactionType, bankCode, slipNo, slipDate, amount } = req.body;
  const resolvedType = (transactionType || existing.transactionType || "deposit").toLowerCase();
  if (!["deposit", "drawing"].includes(resolvedType)) {
    return res.status(400).json({ message: "Invalid bank transaction type." });
  }

  const storageSlipDate = toStorageDate(slipDate);
  if (!storageSlipDate) {
    return res.status(400).json({ message: "Invalid slip date." });
  }

  const resolvedAmount = Number(amount);
  if (!Number.isFinite(resolvedAmount) || resolvedAmount <= 0) {
    return res.status(400).json({ message: "Amount must be greater than zero." });
  }

  const trimmedBank = (bankCode || existing.bank?.code || "").trim();
  if (!trimmedBank) {
    return res.status(400).json({ message: "Bank code is required." });
  }

  const bank = findByCode("banks", trimmedBank);
  if (!bank) {
    return res.status(400).json({ message: "Bank not found." });
  }

  const timestamp = nowIso();
  const previousBankId = existingRow.bank_id;

  try {
    const update = db.prepare(
      `UPDATE bank_transactions
       SET transaction_type = ?,
           bank_id = ?,
           slip_no = ?,
           slip_date = ?,
           cash_amount = ?,
           updated_at = ?
       WHERE id = ?`
    );

    const runUpdate = db.transaction(() => {
      update.run(
        resolvedType,
        bank.id,
        slipNo || null,
        storageSlipDate,
        resolvedAmount,
        timestamp,
        existingRow.id
      );
      const updatedRow = fetchBankTransactionById(db, existingRow.id);
      const totals = computeBankTotals(db, bank.id);
      const previousTotals = bank.id !== previousBankId && previousBankId
        ? computeBankTotals(db, previousBankId)
        : null;
      return { updatedRow, totals, previousTotals };
    });

    const { updatedRow, totals, previousTotals } = runUpdate();
    res.json({
      transaction: mapBankTransactionDetail(updatedRow),
      totals,
      previousTotals
    });
  } catch (error) {
    res.status(400).json({ message: error.message || "Failed to update bank transaction." });
  }
});

app.get("/api/customer-receipts", (req, res) => {
  const db = getDb();
  const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);
  const search = (req.query.search || "").trim();

  const clauses = [];
  const params = { limit };

  if (search) {
    params.search = `%${search}%`;
    clauses.push(
      "(cr.receipt_no LIKE @search OR customers.code LIKE @search OR customers.name LIKE @search OR cr.slip_no LIKE @search)"
    );
  }

  const whereSql = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const rows = db
    .prepare(
      `${CUSTOMER_RECEIPT_BASE_QUERY} ${whereSql} ORDER BY cr.receipt_date DESC, cr.id DESC LIMIT @limit`
    )
    .all(params);

  res.json(
    rows.map((row) => {
      const mapped = mapRowDates(row);
      return {
        ...mapped,
        id: row.id,
        receipt_no: row.receipt_no,
        customer_id: row.customer_id,
        customer_code: row.customer_code,
        customer_name: row.customer_name,
        salesman_id: row.salesman_id,
        salesman_code: row.salesman_code,
        salesman_name: row.salesman_name,
        payment_mode: row.payment_mode,
        amount: Number(row.amount ?? 0),
        bank_id: row.bank_id,
        bank_code: row.bank_code,
        bank_name: row.bank_name,
        slip_no: row.slip_no,
        slip_date: mapped.slip_date,
        attachment_image: row.attachment_image || null,
        created_at: row.created_at,
        updated_at: row.updated_at
      };
    })
  );
});

app.get("/api/supplier-payments", (req, res) => {
  const db = getDb();
  const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);
  const search = (req.query.search || "").trim();

  const clauses = [];
  const params = { limit };

  if (search) {
    params.search = `%${search}%`;
    clauses.push(
      "(sp.payment_no LIKE @search OR suppliers.code LIKE @search OR suppliers.name LIKE @search OR sp.slip_no LIKE @search)"
    );
  }

  const whereSql = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const rows = db
    .prepare(
      `${SUPPLIER_PAYMENT_BASE_QUERY} ${whereSql} ORDER BY sp.payment_date DESC, sp.id DESC LIMIT @limit`
    )
    .all(params);

  res.json(
    rows.map((row) => {
      const mapped = mapRowDates(row);
      return {
        ...mapped,
        id: row.id,
        payment_no: row.payment_no,
        supplier_id: row.supplier_id,
        supplier_code: row.supplier_code,
        supplier_name: row.supplier_name,
        payment_mode: row.payment_mode,
        amount: Number(row.amount ?? 0),
        bank_id: row.bank_id,
        bank_code: row.bank_code,
        bank_name: row.bank_name,
        slip_no: row.slip_no,
        slip_date: mapped.slip_date,
        created_at: row.created_at,
        updated_at: row.updated_at
      };
    })
  );
});

app.get("/api/metadata/next/sales-invoice", (req, res) => {
  const db = getDb();
  const row = db.prepare(`SELECT invoice_no FROM sales ORDER BY id DESC LIMIT 1`).get();
  const last = row?.invoice_no ?? "0000000";
  res.json({ nextInvoice: formatInvoiceNumber("", last) });
});

app.get("/api/metadata/next/expense-voucher", (req, res) => {
  const db = getDb();
  const row = db.prepare(`SELECT voucher_no FROM expense_entries ORDER BY id DESC LIMIT 1`).get();
  const last = (row?.voucher_no || "").replace(/\D/g, "") || "000000";
  res.json({ nextVoucher: formatInvoiceNumber("EX", last) });
});

app.get("/api/metadata/next/customer-receipt", (req, res) => {
  const db = getDb();
  const row = db.prepare(`SELECT receipt_no FROM customer_receipts ORDER BY id DESC LIMIT 1`).get();
  const last = row?.receipt_no?.replace(/^R/, "") || "000000";
  res.json({ nextReceipt: formatInvoiceNumber("R", last) });
});

app.get("/api/metadata/next/supplier-payment", (req, res) => {
  const db = getDb();
  const row = db.prepare(`SELECT payment_no FROM supplier_payments ORDER BY id DESC LIMIT 1`).get();
  const last = row?.payment_no?.replace(/^SP/, "") || "000000";
  res.json({ nextPayment: formatInvoiceNumber("SP", last) });
});

app.get("/api/metadata/next/purchase-return", (req, res) => {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT return_no
       FROM purchase_returns
       WHERE return_no GLOB 'PR[0-9][0-9][0-9][0-9][0-9][0-9]'
       ORDER BY id DESC LIMIT 1`
    )
    .get();
  const last = row?.return_no?.replace(/^PR/, "") || "000000";
  res.json({ nextReturn: formatInvoiceNumber("PR", last) });
});

app.get("/api/metadata/next/salesman-receipt", (req, res) => {
  const db = getDb();
  const row = db.prepare(`SELECT receipt_no FROM salesman_receipts ORDER BY id DESC LIMIT 1`).get();
  const last = row?.receipt_no?.replace(/^SR/, "") || "000000";
  res.json({ nextReceipt: formatInvoiceNumber("SR", last) });
});

app.get("/api/metadata/next/salesman-bonus", (req, res) => {
  const db = getDb();
  const row = db.prepare(`SELECT voucher_no FROM salesman_bonuses ORDER BY id DESC LIMIT 1`).get();
  const last = row?.voucher_no?.replace(/^SB/, "") || "000000";
  res.json({ nextVoucher: formatInvoiceNumber("SB", last) });
});

app.get("/api/metadata/next/bank-transaction", (req, res) => {
  const db = getDb();
  const nextEntry = nextBankTransactionEntryNo(db);
  res.json({ nextEntry });
});

app.get("/api/metadata/next/damage-voucher", (req, res) => {
  const db = getDb();
  const nextVoucher = nextDamageVoucherNo(db);
  res.json({ nextVoucher });
});

app.post("/api/salesman-receipts", (req, res) => {
  const db = getDb();
  const { salesmanCode, receiptDate, items = [] } = req.body;

  if (!salesmanCode) {
    return res.status(400).json({ message: "Salesman code is required" });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: "Add at least one customer entry" });
  }

  const salesman = findByCode("salesmen", salesmanCode);
  if (!salesman) {
    return res.status(400).json({ message: "Salesman not found" });
  }

  const storageDate = toStorageDate(receiptDate);
  if (!storageDate) {
    return res.status(400).json({ message: "Invalid date format" });
  }

  const invalidRow = items.find((item) => {
    return !item.customerCode || Number(item.receivedAmount) < 0 || Number(item.netBalance) < 0;
  });

  if (invalidRow) {
    return res.status(400).json({ message: "Each row must have customer code, received amount >= 0, and net balance >= 0" });
  }

  const timestamp = nowIso();
  const row = db.prepare(`SELECT receipt_no FROM salesman_receipts ORDER BY id DESC LIMIT 1`).get();
  const last = row?.receipt_no?.replace(/^SR/, "") || "000000";
  const receiptNo = formatInvoiceNumber("SR", last);

  const transaction = db.transaction(() => {
    const insertReceipt = db.prepare(
      `INSERT INTO salesman_receipts (receipt_no, salesman_id, receipt_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    );
    const receiptInfo = insertReceipt.run(receiptNo, salesman.id, storageDate, timestamp, timestamp);
    const receiptId = receiptInfo.lastInsertRowid;

    const insertItem = db.prepare(
      `INSERT INTO salesman_receipt_items (receipt_id, customer_id, received_amount, previous_balance, net_balance, remarks, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const item of items) {
      const customer = findByCode("customers", item.customerCode);
      if (!customer) {
        throw new Error(`Customer not found: ${item.customerCode}`);
      }
      insertItem.run(
        receiptId,
        customer.id,
        Number(item.receivedAmount) || 0,
        Number(item.previousBalance) || 0,
        Number(item.netBalance) || 0,
        item.remarks || null,
        timestamp,
        timestamp
      );
    }

    return receiptId;
  });

  try {
    const receiptId = transaction();
    const saved = db.prepare(`SELECT * FROM salesman_receipts WHERE id = ?`).get(receiptId);
    res.status(201).json({ ...mapRowDates(saved), receipt_no: receiptNo });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Backup and restore endpoints
app.post("/api/db/backup", async (req, res) => {
  const timestamp = new Date().toISOString().replace(/[:T]/g, "-").split(".")[0];
  const backupFolderName = `backup-${timestamp}`;
  const backupFolder = path.join(BACKUP_DIR, backupFolderName);
  
  try {
    // Ensure data directories exist
    await fs.ensureDir(DATA_DIR);
    await fs.ensureDir(BACKUP_DIR);
    await fs.ensureDir(backupFolder);

    // Ensure database file exists (create empty DB if missing)
    if (!(await fs.pathExists(DB_FILE))) {
      console.log("[BACKUP] inventory.db missing, initializing new database before backup");
      const db = getDb();
      db.close();
    }
    
    // Backup main inventory database
    const inventoryBackup = path.join(backupFolder, "inventory.db");
    await fs.copy(DB_FILE, inventoryBackup);
    
    // Backup auth database (backend)
    const projectRoot = path.resolve(path.dirname(DB_FILE), "..", "..");
    const authDbPath = path.join(projectRoot, "backend", "data", "app.db");
    if (await fs.pathExists(authDbPath)) {
      const authBackup = path.join(backupFolder, "app.db");
      await fs.copy(authDbPath, authBackup);
    }
    
    // Backup uploads folder
    const uploadsPath = path.join(BACKUP_DIR, "uploads");
    if (await fs.pathExists(uploadsPath)) {
      const uploadsBackup = path.join(backupFolder, "uploads");
      await fs.copy(uploadsPath, uploadsBackup);
    }
    
    res.json({ 
      message: "Complete backup created", 
      path: backupFolder,
      timestamp: timestamp,
      includes: ["inventory.db", "app.db", "uploads"]
    });
  } catch (error) {
    res.status(500).json({ message: "Backup failed", error: error.message });
  }
});

app.get("/api/db/backups", async (req, res) => {
  try {
    const files = await fs.readdir(BACKUP_DIR);
    const backups = files.filter((f) => f.startsWith("backup-") || f.endsWith(".db"));
    res.json(backups);
  } catch (error) {
    res.status(500).json({ message: "Unable to list backups", error: error.message });
  }
});

app.get("/api/db/backup/:file", (req, res) => {
  const file = path.basename(req.params.file);
  const fullPath = path.join(BACKUP_DIR, file);
  if (!fs.existsSync(fullPath)) return res.status(404).json({ message: "Backup not found" });
  res.download(fullPath);
});

app.post("/api/db/restore/:backupName", async (req, res) => {
  const backupName = req.params.backupName;
  const backupPath = path.join(BACKUP_DIR, backupName);
  
  console.log(`[RESTORE] Attempting to restore: ${backupName}`);
  console.log(`[RESTORE] Full path: ${backupPath}`);
  
  try {
    // Check if backup exists
    if (!await fs.pathExists(backupPath)) {
      console.log(`[RESTORE] ERROR: Backup path does not exist: ${backupPath}`);
      return res.status(404).json({ message: "Backup not found", path: backupPath });
    }
    
    const stat = await fs.stat(backupPath);
    console.log(`[RESTORE] Backup found - isDirectory: ${stat.isDirectory()}`);
    
    // Handle folder-based backup (new format)
    if (stat.isDirectory()) {
      const inventoryBackup = path.join(backupPath, "inventory.db");
      const authBackup = path.join(backupPath, "app.db");
      
      console.log(`[RESTORE] Looking for inventory.db at: ${inventoryBackup}`);
      
      // Restore inventory database
      if (await fs.pathExists(inventoryBackup)) {
        console.log(`[RESTORE] Found inventory.db, closing current connection and preparing restore...`);
        
        // Close database connection
        const db = getDb();
        db.close();
        console.log(`[RESTORE] Database connection closed`);
        
        // Wait a moment for files to be released
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Remove old database
        if (await fs.pathExists(DB_FILE)) {
          await fs.remove(DB_FILE);
          console.log(`[RESTORE] Old database removed`);
        }
        
        // Copy new database
        await fs.copy(inventoryBackup, DB_FILE, { overwrite: true });
        console.log(`[RESTORE] ✓ inventory.db restored`);
      } else {
        console.log(`[RESTORE] ERROR: inventory.db not found in backup`);
        return res.status(400).json({ message: "inventory.db not found in backup", path: inventoryBackup });
      }
      
      // Restore auth database (optional)
      const projectRoot = path.resolve(path.dirname(DB_FILE), "..", "..");
      const authDbPath = path.join(projectRoot, "backend", "data", "app.db");
      console.log(`[RESTORE] Looking for app.db at: ${authBackup}`);
      if (await fs.pathExists(authBackup)) {
        console.log(`[RESTORE] Found app.db, copying to ${authDbPath}`);
        await fs.copy(authBackup, authDbPath, { overwrite: true });
        console.log(`[RESTORE] ✓ app.db restored`);
      } else {
        console.log(`[RESTORE] app.db not found in backup (this is okay for old backups)`);
      }
      
      console.log(`[RESTORE] ✓ Restore complete`);
      
      res.json({ 
        message: "Database restored successfully", 
        restored: ["inventory.db"],
        note: "⚠️ SERVER RESTARTING - Please wait and refresh your browser"
      });
      
      // Exit the server to force restart with new database
      console.log(`[RESTORE] Exiting server to complete restore...`);
      setTimeout(() => process.exit(0), 1500);
    } 
    // Handle old single-file backup
    else if (stat.isFile() && backupName.endsWith('.db')) {
      console.log(`[RESTORE] Old format backup detected`);
      
      // Close database connection
      const db = getDb();
      db.close();
      console.log(`[RESTORE] Database connection closed`);
      
      // Wait a moment for files to be released
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Remove old database
      if (await fs.pathExists(DB_FILE)) {
        await fs.remove(DB_FILE);
        console.log(`[RESTORE] Old database removed`);
      }
      
      // Copy backup
      await fs.copy(backupPath, DB_FILE, { overwrite: true });
      console.log(`[RESTORE] ✓ Old format restore complete`);
      res.json({ 
        message: "Database restored (old format)", 
        restored: ["inventory.db"],
        note: "⚠️ SERVER RESTARTING - Please wait and refresh your browser"
      });
      
      // Exit the server to force restart with new database
      console.log(`[RESTORE] Exiting server to complete restore...`);
      setTimeout(() => process.exit(0), 1500);
    } else {
      console.log(`[RESTORE] ERROR: Invalid backup format`);
      res.status(400).json({ message: "Invalid backup format" });
    }
  } catch (error) {
    console.error(`[RESTORE] ERROR:`, error);
    res.status(500).json({ message: "Restore failed", error: error.message, details: error.toString() });
  }
});

// ==================== PROFIT REPORTS ENDPOINTS ====================

// NET PROFIT - Entire period summary
app.get("/api/reports/profit/net-profit", (req, res) => {
  try {
    const db = getDb();
    const result = db.prepare(NET_PROFIT_QUERY).get();
    res.json(result || {
      total_sales: 0,
      total_cost: 0,
      invoice_profit: 0,
      total_amount_paid: 0,
      total_outstanding: 0,
      realized_profit: 0,
      pending_profit: 0
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch net profit", error: error.message });
  }
});

// PROFIT SUMMARY - All invoices with profit metrics
app.get("/api/reports/profit/summary", (req, res) => {
  try {
    const db = getDb();
    const invoices = db.prepare(PROFIT_SUMMARY_QUERY).all();
    res.json(invoices || []);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch profit summary", error: error.message });
  }
});

// ITEMS PROFIT SUMMARY
app.get("/api/reports/profit/items", (req, res) => {
  try {
    const db = getDb();
    const items = db.prepare(PROFIT_BY_ITEM_QUERY).all();
    res.json(items || []);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch items profit", error: error.message });
  }
});

// CUSTOMERS PROFIT SUMMARY
app.get("/api/reports/profit/customers", (req, res) => {
  try {
    const db = getDb();
    const customers = db.prepare(PROFIT_BY_CUSTOMER_QUERY).all();
    res.json(customers || []);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch customers profit", error: error.message });
  }
});

// COMPANIES PROFIT SUMMARY
app.get("/api/reports/profit/companies", (req, res) => {
  try {
    const db = getDb();
    const companies = db.prepare(PROFIT_BY_COMPANY_QUERY).all();
    res.json(companies || []);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch companies profit", error: error.message });
  }
});

// DATE WISE PROFIT WITH RETURN
app.get("/api/reports/profit/date-wise", (req, res) => {
  try {
    const db = getDb();
    const dateData = db.prepare(PROFIT_BY_DATE_QUERY).all();
    res.json(dateData || []);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch date-wise profit", error: error.message });
  }
});

// SALESMAN PROFIT SUMMARY
app.get("/api/reports/profit/salesmen", (req, res) => {
  try {
    const db = getDb();
    const salesmen = db.prepare(PROFIT_BY_SALESMAN_QUERY).all();
    res.json(salesmen || []);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch salesmen profit", error: error.message });
  }
});

// Single invoice profit details
app.get("/api/reports/profit/invoice/:invoiceNo", (req, res) => {
  try {
    const db = getDb();
    const { invoiceNo } = req.params;

    const invoiceData = db.prepare(`
      SELECT 
        s.id,
        s.invoice_no,
        s.invoice_date,
        c.id as customer_id,
        c.name as customer_name,
        s.total_amount,
        s.amount_paid,
        (s.total_amount - s.amount_paid) as amount_outstanding,
        COALESCE(SUM(si.quantity * i.purchase_rate), 0) as total_cost
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      LEFT JOIN sale_items si ON s.id = si.sale_id
      LEFT JOIN items i ON si.item_id = i.id
      WHERE s.invoice_no = ?
      GROUP BY s.id
    `).get(invoiceNo);

    if (!invoiceData) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    const metrics = calculateProfitMetrics(
      invoiceData.total_amount,
      invoiceData.total_cost,
      invoiceData.amount_paid
    );

    res.json({
      ...invoiceData,
      ...metrics
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch invoice profit details", error: error.message });
  }
});

// ==================== END OF PROFIT REPORTS ====================

// ==================== SUPPLIER PAYABLE REPORTS ====================

// Supplier payable summary
app.get("/api/reports/supplier-payable-summary", (req, res) => {
  try {
    const db = getDb();
    
    const purchases = db.prepare(`
      SELECT 
        s.code,
        s.name,
        p.invoice_no,
        p.invoice_date,
        (p.total_amount - p.amount_paid) as balance
      FROM purchases p
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE (p.total_amount - p.amount_paid) != 0
      ORDER BY s.code, p.invoice_date DESC
    `).all();

    res.json(purchases);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch supplier payable summary", error: error.message });
  }
});

// Supplier-wise purchase bills summary (single supplier + optional date range)
app.get("/api/reports/purchase/supplier-bills-summary", (req, res) => {
  try {
    const db = getDb();
    const supplierCode = String(req.query.supplierCode || "").trim();
    const { startDate, endDate } = req.query;

    if (!supplierCode) {
      return res.status(400).json({ message: "Supplier code is required." });
    }

    const supplier = db
      .prepare(`SELECT id, code, name FROM suppliers WHERE code = ? LIMIT 1`)
      .get(supplierCode);

    if (!supplier) {
      return res.status(404).json({ message: `Supplier not found: ${supplierCode}` });
    }

    const params = { supplierId: supplier.id };
    let where = "WHERE p.supplier_id = @supplierId AND (p.is_cancelled IS NULL OR p.is_cancelled = 0)";

    if (startDate) {
      const normalized = toStorageDate(startDate);
      if (!normalized) {
        return res.status(400).json({ message: "Invalid start date. Use DD-MM-YYYY." });
      }
      params.startDate = normalized;
      where += " AND p.invoice_date >= @startDate";
    }

    if (endDate) {
      const normalized = toStorageDate(endDate);
      if (!normalized) {
        return res.status(400).json({ message: "Invalid end date. Use DD-MM-YYYY." });
      }
      params.endDate = normalized;
      where += " AND p.invoice_date <= @endDate";
    }

    const invoices = db
      .prepare(
        `SELECT p.invoice_no, p.invoice_date, p.total_amount
         FROM purchases p
         ${where}
         ORDER BY p.invoice_date DESC, p.invoice_no DESC`
      )
      .all(params)
      .map(mapRowDates);

    const totalAmount = invoices.reduce((sum, row) => sum + Number(row.total_amount || 0), 0);

    res.json({
      supplier,
      invoices,
      totals: {
        invoiceCount: invoices.length,
        totalAmount
      }
    });
  } catch (error) {
    console.error("Error in purchase supplier bills summary:", error);
    res.status(500).json({ message: "Failed to fetch supplier bills summary", error: error.message });
  }
});

// All suppliers' purchase bills summary (loads all suppliers with their bills)
app.get("/api/reports/purchase/all-supplier-bills-summary", (req, res) => {
  try {
    const db = getDb();
    const supplierCode = String(req.query.supplierCode || "").trim();
    const { startDate, endDate } = req.query;

    // Get all suppliers
    let suppliersQuery = `SELECT id, code, name FROM suppliers ORDER BY code, name`;
    const suppliers = db.prepare(suppliersQuery).all();

    // Build date filters
    const dateParams = {};
    let dateWhere = "(p.is_cancelled IS NULL OR p.is_cancelled = 0)";

    if (startDate) {
      const normalized = toStorageDate(startDate);
      if (!normalized) {
        return res.status(400).json({ message: "Invalid start date. Use DD-MM-YYYY." });
      }
      dateParams.startDate = normalized;
      dateWhere += " AND p.invoice_date >= @startDate";
    }

    if (endDate) {
      const normalized = toStorageDate(endDate);
      if (!normalized) {
        return res.status(400).json({ message: "Invalid end date. Use DD-MM-YYYY." });
      }
      dateParams.endDate = normalized;
      dateWhere += " AND p.invoice_date <= @endDate";
    }

    // If supplier code filter is provided, filter suppliers
    let filteredSuppliers = suppliers;
    if (supplierCode) {
      filteredSuppliers = suppliers.filter((s) => s.code.toLowerCase().includes(supplierCode.toLowerCase()) || s.name.toLowerCase().includes(supplierCode.toLowerCase()));
    }

    // Get invoices for each supplier
    const suppliersData = filteredSuppliers.map((supplier) => {
      const params = { ...dateParams, supplierId: supplier.id };
      const invoices = db
        .prepare(
          `SELECT p.invoice_no, p.invoice_date, p.total_amount
           FROM purchases p
           WHERE p.supplier_id = @supplierId AND ${dateWhere}
           ORDER BY p.invoice_date DESC, p.invoice_no DESC`
        )
        .all(params)
        .map(mapRowDates);

      const totalAmount = invoices.reduce((sum, row) => sum + Number(row.total_amount || 0), 0);

      return {
        supplierId: supplier.id,
        code: supplier.code,
        name: supplier.name,
        invoices,
        totalAmount,
        invoiceCount: invoices.length
      };
    });

    // Filter out suppliers with no invoices if needed, or keep all
    const suppliersWithData = suppliersData;

    const grandTotal = suppliersWithData.reduce((sum, s) => sum + s.totalAmount, 0);

    res.json({
      suppliers: suppliersWithData,
      totals: {
        supplierCount: suppliersWithData.length,
        totalInvoices: suppliersWithData.reduce((sum, s) => sum + s.invoiceCount, 0),
        grandTotal
      }
    });
  } catch (error) {
    console.error("Error in all supplier bills summary:", error);
    res.status(500).json({ message: "Failed to fetch all supplier bills summary", error: error.message });
  }
});

// Days wise purchase amount summary (by invoice date within range)
app.get("/api/reports/purchase/days-wise-summary", (req, res) => {
  try {
    const db = getDb();
    const { startDate, endDate } = req.query;

    const params = {};
    let where = "WHERE (p.is_cancelled IS NULL OR p.is_cancelled = 0)";

    if (startDate) {
      const normalized = toStorageDate(startDate);
      if (!normalized) {
        return res.status(400).json({ message: "Invalid start date. Use DD-MM-YYYY." });
      }
      params.startDate = normalized;
      where += " AND p.invoice_date >= @startDate";
    }

    if (endDate) {
      const normalized = toStorageDate(endDate);
      if (!normalized) {
        return res.status(400).json({ message: "Invalid end date. Use DD-MM-YYYY." });
      }
      params.endDate = normalized;
      where += " AND p.invoice_date <= @endDate";
    }

    const rows = db
      .prepare(
        `SELECT p.invoice_date, SUM(p.total_amount) AS total_amount, COUNT(*) AS invoice_count
         FROM purchases p
         ${where}
         GROUP BY p.invoice_date
         ORDER BY p.invoice_date DESC`
      )
      .all(params)
      .map(mapRowDates);

    const totals = rows.reduce(
      (acc, row) => {
        acc.invoiceCount += Number(row.invoice_count || 0);
        acc.totalAmount += Number(row.total_amount || 0);
        return acc;
      },
      { invoiceCount: 0, totalAmount: 0 }
    );

    res.json({ rows, totals });
  } catch (error) {
    console.error("Error in days-wise purchase summary:", error);
    res.status(500).json({ message: "Failed to fetch days wise purchase summary", error: error.message });
  }
});

// Date wise bills summary (detailed bills list)
app.get("/api/reports/purchase/date-wise-bills-summary", (req, res) => {
  try {
    const db = getDb();
    const { startDate, endDate } = req.query;

    const params = {};
    let where = "";

    if (startDate) {
      const normalized = toStorageDate(startDate);
      if (!normalized) {
        return res.status(400).json({ message: "Invalid start date. Use DD-MM-YYYY." });
      }
      params.startDate = normalized;
      where += "WHERE p.invoice_date >= @startDate";
    }

    if (endDate) {
      const normalized = toStorageDate(endDate);
      if (!normalized) {
        return res.status(400).json({ message: "Invalid end date. Use DD-MM-YYYY." });
      }
      params.endDate = normalized;
      where += (where ? " AND " : "WHERE ") + "p.invoice_date <= @endDate";
    }

    const rows = db
      .prepare(
        `SELECT 
          p.invoice_no,
          p.invoice_date,
          s.name AS supplier_name,
          p.total_amount
         FROM purchases p
         INNER JOIN suppliers s ON s.id = p.supplier_id
         ${where}
         ORDER BY p.invoice_date DESC, p.invoice_no DESC`
      )
      .all(params)
      .map(mapRowDates);

    const totalAmount = rows.reduce((sum, row) => sum + Number(row.total_amount || 0), 0);

    res.json({ 
      rows, 
      totals: {
        billCount: rows.length,
        totalAmount
      }
    });
  } catch (error) {
    console.error("Error in date-wise bills summary:", error);
    res.status(500).json({ message: "Failed to fetch date wise bills summary", error: error.message });
  }
});

// Bill checking - get bill details by invoice number
app.get("/api/reports/purchase/bill-details", (req, res) => {
  try {
    const db = getDb();
    const invoiceNo = String(req.query.invoiceNo || "").trim();

    if (!invoiceNo) {
      return res.status(400).json({ message: "Invoice number is required." });
    }

    // Get purchase header
    const bill = db
      .prepare(
        `SELECT 
          p.id,
          p.invoice_no,
          p.invoice_date,
          p.supplier_id,
          p.total_amount,
          s.name AS supplier_name,
          s.code AS supplier_code
         FROM purchases p
         INNER JOIN suppliers s ON s.id = p.supplier_id
         WHERE p.invoice_no = ?
         LIMIT 1`
      )
      .get(invoiceNo);

    if (!bill) {
      return res.status(404).json({ message: `Bill #${invoiceNo} not found.` });
    }

    // Get purchase items
    const items = db
      .prepare(
        `SELECT 
          pi.id,
          pi.quantity,
          pi.purchase_rate,
          i.name AS item_name,
          i.code AS item_code,
          i.base_unit
         FROM purchase_items pi
         INNER JOIN items i ON i.id = pi.item_id
         WHERE pi.purchase_id = ?
         ORDER BY pi.id`
      )
      .all(bill.id);

    // Calculate totals for each item
    const itemsWithTotals = items.map((item) => ({
      ...item,
      total_amount: Number(item.quantity) * Number(item.purchase_rate || 0),
      packing: item.base_unit || "-",
      tax: "-",
      discount: "0"
    }));

    res.json({
      bill: mapRowDates(bill),
      items: itemsWithTotals
    });
  } catch (error) {
    console.error("Error in bill checking:", error);
    res.status(500).json({ message: "Failed to fetch bill details", error: error.message });
  }
});

// Get bills by supplier (for bill checking browse)
app.get("/api/reports/purchase/bills-by-supplier", (req, res) => {
  try {
    const db = getDb();
    const supplierId = String(req.query.supplierId || "").trim();
    const { startDate, endDate } = req.query;

    if (!supplierId) {
      return res.status(400).json({ message: "Supplier ID is required." });
    }

    const params = { supplierId };
    let where = "WHERE p.supplier_id = @supplierId AND (p.is_cancelled IS NULL OR p.is_cancelled = 0)";

    if (startDate) {
      const normalized = toStorageDate(startDate);
      if (!normalized) {
        return res.status(400).json({ message: "Invalid start date. Use DD-MM-YYYY." });
      }
      params.startDate = normalized;
      where += " AND p.invoice_date >= @startDate";
    }

    if (endDate) {
      const normalized = toStorageDate(endDate);
      if (!normalized) {
        return res.status(400).json({ message: "Invalid end date. Use DD-MM-YYYY." });
      }
      params.endDate = normalized;
      where += " AND p.invoice_date <= @endDate";
    }

    const bills = db
      .prepare(
        `SELECT 
          p.id,
          p.invoice_no,
          p.invoice_date,
          p.total_amount
         FROM purchases p
         ${where}
         ORDER BY p.invoice_date DESC, p.invoice_no DESC`
      )
      .all(params)
      .map(mapRowDates);

    res.json({
      bills
    });
  } catch (error) {
    console.error("Error in bills by supplier:", error);
    res.status(500).json({ message: "Failed to fetch bills", error: error.message });
  }
});

// Item-wise purchase detail (all invoices for selected item within date range)
app.get("/api/reports/purchase/item-wise-detail", (req, res) => {
  try {
    const db = getDb();
    const itemCode = String(req.query.itemCode || "").trim();
    const { startDate, endDate } = req.query;

    if (!itemCode) {
      return res.status(400).json({ message: "Item code is required." });
    }

    const item = db
      .prepare(`SELECT id, code, name, base_unit FROM items WHERE code = ? LIMIT 1`)
      .get(itemCode);

    if (!item) {
      return res.status(404).json({ message: `Item not found: ${itemCode}` });
    }

    const params = { itemId: item.id };
    let where = "WHERE pi.item_id = @itemId AND (p.is_cancelled IS NULL OR p.is_cancelled = 0)";

    if (startDate) {
      const normalized = toStorageDate(startDate);
      if (!normalized) {
        return res.status(400).json({ message: "Invalid start date. Use DD-MM-YYYY." });
      }
      params.startDate = normalized;
      where += " AND p.invoice_date >= @startDate";
    }

    if (endDate) {
      const normalized = toStorageDate(endDate);
      if (!normalized) {
        return res.status(400).json({ message: "Invalid end date. Use DD-MM-YYYY." });
      }
      params.endDate = normalized;
      where += " AND p.invoice_date <= @endDate";
    }

    const rows = db
      .prepare(
        `SELECT 
          p.invoice_no,
          p.invoice_date,
          s.code AS supplier_code,
          s.name AS supplier_name,
          pi.quantity,
          pi.base_unit,
          pi.bonus,
          pi.purchase_rate,
          pi.discount_percent,
          0 AS tax_percent,
          pi.net_amount,
          (pi.quantity + pi.bonus) * pi.purchase_rate AS gross_amount
         FROM purchase_items pi
         INNER JOIN purchases p ON p.id = pi.purchase_id
         INNER JOIN suppliers s ON s.id = p.supplier_id
         ${where}
         ORDER BY p.invoice_date DESC, p.invoice_no DESC`
      )
      .all(params)
      .map(mapRowDates);

    const totals = rows.reduce(
      (acc, row) => {
        acc.totalQty += Number(row.quantity || 0);
        acc.totalValue += Number(row.net_amount || 0);
        acc.invoiceSet.add(row.invoice_no);
        return acc;
      },
      { totalQty: 0, totalValue: 0, invoiceSet: new Set() }
    );

    res.json({
      item,
      rows,
      totals: {
        totalQty: totals.totalQty,
        totalValue: totals.totalValue,
        invoiceCount: totals.invoiceSet.size
      }
    });
  } catch (error) {
    console.error("Error in item-wise purchase detail:", error);
    res.status(500).json({ message: "Failed to fetch item wise purchase detail", error: error.message });
  }
});

// Item company wise purchase detail
app.get("/api/reports/purchase/item-company-wise-detail", (req, res) => {
  try {
    const db = getDb();
    const itemCode = String(req.query.itemCode || "").trim();
    const { startDate, endDate } = req.query;

    if (!itemCode) {
      return res.status(400).json({ message: "Item code is required." });
    }

    const item = db
      .prepare(`SELECT id, code, name, base_unit FROM items WHERE code = ? LIMIT 1`)
      .get(itemCode);

    if (!item) {
      return res.status(404).json({ message: `Item not found: ${itemCode}` });
    }

    const params = { itemId: item.id };
    let where = "WHERE pi.item_id = @itemId AND (p.is_cancelled IS NULL OR p.is_cancelled = 0)";

    if (startDate) {
      const normalized = toStorageDate(startDate);
      if (!normalized) {
        return res.status(400).json({ message: "Invalid start date. Use DD-MM-YYYY." });
      }
      params.startDate = normalized;
      where += " AND p.invoice_date >= @startDate";
    }

    if (endDate) {
      const normalized = toStorageDate(endDate);
      if (!normalized) {
        return res.status(400).json({ message: "Invalid end date. Use DD-MM-YYYY." });
      }
      params.endDate = normalized;
      where += " AND p.invoice_date <= @endDate";
    }

    const rows = db
      .prepare(
        `SELECT 
          p.invoice_no,
          p.invoice_date,
          s.code AS supplier_code,
          s.name AS supplier_name,
          pi.quantity,
          pi.base_unit,
          pi.bonus,
          pi.purchase_rate,
          pi.discount_percent,
          0 AS tax_percent,
          pi.net_amount,
          (pi.quantity + pi.bonus) * pi.purchase_rate AS gross_amount
         FROM purchase_items pi
         INNER JOIN purchases p ON p.id = pi.purchase_id
         INNER JOIN suppliers s ON s.id = p.supplier_id
         ${where}
         ORDER BY s.code ASC, p.invoice_date DESC, p.invoice_no DESC`
      )
      .all(params)
      .map(mapRowDates);

    res.json({
      item,
      rows
    });
  } catch (error) {
    console.error("Error in item-company-wise purchase detail:", error);
    res.status(500).json({ message: "Failed to fetch item company wise purchase detail", error: error.message });
  }
});

// Company-wise purchase detail (by supplier, showing all items)
app.get("/api/reports/purchase/company-wise-detail", (req, res) => {
  try {
    const db = getDb();
    const supplierCode = String(req.query.supplierCode || "").trim();
    const companyId = req.query.companyId ? Number(req.query.companyId) : null;
    const { startDate, endDate } = req.query;

    if (!supplierCode) {
      return res.status(400).json({ message: "Supplier code is required." });
    }

    const supplier = db
      .prepare(`SELECT id, code, name FROM suppliers WHERE code = ? LIMIT 1`)
      .get(supplierCode);

    if (!supplier) {
      return res.status(404).json({ message: `Supplier not found: ${supplierCode}` });
    }

    const params = { supplierId: supplier.id };
    let where = "WHERE p.supplier_id = @supplierId AND (p.is_cancelled IS NULL OR p.is_cancelled = 0)";

    if (companyId) {
      params.companyId = companyId;
      where += " AND i.company_id = @companyId";
    }

    if (startDate) {
      const normalized = toStorageDate(startDate);
      if (!normalized) {
        return res.status(400).json({ message: "Invalid start date. Use DD-MM-YYYY." });
      }
      params.startDate = normalized;
      where += " AND p.invoice_date >= @startDate";
    }

    if (endDate) {
      const normalized = toStorageDate(endDate);
      if (!normalized) {
        return res.status(400).json({ message: "Invalid end date. Use DD-MM-YYYY." });
      }
      params.endDate = normalized;
      where += " AND p.invoice_date <= @endDate";
    }

    const rows = db
      .prepare(
        `SELECT 
          p.invoice_no,
          p.invoice_date,
          i.code AS item_code,
          i.name AS item_name,
          pi.quantity,
          i.base_unit,
          pi.bonus,
          pi.purchase_rate,
          pi.discount_percent,
          0 AS tax_percent,
          pi.net_amount,
          (pi.quantity + pi.bonus) * pi.purchase_rate AS gross_amount
         FROM purchase_items pi
         INNER JOIN purchases p ON p.id = pi.purchase_id
         INNER JOIN items i ON i.id = pi.item_id
         ${where}
         ORDER BY p.invoice_date DESC, p.invoice_no DESC, i.code ASC`
      )
      .all(params)
      .map(mapRowDates);

    res.json({
      supplier,
      rows
    });
  } catch (error) {
    console.error("Error in company-wise purchase detail:", error);
    res.status(500).json({ message: "Failed to fetch company wise purchase detail", error: error.message });
  }
});

// Company wise item purchase summary
app.get("/api/reports/purchase/company-wise-item-summary", (req, res) => {
  try {
    const db = getDb();
    const companyId = req.query.companyId ? Number(req.query.companyId) : null;
    const { startDate, endDate } = req.query;

    if (!companyId) {
      return res.status(400).json({ message: "Company ID is required." });
    }

    const company = db
      .prepare(`SELECT id, name FROM companies WHERE id = ? LIMIT 1`)
      .get(companyId);

    if (!company) {
      return res.status(404).json({ message: `Company not found: ${companyId}` });
    }

    const params = { companyId };
    let where = "WHERE i.company_id = @companyId";

    if (startDate) {
      const normalized = toStorageDate(startDate);
      if (!normalized) {
        return res.status(400).json({ message: "Invalid start date. Use DD-MM-YYYY." });
      }
      params.startDate = normalized;
      where += " AND p.invoice_date >= @startDate";
    }

    if (endDate) {
      const normalized = toStorageDate(endDate);
      if (!normalized) {
        return res.status(400).json({ message: "Invalid end date. Use DD-MM-YYYY." });
      }
      params.endDate = normalized;
      where += " AND p.invoice_date <= @endDate";
    }

    const rows = db
      .prepare(
        `SELECT 
          i.code AS item_code,
          i.name AS item_name,
          SUM(pi.quantity) AS total_qty,
          SUM(pi.quantity * pi.purchase_rate) AS total_amount,
          COUNT(DISTINCT p.id) AS invoice_count
         FROM purchase_items pi
         INNER JOIN purchases p ON p.id = pi.purchase_id
         INNER JOIN items i ON i.id = pi.item_id
         ${where}
         GROUP BY i.id, i.code, i.name
         ORDER BY i.code ASC`
      )
      .all(params)
      .map(mapRowDates);

    res.json({
      company,
      rows
    });
  } catch (error) {
    console.error("Error in company-wise item purchase summary:", error);
    res.status(500).json({ message: "Failed to fetch company wise item purchase summary", error: error.message });
  }
});

// Supplier wise ledger
app.get("/api/reports/supplier-ledger/:supplierId", (req, res) => {
  try {
    const db = getDb();
    const { supplierId } = req.params;
    const { start_date, end_date } = req.query;

    // Get supplier info
    const supplier = db.prepare(`
      SELECT id, code, name FROM suppliers WHERE id = ?
    `).get(supplierId);

    if (!supplier) {
      return res.status(404).json({ message: "Supplier not found" });
    }

    // Try to get opening balance from supplier_opening_balances table
    let opening = 0;
    try {
      const openingBalance = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as opening_balance 
        FROM supplier_opening_balances 
        WHERE supplier_id = ?
      `).get(supplierId);
      opening = openingBalance?.opening_balance || 0;
    } catch (e) {
      // Table might not exist, use 0
      opening = 0;
    }

    // Build date filter clause
    let dateFilter = "";
    const params = [supplierId, supplierId];
    if (start_date) {
      dateFilter += ` AND p.invoice_date >= ?`;
      params.push(start_date);
    }
    if (end_date) {
      dateFilter += ` AND p.invoice_date <= ?`;
      params.push(end_date);
    }

    // Get all purchase and purchase return transactions
    let transactions = [];
    try {
      const query = `
        SELECT 
          'PURCHASE' as type,
          p.invoice_no,
          p.invoice_date,
          'PURCHASE' as description,
          p.total_amount as debit,
          0 as credit
        FROM purchases p
        WHERE p.supplier_id = ? AND p.is_cancelled = 0${dateFilter}
        
        UNION ALL
        
        SELECT 
          'PURCHASE_PAYMENT' as type,
          p.invoice_no,
          p.invoice_date,
          'PAYMENT' as description,
          0 as debit,
          p.amount_paid as credit
        FROM purchases p
        WHERE p.supplier_id = ? AND p.is_cancelled = 0 AND p.amount_paid > 0${dateFilter}
        
        UNION ALL
        
        SELECT 
          'PURCHASE_RETURN' as type,
          pr.return_no as invoice_no,
          pr.return_date as invoice_date,
          'PURCHASE RETURN' as description,
          0 as debit,
          (pi.purchase_rate * pr.quantity) as credit
        FROM purchase_returns pr
        JOIN purchase_items pi ON pi.id = pr.purchase_item_id
        JOIN purchases p ON p.id = pr.purchase_id
        WHERE p.supplier_id = ?${start_date ? ` AND pr.return_date >= ?` : ""}${end_date ? ` AND pr.return_date <= ?` : ""}
        
        UNION ALL
        
        SELECT 
          'PAYMENT' as type,
          sp.payment_no as invoice_no,
          sp.payment_date as invoice_date,
          'PAYMENT' as description,
          0 as debit,
          sp.amount as credit
        FROM supplier_payments sp
        WHERE sp.supplier_id = ?${start_date ? ` AND sp.payment_date >= ?` : ""}${end_date ? ` AND sp.payment_date <= ?` : ""}
        
        ORDER BY invoice_date ASC
      `;
      
      // Build proper params array for all four parts of union
      const allParams = [supplierId];
      if (start_date) allParams.push(start_date);
      if (end_date) allParams.push(end_date);
      // Purchase payments params
      allParams.push(supplierId);
      if (start_date) allParams.push(start_date);
      if (end_date) allParams.push(end_date);
      // Purchase returns params
      allParams.push(supplierId);
      if (start_date) allParams.push(start_date);
      if (end_date) allParams.push(end_date);
      // Supplier payment params
      allParams.push(supplierId);
      if (start_date) allParams.push(start_date);
      if (end_date) allParams.push(end_date);
      
      transactions = db.prepare(query).all(...allParams);
    } catch (e) {
      // If query fails, just get purchases
      const query = `
        SELECT 
          'PURCHASE' as type,
          p.invoice_no,
          p.invoice_date,
          'PURCHASE' as description,
          p.total_amount as debit,
          0 as credit
        FROM purchases p
        WHERE p.supplier_id = ? AND p.is_cancelled = 0${dateFilter}
        ORDER BY p.invoice_date ASC
      `;
      const params2 = [supplierId];
      if (start_date) params2.push(start_date);
      if (end_date) params2.push(end_date);
      transactions = db.prepare(query).all(...params2);
    }

    // Calculate running balance
    let balance = opening;
    const ledgerTransactions = transactions.map(tx => {
      balance += (tx.debit || 0) - (tx.credit || 0);
      return {
        ...tx,
        balance
      };
    });

    // Calculate totals
    const totalDebit = ledgerTransactions.reduce((sum, tx) => sum + (tx.debit || 0), 0);
    const totalCredit = ledgerTransactions.reduce((sum, tx) => sum + (tx.credit || 0), 0);
    const closingBalance = balance;

    res.json({
      supplier_code: supplier.code,
      supplier_name: supplier.name,
      opening_balance: opening,
      transactions: ledgerTransactions,
      total_debit: totalDebit,
      total_credit: totalCredit,
      closing_balance: closingBalance
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch supplier ledger", error: error.message });
  }
});

// ==================== END OF SUPPLIER PAYABLE REPORTS ====================

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Network access available at http://192.168.1.16:${PORT}`);
});

