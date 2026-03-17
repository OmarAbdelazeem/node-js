import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";
import { validateSessionBodySafe } from "../utils/validate";
import { createIntention } from "../services/paymob";
import { getStorage } from "../storage/index";
import { verifyHmac, isHmacBypassEnabled } from "../utils/hmac";
import type { PaymentStatus } from "../types";
import type { PaymobWebhookPayload } from "../types";

const router = Router();
const storage = getStorage();

function findTokenishKeys(value: unknown): string[] {
  const matches: string[] = [];
  const visit = (v: unknown, path: string) => {
    if (v == null) return;
    if (Array.isArray(v)) {
      v.forEach((item, idx) => visit(item, `${path}[${idx}]`));
      return;
    }
    if (typeof v === "object") {
      for (const [k, child] of Object.entries(v as Record<string, unknown>)) {
        const p = path ? `${path}.${k}` : k;
        if (/(^|_)(token|card_token|cardToken|card_tokens|saved)(_|\b)/i.test(k)) {
          matches.push(p);
        }
        visit(child, p);
      }
    }
  };
  visit(value, "");
  return Array.from(new Set(matches));
}

/**
 * POST /payments/paymob/session
 * Body: SessionRequest (merchant_order_id, amount_cents, currency, customer, billing, optional saved_card_uuid).
 * When saved_card_uuid is set, X-User-Id header is required; backend passes card token in Create Intention.
 * Returns: merchant_order_id, paymob_order_id, client_secret, payment_key (alias), status, optional public_key.
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
  const rawUserId = req.headers["x-user-id"];
  const userId = typeof rawUserId === "string" ? rawUserId.trim() : "";

  let cardTokens: string[] = [];
  if (input.saved_card_uuid && input.saved_card_uuid.trim()) {
    if (!userId) {
      return res.status(400).json({
        error: "X-User-Id header is required when paying with a saved card (saved_card_uuid)",
      });
    }
    const card = await storage.savedCards.getCardByIdAndUserId(
      input.saved_card_uuid.trim(),
      userId
    );
    if (!card) {
      return res.status(404).json({ error: "Saved card not found" });
    }
    cardTokens = [card.paymob_token];
  }

  const baseUrl = process.env.BASE_URL ?? "";
  const notificationUrl = baseUrl.trim()
    ? `${baseUrl.replace(/\/$/, "")}/payments/paymob/webhook`
    : undefined;

  try {
    const { orderId, clientSecret } = await createIntention(input, {
      cardTokens,
      notificationUrl,
    });
    await storage.create({
      user_id: userId || undefined,
      merchant_order_id: input.merchant_order_id,
      paymob_order_id: orderId,
      amount_cents: input.amount_cents,
      currency: input.currency,
      status: "PENDING",
      payment_key: clientSecret,
    });

    const publicKey = process.env.PAYMOB_PUBLIC_KEY?.trim();
    const payload: Record<string, unknown> = {
      merchant_order_id: input.merchant_order_id,
      paymob_order_id: orderId,
      client_secret: clientSecret,
      payment_key: clientSecret,
      status: "PENDING",
    };
    if (publicKey) payload.public_key = publicKey;

    return res.status(200).json(payload);
  } catch (err) {
    console.error("[paymob/session] createIntention error:", err instanceof Error ? err.message : err);
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

  // Capture every callback payload for debugging saved-card token delivery.
  // We store raw_body + headers, and best-effort extract identifiers.
  const eventType =
    typeof (payload as Record<string, unknown>)?.type === "string"
      ? ((payload as Record<string, unknown>).type as string)
      : undefined;
  const paymobOrderIdForEvent = resolvePaymobOrderId(payload) ?? undefined;
  const merchantOrderIdForEvent = resolveMerchantOrderId(payload) ?? undefined;
  storage.webhookEvents
    .addEvent({
      merchant_order_id: merchantOrderIdForEvent,
      paymob_order_id: paymobOrderIdForEvent,
      event_type: eventType,
      headers: req.headers as Record<string, string | string[] | undefined>,
      raw_body: payloadStr,
    })
    .catch((e) => console.warn("[webhook] failed to persist webhook event:", e instanceof Error ? e.message : e));

  const tokenish = findTokenishKeys(payload);
  if (tokenish.length) {
    console.log("[webhook] token-like keys found:", tokenish);
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
    // Saved cards tokenization: Paymob sends a separate TOKEN event.
    const type = typeof (payload as Record<string, unknown>)?.type === "string"
      ? ((payload as Record<string, unknown>).type as string)
      : undefined;
    if (type === "TOKEN") {
      const obj = (payload as Record<string, unknown>).obj as Record<string, unknown> | undefined;
      const token = typeof obj?.token === "string" ? obj.token : "";
      const maskedPan = typeof obj?.masked_pan === "string" ? obj.masked_pan : "";
      const cardSubtype = typeof obj?.card_subtype === "string" ? obj.card_subtype : undefined;
      const orderIdRaw = obj?.order_id;
      const orderId = typeof orderIdRaw === "number"
        ? orderIdRaw
        : typeof orderIdRaw === "string"
          ? parseInt(orderIdRaw, 10)
          : NaN;

      if (token && maskedPan && Number.isFinite(orderId)) {
        const record = await storage.findByPaymobOrderId(orderId);
        const recordUserId = record?.user_id;
        if (recordUserId) {
          const existing = await storage.savedCards.getCardByToken(recordUserId, token);
          if (!existing) {
            const lastFourMatch = maskedPan.match(/(\d{4})\s*$/);
            await storage.savedCards.createCard(recordUserId, {
              paymob_token: token,
              masked_pan: maskedPan,
              card_brand: cardSubtype,
              last_four: lastFourMatch ? lastFourMatch[1] : undefined,
            });
            console.log("[saved-cards] token saved", { user_id: recordUserId, paymob_order_id: orderId });
          } else {
            console.log("[saved-cards] token already saved", { user_id: recordUserId, paymob_order_id: orderId });
          }
        } else {
          console.warn("[saved-cards] TOKEN webhook received but no user_id mapped for order", { paymob_order_id: orderId });
        }
      } else {
        console.warn("[saved-cards] TOKEN webhook missing required fields", { hasToken: !!token, hasMaskedPan: !!maskedPan, orderId: orderIdRaw });
      }
      res.status(200).send();
      return;
    }

    let record = null;
    if (paymobOrderId != null) record = await storage.findByPaymobOrderId(paymobOrderId);
    if (!record && merchantOrderId) record = await storage.findByMerchantOrderId(merchantOrderId);
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
  // Legacy Accept payload
  const legacySuccess =
    payload?.obj?.success === true ||
    payload?.obj?.is_success === true ||
    payload?.success === true;
  const legacyPending =
    payload?.obj?.pending === true || payload?.pending === true;
  if (legacySuccess && !legacyPending) return "PAID";
  if (legacyPending) return "PENDING";

  // Intention-style: transactions array
  const transactions = payload?.transactions as Array<{ success?: boolean; pending?: boolean }> | undefined;
  if (Array.isArray(transactions) && transactions.length > 0) {
    const anyPending = transactions.some((t) => t?.pending === true);
    const anySuccess = transactions.some((t) => t?.success === true);
    if (anyPending) return "PENDING";
    if (anySuccess) return "PAID";
    return "FAILED";
  }

  if (legacySuccess) return "PAID";
  return "FAILED";
}

function resolvePaymobOrderId(payload: PaymobWebhookPayload): number | null {
  const o = payload?.obj;
  // Intention callback may send order_id at top level
  const id =
    payload?.order_id ??
    o?.order?.id ??
    o?.order_id ??
    payload?.order_id ??
    payload?.order;
  if (typeof id === "number") return id;
  if (typeof id === "string") return parseInt(id, 10) || null;
  return null;
}

function resolveMerchantOrderId(payload: PaymobWebhookPayload): string | null {
  const o = payload?.obj as Record<string, unknown> | undefined;
  // Intention: special_reference is our merchant_order_id
  const id =
    payload?.merchant_order_id ??
    payload?.special_reference ??
    o?.merchant_order_id ??
    (o?.special_reference as string | undefined);
  return typeof id === "string" ? id : null;
}

/**
 * GET /payments/paymob/callback
 * Transaction response callback for mobile redirect. Paymob redirects the user here after payment (GET).
 * Use this URL as "Transaction response callback" in Paymob; keep "Transaction processed callback" as the webhook (POST).
 * Optional: set PAYMENT_CALLBACK_DEEP_LINK in env (e.g. myapp://payment/complete) to redirect back to the app.
 */
