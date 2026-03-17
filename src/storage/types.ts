import type {
  PaymentRecord,
  PaymentStatus,
  SavedCard,
  SavedCardListItem,
  CreateSavedCardData,
} from "../types.js";

export interface CreatePaymentData {
  /** Optional: app user/device id for mapping callbacks to user */
  user_id?: string;
  merchant_order_id: string;
  paymob_order_id: number;
  amount_cents: number;
  currency: string;
  status: PaymentStatus;
  payment_key?: string;
}

export interface PaymentStorage {
  create(data: CreatePaymentData): Promise<PaymentRecord>;
  findByMerchantOrderId(merchantOrderId: string): Promise<PaymentRecord | null>;
  findByPaymobOrderId(paymobOrderId: number): Promise<PaymentRecord | null>;
  updateStatus(
    merchantOrderId: string,
    status: PaymentStatus,
    rawWebhook?: unknown
  ): Promise<void>;
}

export interface CreateWebhookEventData {
  merchant_order_id?: string;
  paymob_order_id?: number;
  event_type?: string;
  headers?: Record<string, string | string[] | undefined>;
  raw_body: string;
}

export interface WebhookEventsStorage {
  addEvent(data: CreateWebhookEventData): Promise<void>;
  listEventsByMerchantOrderId(merchantOrderId: string): Promise<Array<{
    id: string;
    merchant_order_id?: string;
    paymob_order_id?: number;
    event_type?: string;
    headers?: Record<string, string | string[] | undefined>;
    raw_body: string;
    received_at: Date;
  }>>;
}

export interface SavedCardsStorage {
  createCard(userId: string, data: CreateSavedCardData): Promise<SavedCard>;
  getCardByToken(userId: string, paymobToken: string): Promise<SavedCard | null>;
  listCardsByUserId(userId: string): Promise<SavedCardListItem[]>;
  getCardByIdAndUserId(cardId: string, userId: string): Promise<SavedCard | null>;
  deleteCardByIdAndUserId(cardId: string, userId: string): Promise<boolean>;
}
