import type { PaymentRecord, PaymentStatus, SavedCard, SavedCardListItem, CreateSavedCardData } from "../types.js";
export interface CreatePaymentData {
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
    updateStatus(merchantOrderId: string, status: PaymentStatus, rawWebhook?: unknown): Promise<void>;
}
export interface SavedCardsStorage {
    createCard(userId: string, data: CreateSavedCardData): Promise<SavedCard>;
    listCardsByUserId(userId: string): Promise<SavedCardListItem[]>;
    getCardByIdAndUserId(cardId: string, userId: string): Promise<SavedCard | null>;
    deleteCardByIdAndUserId(cardId: string, userId: string): Promise<boolean>;
}
