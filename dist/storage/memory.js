"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.memoryStorage = void 0;
const byMerchantOrderId = new Map();
const byPaymobOrderId = new Map();
const byCardId = new Map();
function ensureIndex(record) {
    byMerchantOrderId.set(record.merchant_order_id, record);
    byPaymobOrderId.set(record.paymob_order_id, record);
}
const paymentStorage = {
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
const savedCardsStorage = {
    async createCard(userId, data) {
        const id = crypto.randomUUID();
        const now = new Date();
        const card = {
            id,
            user_id: userId,
            paymob_token: data.paymob_token,
            masked_pan: data.masked_pan,
            card_brand: data.card_brand,
            last_four: data.last_four,
            created_at: now,
        };
        byCardId.set(id, card);
        return card;
    },
    async getCardByToken(userId, paymobToken) {
        for (const card of byCardId.values()) {
            if (card.user_id === userId && card.paymob_token === paymobToken)
                return card;
        }
        return null;
    },
    async listCardsByUserId(userId) {
        const list = [];
        for (const card of byCardId.values()) {
            if (card.user_id !== userId)
                continue;
            list.push({
                id: card.id,
                masked_pan: card.masked_pan,
                card_brand: card.card_brand,
                last_four: card.last_four,
                created_at: card.created_at,
            });
        }
        return list.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
    },
    async getCardByIdAndUserId(cardId, userId) {
        const card = byCardId.get(cardId) ?? null;
        if (!card || card.user_id !== userId)
            return null;
        return card;
    },
    async deleteCardByIdAndUserId(cardId, userId) {
        const card = byCardId.get(cardId);
        if (!card || card.user_id !== userId)
            return false;
        byCardId.delete(cardId);
        return true;
    },
};
const webhookEvents = {
    async addEvent(data) {
        events.unshift({
            id: crypto.randomUUID(),
            merchant_order_id: data.merchant_order_id,
            paymob_order_id: data.paymob_order_id,
            event_type: data.event_type,
            headers: data.headers,
            raw_body: data.raw_body,
            received_at: new Date(),
        });
    },
    async listEventsByMerchantOrderId(merchantOrderId) {
        return events.filter((e) => e.merchant_order_id === merchantOrderId);
    },
};
const events = [];
exports.memoryStorage = {
    ...paymentStorage,
    savedCards: savedCardsStorage,
    webhookEvents,
};
//# sourceMappingURL=memory.js.map