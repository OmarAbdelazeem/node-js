# Paymob Mobile SDK Backend – API Recipe

This document is a copy/paste “recipe” of the HTTP endpoints used by this backend so you can reuse the same contract in another project.

## Base concepts

- **`merchant_order_id`**: your app’s unique order id (must be unique per payment attempt).
- **`paymob_order_id`**: Paymob’s order id returned from Create Intention.
- **`X-User-Id` header**: an opaque user/device id (for production replace with real auth). Used to link saved cards + payments to a user.
- **Webhook vs Callback**
  - **Webhook**: server-to-server (Paymob → your backend) via **POST**.
  - **Callback**: user redirect (Paymob/SDK → browser) via **GET**.

## Endpoints

### POST `/payments/paymob/session`

Creates a Paymob payment intention (Create Intention API) and returns the `client_secret` for the Mobile SDK.

- **Headers**
  - `Content-Type: application/json`
  - `X-User-Id: <opaque id>` (**recommended always**; **required** when paying with saved card)

- **Request body**

```json
{
  "merchant_order_id": "order-123",
  "amount_cents": 10000,
  "currency": "EGP",
  "customer": {
    "id": "user-1",
    "email": "test@example.com",
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
  },
  "saved_card_uuid": "optional-saved-card-id"
}
```

- **Saved card usage**
  - For “pay with saved card (CIT)”, set `saved_card_uuid` to the id returned from **GET** `/users/me/cards`.
  - When `saved_card_uuid` is present, the backend looks up the user’s card token and calls Paymob with `card_tokens: [token]`.

- **Response 200**

```json
{
  "merchant_order_id": "order-123",
  "paymob_order_id": 488243400,
  "client_secret": "egy_csk_test_...",
  "payment_key": "egy_csk_test_...",
  "status": "PENDING",
  "public_key": "egy_pk_test_... (optional)"
}
```

Mobile should start Paymob Mobile SDK using `public_key` + `client_secret`.

---

### POST `/payments/paymob/webhook`

Paymob server-to-server callbacks.

- **Used for**
  - Payment status updates (`type: "TRANSACTION"`)
  - Saved card token delivery (`type: "TOKEN"`)

- **Important**
  - The backend expects a **raw JSON body** (configured in `src/index.ts`).
  - HMAC verification is supported; for local demo you may use `DEV_BYPASS_HMAC=true` (do not use in production).

#### TOKEN event (saved card)

When the user checks **Save card** during payment, Paymob sends a separate callback:

- `payload.type === "TOKEN"`
- Token is at **`payload.obj.token`**
- Masked PAN is at **`payload.obj.masked_pan`**
- Order id is at **`payload.obj.order_id`** (maps to `paymob_order_id`)

The backend automatically stores this token in `saved_cards` **linked to the payment’s `user_id`**, which comes from the `X-User-Id` header sent to `/payments/paymob/session`.

---

### GET `/payments/paymob/callback`

User-facing redirect endpoint (Paymob “Transaction response callback”).

- Returns an HTML page.
- Optional env: `PAYMENT_CALLBACK_DEEP_LINK=myapp://payment/complete`
  - If set, the HTML redirects back into your app and forwards query params.

Use this for the mobile redirect to avoid “Cannot GET /payments/paymob/webhook”.

---

### GET `/orders/:merchant_order_id/payment-status`

Returns payment status for an order (no secrets).

- **Response 200**

```json
{
  "status": "PAID",
  "amount_cents": 10000,
  "currency": "EGP",
  "paymob_order_id": 488243400,
  "updatedAt": "2026-03-17T10:46:48.298Z"
}
```

---

### Saved cards (tokenization)

All saved-card endpoints require:

- `X-User-Id: <opaque id>`

#### POST `/users/me/cards`

Manually save a card (optional path). **Not required** if you rely on the webhook `TOKEN` event auto-save.

- **Request body**

```json
{
  "paymob_token": "token-from-paymob",
  "masked_pan": "xxxx-xxxx-xxxx-2346",
  "card_brand": "MasterCard",
  "last_four": "2346"
}
```

#### GET `/users/me/cards`

List saved cards for the user (**no token returned**).

- **Response 200**

```json
{
  "cards": [
    {
      "id": "saved-card-uuid",
      "masked_pan": "xxxx-xxxx-xxxx-2346",
      "card_brand": "MasterCard",
      "last_four": "2346",
      "created_at": "2026-03-17T10:46:49.911Z"
    }
  ]
}
```

#### GET `/users/me/cards/:cardId`

Get saved card details for payment (**includes token**).

- **Response 200**

```json
{
  "id": "saved-card-uuid",
  "paymob_token": "token-from-paymob",
  "masked_pan": "xxxx-xxxx-xxxx-2346",
  "card_brand": "MasterCard",
  "last_four": "2346"
}
```

#### DELETE `/users/me/cards/:cardId`

Removes a saved card.

- **Response 204**: No Content

---

### Debug (dev-only)

#### GET `/debug/paymob/webhook-events/:merchant_order_id`

Returns all captured webhook/callback payloads received for that order id (useful to locate saved-card token fields).

- Disabled in production (`NODE_ENV=production` returns 404).

