"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.memoryStorage = void 0;
const byMerchantOrderId = new Map();
const byPaymobOrderId = new Map();
function ensureIndex(record) {
    byMerchantOrderId.set(record.merchant_order_id, record);
    byPaymobOrderId.set(record.paymob_order_id, record);
}
exports.memoryStorage = {
    async create(data) {
        const now = new Date();
        const record = {
            ...data,
            createdAt: now,
            updatedAt: now,
        };
        byMerchantOrderId.set(data.merchant_order_id, record);
        byPaymobOrderId.set(data.paymob_order_id, record);
        return record;
    },
    async findByMerchantOrderId(merchantOrderId) {
        return byMerchantOrderId.get(merchantOrderId) ?? null;
    },
    async findByPaymobOrderId(paymobOrderId) {
        return byPaymobOrderId.get(paymobOrderId) ?? null;
    },
    async updateStatus(merchantOrderId, status, rawWebhook) {
        const record = byMerchantOrderId.get(merchantOrderId);
        if (!record)
            return;
        const finalStatuses = ["PAID", "FAILED"];
        if (finalStatuses.includes(record.status))
            return; // idempotent
        record.status = status;
        record.updatedAt = new Date();
        if (rawWebhook !== undefined)
            record.raw_webhook = rawWebhook;
        ensureIndex(record);
    },
};
//# sourceMappingURL=memory.js.map