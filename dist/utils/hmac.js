"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeHmac = computeHmac;
exports.secureCompare = secureCompare;
exports.verifyHmac = verifyHmac;
exports.isHmacBypassEnabled = isHmacBypassEnabled;
const crypto_1 = __importDefault(require("crypto"));
/**
 * Verify HMAC signature for Paymob webhook.
 * Supports signature from query param `hmac` or header `hmac`.
 *
 * TODO: Paymob's exact concatenation order for the signed payload may vary.
 * See official Paymob docs for the precise list and order of fields to concatenate
 * (e.g. query string order or specific keys). This helper accepts a pre-built
 * payload string or raw body so you can adapt once the exact format is known.
 */
function computeHmac(secret, payload) {
    return crypto_1.default.createHmac("sha256", secret).update(payload).digest("hex");
}
/**
 * Constant-time comparison to prevent timing attacks.
 */
function secureCompare(a, b) {
    if (a.length !== b.length)
        return false;
    let result = 0;
    for (let i = 0; i < a.length; i++) {
        result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
}
/**
 * Verify that the provided signature matches HMAC-SHA256(secret, payload).
 * Uses whichever of queryHmac or headerHmac is provided.
 * Returns true if valid, false otherwise.
 */
function verifyHmac(secret, sources) {
    const signature = sources.queryHmac ?? sources.headerHmac;
    if (!signature || !sources.payload)
        return false;
    const expected = computeHmac(secret, sources.payload);
    return secureCompare(signature, expected);
}
/**
 * Check if HMAC verification should be bypassed (demo only).
 * When DEV_BYPASS_HMAC=true, callers should skip verification and log a warning.
 */
function isHmacBypassEnabled() {
    return process.env.DEV_BYPASS_HMAC === "true";
}
//# sourceMappingURL=hmac.js.map