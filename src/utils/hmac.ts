import crypto from "crypto";

/**
 * Verify HMAC signature for Paymob webhook.
 * Supports signature from query param `hmac` or header `hmac`.
 *
 * TODO: Paymob's exact concatenation order for the signed payload may vary.
 * See official Paymob docs for the precise list and order of fields to concatenate
 * (e.g. query string order or specific keys). This helper accepts a pre-built
 * payload string or raw body so you can adapt once the exact format is known.
 */
export function computeHmac(secret: string, payload: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Constant-time comparison to prevent timing attacks.
 */
export function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export interface HmacSources {
  /** Signature from query param (e.g. ?hmac=...) */
  queryHmac?: string;
  /** Signature from header (e.g. x-hmac or hmac) */
  headerHmac?: string;
  /** Raw body string used to compute expected HMAC */
  payload: string;
}

/**
 * Verify that the provided signature matches HMAC-SHA256(secret, payload).
 * Uses whichever of queryHmac or headerHmac is provided.
 * Returns true if valid, false otherwise.
 */
export function verifyHmac(secret: string, sources: HmacSources): boolean {
  const signature = sources.queryHmac ?? sources.headerHmac;
  if (!signature || !sources.payload) return false;
  const expected = computeHmac(secret, sources.payload);
  return secureCompare(signature, expected);
}

/**
 * Check if HMAC verification should be bypassed (demo only).
 * When DEV_BYPASS_HMAC=true, callers should skip verification and log a warning.
 */
export function isHmacBypassEnabled(): boolean {
  return process.env.DEV_BYPASS_HMAC === "true";
}
