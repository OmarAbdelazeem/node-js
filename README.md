# Paymob Card Payments Demo Backend

Production-lean Node.js + Express + TypeScript backend for **Paymob** card payments, designed for mobile apps using the **Paymob Mobile SDK** (no WebView). The backend uses Paymob’s **Create Intention API** to issue a **client_secret** (and optional **public_key**) for the SDK; it holds the secret key and exposes a session endpoint plus webhook handling.

## Requirements

- Node.js 20+
- (Optional) PostgreSQL when `USE_DB=true`, or SQLite when `USE_DB=sqlite`

## Setup

1. **Clone and install**

   ```bash
   cd "node js"
   npm install
   ```

2. **Environment**

   Copy the example env and set your Paymob credentials:

   ```bash
   cp .env.example .env
   ```

   Edit `.env` and set at least:

   - `BASE_URL` – your public base URL (e.g. ngrok URL for local testing)
   - `PAYMOB_SECRET_KEY` – from Paymob dashboard (Account Info → Secret Key); used for Create Intention API
   - `PAYMOB_HMAC_SECRET` – for webhook signature verification
   - `PAYMOB_INTEGRATION_ID_CARD` – card integration ID

3. **Run (in-memory, no DB)**

   ```bash
   npm run dev
   ```

   Server runs at `http://localhost:3000` (or your `PORT`). Interactive API docs: **http://localhost:3000/api-docs** (Swagger UI).

4. **Optional: Postgres**

   - Set `USE_DB=true` and `DATABASE_URL` in `.env`.
   - Create DB and run the schema:

   ```bash
   psql "$DATABASE_URL" -f schema.sql
   ```

   Then start the app as above.

5. **Optional: SQLite** (single file, no server)

   - Set `USE_DB=sqlite` and `DATABASE_PATH=./data/paymob.db` in `.env`.
   - The app creates the file and table on first run. View data with any SQLite client (e.g. `sqlite3 data/paymob.db` → `SELECT * FROM payments;`) or DB Browser for SQLite.

   Then start the app as above.

## Webhook (HTTPS tunnel)

Paymob must reach your webhook over HTTPS. **Recommended: ngrok** (no interstitial, so Paymob callbacks work).

### Option A: ngrok from the app (Node.js SDK, recommended if CLI auth fails)

The backend can create the ngrok tunnel itself using the **@ngrok/ngrok** package. This often works when the ngrok CLI fails with "failed to send authentication request" or CRL timeouts.

