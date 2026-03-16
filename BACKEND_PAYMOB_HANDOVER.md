# Backend handover: Paymob integration (Create Intention API)

**Audience:** Backend developer or AI agent implementing/updating the backend for the Flutter Paymob app.

**Context:** The mobile app has been migrated to Paymob’s **official iOS/Android SDKs**. The SDK expects a **client_secret** (from Paymob’s **Create Intention API**) and a **public_key** (integration credential). The app no longer uses the legacy Accept API or `payment_key`-only flow. This document describes what the backend must provide so the app can create sessions, pay with a new or saved card, and poll status.

---

## 1. High-level flow

1. **Mobile** calls your **session** endpoint (e.g. `POST /payments/paymob/session`) with order details and an optional **saved_card_uuid** when the user pays with a saved card.
2. **Backend** calls Paymob’s **Create Intention API** (`POST /v1/intention/`) with amount, currency, payment methods, and (when paying with a saved card) **card_tokens**.
3. **Backend** returns the intention’s **client_secret** (and optionally **public_key**) to the app.
4. **Mobile** opens the Paymob SDK with `publicKey` + `clientSecret`; the user completes payment (new card or saved card).
5. **Mobile** polls your **payment status** endpoint until the order is in a terminal state (e.g. PAID / FAILED), then shows success or failure.
6. When the user chose “Save this card” and the SDK returns token + masked_pan, the app calls your **save card** API.

The backend **must not** expose the Paymob **secret key** to the app. Only the **public key** and the one-time **client_secret** per intention are used on the client.

---

## 2. Paymob Create Intention API (backend responsibility)

- **Endpoint:** `POST /v1/intention/`  
  Base URLs by region: Egypt `https://accept.paymob.com`, Oman `https://oman.paymob.com`, KSA `https://ksa.paymob.com`, UAE `https://uae.paymob.com`.

- **Authorization:** `Token <your_secret_key>` (Paymob secret key, server-side only).

- **Request body (summary):**  
  - `amount` (cents), `currency`, `payment_methods` (integration ID(s) or names like `"card"`).  
  - Link to your order (e.g. merchant reference).  
  - **When the user pays with a saved card:** include **`card_tokens`** (array of strings). Each string is the Paymob token for that saved card. The backend must resolve `saved_card_uuid` from the session request to the stored `paymob_token` and pass it in `card_tokens`.

- **Response:** Use at least **`client_secret`** (and optionally order/id fields). The app will send `client_secret` to the Paymob SDK as `clientSecret`. If your backend does not return `public_key` in the session response, the app will use a build-time/public key from config.

