import { AxiosError } from "axios";
import type { SessionRequest } from "../types.js";
/**
 * Get Paymob auth token.
 * Uses api_key; if your dashboard provides username/password, set PAYMOB_USERNAME and PAYMOB_PASSWORD and we can branch here.
 */
export declare function getAuthToken(): Promise<{
    token: string;
    merchantId?: number;
}>;
/**
 * Create Paymob order. Returns order id.
 */
export declare function createOrder(authToken: string, merchantId: number | undefined, input: SessionRequest): Promise<number>;
/**
 * Create payment key for card integration (mobile SDK).
 */
export declare function createPaymentKey(authToken: string, orderId: number, input: SessionRequest): Promise<string>;
/**
 * Full flow: auth -> order -> payment_key. Returns { orderId, paymentKey }.
 */
export declare function createSession(input: SessionRequest): Promise<{
    orderId: number;
    paymentKey: string;
}>;
export declare function isPaymobError(err: unknown): err is AxiosError;
