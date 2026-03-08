# Paymob Card Payments Demo Backend

Production-lean Node.js + Express + TypeScript backend for **Paymob Accept** card payments, designed for mobile apps using the **Paymob Mobile SDK** (no WebView). The backend holds all Paymob secrets and exposes a session endpoint plus webhook handling.

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
   - `PAYMOB_API_KEY` – from Paymob dashboard
   - `PAYMOB_HMAC_SECRET` – for webhook signature verification
   - `PAYMOB_INTEGRATION_ID_CARD` – card integration ID

3. **Run (in-memory, no DB)**

   ```bash
   npm run dev
   ```

   Server runs at `http://localhost:3000` (or your `PORT`).

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

### Option A: ngrok (recommended for webhooks)

1. **Install:** `brew install ngrok`
2. **Sign up** at [ngrok.com](https://ngrok.com) and get your **authtoken** from [dashboard → Your Authtoken](https://dashboard.ngrok.com/get-started/your-authtoken).
3. **Add authtoken:** `ngrok config add-authtoken YOUR_TOKEN`
4. **Terminal 1** – start the server: `npm run dev`
5. **Terminal 2** – start tunnel: `ngrok http 3000`
6. Copy the **HTTPS Forwarding** URL (e.g. `https://xxxx.ngrok-free.app`). Your webhook URL is: `https://xxxx.ngrok-free.app/payments/paymob/webhook`
7. In **Paymob** → Developers → Payment Integrations → Edit (integration 5547386) → set both callback URLs to that webhook URL → Submit.

### Option B: localtunnel (`npm run tunnel`)

1. **Terminal 1:** `npm run dev`
2. **Terminal 2:** `npm run tunnel` — copy the Webhook URL printed.
3. Set that URL in Paymob as above.

**Note:** Localtunnel may show an interstitial or block server requests; if Paymob callbacks don’t reach your backend (order stays PENDING), use ngrok instead.

## API

### POST /payments/paymob/session

Creates a Paymob order and payment key. The mobile app calls this, then starts the Paymob SDK with the returned `payment_key` only (no WebView).

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
  "payment_key": "ZXlK...",
  "status": "PENDING"
}
```

### POST /payments/paymob/webhook

Paymob callback. Verifies HMAC (query `hmac` or header `hmac`), then updates the stored payment status. Returns 200 quickly. For local testing you can set `DEV_BYPASS_HMAC=true` (do not use in production).

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
| BASE_URL | Yes | Public base URL (e.g. for webhook logging) |
| PAYMOB_API_KEY | Yes | Paymob API key |
| PAYMOB_HMAC_SECRET | Yes | Webhook HMAC secret |
| PAYMOB_INTEGRATION_ID_CARD | Yes | Card integration ID |
| PAYMOB_IFRAME_ID | No | Optional iframe ID |
| PAYMOB_API_BASE | No | Default: https://accept.paymob.com/api |
| USE_DB | No | `sqlite` for SQLite, `true` for Postgres; omit for in-memory |
| DATABASE_PATH | If USE_DB=sqlite | Path to SQLite file (e.g. `./data/paymob.db`) |
| DATABASE_URL | If USE_DB=true | Postgres connection string |
| DEV_BYPASS_HMAC | No | Set to `true` to skip webhook HMAC (demo only) |

Optional auth (if your dashboard uses username/password instead of api_key):  
`PAYMOB_USERNAME`, `PAYMOB_PASSWORD`.
