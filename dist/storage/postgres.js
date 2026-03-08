"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPostgresStorage = createPostgresStorage;
const pg_1 = require("pg");
function createPostgresStorage(connectionString) {
    const pool = new pg_1.Pool({ connectionString });
    const rowToRecord = (row) => ({
        id: row.id,
        merchant_order_id: row.merchant_order_id,
        paymob_order_id: Number(row.paymob_order_id),
        amount_cents: row.amount_cents,
        currency: row.currency,
        status: row.status,
        payment_key: row.payment_key ?? undefined,
        raw_webhook: row.raw_webhook,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    });
    return {
        async create(data) {
            const now = new Date();
            const result = await pool.query(`INSERT INTO payments (
          merchant_order_id, paymob_order_id, amount_cents, currency, status, payment_key, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, merchant_order_id, paymob_order_id, amount_cents, currency, status, payment_key, raw_webhook, created_at, updated_at`, [
                data.merchant_order_id,
                data.paymob_order_id,
                data.amount_cents,
                data.currency,
                data.status,
                data.payment_key ?? null,
                now,
                now,
            ]);
            return rowToRecord(result.rows[0]);
        },
        async findByMerchantOrderId(merchantOrderId) {
            const result = await pool.query(`SELECT id, merchant_order_id, paymob_order_id, amount_cents, currency, status, payment_key, raw_webhook, created_at, updated_at
         FROM payments WHERE merchant_order_id = $1`, [merchantOrderId]);
            if (result.rows.length === 0)
                return null;
            return rowToRecord(result.rows[0]);
        },
        async findByPaymobOrderId(paymobOrderId) {
            const result = await pool.query(`SELECT id, merchant_order_id, paymob_order_id, amount_cents, currency, status, payment_key, raw_webhook, created_at, updated_at
         FROM payments WHERE paymob_order_id = $1`, [paymobOrderId]);
            if (result.rows.length === 0)
                return null;
            return rowToRecord(result.rows[0]);
        },
        async updateStatus(merchantOrderId, status, rawWebhook) {
            const existing = await pool.query("SELECT status FROM payments WHERE merchant_order_id = $1", [merchantOrderId]);
            if (existing.rows.length === 0)
                return;
            const currentStatus = existing.rows[0].status;
            const finalStatuses = ["PAID", "FAILED"];
            if (finalStatuses.includes(currentStatus))
                return; // idempotent
            await pool.query(`UPDATE payments SET status = $1, raw_webhook = COALESCE($2::jsonb, raw_webhook), updated_at = $3 WHERE merchant_order_id = $4`, [status, rawWebhook !== undefined ? JSON.stringify(rawWebhook) : null, new Date(), merchantOrderId]);
        },
    };
}
//# sourceMappingURL=postgres.js.map