1. Get your **authtoken** from [dashboard → Your Authtoken](https://dashboard.ngrok.com/get-started/your-authtoken) (copy it; avoid typing to prevent 0/O and 1/l typos).
2. In `.env`, add: `NGROK_AUTHTOKEN=your_token_here`
3. Start the server: `npm run dev`
4. On startup you’ll see `[ngrok] Tunnel is up`, **Webhook URL**, and **Callback URL**. In **Paymob** → Integration Callbacks: set **Transaction processed callback** to the Webhook URL, and **Transaction response callback** to the Callback URL.

Only one terminal is needed; the server and tunnel run together.

### Option B: ngrok CLI (separate terminal)

1. **Install:** `brew install ngrok`
2. **Sign up** at [ngrok.com](https://ngrok.com) and get your **authtoken** from [dashboard → Your Authtoken](https://dashboard.ngrok.com/get-started/your-authtoken).
3. **Add authtoken:** `ngrok config add-authtoken YOUR_TOKEN`
4. **Terminal 1** – start the server: `npm run dev`
5. **Terminal 2** – start tunnel: `ngrok http 3000`
6. Copy the **HTTPS Forwarding** URL. Your webhook URL is: `https://xxxx.ngrok-free.app/payments/paymob/webhook`
7. Set that webhook URL in Paymob as above.

**If ngrok shows "reconnecting (failed to send authentication request)":** Use **Option A** (NGROK_AUTHTOKEN in .env) instead, or fix the token (copy from dashboard; watch for 0 vs O, 1 vs l).

### Option C: localtunnel (`npm run tunnel`)

1. **Terminal 1:** `npm run dev`
2. **Terminal 2:** `npm run tunnel` — copy the Webhook URL printed.
3. Set that URL in Paymob as above.

**Note:** Localtunnel may show an interstitial or block server requests; if Paymob callbacks don’t reach your backend (order stays PENDING), use ngrok (Option A or B) instead.

## API

**Interactive docs:** [Swagger UI](http://localhost:3000/api-docs) when the server is running.

### POST /payments/paymob/session

Creates a payment intention via Paymob’s **Create Intention API** and returns **client_secret** (and optionally **public_key**) for the Mobile SDK. The app starts the Paymob SDK with `clientSecret` and `publicKey`; no card data is sent from the app. For **pay with saved card**, send **saved_card_uuid** in the body and **X-User-Id** in the header; the backend passes the card token in the intention.

**Request (JSON):**

```json
{
  "merchant_order_id": "order-123",
  "amount_cents": 12345,
  "currency": "EGP",
  "customer": {
    "id": "cust-1",
    "email": "user@example.com",
    "first_name": "John",
    "last_name": "Doe",
    "phone": "+201234567890"
  },
  "billing": {
    "apartment": "NA",
    "floor": "NA",
    "street": "NA",
    "building": "NA",
    "city": "Cairo",
    "state": "Cairo",
    "country": "EG",
    "postal_code": "00000"
  }
}
```

**Response (200):**

```json
{
  "merchant_order_id": "order-123",
  "paymob_order_id": 123456,
  "client_secret": "intention_client_secret_from_paymob",
  "payment_key": "intention_client_secret_from_paymob",
  "status": "PENDING",
  "public_key": "optional_if_set_in_env"
}
```

The app uses **client_secret** (or **payment_key**, same value) as the SDK’s `clientSecret`. If **public_key** is omitted, the app uses its build-time key.

### POST /payments/paymob/webhook (Transaction processed callback)

Server-to-server callback from Paymob. Verifies HMAC (query `hmac` or header `hmac`), then updates the stored payment status. Set this URL as **Transaction processed callback** in Paymob Integration Callbacks. For local testing you can set `DEV_BYPASS_HMAC=true` (do not use in production).

### GET /payments/paymob/callback (Transaction response callback)

User redirect after payment. Paymob (or the SDK) redirects the user here with GET. Set this URL as **Transaction response callback** in Paymob. Returns an HTML page; if `PAYMENT_CALLBACK_DEEP_LINK` is set in `.env` (e.g. `myapp://payment/complete`), the page redirects back to the app and forwards query params (e.g. `merchant_order_id`, `success`) so the app can show the result or poll payment status.

### GET /debug/paymob/webhook-events/:merchant_order_id (dev-only)

Lists **all** captured webhook/callback payloads for an order to help debug saved-cards tokenization. Disabled in production.

### GET /orders/:merchant_order_id/payment-status

Returns the current payment status for an order (no secrets).

**Response (200):**

```json
{
  "status": "PAID",
  "amount_cents": 12345,
  "currency": "EGP",
  "paymob_order_id": 123456,
  "updatedAt": "2025-02-18T12:00:00.000Z"
}
```

### POST /demo/orders

Creates a dummy `merchant_order_id` for quick tests. Response: `{ "merchant_order_id": "demo-<uuid>" }`.

### GET /health

Returns `{ "status": "ok" }`.

### Saved cards (Paymob tokenization)

All saved-card endpoints require the **`X-User-Id`** header (opaque string, e.g. UUID or device id). For production, replace this with real auth (JWT/session); the same user id concept can be the JWT subject.

| Action | Method | Endpoint | Description |
|--------|--------|----------|--------------|
| Save card | POST | /users/me/cards | Body: `paymob_token`, `masked_pan` (required); `card_brand`, `last_four` (optional). Returns 201 with `id`, `masked_pan`, etc. (no token). |
| List cards | GET | /users/me/cards | Returns `{ "cards": [ ... ] }` (no token in list). |
| Get for payment | GET | /users/me/cards/:cardId | Returns card with `paymob_token` so the app can call the SDK. |
| Remove card | DELETE | /users/me/cards/:cardId | 204 No Content. |

---

## Example cURL

**Create session:**

```bash
curl -s -X POST http://localhost:3000/payments/paymob/session \
  -H "Content-Type: application/json" \
  -d '{
    "merchant_order_id": "order-1",
    "amount_cents": 10000,
    "currency": "EGP",
    "customer": {
      "id": "c1",
      "email": "test@example.com",
      "first_name": "Test",
      "last_name": "User",
      "phone": "+201234567890"
    },
    "billing": {
      "apartment": "NA",
      "floor": "NA",
      "street": "NA",
      "building": "NA",
      "city": "Cairo",
      "state": "Cairo",
      "country": "EG",
      "postal_code": "00000"
    }
  }'
```

**Get payment status:**

```bash
curl -s http://localhost:3000/orders/order-1/payment-status
```

**Mock webhook (with HMAC bypass, for demo):**

Set `DEV_BYPASS_HMAC=true`, then:

```bash
curl -s -X POST http://localhost:3000/payments/paymob/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "success": true,
    "pending": false,
    "obj": {
      "success": true,
      "is_success": true,
      "pending": false,
      "order_id": 123456
    }
  }'
```

Replace `order_id` with the real `paymob_order_id` from the session response if you want the backend to match and update the record.

---

## Mobile app usage

1. **Create order** in your backend (or use `POST /demo/orders` to get a `merchant_order_id`).
2. **Get payment key:**  
   `POST /payments/paymob/session` with order details, customer, and billing.  
   Response: `payment_key`, `paymob_order_id`, `merchant_order_id`, `status`.
3. **Start Paymob Mobile SDK** with the `payment_key` only (no WebView). Do not pass API keys or other Paymob secrets from the app.
4. **After payment:**  
   - Either poll `GET /orders/:merchant_order_id/payment-status`, or  
   - Rely on your backend being updated by Paymob’s webhook (`POST /payments/paymob/webhook`), then inform the app (e.g. push or poll).

---

## Scripts

- `npm run dev` – run with ts-node (no DB by default)
- `npm run build` – compile to `dist/`
- `npm start` – run compiled app: `node dist/index.js`

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| PORT | No | Server port (default 3000) |
| BASE_URL | Yes | Public base URL (e.g. for webhook and intention notification_url) |
| PAYMOB_SECRET_KEY | Yes | Paymob secret key (Dashboard → Account Info); used for Create Intention API |
| PAYMOB_HMAC_SECRET | Yes | Webhook HMAC secret |
| PAYMOB_INTEGRATION_ID_CARD | Yes | Card integration ID |
| PAYMOB_PUBLIC_KEY | No | Public key returned in session; if omitted, app uses build-time key |
| PAYMOB_INTENTION_BASE | No | Intention API base (default: https://accept.paymob.com for Egypt) |
| PAYMOB_API_BASE | No | Legacy; default https://accept.paymob.com/api |
| USE_DB | No | `sqlite` for SQLite, `true` for Postgres; omit for in-memory |
| DATABASE_PATH | If USE_DB=sqlite | Path to SQLite file (e.g. `./data/paymob.db`) |
| DATABASE_URL | If USE_DB=true | Postgres connection string |
| DEV_BYPASS_HMAC | No | Set to `true` to skip webhook HMAC (demo only) |
| PAYMENT_CALLBACK_DEEP_LINK | No | Deep link for mobile redirect (e.g. myapp://payment/complete); GET /payments/paymob/callback redirects here with query params |
| NGROK_AUTHTOKEN | No | ngrok authtoken; when set, server creates a public tunnel on startup (see Option A above) |
