"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const paymob_1 = require("./routes/paymob");
const PORT = Number(process.env.PORT) || 3000;
function validateEnv() {
    const required = [
        "BASE_URL",
        "PAYMOB_API_KEY",
        "PAYMOB_HMAC_SECRET",
        "PAYMOB_INTEGRATION_ID_CARD",
    ];
    const missing = required.filter((k) => !process.env[k]);
    if (missing.length) {
        console.error("Missing required env:", missing.join(", "));
        process.exit(1);
    }
    if (process.env.USE_DB === "true" && !process.env.DATABASE_URL) {
        console.error("USE_DB=true but DATABASE_URL is not set");
        process.exit(1);
    }
    if (process.env.USE_DB === "sqlite" && !process.env.DATABASE_PATH) {
        console.error("USE_DB=sqlite but DATABASE_PATH is not set");
        process.exit(1);
    }
}
validateEnv();
const app = (0, express_1.default)();
// Webhook must receive raw body for HMAC verification
app.post("/payments/paymob/webhook", express_1.default.raw({ type: "application/json" }), paymob_1.webhookHandler);
app.use(express_1.default.json());
app.use(paymob_1.paymobRoutes);
app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
});
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
//# sourceMappingURL=index.js.map