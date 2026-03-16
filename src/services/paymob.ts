import axios, { AxiosError } from "axios";
import type { SessionRequest } from "../types.js";

const PAYMOB_API_BASE =
  process.env.PAYMOB_API_BASE ?? "https://accept.paymob.com/api";
const PAYMOB_INTENTION_BASE =
  process.env.PAYMOB_INTENTION_BASE ??
  (PAYMOB_API_BASE.replace(/\/api\/?$/, "") || "https://accept.paymob.com");
const PAYMOB_SECRET_KEY = process.env.PAYMOB_SECRET_KEY!;
const PAYMOB_INTEGRATION_ID_CARD = process.env.PAYMOB_INTEGRATION_ID_CARD!;

function getIntentionBaseUrl(): string {
  return PAYMOB_INTENTION_BASE.replace(/\/$/, "");
}

/** Paymob Create Intention API response (relevant fields). */
export interface IntentionResponse {
  intention_order_id?: number;
  order_id?: number;
  id?: number;
  order?: number | { id?: number };
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
export async function createIntention(
  input: SessionRequest,
  options: CreateIntentionOptions = {}
): Promise<{ orderId: number; clientSecret: string }> {
  const { customer, billing } = input;
  const url = `${getIntentionBaseUrl()}/v1/intention/`;
  const integrationId = Number(PAYMOB_INTEGRATION_ID_CARD);

  const body: Record<string, unknown> = {
    amount: input.amount_cents,
    currency: input.currency,
    payment_methods: [Number.isNaN(integrationId) ? "card" : integrationId],
    items: [{ name: "Order", amount: input.amount_cents }],
    billing_data: {
      first_name: customer.first_name,
      last_name: customer.last_name,
      email: customer.email,
      phone_number: customer.phone,
      country: billing.country,
      apartment: billing.apartment,
      floor: billing.floor,
      street: billing.street,
      building: billing.building,
      city: billing.city,
      state: billing.state,
      postal_code: billing.postal_code,
    },
    special_reference: input.merchant_order_id,
    expiration: 3600,
  };

  if (options.notificationUrl && options.notificationUrl.trim()) {
    body.notification_url = options.notificationUrl.trim();
  }
  if (options.cardTokens && options.cardTokens.length > 0) {
    body.card_tokens = options.cardTokens;
  }

  // Debug: log request (no secrets in body)
  console.log("[paymob] Create intention request", {
    url,
    body: JSON.stringify(body, null, 2),
  });

  const res = await axios.post<IntentionResponse>(url, body, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Token ${PAYMOB_SECRET_KEY}`,
    },
    validateStatus: () => true,
  });

  if (res.status < 200 || res.status >= 300) {
    const data = res.data as unknown as { detail?: string; message?: string };
    // Debug: log full error response from Paymob
    console.error("[paymob] Intention failed", {
      status: res.status,
      statusText: res.statusText,
      responseData: res.data,
    });
    const msg =
      typeof data?.detail === "string"
        ? data.detail
        : typeof data?.message === "string"
          ? data.message
          : `Paymob intention failed with status ${res.status}`;
    throw new Error(msg);
  }

  const data = res.data as IntentionResponse;
  const clientSecret = data.client_secret;
  // Paymob returns intention_order_id; fallbacks for older/different response shapes
  const rawOrder = data.order;
  const orderId =
    data.intention_order_id ??
    data.order_id ??
    data.id ??
    (typeof rawOrder === "number" ? rawOrder : null) ??
    (rawOrder && typeof rawOrder === "object" && typeof (rawOrder as { id?: number }).id === "number"
      ? (rawOrder as { id: number }).id
      : null);

  if (orderId == null || typeof orderId !== "number") {
    console.error("[paymob] Intention response missing order id. Full response:", JSON.stringify(res.data));
    throw new Error("Paymob intention response missing order_id");
  }
  if (!clientSecret || typeof clientSecret !== "string") {
    throw new Error("Paymob intention response missing client_secret");
  }

  console.log("[paymob] Intention created", { orderId, clientSecretLength: clientSecret.length });
  return { orderId, clientSecret };
}

export function isPaymobError(err: unknown): err is AxiosError {
  return axios.isAxiosError(err);
}