Official docs: [Paymob Create Intention](https://developers.paymob.com) (Developer Reference → Create Intention).

---

## 3. Session endpoint (required contract)

The app calls this to get a Paymob session before opening the SDK.

### 3.1 Request

- **Method:** `POST`
- **Path:** `/payments/paymob/session` (or your equivalent; the app’s base URL is configurable)
- **Headers:** `Content-Type: application/json`, `Accept: application/json`. If you use auth (e.g. Bearer or `X-User-Id` for saved cards), the app will send whatever your API expects.

**Body (JSON):**

| Field               | Type   | Required | Description |
|---------------------|--------|----------|-------------|
| `merchant_order_id` | string | Yes      | Your order/transaction identifier. |
| `amount_cents`      | number | Yes      | Amount in cents (e.g. 10000 = 100 EGP). |
| `currency`          | string | Yes      | e.g. `"EGP"`. Must match Paymob integration. |
| `customer`          | object | Yes      | See below. |
| `billing`           | object | Yes      | See below. |
| `saved_card_uuid`   | string | No       | **Required for “pay with saved card”.** Card id/uuid; backend must create the intention with `card_tokens: [paymob_token]` for this card. |

**`customer`:**

- `id`, `email`, `first_name`, `last_name`, `phone` (strings).

**`billing`:**

- `apartment`, `floor`, `street`, `building`, `city`, `state`, `country`, `postal_code` (strings; app may send placeholders like `"NA"`).

Example (new card):

```json
{
  "merchant_order_id": "ord_abc123",
  "amount_cents": 10000,
  "currency": "EGP",
  "customer": {
    "id": "ord_abc123",
    "email": "user@example.com",
    "first_name": "John",
    "last_name": "Doe",
    "phone": "+201012345678"
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

Example (saved card):

- Same as above, plus `"saved_card_uuid": "3fa85f64-5717-4562-b3fc-2c963f66afa6"`.
- Backend must look up this card’s `paymob_token` and call Create Intention with `card_tokens: [paymob_token]`.

### 3.2 Response

- **Status:** `200` or `201`
- **Body (JSON):** The app expects the following. All fields used by the SDK are required for the flow to work.

| Field                 | Type   | Required for app        | Description |
|-----------------------|--------|--------------------------|-------------|
| `merchant_order_id`   | string | Yes                      | Same as request (for polling). |
| `paymob_order_id`     | number | Yes                      | Paymob order/id from intention (for correlation). |
| `client_secret`       | string | **Yes (recommended)**    | From Create Intention response. App passes it to the SDK as `clientSecret`. |
| `payment_key`         | string | Optional if `client_secret` set | If you do not send `client_secret`, the app will use `payment_key` as the SDK’s `clientSecret`. So either return `client_secret` from the intention, or a single token as `payment_key`. |
| `status`              | string | Yes                      | e.g. `"PENDING"`. |
| `public_key`          | string | No                       | Paymob public key. If omitted, the app uses a config/build-time public key. |

Minimum recommended response (Create Intention flow):

```json
{
  "merchant_order_id": "ord_abc123",
  "paymob_order_id": 12345678,
  "client_secret": "the_intention_client_secret_from_paymob",
  "payment_key": "the_intention_client_secret_from_paymob",
  "status": "PENDING",
  "public_key": "your_paymob_public_key"
}
```

You can omit `public_key` if the app is configured with `PAYMOB_PUBLIC_KEY`; you must always return a token the app can use as **clientSecret** (either as `client_secret` or `payment_key`).

---

## 4. Payment status endpoint (polling)

The app polls this after the SDK returns to determine final outcome.

- **Method:** `GET`
- **Path:** `/orders/{merchant_order_id}/payment-status`  
  (The app uses the same `merchant_order_id` it sent in the session request.)

- **Response (JSON):** The app expects at least:

| Field             | Type   | Description |
|-------------------|--------|-------------|
| `status`          | string | `"PAID"` \| `"FAILED"` \| `"PENDING"` (or your equivalents; app checks for paid/failed). |
| `amount_cents`    | number | Used on success screen. |
| `currency`        | string | e.g. `"EGP"`. |
| `paymob_order_id` | number | Optional. |
| `updatedAt`       | string | Optional. |

Ensure that when Paymob notifies your backend (webhook/callback), you update the order state so this endpoint returns the correct terminal status.

---

## 5. Saved cards APIs (existing contract)

The app already uses these; keep them compatible.

- **User identity:** Requests use header **`X-User-Id`** (or your auth). Backend scopes cards to this user.

| Purpose           | Method | Path                    | Notes |
|-------------------|--------|-------------------------|-------|
| Save card         | POST   | `/users/me/cards`       | Body: `paymob_token`, `masked_pan`, optional `card_brand`, `last_four`. Response 201 with saved card (id/uuid, masked_pan, etc.). |
| List cards        | GET    | `/users/me/cards`       | Response 200 with list (e.g. `cards: [{ id, masked_pan, card_brand, ... }]`). |
| Get card for payment | GET | `/users/me/cards/:cardId` | When paying with saved card, app may call this to get `paymob_token` + `masked_pan`. With the new flow, **the app does not pass token to the SDK**; the backend must pass the token in Create Intention via **card_tokens**. So this endpoint is still needed if you resolve `saved_card_uuid` to a `paymob_token` server-side. |
| Delete card       | DELETE | `/users/me/cards/:cardId` | 204 or 200. |

For **pay with saved card**, the app sends **saved_card_uuid** in the **session** request. The backend must:

1. Resolve `saved_card_uuid` to the stored Paymob token for that card.
2. Call Create Intention with **`card_tokens: [paymob_token]`**.
3. Return the intention’s **client_secret** (and optionally **public_key**) in the session response.

The app then calls the SDK only with **publicKey** and **clientSecret**; it does not send the card token in the session body.

---

## 6. Callback URL (Paymob)

Configure the **callback URL** for the integration ID you use so Paymob can notify your backend after payment. By region (from Paymob docs):

- Egypt: `https://accept.paymob.com/api/acceptance/post_pay`
- Oman: `https://oman.paymob.com/api/acceptance/post_pay`
- Saudi Arabia: `https://ksa.paymob.com/api/acceptance/post_pay`
- UAE: `https://uae.paymob.com/api/acceptance/post_pay`

Your backend should handle the callback and update the order state so that **GET /orders/{merchant_order_id}/payment-status** returns the correct status.

---

## 7. Optional: demo order endpoint

The app may call **POST /demo/orders** to get a test **merchant_order_id**. Response should include at least:

```json
{ "merchant_order_id": "demo_ord_123" }
```

Not required for production if orders are always created elsewhere.

---

## 8. Implementation checklist (backend)

- [ ] **Create Intention API:** Implement server-side call to Paymob `POST /v1/intention/` with secret key, amount, currency, payment methods, and link to merchant order.
- [ ] **Session endpoint:** Accept `POST /payments/paymob/session` (or your path) with the request body above. Return **client_secret** (from intention) and optionally **public_key**; ensure **merchant_order_id**, **paymob_order_id**, and **status** are present.
- [ ] **Saved-card flow:** When request contains **saved_card_uuid**, resolve it to the stored Paymob token and call Create Intention with **card_tokens: [paymob_token]**.
- [ ] **Payment status:** Expose **GET /orders/{merchant_order_id}/payment-status** with **status** (PAID/FAILED/PENDING), **amount_cents**, **currency**. Update order state from Paymob callback.
- [ ] **Saved cards:** Keep **POST/GET/DELETE** for `/users/me/cards` and **GET /users/me/cards/:cardId** (with **paymob_token** + **masked_pan** for payment) compatible with current app; use **X-User-Id** (or your auth) for user scoping.
- [ ] **Callback URL:** Configure Paymob integration callback URL for your region and handle it so order status stays in sync.
- [ ] **Secrets:** Use Paymob **secret key** only on the backend; never expose it to the app. App only receives **public_key** and per-intention **client_secret**.

---

## 9. References

- Paymob developer docs: [developers.paymob.com](https://developers.paymob.com)
- Create Intention API: Developer Reference → Create Intention
- Flutter/mobile SDK doc: [Paymob Flutter SDK](https://developers.paymob.com/paymob-docs/developers/mobile-sdks/flutter-sdk) (for context on client_secret + public_key usage)
