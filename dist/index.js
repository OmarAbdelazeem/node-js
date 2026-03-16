"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const path_1 = __importDefault(require("path"));
const express_1 = __importDefault(require("express"));
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const paymob_1 = require("./routes/paymob");
const cards_1 = require("./routes/cards");
const swagger_spec_json_1 = __importDefault(require("./swagger-spec.json"));
const PORT = Number(process.env.PORT) || 3000;
function logStorageMode() {
    const useDb = process.env.USE_DB;
    if (useDb === "sqlite" && process.env.DATABASE_PATH) {
        const resolved = path_1.default.resolve(process.cwd(), process.env.DATABASE_PATH);
        console.log("[storage] Using SQLite:", resolved);
    }
    else if (useDb === "true") {
        console.log("[storage] Using Postgres");
    }
    else {
        console.log("[storage] Using in-memory (no persistence)");
    }
}
function validateEnv() {
    const required = [
        "BASE_URL",
        "PAYMOB_SECRET_KEY",
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
logStorageMode();
const app = (0, express_1.default)();
// Webhook must receive raw body for HMAC verification
app.post("/payments/paymob/webhook", express_1.default.raw({ type: "application/json" }), paymob_1.webhookHandler);
app.use(express_1.default.json());
app.use("/api-docs", swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(swagger_spec_json_1.default));
app.use(paymob_1.paymobRoutes);
app.use("/users/me/cards", cards_1.cardsRoutes);
app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
});
app.listen(PORT, async () => {
    console.log(`Server listening on port ${PORT}`);
    // Optional: create ngrok tunnel when NGROK_AUTHTOKEN is set (avoids CLI auth issues)
    const authtoken = process.env.NGROK_AUTHTOKEN;
    if (authtoken && authtoken.trim()) {
        try {
            const ngrok = await Promise.resolve().then(() => __importStar(require("@ngrok/ngrok")));
            const listener = await ngrok.forward({
                addr: PORT,
                authtoken: authtoken.trim(),
            });
            const publicUrl = listener.url();
            if (publicUrl) {
                const base = publicUrl.replace(/\/$/, "");
                const webhookUrl = `${base}/payments/paymob/webhook`;
                const callbackUrl = `${base}/payments/paymob/callback`;
                console.log("");
                console.log("[ngrok] Tunnel is up");
                console.log("[ngrok] Public URL:    ", publicUrl);
                console.log("[ngrok] Webhook URL:   ", webhookUrl, "(Transaction processed callback)");
                console.log("[ngrok] Callback URL:  ", callbackUrl, "(Transaction response callback)");
                console.log("[ngrok] Set both URLs in Paymob Integration Callbacks.");
                console.log("");
            }
        }
        catch (err) {
            console.warn("[ngrok] Tunnel failed (server still running on localhost):", err instanceof Error ? err.message : err);
        }
    }
});
//# sourceMappingURL=index.js.map