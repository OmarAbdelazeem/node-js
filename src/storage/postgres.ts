import { Pool } from "pg";
import type { PaymentRecord, PaymentStatus, SavedCard, SavedCardListItem, CreateSavedCardData } from "../types";
import type { CreatePaymentData, CreateWebhookEventData, PaymentStorage, SavedCardsStorage, WebhookEventsStorage } from "./types";

export function createPostgresStorage(connectionString: string): PaymentStorage & { savedCards: SavedCardsStorage; webhookEvents: WebhookEventsStorage } {
  const pool = new Pool({ connectionString });

  const rowToRecord = (row: {
    id: string;
    user_id: string | null;
    merchant_order_id: string;
    paymob_order_id: string;
    amount_cents: number;
    currency: string;
    status: string;
    payment_key: string | null;
    raw_webhook: unknown;
    created_at: Date;
    updated_at: Date;
  }): PaymentRecord => ({
    id: row.id,
    ...(row.user_id != null && { user_id: row.user_id }),
    merchant_order_id: row.merchant_order_id,
    paymob_order_id: Number(row.paymob_order_id),
    amount_cents: row.amount_cents,
    currency: row.currency,
    status: row.status as PaymentStatus,
    payment_key: row.payment_key ?? undefined,
    raw_webhook: row.raw_webhook,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

  type SavedCardRow = {
    id: string;
    user_id: string;
    paymob_token: string;
    masked_pan: string;
    card_brand: string | null;
    last_four: string | null;
    created_at: Date;
  };

  const rowToSavedCard = (row: SavedCardRow): SavedCard => ({
    id: row.id,
    user_id: row.user_id,
    paymob_token: row.paymob_token,
    masked_pan: row.masked_pan,
    card_brand: row.card_brand ?? undefined,
    last_four: row.last_four ?? undefined,
    created_at: row.created_at,
  });

  const paymentStorage: PaymentStorage = {
    async create(data: CreatePaymentData): Promise<PaymentRecord> {
      const now = new Date();
      const result = await pool.query(
        `INSERT INTO payments (
          user_id, merchant_order_id, paymob_order_id, amount_cents, currency, status, payment_key, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, user_id, merchant_order_id, paymob_order_id, amount_cents, currency, status, payment_key, raw_webhook, created_at, updated_at`,
        [
          data.user_id ?? null,
          data.merchant_order_id,
          data.paymob_order_id,
          data.amount_cents,
          data.currency,
          data.status,
          data.payment_key ?? null,
          now,
          now,
        ]
      );
      return rowToRecord(result.rows[0]);
    },

    async findByMerchantOrderId(merchantOrderId: string): Promise<PaymentRecord | null> {
      const result = await pool.query(
        `SELECT id, user_id, merchant_order_id, paymob_order_id, amount_cents, currency, status, payment_key, raw_webhook, created_at, updated_at
         FROM payments WHERE merchant_order_id = $1`,
        [merchantOrderId]
      );
      if (result.rows.length === 0) return null;
      return rowToRecord(result.rows[0]);
    },

    async findByPaymobOrderId(paymobOrderId: number): Promise<PaymentRecord | null> {
      const result = await pool.query(
        `SELECT id, user_id, merchant_order_id, paymob_order_id, amount_cents, currency, status, payment_key, raw_webhook, created_at, updated_at
         FROM payments WHERE paymob_order_id = $1`,
        [paymobOrderId]
      );
      if (result.rows.length === 0) return null;
      return rowToRecord(result.rows[0]);
    },

    async updateStatus(
      merchantOrderId: string,
      status: PaymentStatus,
      rawWebhook?: unknown
    ): Promise<void> {
      const existing = await pool.query(
        "SELECT status FROM payments WHERE merchant_order_id = $1",
        [merchantOrderId]
      );
      if (existing.rows.length === 0) return;
      const currentStatus = existing.rows[0].status as string;
      const finalStatuses = ["PAID", "FAILED"];
      if (finalStatuses.includes(currentStatus)) return; // idempotent

      await pool.query(
        `UPDATE payments SET status = $1, raw_webhook = COALESCE($2::jsonb, raw_webhook), updated_at = $3 WHERE merchant_order_id = $4`,
        [status, rawWebhook !== undefined ? JSON.stringify(rawWebhook) : null, new Date(), merchantOrderId]
      );
    },
  };

  const webhookEvents: WebhookEventsStorage = {
    async addEvent(data: CreateWebhookEventData): Promise<void> {
      await pool.query(
        `INSERT INTO payment_webhook_events (merchant_order_id, paymob_order_id, event_type, headers, raw_body, received_at)
         VALUES ($1, $2, $3, $4::jsonb, $5, NOW())`,
        [
          data.merchant_order_id ?? null,
          data.paymob_order_id ?? null,
          data.event_type ?? null,
          data.headers ? JSON.stringify(data.headers) : null,
          data.raw_body,
        ]
      );
    },

    async listEventsByMerchantOrderId(merchantOrderId: string) {
      const result = await pool.query(
        `SELECT id, merchant_order_id, paymob_order_id, event_type, headers, raw_body, received_at
         FROM payment_webhook_events
         WHERE merchant_order_id = $1
         ORDER BY received_at DESC`,
        [merchantOrderId]
      );
      return (result.rows as Array<{
        id: string;
        merchant_order_id: string | null;
        paymob_order_id: string | null;
        event_type: string | null;
        headers: Record<string, string | string[] | undefined> | null;
        raw_body: string;
        received_at: Date;
      }>).map((r) => ({
        id: r.id,
        ...(r.merchant_order_id != null && { merchant_order_id: r.merchant_order_id }),
        ...(r.paymob_order_id != null && { paymob_order_id: Number(r.paymob_order_id) }),
        ...(r.event_type != null && { event_type: r.event_type }),
        headers: r.headers ?? undefined,
        raw_body: r.raw_body,
        received_at: r.received_at,
      }));
    },
  };

  const savedCardsStorage: SavedCardsStorage = {
    async createCard(userId: string, data: CreateSavedCardData): Promise<SavedCard> {
      const result = await pool.query(
        `INSERT INTO saved_cards (user_id, paymob_token, masked_pan, card_brand, last_four, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         RETURNING id, user_id, paymob_token, masked_pan, card_brand, last_four, created_at`,
        [userId, data.paymob_token, data.masked_pan, data.card_brand ?? null, data.last_four ?? null]
      );
      return rowToSavedCard(result.rows[0] as SavedCardRow);
    },

    async getCardByToken(userId: string, paymobToken: string): Promise<SavedCard | null> {
      const result = await pool.query(
        `SELECT id, user_id, paymob_token, masked_pan, card_brand, last_four, created_at
         FROM saved_cards WHERE user_id = $1 AND paymob_token = $2`,
        [userId, paymobToken]
      );
      if (result.rows.length === 0) return null;
      return rowToSavedCard(result.rows[0] as SavedCardRow);
    },

    async listCardsByUserId(userId: string): Promise<SavedCardListItem[]> {
      const result = await pool.query(
        `SELECT id, masked_pan, card_brand, last_four, created_at FROM saved_cards WHERE user_id = $1 ORDER BY created_at DESC`,
        [userId]
      );
      return (result.rows as SavedCardRow[]).map((r) => ({
        id: r.id,
        masked_pan: r.masked_pan,
        card_brand: r.card_brand ?? undefined,
        last_four: r.last_four ?? undefined,
        created_at: r.created_at,
      }));
    },

    async getCardByIdAndUserId(cardId: string, userId: string): Promise<SavedCard | null> {
      const result = await pool.query(
        `SELECT id, user_id, paymob_token, masked_pan, card_brand, last_four, created_at FROM saved_cards WHERE id = $1 AND user_id = $2`,
        [cardId, userId]
      );
      if (result.rows.length === 0) return null;
      return rowToSavedCard(result.rows[0] as SavedCardRow);
    },

    async deleteCardByIdAndUserId(cardId: string, userId: string): Promise<boolean> {
      const result = await pool.query(
        "DELETE FROM saved_cards WHERE id = $1 AND user_id = $2",
        [cardId, userId]
      );
      return (result.rowCount ?? 0) > 0;
    },
  };

  return {
    ...paymentStorage,
    savedCards: savedCardsStorage,
    webhookEvents,
  };
}
