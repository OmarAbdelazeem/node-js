# Flutter Handover: Saved Cards (Backend Ready)

This document is for the **Flutter / mobile agent** to implement the app side of the saved-cards feature. The backend is implemented and deployed; the app must call these APIs and integrate with the Paymob SDK as described below.

---

## 1. Backend base and auth

- **Base URL:** Same as your existing backend (e.g. `https://your-api.com` or ngrok URL for dev).
- **Saved-cards auth:** Every request to `/users/me/cards` (and subpaths) **must** include the header:
  - **`X-User-Id`:** Opaque string identifying the current user (e.g. UUID, device id, or later the JWT subject). Same value must be sent for all card operations so cards are scoped to that user.
- No other auth is required for these endpoints in the current backend; for production you would replace `X-User-Id` with real auth (e.g. `Authorization: Bearer <jwt>`), and the backend would derive the user id from the token.

**Flutter:** Store a stable `userId` (e.g. from device id or your auth) and send it as `X-User-Id` on every saved-cards API call.

---

## 2. API endpoints (implemented on backend)

All paths are relative to your base URL. All require `X-User-Id`; otherwise the backend returns **401** with `{ "error": "Missing or invalid X-User-Id header" }`.

### 2.1 Save a card

**When to call:** After a **successful** payment when the user chose **“Save this card”** in the Paymob SDK. The SDK returns a **token** and **masked_pan** (and optionally card_brand / last_four); send those to the backend so the card is stored for this user.

| Item | Value |
|------|--------|
| **Method** | `POST` |
| **Path** | `/users/me/cards` |
| **Headers** | `Content-Type: application/json`, `X-User-Id: <userId>` |
| **Body (JSON)** | `paymob_token` (string, required), `masked_pan` (string, required), `card_brand` (string, optional), `last_four` (string, optional) |

**Success (201):**

```json
{
  "id": "8c7195d7-a641-43e3-90ca-9ec2d4a4d0c1",
  "masked_pan": "XXXX XXXX XXXX 1234",
  "card_brand": "Visa",
  "last_four": "1234",
  "created_at": "2026-02-19T17:56:07.547Z"
}
```

- **Do not** expect `paymob_token` in this response. Store the returned `id` and use it for “get for payment” and “remove”.
- **Errors:** 400 (validation, body has `error` and `details`), 401 (no/invalid `X-User-Id`).

---

### 2.2 List saved cards

**When to call:** When showing the user’s saved cards (e.g. “My cards” or “Pay with saved card” list). Response does **not** include the Paymob token (only display data).

| Item | Value |
|------|--------|
| **Method** | `GET` |
| **Path** | `/users/me/cards` |
| **Headers** | `X-User-Id: <userId>` |

**Success (200):**

```json
{
  "cards": [
    {
      "id": "8c7195d7-a641-43e3-90ca-9ec2d4a4d0c1",
      "masked_pan": "XXXX XXXX XXXX 1234",
      "card_brand": "Visa",
      "last_four": "1234",
      "created_at": "2026-02-19T17:56:07.547Z"
    }
  ]
}
```

- **Errors:** 401 (no/invalid `X-User-Id`).

---

### 2.3 Get card details for payment

**When to call:** When the user **selects a saved card to pay**. The app needs the **Paymob token** and **masked_pan** to pass to the Paymob SDK “pay with token” flow. Call this endpoint with the card `id` from the list; backend returns token + masked_pan only for that card and only for the same user.

| Item | Value |
|------|--------|
| **Method** | `GET` |
| **Path** | `/users/me/cards/:cardId` |
| **Headers** | `X-User-Id: <userId>` |
| **URL** | Replace `:cardId` with the card’s `id` (e.g. `8c7195d7-a641-43e3-90ca-9ec2d4a4d0c1`). |

**Success (200):**

```json
{
  "id": "8c7195d7-a641-43e3-90ca-9ec2d4a4d0c1",
  "paymob_token": "test-token-from-paymob-sdk",
  "masked_pan": "XXXX XXXX XXXX 1234",
  "card_brand": "Visa",
  "last_four": "1234"
}
```

- Use `paymob_token` and `masked_pan` with the Paymob SDK (e.g. tokenized payment / “pay with saved card”).
- **Errors:** 401 (no/invalid `X-User-Id`), 404 (card not found or not owned by user) with `{ "error": "Card not found" }`.

---

### 2.4 Remove a saved card

**When to call:** When the user chooses to delete a saved card (e.g. “Remove card” in the list).

