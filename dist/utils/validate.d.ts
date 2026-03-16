import { z } from "zod";
import type { SessionRequest } from "../types";
export declare const sessionBodySchema: z.ZodObject<{
    merchant_order_id: z.ZodString;
    amount_cents: z.ZodNumber;
    currency: z.ZodString;
    customer: z.ZodObject<{
        id: z.ZodString;
        email: z.ZodString;
        first_name: z.ZodString;
        last_name: z.ZodString;
        phone: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
        email: string;
        first_name: string;
        last_name: string;
        phone: string;
    }, {
        id: string;
        email: string;
        first_name: string;
        last_name: string;
        phone: string;
    }>;
    billing: z.ZodObject<{
        apartment: z.ZodString;
        floor: z.ZodString;
        street: z.ZodString;
        building: z.ZodString;
        city: z.ZodString;
        state: z.ZodString;
        country: z.ZodString;
        postal_code: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        apartment: string;
        floor: string;
        street: string;
        building: string;
        city: string;
        state: string;
        country: string;
        postal_code: string;
    }, {
        apartment: string;
        floor: string;
        street: string;
        building: string;
        city: string;
        state: string;
        country: string;
        postal_code: string;
    }>;
    saved_card_uuid: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    merchant_order_id: string;
    amount_cents: number;
    currency: string;
    customer: {
        id: string;
        email: string;
        first_name: string;
        last_name: string;
        phone: string;
    };
    billing: {
        apartment: string;
        floor: string;
        street: string;
        building: string;
        city: string;
        state: string;
        country: string;
        postal_code: string;
    };
    saved_card_uuid?: string | undefined;
}, {
    merchant_order_id: string;
    amount_cents: number;
    currency: string;
    customer: {
        id: string;
        email: string;
        first_name: string;
        last_name: string;
        phone: string;
    };
    billing: {
        apartment: string;
        floor: string;
        street: string;
        building: string;
        city: string;
        state: string;
        country: string;
        postal_code: string;
    };
    saved_card_uuid?: string | undefined;
}>;
export type SessionBody = z.infer<typeof sessionBodySchema>;
export declare function validateSessionBody(body: unknown): SessionRequest;
export declare function validateSessionBodySafe(body: unknown): {
    success: true;
    data: SessionRequest;
} | {
    success: false;
    error: z.ZodError;
};
/** Save card request body (paymob_token + masked_pan from Paymob SDK). */
export declare const saveCardBodySchema: z.ZodObject<{
    paymob_token: z.ZodString;
    masked_pan: z.ZodString;
    card_brand: z.ZodOptional<z.ZodString>;
    last_four: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    paymob_token: string;
    masked_pan: string;
    card_brand?: string | undefined;
    last_four?: string | undefined;
}, {
    paymob_token: string;
    masked_pan: string;
    card_brand?: string | undefined;
    last_four?: string | undefined;
}>;
export type SaveCardBody = z.infer<typeof saveCardBodySchema>;
export declare function validateSaveCardBodySafe(body: unknown): {
    success: true;
    data: SaveCardBody;
} | {
    success: false;
    error: z.ZodError;
};
