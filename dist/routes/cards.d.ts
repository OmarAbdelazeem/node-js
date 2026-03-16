import { Request } from "express";
declare const router: import("express-serve-static-core").Router;
export interface RequestWithUserId extends Request {
    userId: string;
}
export default router;
export { router as cardsRoutes };