| Item | Value |
|------|--------|
| **Method** | `DELETE` |
| **Path** | `/users/me/cards/:cardId` |
| **Headers** | `X-User-Id: <userId>` |
| **URL** | Replace `:cardId` with the card’s `id`. |

**Success (204):** No response body.

**Errors:** 401 (no/invalid `X-User-Id`), 404 (card not found or not owned) with `{ "error": "Card not found" }`.

---

## 3. App flows to implement

### 3.1 Save card (after payment with “Save this card”)

1. User completes a payment in the Paymob SDK and opts in to **“Save this card”**.
2. Paymob SDK returns (in its success callback) at least:
   - **token** (Paymob card token)
   - **masked_pan** (e.g. `XXXX XXXX XXXX 1234`)
   - Optionally: card brand, last four digits (if SDK provides them).
3. **Call backend:** `POST /users/me/cards` with body:
   - `paymob_token`: value from SDK
   - `masked_pan`: value from SDK
   - `card_brand`, `last_four`: if available from SDK
4. On 201, store the returned `id` in your UI state or local cache if needed (you will use it for “get for payment” and “remove”). You do **not** need to store the token locally; fetch it when the user selects this card to pay.

### 3.2 List saved cards (UI)

1. When opening “My cards” or “Pay with saved card”, call **`GET /users/me/cards`** with `X-User-Id`.
2. On 200, display `response.cards` (id, masked_pan, card_brand, last_four, created_at). Use `id` for “pay with this card” and “remove this card”.

### 3.3 Pay with a saved card

1. User selects a saved card (you have the card `id` from the list).
2. **Get payment key (unchanged):** Call your existing **`POST /payments/paymob/session`** with order details, customer, billing. Backend returns `payment_key` (and order ids).
3. **Get token for SDK:** Call **`GET /users/me/cards/:cardId`** with that card `id` and `X-User-Id`. Backend returns `paymob_token` and `masked_pan`.
4. **Start Paymob SDK** for “pay with token” using:
   - `payment_key` from step 2
   - `paymob_token` and `masked_pan` from step 3  
   (Exact method name depends on your Paymob Flutter SDK, e.g. something like `startPayActivityToken` or similar.)
5. After success/failure, handle as you do for normal payments (e.g. poll status or rely on webhook).

### 3.4 Remove a saved card

1. User taps “Remove” on a card (you have the card `id`).
2. Call **`DELETE /users/me/cards/:cardId`** with `X-User-Id`.
3. On 204, remove the card from your local list/state and refresh the UI. On 404, show “Card not found” or already removed.

---

## 4. Summary for Flutter

| Backend API | When to use |
|-------------|-------------|
| `POST /users/me/cards` | After successful payment when user chose “Save this card”; send SDK token + masked_pan. |
| `GET /users/me/cards` | Load list of saved cards for “My cards” / “Pay with saved card”. |
| `GET /users/me/cards/:cardId` | When user selected a card to pay; get token + masked_pan for Paymob SDK. |
| `DELETE /users/me/cards/:cardId` | When user removes a saved card. |

- **Every request** to these endpoints must include **`X-User-Id`** (same value for a given user/device).
- **Payment session** is unchanged: still **`POST /payments/paymob/session`** for both “new card” and “saved card” payments; for saved card you then call **`GET /users/me/cards/:cardId`** to get the token and pass it (with the new `payment_key`) to the Paymob SDK.

---

## 5. Quick test (curl)

Backend is running at `http://localhost:3000` (or your base URL). Example (replace `BASE` and use a real card id in the last two):

```bash
# Save card
curl -s -X POST "$BASE/users/me/cards" \
  -H "Content-Type: application/json" \
  -H "X-User-Id: user-123" \
  -d '{"paymob_token":"sdk-token-here","masked_pan":"XXXX XXXX XXXX 1234","card_brand":"Visa","last_four":"1234"}'

# List cards
curl -s "$BASE/users/me/cards" -H "X-User-Id: user-123"

# Get for payment (use id from list response)
curl -s "$BASE/users/me/cards/8c7195d7-a641-43e3-90ca-9ec2d4a4d0c1" -H "X-User-Id: user-123"

# Remove card
curl -s -X DELETE "$BASE/users/me/cards/8c7195d7-a641-43e3-90ca-9ec2d4a4d0c1" -H "X-User-Id: user-123"
```

Note: In a real shell, use the actual card `id` (UUID) in the URL; do not use the literal string `<card-id>` (that was only a placeholder and can cause shell errors if your shell interprets `<`/`>`).
