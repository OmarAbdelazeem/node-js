import { z } from "zod";
import type { SessionRequest } from "../types";

const customerSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  first_name: z.string(),
  last_name: z.string(),
  phone: z.string(),
});

const billingSchema = z.object({
  apartment: z.string(),
  floor: z.string(),
  street: z.string(),
  building: z.string(),
  city: z.string(),
  state: z.string(),
  country: z.string(),
  postal_code: z.string(),
});

export const sessionBodySchema = z.object({
  merchant_order_id: z.string().min(1),
  amount_cents: z.number().int().positive(),
  currency: z.string().min(1),
  customer: customerSchema,
  billing: billingSchema,
  saved_card_uuid: z.string().optional(),
});

export type SessionBody = z.infer<typeof sessionBodySchema>;

export function validateSessionBody(body: unknown): SessionRequest {
  return sessionBodySchema.parse(body) as SessionRequest;
}

export function validateSessionBodySafe(
  body: unknown
): { success: true; data: SessionRequest } | { success: false; error: z.ZodError } {
  const result = sessionBodySchema.safeParse(body);
  if (result.success) {
    return { success: true, data: result.data as SessionRequest };
  }
  return { success: false, error: result.error };
}

/** Save card request body (paymob_token + masked_pan from Paymob SDK). */
export const saveCardBodySchema = z.object({
  paymob_token: z.string().min(1),
  masked_pan: z.string().min(1),
  card_brand: z.string().optional(),
  last_four: z.string().optional(),
});

export type SaveCardBody = z.infer<typeof saveCardBodySchema>;

export function validateSaveCardBodySafe(
  body: unknown
): { success: true; data: SaveCardBody } | { success: false; error: z.ZodError } {
  const result = saveCardBodySchema.safeParse(body);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}
