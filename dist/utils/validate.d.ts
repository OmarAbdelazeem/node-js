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