router.get("/payments/paymob/callback", (req: Request, res: Response) => {
  const deepLink = process.env.PAYMENT_CALLBACK_DEEP_LINK?.trim();
  const query = req.query as Record<string, string | undefined>;
  const params = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => {
    if (v != null && v !== "") params.set(k, v);
  });
  const queryString = params.toString();

  if (deepLink) {
    const target = queryString ? `${deepLink}${deepLink.includes("?") ? "&" : "?"}${queryString}` : deepLink;
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Payment complete</title>
<meta http-equiv="refresh" content="1;url=${escapeHtml(target)}">
</head><body>
<p>Payment complete. Redirecting to app…</p>
<p><a href="${escapeHtml(target)}">Return to app</a></p>
</body></html>`;
    res.type("html").send(html);
    return;
  }

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Payment complete</title>
</head><body>
<p>Payment complete. You can close this page and return to the app.</p>
</body></html>`;
  res.type("html").send(html);
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

/**
 * GET /debug/paymob/webhook-events/:merchant_order_id
 * Dev-only helper: list all captured webhook events for a given order id.
 */
router.get("/debug/paymob/webhook-events/:merchant_order_id", async (req: Request, res: Response) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(404).json({ error: "Not found" });
  }
  const { merchant_order_id } = req.params;
  const events = await storage.webhookEvents.listEventsByMerchantOrderId(merchant_order_id);
  return res.status(200).json({ merchant_order_id, count: events.length, events });
});

export default router;
export { router as paymobRoutes };
