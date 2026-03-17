# Paymob Mobile SDK – Session + Webhook Only

This document covers the **two required backend APIs** for the Paymob Mobile SDK flow:

- `POST /payments/paymob/session`
- `POST /payments/paymob/webhook`

## 1) `POST /payments/paymob/session`

Creates a Paymob **Payment Intention** and returns `client_secret` for the Mobile SDK.

### Headers

- `Content-Type: application/json`
- `X-User-Id: <opaque user/device id>` (**recommended always**)  
  - Required when paying with a saved card (`saved_card_uuid`)  
  - Used to attach Paymob `TOKEN` webhook (saved card token) to the correct user

### Request body

```json
{
  "merchant_order_id": "demo-<uuid>",
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

### Behavior

- Backend calls Paymob Create Intention (`/v1/intention/`) using the **secret key**.
- Backend sets:
  - `notification_url = <BASE_URL>/payments/paymob/webhook`
  - `special_reference = merchant_order_id`
- If `saved_card_uuid` is provided:
  - Backend loads the saved card token and sends Paymob `card_tokens: [token]` (CIT flow).

### Response 200

```json
{
  "merchant_order_id": "demo-<uuid>",
  "paymob_order_id": 488243400,
  "client_secret": "egy_csk_test_...",
  "payment_key": "egy_csk_test_...",
  "status": "PENDING",
  "public_key": "egy_pk_test_... (optional)"
}
```

Mobile opens Paymob Mobile SDK using `public_key` + `client_secret`.

---

## 2) `POST /payments/paymob/webhook`

Paymob server-to-server callback endpoint. This endpoint receives multiple event types.

### Important notes

- Must be reachable publicly over HTTPS (ngrok is fine for local dev).
- This endpoint expects **raw JSON body** (not parsed JSON) for signature verification.
- HMAC verification is supported; for local demo you may set `DEV_BYPASS_HMAC=true` (do **not** use in production).

### Event type: `TRANSACTION`

Used to update payment status (PENDING/PAID/FAILED). The backend maps the payment using:

- `obj.order.id` or `obj.order_id` (Paymob order id), and/or
- `obj.order.merchant_order_id` (your `merchant_order_id`)

### Event type: `TOKEN` (Saved card token)

Sent when the user checks **Save card** during the payment flow.

Token fields (as observed in Paymob callbacks):

- **`payload.type === "TOKEN"`**
- **`payload.obj.token`** → saved as `saved_cards.paymob_token`
- **`payload.obj.masked_pan`** → saved as `saved_cards.masked_pan`
- `payload.obj.card_subtype` → saved as `saved_cards.card_brand` (optional)
- `payload.obj.order_id` → Paymob order id used to find the payment record

Backend behavior for `TOKEN`:

- Looks up the payment by `paymob_order_id` (= `obj.order_id`)
- Reads the stored `user_id` (captured from `X-User-Id` when `/payments/paymob/session` was called)
- Saves the card token into `saved_cards` for that user (deduped by `(user_id, paymob_token)`)

