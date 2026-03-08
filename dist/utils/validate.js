"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sessionBodySchema = void 0;
exports.validateSessionBody = validateSessionBody;
exports.validateSessionBodySafe = validateSessionBodySafe;
const zod_1 = require("zod");
const customerSchema = zod_1.z.object({
    id: zod_1.z.string(),
    email: zod_1.z.string().email(),
    first_name: zod_1.z.string(),
    last_name: zod_1.z.string(),
    phone: zod_1.z.string(),
});
const billingSchema = zod_1.z.object({
    apartment: zod_1.z.string(),
    floor: zod_1.z.string(),
    street: zod_1.z.string(),
    building: zod_1.z.string(),
    city: zod_1.z.string(),
    state: zod_1.z.string(),
    country: zod_1.z.string(),
    postal_code: zod_1.z.string(),
});
exports.sessionBodySchema = zod_1.z.object({
    merchant_order_id: zod_1.z.string().min(1),
    amount_cents: zod_1.z.number().int().positive(),
    currency: zod_1.z.string().min(1),
    customer: customerSchema,
    billing: billingSchema,
});
function validateSessionBody(body) {
    return exports.sessionBodySchema.parse(body);
}
function validateSessionBodySafe(body) {
    const result = exports.sessionBodySchema.safeParse(body);
    if (result.success) {
        return { success: true, data: result.data };
    }
    return { success: false, error: result.error };
}
//# sourceMappingURL=validate.js.map