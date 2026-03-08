#!/usr/bin/env node
/**
 * Start a public tunnel to the local server (default port 3000).
 * Print the public URL and the Paymob webhook URL to set in the dashboard.
 *
 * Usage: npm run tunnel
 * (Start the server first in another terminal: npm run dev)
 */

require("dotenv").config();
const localtunnel = require("localtunnel");

const PORT = process.env.PORT || 3000;

(async function () {
  try {
    const tunnel = await localtunnel({ port: Number(PORT) });
    const base = tunnel.url.replace(/\/$/, "");
    const webhookUrl = `${base}/payments/paymob/webhook`;

    console.log("");
    console.log("  Tunnel is running");
    console.log("  ----------------");
    console.log("  Public URL:     ", base);
    console.log("  Webhook URL:    ", webhookUrl);
    console.log("");
    console.log("  Set the Webhook URL in Paymob dashboard as the callback / webhook URL.");
    console.log("  Optionally set BASE_URL=" + base + " in .env");
    console.log("");
    console.log("  Press Ctrl+C to stop the tunnel.");
    console.log("");

    tunnel.on("close", () => process.exit(0));
    tunnel.on("error", (err) => {
      console.error("Tunnel error:", err.message);
      process.exit(1);
    });
  } catch (err) {
    console.error("Tunnel error:", err.message);
    process.exit(1);
  }
})();
