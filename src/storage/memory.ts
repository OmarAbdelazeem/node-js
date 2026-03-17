import type { PaymentRecord, PaymentStatus, SavedCard, SavedCardListItem, CreateSavedCardData } from "../types";
import type { CreatePaymentData, CreateWebhookEventData, PaymentStorage, SavedCardsStorage, WebhookEventsStorage } from "./types";

const byMerchantOrderId = new Map<string, PaymentRecord>();
const byPaymobOrderId = new Map<number, PaymentRecord>();

const byCardId = new Map<string, SavedCard>();

function ensureIndex(record: PaymentRecord): void {
  byMerchantOrderId.set(record.merchant_order_id, record);
  byPaymobOrderId.set(record.paymob_order_id, record);
}

const paymentStorage: PaymentStorage = {
  async create(data: CreatePaymentData): Promise<PaymentRecord> {
    const now = new Date();
    const record: PaymentRecord = {
      ...data,
      createdAt: now,
      updatedAt: now,
    };
    byMerchantOrderId.set(data.merchant_order_id, record);
    byPaymobOrderId.set(data.paymob_order_id, record);
    return record;
  },

  async findByMerchantOrderId(merchantOrderId: string): Promise<PaymentRecord | null> {
    return byMerchantOrderId.get(merchantOrderId) ?? null;
  },

  async findByPaymobOrderId(paymobOrderId: number): Promise<PaymentRecord | null> {
    return byPaymobOrderId.get(paymobOrderId) ?? null;
  },

  async updateStatus(
    merchantOrderId: string,
    status: PaymentStatus,
    rawWebhook?: unknown
  ): Promise<void> {
    const record = byMerchantOrderId.get(merchantOrderId);
    if (!record) return;
    const finalStatuses: PaymentStatus[] = ["PAID", "FAILED"];
    if (finalStatuses.includes(record.status)) return; // idempotent
    record.status = status;
    record.updatedAt = new Date();
    if (rawWebhook !== undefined) record.raw_webhook = rawWebhook;
    ensureIndex(record);
  },
};

const savedCardsStorage: SavedCardsStorage = {
  async createCard(userId: string, data: CreateSavedCardData): Promise<SavedCard> {
    const id = crypto.randomUUID();
    const now = new Date();
    const card: SavedCard = {
      id,
      user_id: userId,
      paymob_token: data.paymob_token,
      masked_pan: data.masked_pan,
      card_brand: data.card_brand,
      last_four: data.last_four,
      created_at: now,
    };
    byCardId.set(id, card);
    return card;
  },

  async getCardByToken(userId: string, paymobToken: string): Promise<SavedCard | null> {
    for (const card of byCardId.values()) {
      if (card.user_id === userId && card.paymob_token === paymobToken) return card;
    }
    return null;
  },

  async listCardsByUserId(userId: string): Promise<SavedCardListItem[]> {
    const list: SavedCardListItem[] = [];
    for (const card of byCardId.values()) {
      if (card.user_id !== userId) continue;
      list.push({
        id: card.id,
        masked_pan: card.masked_pan,
        card_brand: card.card_brand,
        last_four: card.last_four,
        created_at: card.created_at,
      });
    }
    return list.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  },

  async getCardByIdAndUserId(cardId: string, userId: string): Promise<SavedCard | null> {
    const card = byCardId.get(cardId) ?? null;
    if (!card || card.user_id !== userId) return null;
    return card;
  },

  async deleteCardByIdAndUserId(cardId: string, userId: string): Promise<boolean> {
    const card = byCardId.get(cardId);
    if (!card || card.user_id !== userId) return false;
    byCardId.delete(cardId);
    return true;
  },
};

type WebhookEventRecord = {
  id: string;
  merchant_order_id?: string;
  paymob_order_id?: number;
  event_type?: string;
  headers?: Record<string, string | string[] | undefined>;
  raw_body: string;
  received_at: Date;
};

const webhookEvents: WebhookEventsStorage = {
  async addEvent(data: CreateWebhookEventData): Promise<void> {
    events.unshift({
      id: crypto.randomUUID(),
      merchant_order_id: data.merchant_order_id,
      paymob_order_id: data.paymob_order_id,
      event_type: data.event_type,
      headers: data.headers,
      raw_body: data.raw_body,
      received_at: new Date(),
    });
  },

  async listEventsByMerchantOrderId(merchantOrderId: string): Promise<WebhookEventRecord[]> {
    return events.filter((e) => e.merchant_order_id === merchantOrderId);
  },
};

const events: WebhookEventRecord[] = [];

export const memoryStorage: PaymentStorage & { savedCards: SavedCardsStorage; webhookEvents: WebhookEventsStorage } = {
  ...paymentStorage,
  savedCards: savedCardsStorage,
  webhookEvents,
};
