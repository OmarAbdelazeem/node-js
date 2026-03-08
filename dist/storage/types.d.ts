import type { PaymentRecord, PaymentStatus } from "../types.js";
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
