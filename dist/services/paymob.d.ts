import { AxiosError } from "axios";
import type { SessionRequest } from "../types.js";
/** Paymob Create Intention API response (relevant fields). */
export interface IntentionResponse {
    intention_order_id?: number;
    order_id?: number;
    id?: number;
    order?: number | {
        id?: number;
    };
    client_secret: string;
}
export interface CreateIntentionOptions {
    cardTokens?: string[];
    notificationUrl?: string;
}
/**
 * Create a payment intention via Paymob's Create Intention API.
 * Used by the Mobile SDK flow (client_secret + public_key).
 */
export declare function createIntention(input: SessionRequest, options?: CreateIntentionOptions): Promise<{
    orderId: number;
    clientSecret: string;
}>;
export declare function isPaymobError(err: unknown): err is AxiosError;
