import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import type { PaymentRecord, PaymentStatus, SavedCard, SavedCardListItem, CreateSavedCardData } from "../types";
import type { CreatePaymentData, CreateWebhookEventData, PaymentStorage, SavedCardsStorage, WebhookEventsStorage } from "./types";

type SqliteRow = {
  id: string;
  user_id: string | null;
  merchant_order_id: string;
  paymob_order_id: number;
  amount_cents: number;
  currency: string;
  status: string;
  payment_key: string | null;
  raw_webhook: string | null;
  created_at: string;
  updated_at: string;
};

type SavedCardRow = {
  id: string;
  user_id: string;
  paymob_token: string;
  masked_pan: string;
  card_brand: string | null;
  last_four: string | null;
  created_at: string;
};

type WebhookEventRow = {
  id: string;
  merchant_order_id: string | null;
  paymob_order_id: number | null;
  event_type: string | null;
  headers: string | null;
  raw_body: string;
  received_at: string;
};

function ensureDirForFile(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function createSqliteStorage(dbPath: string): PaymentStorage & { savedCards: SavedCardsStorage; webhookEvents: WebhookEventsStorage } {
  ensureDirForFile(dbPath);
  const db = new Database(dbPath);

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
  const paymentCols = db.pragma("table_info(payments)") as Array<{ name: string }>;
  if (!paymentCols.some((c) => c.name === "user_id")) {
    db.exec(`ALTER TABLE payments ADD COLUMN user_id TEXT;`);
  }

  const rowToRecord = (row: SqliteRow): PaymentRecord => ({
    id: row.id,
    ...(row.user_id != null && { user_id: row.user_id }),
    merchant_order_id: row.merchant_order_id,
    paymob_order_id: row.paymob_order_id,
    amount_cents: row.amount_cents,
    currency: row.currency,
    status: row.status as PaymentStatus,
    payment_key: row.payment_key ?? undefined,
    raw_webhook: row.raw_webhook != null ? JSON.parse(row.raw_webhook) : undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  });

  const rowToSavedCard = (row: SavedCardRow): SavedCard => ({
    id: row.id,
    user_id: row.user_id,
    paymob_token: row.paymob_token,
    masked_pan: row.masked_pan,
    card_brand: row.card_brand ?? undefined,
    last_four: row.last_four ?? undefined,
    created_at: new Date(row.created_at),
  });

  const rowToWebhookEvent = (row: WebhookEventRow): {
    id: string;
    merchant_order_id?: string;
    paymob_order_id?: number;
    event_type?: string;
    headers?: Record<string, string | string[] | undefined>;
    raw_body: string;
    received_at: Date;
  } => ({
    id: row.id,
    ...(row.merchant_order_id != null && { merchant_order_id: row.merchant_order_id }),
    ...(row.paymob_order_id != null && { paymob_order_id: row.paymob_order_id }),
    ...(row.event_type != null && { event_type: row.event_type }),
    headers: row.headers != null ? (JSON.parse(row.headers) as Record<string, string | string[] | undefined>) : undefined,
    raw_body: row.raw_body,
    received_at: new Date(row.received_at),
  });

  const paymentStorage: PaymentStorage = {
    async create(data: CreatePaymentData): Promise<PaymentRecord> {
      const now = new Date().toISOString();
      const id = crypto.randomUUID();
      db.prepare(
        `INSERT INTO payments (id, user_id, merchant_order_id, paymob_order_id, amount_cents, currency, status, payment_key, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        data.user_id ?? null,
        data.merchant_order_id,
        data.paymob_order_id,
        data.amount_cents,
        data.currency,
        data.status,
        data.payment_key ?? null,
        now,
        now
      );
      const row = db.prepare("SELECT * FROM payments WHERE id = ?").get(id) as SqliteRow;
      return rowToRecord(row);
    },

    async findByMerchantOrderId(merchantOrderId: string): Promise<PaymentRecord | null> {
      const row = db.prepare("SELECT * FROM payments WHERE merchant_order_id = ?").get(merchantOrderId) as SqliteRow | undefined;
      return row ? rowToRecord(row) : null;
    },

    async findByPaymobOrderId(paymobOrderId: number): Promise<PaymentRecord | null> {
      const row = db.prepare("SELECT * FROM payments WHERE paymob_order_id = ?").get(paymobOrderId) as SqliteRow | undefined;
      return row ? rowToRecord(row) : null;
    },

    async updateStatus(
      merchantOrderId: string,
      status: PaymentStatus,
      rawWebhook?: unknown
    ): Promise<void> {
      const row = db.prepare("SELECT status FROM payments WHERE merchant_order_id = ?").get(merchantOrderId) as { status: string } | undefined;
      if (!row || ["PAID", "FAILED"].includes(row.status)) return;
      const updatedAt = new Date().toISOString();
      const rawJson = rawWebhook !== undefined ? JSON.stringify(rawWebhook) : null;
      db.prepare(
        `UPDATE payments SET status = ?, raw_webhook = COALESCE(?, raw_webhook), updated_at = ? WHERE merchant_order_id = ?`
      ).run(status, rawJson, updatedAt, merchantOrderId);
    },
  };

  const webhookEvents: WebhookEventsStorage = {
    async addEvent(data: CreateWebhookEventData): Promise<void> {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO payment_webhook_events (id, merchant_order_id, paymob_order_id, event_type, headers, raw_body, received_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        data.merchant_order_id ?? null,
        data.paymob_order_id ?? null,
        data.event_type ?? null,
        data.headers ? JSON.stringify(data.headers) : null,
        data.raw_body,
        now
      );
    },

    async listEventsByMerchantOrderId(merchantOrderId: string) {
      const rows = db.prepare(
        `SELECT id, merchant_order_id, paymob_order_id, event_type, headers, raw_body, received_at
         FROM payment_webhook_events
         WHERE merchant_order_id = ?
         ORDER BY received_at DESC`
      ).all(merchantOrderId) as WebhookEventRow[];
      return rows.map(rowToWebhookEvent);
    },
  };

  const savedCardsStorage: SavedCardsStorage = {
    async createCard(userId: string, data: CreateSavedCardData): Promise<SavedCard> {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO saved_cards (id, user_id, paymob_token, masked_pan, card_brand, last_four, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        userId,
        data.paymob_token,
        data.masked_pan,
        data.card_brand ?? null,
        data.last_four ?? null,
        now
      );
      const row = db.prepare("SELECT * FROM saved_cards WHERE id = ?").get(id) as SavedCardRow;
      return rowToSavedCard(row);
    },

    async getCardByToken(userId: string, paymobToken: string): Promise<SavedCard | null> {
      const row = db.prepare("SELECT * FROM saved_cards WHERE user_id = ? AND paymob_token = ?").get(userId, paymobToken) as SavedCardRow | undefined;
      return row ? rowToSavedCard(row) : null;
    },

    async listCardsByUserId(userId: string): Promise<SavedCardListItem[]> {
      const rows = db.prepare(
        "SELECT id, masked_pan, card_brand, last_four, created_at FROM saved_cards WHERE user_id = ? ORDER BY created_at DESC"
      ).all(userId) as SavedCardRow[];
      return rows.map((r) => ({
        id: r.id,
        masked_pan: r.masked_pan,
        card_brand: r.card_brand ?? undefined,
        last_four: r.last_four ?? undefined,
        created_at: new Date(r.created_at),
      }));
    },

    async getCardByIdAndUserId(cardId: string, userId: string): Promise<SavedCard | null> {
      const row = db.prepare("SELECT * FROM saved_cards WHERE id = ? AND user_id = ?").get(cardId, userId) as SavedCardRow | undefined;
      return row ? rowToSavedCard(row) : null;
    },

    async deleteCardByIdAndUserId(cardId: string, userId: string): Promise<boolean> {
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
