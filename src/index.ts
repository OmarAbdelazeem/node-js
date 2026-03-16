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

app.listen(PORT, async () => {
  console.log(`Server listening on port ${PORT}`);

  // Optional: create ngrok tunnel when NGROK_AUTHTOKEN is set (avoids CLI auth issues)
  const authtoken = process.env.NGROK_AUTHTOKEN;
  if (authtoken && authtoken.trim()) {
    try {
      const ngrok = await import("@ngrok/ngrok");
      const listener = await ngrok.forward({
        addr: PORT,
        authtoken: authtoken.trim(),
      });
      const publicUrl = listener.url();
      if (publicUrl) {
        const webhookUrl = `${publicUrl.replace(/\/$/, "")}/payments/paymob/webhook`;
        console.log("");
        console.log("[ngrok] Tunnel is up");
        console.log("[ngrok] Public URL:   ", publicUrl);
        console.log("[ngrok] Webhook URL: ", webhookUrl);
        console.log("[ngrok] Set the Webhook URL in Paymob dashboard.");
        console.log("");
      }
    } catch (err) {
      console.warn("[ngrok] Tunnel failed (server still running on localhost):", err instanceof Error ? err.message : err);
    }
  }
});
