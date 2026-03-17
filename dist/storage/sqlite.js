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
      user_id TEXT,
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
    CREATE TABLE IF NOT EXISTS payment_webhook_events (
      id TEXT PRIMARY KEY,
      merchant_order_id TEXT,
      paymob_order_id INTEGER,
      event_type TEXT,
      headers TEXT,
      raw_body TEXT NOT NULL,
      received_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_webhook_events_merchant_order_id ON payment_webhook_events (merchant_order_id);
    CREATE INDEX IF NOT EXISTS idx_webhook_events_paymob_order_id ON payment_webhook_events (paymob_order_id);
    CREATE TABLE IF NOT EXISTS saved_cards (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      paymob_token TEXT NOT NULL,
      masked_pan TEXT NOT NULL,
      card_brand TEXT,
      last_four TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_saved_cards_user_id ON saved_cards (user_id);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_saved_cards_user_token ON saved_cards (user_id, paymob_token);
  `);
    // Migrate existing DB files (older schema) to include payments.user_id
    const paymentCols = db.pragma("table_info(payments)");
    if (!paymentCols.some((c) => c.name === "user_id")) {
        db.exec(`ALTER TABLE payments ADD COLUMN user_id TEXT;`);
    }
    const rowToRecord = (row) => ({
        id: row.id,
        ...(row.user_id != null && { user_id: row.user_id }),
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
    const rowToSavedCard = (row) => ({
        id: row.id,
        user_id: row.user_id,
        paymob_token: row.paymob_token,
        masked_pan: row.masked_pan,
        card_brand: row.card_brand ?? undefined,
        last_four: row.last_four ?? undefined,
        created_at: new Date(row.created_at),
    });
    const rowToWebhookEvent = (row) => ({
        id: row.id,
        ...(row.merchant_order_id != null && { merchant_order_id: row.merchant_order_id }),
        ...(row.paymob_order_id != null && { paymob_order_id: row.paymob_order_id }),
        ...(row.event_type != null && { event_type: row.event_type }),
        headers: row.headers != null ? JSON.parse(row.headers) : undefined,
        raw_body: row.raw_body,
        received_at: new Date(row.received_at),
    });
    const paymentStorage = {
        async create(data) {
            const now = new Date().toISOString();
            const id = crypto.randomUUID();
            db.prepare(`INSERT INTO payments (id, user_id, merchant_order_id, paymob_order_id, amount_cents, currency, status, payment_key, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, data.user_id ?? null, data.merchant_order_id, data.paymob_order_id, data.amount_cents, data.currency, data.status, data.payment_key ?? null, now, now);
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
    const webhookEvents = {
        async addEvent(data) {
            const id = crypto.randomUUID();
            const now = new Date().toISOString();
            db.prepare(`INSERT INTO payment_webhook_events (id, merchant_order_id, paymob_order_id, event_type, headers, raw_body, received_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, data.merchant_order_id ?? null, data.paymob_order_id ?? null, data.event_type ?? null, data.headers ? JSON.stringify(data.headers) : null, data.raw_body, now);
        },
        async listEventsByMerchantOrderId(merchantOrderId) {
            const rows = db.prepare(`SELECT id, merchant_order_id, paymob_order_id, event_type, headers, raw_body, received_at
         FROM payment_webhook_events
         WHERE merchant_order_id = ?
         ORDER BY received_at DESC`).all(merchantOrderId);
            return rows.map(rowToWebhookEvent);
        },
    };
    const savedCardsStorage = {
        async createCard(userId, data) {
            const id = crypto.randomUUID();
            const now = new Date().toISOString();
            db.prepare(`INSERT INTO saved_cards (id, user_id, paymob_token, masked_pan, card_brand, last_four, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, userId, data.paymob_token, data.masked_pan, data.card_brand ?? null, data.last_four ?? null, now);
            const row = db.prepare("SELECT * FROM saved_cards WHERE id = ?").get(id);
            return rowToSavedCard(row);
        },
        async getCardByToken(userId, paymobToken) {
            const row = db.prepare("SELECT * FROM saved_cards WHERE user_id = ? AND paymob_token = ?").get(userId, paymobToken);
            return row ? rowToSavedCard(row) : null;
        },
        async listCardsByUserId(userId) {
            const rows = db.prepare("SELECT id, masked_pan, card_brand, last_four, created_at FROM saved_cards WHERE user_id = ? ORDER BY created_at DESC").all(userId);
            return rows.map((r) => ({
                id: r.id,
                masked_pan: r.masked_pan,
                card_brand: r.card_brand ?? undefined,
                last_four: r.last_four ?? undefined,
                created_at: new Date(r.created_at),
            }));
        },
        async getCardByIdAndUserId(cardId, userId) {
            const row = db.prepare("SELECT * FROM saved_cards WHERE id = ? AND user_id = ?").get(cardId, userId);
            return row ? rowToSavedCard(row) : null;
        },
        async deleteCardByIdAndUserId(cardId, userId) {
            const result = db.prepare("DELETE FROM saved_cards WHERE id = ? AND user_id = ?").run(cardId, userId);
            return result.changes > 0;
        },
    };
    return {
        ...paymentStorage,
        savedCards: savedCardsStorage,
        webhookEvents,
    };
}
//# sourceMappingURL=sqlite.js.map