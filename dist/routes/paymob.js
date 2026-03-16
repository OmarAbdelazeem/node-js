"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymobRoutes = void 0;
exports.webhookHandler = webhookHandler;
const express_1 = require("express");
const crypto_1 = require("crypto");
const validate_1 = require("../utils/validate");
const paymob_1 = require("../services/paymob");
const index_1 = require("../storage/index");
const hmac_1 = require("../utils/hmac");
const router = (0, express_1.Router)();
exports.paymobRoutes = router;
const storage = (0, index_1.getStorage)();
/**
 * POST /payments/paymob/session
 * Body: SessionRequest (merchant_order_id, amount_cents, currency, customer, billing, optional saved_card_uuid).
 * When saved_card_uuid is set, X-User-Id header is required; backend passes card token in Create Intention.
 * Returns: merchant_order_id, paymob_order_id, client_secret, payment_key (alias), status, optional public_key.
 */
router.post("/payments/paymob/session", async (req, res) => {
    const parsed = (0, validate_1.validateSessionBodySafe)(req.body);
    if (!parsed.success) {
        return res.status(400).json({
            error: "Validation failed",
            details: parsed.error.flatten(),
        });
    }
    const input = parsed.data;
    let cardTokens = [];
    if (input.saved_card_uuid && input.saved_card_uuid.trim()) {
        const rawUserId = req.headers["x-user-id"];
        const userId = typeof rawUserId === "string" ? rawUserId.trim() : "";
        if (!userId) {
            return res.status(400).json({
                error: "X-User-Id header is required when paying with a saved card (saved_card_uuid)",
            });
        }
        const card = await storage.savedCards.getCardByIdAndUserId(input.saved_card_uuid.trim(), userId);
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
        const { orderId, clientSecret } = await (0, paymob_1.createIntention)(input, {
            cardTokens,
            notificationUrl,
        });
        await storage.create({
            merchant_order_id: input.merchant_order_id,
            paymob_order_id: orderId,
            amount_cents: input.amount_cents,
            currency: input.currency,
            status: "PENDING",
            payment_key: clientSecret,
        });
        const publicKey = process.env.PAYMOB_PUBLIC_KEY?.trim();
        const payload = {
            merchant_order_id: input.merchant_order_id,
            paymob_order_id: orderId,
            client_secret: clientSecret,
            payment_key: clientSecret,
            status: "PENDING",
        };
        if (publicKey)
            payload.public_key = publicKey;
        return res.status(200).json(payload);
    }
    catch (err) {
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
function webhookHandler(req, res) {
    const rawBody = req.body;
    if (!rawBody || !Buffer.isBuffer(rawBody)) {
        res.status(400).json({ error: "Missing body" });
        return;
    }
    const payloadStr = rawBody.toString("utf8");
    let payload;
    try {
        payload = JSON.parse(payloadStr);
    }
    catch {
        res.status(400).json({ error: "Invalid JSON" });
        return;
    }
    const queryHmac = typeof req.query.hmac === "string" ? req.query.hmac : undefined;
    const headerHmac = typeof req.headers.hmac === "string" ? req.headers.hmac : undefined;
    const signature = queryHmac ?? headerHmac;
    if ((0, hmac_1.isHmacBypassEnabled)()) {
        if (process.env.NODE_ENV !== "test") {
            console.warn("[webhook] DEV_BYPASS_HMAC is true; HMAC verification skipped");
        }
    }
    else {
        const secret = process.env.PAYMOB_HMAC_SECRET;
        if (!secret) {
            res.status(500).json({ error: "HMAC secret not configured" });
            return;
        }
        if (!signature) {
            res.status(401).json({ error: "Missing HMAC (query param or header)" });
            return;
        }
        const valid = (0, hmac_1.verifyHmac)(secret, { queryHmac, headerHmac, payload: payloadStr });
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
        const finalStatuses = ["PAID", "FAILED"];
        if (finalStatuses.includes(record.status)) {
            res.status(200).send();
            return;
        }
        await storage.updateStatus(record.merchant_order_id, status, payload);
        res.status(200).send();
    })();
}
function resolveWebhookStatus(payload) {
    // Legacy Accept payload
    const legacySuccess = payload?.obj?.success === true ||
        payload?.obj?.is_success === true ||
        payload?.success === true;
    const legacyPending = payload?.obj?.pending === true || payload?.pending === true;
    if (legacySuccess && !legacyPending)
        return "PAID";
    if (legacyPending)
        return "PENDING";
    // Intention-style: transactions array
    const transactions = payload?.transactions;
    if (Array.isArray(transactions) && transactions.length > 0) {
        const anyPending = transactions.some((t) => t?.pending === true);
        const anySuccess = transactions.some((t) => t?.success === true);
        if (anyPending)
            return "PENDING";
        if (anySuccess)
            return "PAID";
        return "FAILED";
    }
    if (legacySuccess)
        return "PAID";
    return "FAILED";
}
function resolvePaymobOrderId(payload) {
    const o = payload?.obj;
    // Intention callback may send order_id at top level
    const id = payload?.order_id ??
        o?.order?.id ??
        o?.order_id ??
        payload?.order_id ??
        payload?.order;
    if (typeof id === "number")
        return id;
    if (typeof id === "string")
        return parseInt(id, 10) || null;
    return null;
}
function resolveMerchantOrderId(payload) {
    const o = payload?.obj;
    // Intention: special_reference is our merchant_order_id
    const id = payload?.merchant_order_id ??
        payload?.special_reference ??
        o?.merchant_order_id ??
        o?.special_reference;
    return typeof id === "string" ? id : null;
}
/**
 * GET /payments/paymob/callback
 * Transaction response callback for mobile redirect. Paymob redirects the user here after payment (GET).
 * Use this URL as "Transaction response callback" in Paymob; keep "Transaction processed callback" as the webhook (POST).
 * Optional: set PAYMENT_CALLBACK_DEEP_LINK in env (e.g. myapp://payment/complete) to redirect back to the app.
 */
router.get("/payments/paymob/callback", (req, res) => {
    const deepLink = process.env.PAYMENT_CALLBACK_DEEP_LINK?.trim();
    const query = req.query;
    const params = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => {
        if (v != null && v !== "")
            params.set(k, v);
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
function escapeHtml(s) {
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
router.get("/orders/:merchant_order_id/payment-status", async (req, res) => {
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
router.post("/demo/orders", (_req, res) => {
    const merchant_order_id = `demo-${(0, crypto_1.randomUUID)()}`;
    return res.status(200).json({ merchant_order_id });
});
/**
 * GET /health
 */
router.get("/health", (_req, res) => {
    return res.status(200).json({ status: "ok" });
});
exports.default = router;
//# sourceMappingURL=paymob.js.map