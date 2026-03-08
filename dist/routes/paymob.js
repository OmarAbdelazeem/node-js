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
 * Body: SessionRequest (merchant_order_id, amount_cents, currency, customer, billing)
 * Returns: { merchant_order_id, paymob_order_id, payment_key, status: "PENDING" }
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
    try {
        const { orderId, paymentKey } = await (0, paymob_1.createSession)(input);
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
    }
    catch (err) {
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
    const success = payload?.obj?.success === true ||
        payload?.obj?.is_success === true ||
        payload?.success === true;
    const pending = payload?.obj?.pending === true || payload?.pending === true;
    if (success && !pending)
        return "PAID";
    if (pending)
        return "PENDING";
    return "FAILED";
}
function resolvePaymobOrderId(payload) {
    const o = payload?.obj;
    const id = o?.order?.id ?? o?.order_id ?? payload?.order_id ?? payload?.order;
    if (typeof id === "number")
        return id;
    if (typeof id === "string")
        return parseInt(id, 10) || null;
    return null;
}
function resolveMerchantOrderId(payload) {
    const id = payload?.obj?.merchant_order_id ?? payload?.merchant_order_id;
    return typeof id === "string" ? id : null;
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