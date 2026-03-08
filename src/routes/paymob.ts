import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";
import { validateSessionBodySafe } from "../utils/validate";
import { createSession } from "../services/paymob";
import { getStorage } from "../storage/index";
import { verifyHmac, isHmacBypassEnabled } from "../utils/hmac";
import type { PaymentStatus } from "../types";
import type { PaymobWebhookPayload } from "../types";

const router = Router();
const storage = getStorage();

/**
 * POST /payments/paymob/session
 * Body: SessionRequest (merchant_order_id, amount_cents, currency, customer, billing)
 * Returns: { merchant_order_id, paymob_order_id, payment_key, status: "PENDING" }
 */
router.post("/payments/paymob/session", async (req: Request, res: Response) => {
  const parsed = validateSessionBodySafe(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Validation failed",
      details: parsed.error.flatten(),
    });
  }
  const input = parsed.data;

  try {
    const { orderId, paymentKey } = await createSession(input);
    await storage.create({
      merchant_order_id: input.merchant_order_id,
      paymob_order_id: orderId,
      amount_cents: input.amount_cents,
      currency: input.currency,
      status: "PENDING",
      payment_key: paymentKey,
    });

    return res.status(200).json({
      merchant_order_id: input.merchant_order_id,
      paymob_order_id: orderId,
      payment_key: paymentKey,
      status: "PENDING",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Payment session failed";
    return res.status(502).json({ error: message });
  }
});

/**
 * POST /payments/paymob/webhook
 * Expects raw body (Buffer) for HMAC. Signature from query `hmac` or header `hmac`.
 * DEV_BYPASS_HMAC=true skips verification.
 */
export function webhookHandler(req: Request, res: Response): void {
  const rawBody = req.body as Buffer | undefined;
  if (!rawBody || !Buffer.isBuffer(rawBody)) {
    res.status(400).json({ error: "Missing body" });
    return;
  }

  const payloadStr = rawBody.toString("utf8");
  let payload: PaymobWebhookPayload;
  try {
    payload = JSON.parse(payloadStr) as PaymobWebhookPayload;
  } catch {
    res.status(400).json({ error: "Invalid JSON" });
    return;
  }

  const queryHmac = typeof req.query.hmac === "string" ? req.query.hmac : undefined;
  const headerHmac = typeof req.headers.hmac === "string" ? req.headers.hmac : undefined;
  const signature = queryHmac ?? headerHmac;

  if (isHmacBypassEnabled()) {
    if (process.env.NODE_ENV !== "test") {
      console.warn("[webhook] DEV_BYPASS_HMAC is true; HMAC verification skipped");
    }
  } else {
    const secret = process.env.PAYMOB_HMAC_SECRET;
    if (!secret) {
      res.status(500).json({ error: "HMAC secret not configured" });
      return;
    }
    if (!signature) {
      res.status(401).json({ error: "Missing HMAC (query param or header)" });
      return;
    }
    const valid = verifyHmac(secret, { queryHmac, headerHmac, payload: payloadStr });
    if (!valid) {
      res.status(401).json({ error: "Invalid HMAC" });
      return;
    }
  }

  const status = resolveWebhookStatus(payload);
  const paymobOrderId = resolvePaymobOrderId(payload);
  const merchantOrderId = resolveMerchantOrderId(payload);

  (async () => {
    let record = null;
    if (paymobOrderId != null) {
      record = await storage.findByPaymobOrderId(paymobOrderId);
    }
    if (!record && merchantOrderId) {
      record = await storage.findByMerchantOrderId(merchantOrderId);
    }
    if (!record) {
      res.status(200).send();
      return;
    }
    const finalStatuses: PaymentStatus[] = ["PAID", "FAILED"];
    if (finalStatuses.includes(record.status)) {
      res.status(200).send();
      return;
    }
    await storage.updateStatus(record.merchant_order_id, status, payload);
    res.status(200).send();
  })();
}

function resolveWebhookStatus(payload: PaymobWebhookPayload): PaymentStatus {
  const success =
    payload?.obj?.success === true ||
    payload?.obj?.is_success === true ||
    payload?.success === true;
  const pending =
    payload?.obj?.pending === true || payload?.pending === true;
  if (success && !pending) return "PAID";
  if (pending) return "PENDING";
  return "FAILED";
}

function resolvePaymobOrderId(payload: PaymobWebhookPayload): number | null {
  const o = payload?.obj;
  const id = o?.order?.id ?? o?.order_id ?? payload?.order_id ?? payload?.order;
  if (typeof id === "number") return id;
  if (typeof id === "string") return parseInt(id, 10) || null;
  return null;
}

function resolveMerchantOrderId(payload: PaymobWebhookPayload): string | null {
  const id = payload?.obj?.merchant_order_id ?? payload?.merchant_order_id;
  return typeof id === "string" ? id : null;
}

/**
 * GET /orders/:merchant_order_id/payment-status
 */
router.get("/orders/:merchant_order_id/payment-status", async (req: Request, res: Response) => {
  const { merchant_order_id } = req.params;
  const record = await storage.findByMerchantOrderId(merchant_order_id);
  if (!record) {
    return res.status(404).json({ error: "Order not found" });
  }
  return res.status(200).json({
    status: record.status,
    amount_cents: record.amount_cents,
    currency: record.currency,
    paymob_order_id: record.paymob_order_id,
    updatedAt: record.updatedAt,
  });
});

/**
 * POST /demo/orders - create a dummy order id for testing
 */
router.post("/demo/orders", (_req: Request, res: Response) => {
  const merchant_order_id = `demo-${randomUUID()}`;
  return res.status(200).json({ merchant_order_id });
});

/**
 * GET /health
 */
router.get("/health", (_req: Request, res: Response) => {
  return res.status(200).json({ status: "ok" });
});

export default router;
export { router as paymobRoutes };
