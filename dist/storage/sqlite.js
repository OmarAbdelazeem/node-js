"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSqliteStorage = createSqliteStorage;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const fs_1 = require("fs");
const path_1 = require("path");
function ensureDirForFile(filePath) {
    const dir = (0, path_1.dirname)(filePath);
    if (!(0, fs_1.existsSync)(dir)) {
        (0, fs_1.mkdirSync)(dir, { recursive: true });
    }
}
function createSqliteStorage(dbPath) {
    ensureDirForFile(dbPath);
    const db = new better_sqlite3_1.default(dbPath);
    db.exec(`
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      merchant_order_id TEXT NOT NULL UNIQUE,
      paymob_order_id INTEGER NOT NULL,
      amount_cents INTEGER NOT NULL,
      currency TEXT NOT NULL,
      status TEXT NOT NULL,
      payment_key TEXT,
      raw_webhook TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_payments_paymob_order_id ON payments (paymob_order_id);
    CREATE INDEX IF NOT EXISTS idx_payments_merchant_order_id ON payments (merchant_order_id);
  `);
    const rowToRecord = (row) => ({
        id: row.id,
        merchant_order_id: row.merchant_order_id,
        paymob_order_id: row.paymob_order_id,
        amount_cents: row.amount_cents,
        currency: row.currency,
        status: row.status,
        payment_key: row.payment_key ?? undefined,
        raw_webhook: row.raw_webhook != null ? JSON.parse(row.raw_webhook) : undefined,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
    });
    return {
        async create(data) {
            const now = new Date().toISOString();
            const id = crypto.randomUUID();
            db.prepare(`INSERT INTO payments (id, merchant_order_id, paymob_order_id, amount_cents, currency, status, payment_key, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, data.merchant_order_id, data.paymob_order_id, data.amount_cents, data.currency, data.status, data.payment_key ?? null, now, now);
            const row = db.prepare("SELECT * FROM payments WHERE id = ?").get(id);
            return rowToRecord(row);
        },
        async findByMerchantOrderId(merchantOrderId) {
            const row = db.prepare("SELECT * FROM payments WHERE merchant_order_id = ?").get(merchantOrderId);
            return row ? rowToRecord(row) : null;
        },
        async findByPaymobOrderId(paymobOrderId) {
            const row = db.prepare("SELECT * FROM payments WHERE paymob_order_id = ?").get(paymobOrderId);
            return row ? rowToRecord(row) : null;
        },
        async updateStatus(merchantOrderId, status, rawWebhook) {
            const row = db.prepare("SELECT status FROM payments WHERE merchant_order_id = ?").get(merchantOrderId);
            if (!row || ["PAID", "FAILED"].includes(row.status))
                return;
            const updatedAt = new Date().toISOString();
            const rawJson = rawWebhook !== undefined ? JSON.stringify(rawWebhook) : null;
            db.prepare(`UPDATE payments SET status = ?, raw_webhook = COALESCE(?, raw_webhook), updated_at = ? WHERE merchant_order_id = ?`).run(status, rawJson, updatedAt, merchantOrderId);
        },
    };
}
//# sourceMappingURL=sqlite.js.map