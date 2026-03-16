/**
 * Shared types for Paymob demo backend.
 */
export interface SessionCustomer {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    phone: string;
}
export interface SessionBilling {
    apartment: string;
    floor: string;
    street: string;
    building: string;
    city: string;
    state: string;
    country: string;
    postal_code: string;
}
export interface SessionRequest {
    merchant_order_id: string;
    amount_cents: number;
    currency: string;
    customer: SessionCustomer;
    billing: SessionBilling;
    /** When paying with a saved card; backend passes card token in Create Intention. */
    saved_card_uuid?: string;
}
export interface SessionResponse {
    merchant_order_id: string;
    paymob_order_id: number;
    payment_key: string;
    status: string;
    client_secret: string;
    public_key?: string;
}
export type PaymentStatus = "PENDING" | "PAID" | "FAILED";
export interface PaymentRecord {
    id?: string;
    merchant_order_id: string;
    paymob_order_id: number;
    amount_cents: number;
    currency: string;
    status: PaymentStatus;
    payment_key?: string;
    raw_webhook?: unknown;
    createdAt: Date;
    updatedAt: Date;
}
/** Public payment status response (no payment_key). */
export interface PaymentStatusResponse {
    status: PaymentStatus;
    amount_cents: number;
    currency: string;
    paymob_order_id: number;
    updatedAt: Date;
}
/** Paymob auth token response. */
export interface PaymobAuthResponse {
    token: string;
    profile?: {
        id?: number;
    };
    merchant_id?: number;
}
/** Paymob order creation response. */
export interface PaymobOrderResponse {
    id: number;
}
/** Paymob payment key response. */
export interface PaymobPaymentKeyResponse {
    token: string;
}
/** Generic webhook payload (Paymob may send various shapes). */
export interface PaymobWebhookPayload {
    success?: boolean;
    pending?: boolean;
    obj?: {
        success?: boolean;
        is_success?: boolean;
        pending?: boolean;
        order?: {
            id?: number;
        };
        order_id?: number;
        merchant_order_id?: string;
        special_reference?: string;
    };
    order_id?: number;
    order?: number;
    merchant_order_id?: string;
    special_reference?: string;
    transactions?: Array<{
        success?: boolean;
        pending?: boolean;
    }>;
    [key: string]: unknown;
}
/** Saved card (full record, includes token). */
export interface SavedCard {
    id: string;
    user_id: string;
    paymob_token: string;
    masked_pan: string;
    card_brand?: string;
    last_four?: string;
    created_at: Date;
}
/** Input for creating a saved card (from Paymob SDK after user saves card). */
export interface CreateSavedCardData {
    paymob_token: string;
    masked_pan: string;
    card_brand?: string;
    last_four?: string;
}
/** Saved card list item (no token). */
export interface SavedCardListItem {
    id: string;
    masked_pan: string;
    card_brand?: string;
    last_four?: string;
    created_at: Date;
}
/** Saved card with token (for payment flow). */
export interface SavedCardForPayment {
    id: string;
    paymob_token: string;
    masked_pan: string;
    card_brand?: string;
    last_four?: string;
}
export interface EnvConfig {
    PORT: number;
    BASE_URL: string;
    PAYMOB_API_KEY: string;
    PAYMOB_HMAC_SECRET: string;
    PAYMOB_INTEGRATION_ID_CARD: number;
    PAYMOB_IFRAME_ID: string;
    PAYMOB_API_BASE: string;
    USE_DB: boolean;
    DATABASE_URL: string;
    DEV_BYPASS_HMAC: boolean;
}
