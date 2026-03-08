import "dotenv/config";
import path from "path";
import express from "express";
import { paymobRoutes, webhookHandler } from "./routes/paymob";
import { cardsRoutes } from "./routes/cards";

const PORT = Number(process.env.PORT) || 3000;

function logStorageMode(): void {
  const useDb = process.env.USE_DB;
  if (useDb === "sqlite" && process.env.DATABASE_PATH) {
    const resolved = path.resolve(process.cwd(), process.env.DATABASE_PATH);
    console.log("[storage] Using SQLite:", resolved);
  } else if (useDb === "true") {
    console.log("[storage] Using Postgres");
  } else {
    console.log("[storage] Using in-memory (no persistence)");
  }
}

function validateEnv(): void {
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
logStorageMode();

const app = express();

// Webhook must receive raw body for HMAC verification
app.post(
  "/payments/paymob/webhook",
  express.raw({ type: "application/json" }),
  webhookHandler
);

app.use(express.json());
app.use(paymobRoutes);
app.use("/users/me/cards", cardsRoutes);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
