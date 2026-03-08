import { Request, Response } from "express";
declare const router: import("express-serve-static-core").Router;
/**
 * POST /payments/paymob/webhook
 * Expects raw body (Buffer) for HMAC. Signature from query `hmac` or header `hmac`.
 * DEV_BYPASS_HMAC=true skips verification.
 */
export declare function webhookHandler(req: Request, res: Response): void;
export default router;
export { router as paymobRoutes };
