import axios, { AxiosError } from "axios";
import type {
  PaymobAuthResponse,
  PaymobOrderResponse,
  PaymobPaymentKeyResponse,
  SessionRequest,
} from "../types.js";

const PAYMOB_API_BASE =
  process.env.PAYMOB_API_BASE ?? "https://accept.paymob.com/api";
const PAYMOB_API_KEY = process.env.PAYMOB_API_KEY!;
const PAYMOB_INTEGRATION_ID_CARD = process.env.PAYMOB_INTEGRATION_ID_CARD!;

function getBaseUrl(): string {
  return PAYMOB_API_BASE.replace(/\/$/, "");
}

/**
 * Get Paymob auth token.
 * Uses api_key; if your dashboard provides username/password, set PAYMOB_USERNAME and PAYMOB_PASSWORD and we can branch here.
 */
export async function getAuthToken(): Promise<{ token: string; merchantId?: number }> {
  const url = `${getBaseUrl()}/auth/tokens`;
  const body = process.env.PAYMOB_USERNAME
    ? { username: process.env.PAYMOB_USERNAME, password: process.env.PAYMOB_PASSWORD }
    : { api_key: PAYMOB_API_KEY };

  const res = await axios.post<PaymobAuthResponse>(url, body, {
    headers: { "Content-Type": "application/json" },
    validateStatus: () => true,
  });

  if ((res.status < 200 || res.status >= 300) || !res.data?.token) {
    const data = res.data as unknown as { message?: string };
    const msg = typeof data?.message === "string"
      ? data.message
      : `Paymob auth failed with status ${res.status}`;
    throw new Error(msg);
  }

  const data = res.data as PaymobAuthResponse;
  const merchantId = data.merchant_id ?? data.profile?.id;
  return { token: data.token, merchantId };
}

/**
 * Create Paymob order. Returns order id.
 */
export async function createOrder(
  authToken: string,
  merchantId: number | undefined,
  input: SessionRequest
): Promise<number> {
  const url = `${getBaseUrl()}/ecommerce/orders`;
  const body: Record<string, unknown> = {
    delivery_needed: false,
    amount_cents: input.amount_cents,
    currency: input.currency,
    merchant_order_id: input.merchant_order_id,
    items: [],
  };
  if (merchantId != null) body.merchant_id = merchantId;

  const res = await axios.post<PaymobOrderResponse>(url, body, {
    headers: { "Content-Type": "application/json" },
    params: { token: authToken },
    validateStatus: () => true,
  });

  if (res.status !== 200 && res.status !== 201) {
    const err = res.data as { message?: string };
    throw new Error(err?.message ?? `Paymob order failed with status ${res.status}`);
  }

  const id = (res.data as PaymobOrderResponse).id;
  if (id == null || typeof id !== "number") {
    throw new Error("Paymob order response missing id");
  }
  return id;
}

/**
 * Create payment key for card integration (mobile SDK).
 */
export async function createPaymentKey(
  authToken: string,
  orderId: number,
  input: SessionRequest
): Promise<string> {
  const url = `${getBaseUrl()}/acceptance/payment_keys`;
  const { customer, billing } = input;
  const billing_data = {
    first_name: customer.first_name,
    last_name: customer.last_name,
    email: customer.email,
    phone_number: customer.phone,
    apartment: billing.apartment,
    floor: billing.floor,
    street: billing.street,
    building: billing.building,
    city: billing.city,
    state: billing.state,
    country: billing.country,
    postal_code: billing.postal_code,
  };

  const body = {
    amount_cents: input.amount_cents,
    expiration: 3600,
    order_id: orderId,
    currency: input.currency,
    integration_id: Number(PAYMOB_INTEGRATION_ID_CARD),
    billing_data,
  };

  const res = await axios.post<PaymobPaymentKeyResponse>(url, body, {
    headers: { "Content-Type": "application/json" },
    params: { token: authToken },
    validateStatus: () => true,
  });

  if (res.status !== 200 && res.status !== 201) {
    const err = res.data as { message?: string };
    throw new Error(err?.message ?? `Paymob payment_key failed with status ${res.status}`);
  }

  const token = (res.data as PaymobPaymentKeyResponse).token;
  if (!token || typeof token !== "string") {
    throw new Error("Paymob payment_key response missing token");
  }
  return token;
}

/**
 * Full flow: auth -> order -> payment_key. Returns { orderId, paymentKey }.
 */
export async function createSession(input: SessionRequest): Promise<{
  orderId: number;
  paymentKey: string;
}> {
  const { token: authToken, merchantId } = await getAuthToken();
  const orderId = await createOrder(authToken, merchantId, input);
  const paymentKey = await createPaymentKey(authToken, orderId, input);
  return { orderId, paymentKey };
}

export function isPaymobError(err: unknown): err is AxiosError {
  return axios.isAxiosError(err);
}
