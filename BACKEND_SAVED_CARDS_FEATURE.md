# Backend Feature: Save / Remove Cards (Paymob Tokenization)

## Context

- The Flutter app uses **Paymob Accept Egypt** (accept.paymob.com) with a **backend-created session**: the app never holds API keys; the backend creates the order and returns a `payment_key`, and the app passes only that key to the native SDK.
- When a user pays and chooses **“Save this card”** in the Paymob SDK, Paymob returns a **token** and a **masked card number** (e.g. `XXXX XXXX XXXX 1234`) to the app. That token can be used later with a new `payment_key` to pay without re-entering full card details.
- The app needs the backend to **store and manage these saved cards per user** so that:
  - The user can see a list of saved cards (masked number, optional brand).
  - The user can pay with a saved card (app will send token + masked_pan to the SDK along with a new payment_key).
  - The user can remove a saved card.

---

## Feature Goal

Implement backend support for **saved payment methods** so the mobile app can:

1. **Save a card** after a successful payment when the user opted to save it (app will send token + masked_pan to backend).
2. **List saved cards** for the current user (backend returns id, masked_pan, optional metadata).
3. **Remove a saved card** (backend deletes or soft-deletes the stored token for that card id).

No change to the **existing payment session flow**: the backend continues to expose `POST /payments/paymob/session` and returns `payment_key`. The app will use that same endpoint for both “new card” and “saved card” payments; for saved card it will then call the Paymob SDK with `payment_key` + stored token + masked_pan.

---

## Backend Responsibilities

1. **Identify the user**  
   Use your existing auth (e.g. JWT, session, API key) so every saved-card request is tied to a **user id**. If the app currently has no auth, define a minimal scheme (e.g. device id or temporary user id) so cards are scoped per user.

2. **Store saved cards**  
   When the app sends a token + masked_pan after a successful “save card” payment, store them in a table (e.g. `saved_cards` or `payment_methods`) with at least:
   - `user_id` (or equivalent)
   - `paymob_token` (string from Paymob)
   - `masked_pan` (e.g. `XXXX XXXX XXXX 1234`)
   - Optional: `card_brand` (Visa/Mastercard), `last_four`, `created_at`
   - A stable **card id** (e.g. UUID or auto-increment) that the app will use for “list” and “remove”.

3. **Expose three APIs** (see below): **save card**, **list cards**, **remove card**.

4. **Security**  
   - Never return the raw Paymob token to the client in list responses; only use it server-side if you ever need to (e.g. server-side payment). The app will store the token locally after “save” or fetch it when needed for payment, depending on your design (see below).
   - Actually: the app needs the token to pass to the Paymob SDK for “pay with saved card”. So either:
     - **Option A:** Backend returns token + masked_pan in “list cards” (only to the owning user). App uses them for `startPayActivityToken`.  
     - **Option B:** Backend does not return token in list; app calls a dedicated “get payment method details” (token + masked_pan) when user selects a card for payment.  
   - Prefer the least exposure: e.g. return token only when the user is about to pay (e.g. “get card details” by card id), not in the full list. If the list is only shown to the authenticated user, returning token in list is acceptable but less secure if the device is compromised.

Recommendation: **List** returns only `id`, `masked_pan`, optional `card_brand`/`last_four`. **Get card details for payment** returns `token` + `masked_pan` for a given card id so the app can call the SDK once the user selects that card.

---

## API Contract

Base URL and auth: same as existing app (e.g. `Authorization: Bearer <token>` or your current mechanism). All endpoints below assume the user is identified as above.

---

### 1. Save a card (after successful payment when user chose “Save card”)

**Endpoint:** `POST /users/me/cards` (or `POST /saved-cards`, or under your existing user resource).

**Request body (JSON):**
```json
{
  "paymob_token": "string",
  "masked_pan": "string",
  "card_brand": "Visa | Mastercard | optional",
  "last_four": "1234"
}
```

- `paymob_token` and `masked_pan` are **required** (they come from Paymob SDK response when user saves the card).
- `card_brand` and `last_four` are optional; the app can send them if the SDK provides them.

**Success (201 Created):**
```json
{
  "id": "uuid-or-card-id",
  "masked_pan": "XXXX XXXX XXXX 1234",
  "card_brand": "Mastercard",
  "last_four": "1234",
  "created_at": "2026-02-19T12:00:00.000Z"
}
```

Do **not** return `paymob_token` in this response if you prefer to expose it only when needed for payment (then the app will call “get card details” before paying with this card). Otherwise you can return it once here so the app can store it locally for that card id.

**Errors:** 400 (validation), 401 (unauthorized).

---

### 2. List saved cards

**Endpoint:** `GET /users/me/cards` (or `GET /saved-cards`).

**Request:** No body. Query params optional (e.g. `limit`, `offset`).

**Success (200):**
```json
{
  "cards": [
    {
      "id": "uuid-or-card-id",
      "masked_pan": "XXXX XXXX XXXX 1234",
      "card_brand": "Mastercard",
      "last_four": "1234",
      "created_at": "2026-02-19T12:00:00.000Z"
    }
  ]
}
```

Do **not** include `paymob_token` here if you have a separate “get card details for payment” endpoint.

**Errors:** 401 (unauthorized).

---

### 3. Get card details (for payment with saved card)

**Endpoint:** `GET /users/me/cards/:cardId` (or `GET /saved-cards/:cardId`).

**Purpose:** Return the Paymob token and masked_pan so the app can call the Paymob SDK’s “pay with token” flow. Only return for the authenticated user and only for the specified card id.

**Success (200):**
```json
{
  "id": "uuid-or-card-id",
  "paymob_token": "string",
  "masked_pan": "XXXX XXXX XXXX 1234",
  "card_brand": "Mastercard",
  "last_four": "1234"
}
```

**Errors:** 401 (unauthorized), 404 (card not found or not owned by user).

---

### 4. Remove a saved card

**Endpoint:** `DELETE /users/me/cards/:cardId` (or `DELETE /saved-cards/:cardId`).

**Request:** No body.

**Success:** 204 No Content (or 200 with a short confirmation message).

**Errors:** 401 (unauthorized), 404 (card not found or not owned by user).

---

## Optional: Paymob token invalidation

If Paymob’s API supports invalidating a token when the user removes a card, the backend can call that when handling `DELETE /users/me/cards/:cardId`. This is optional and depends on Paymob Accept documentation.

---

## Summary for backend

| Action        | Method | Endpoint                  | Body / response |
|---------------|--------|---------------------------|------------------|
| Save card     | POST   | /users/me/cards           | Body: paymob_token, masked_pan (+ optional). Response: id, masked_pan, etc. |
| List cards    | GET    | /users/me/cards           | Response: list of { id, masked_pan, card_brand?, last_four?, created_at } (no token). |
| Get for pay   | GET    | /users/me/cards/:cardId   | Response: id, paymob_token, masked_pan (so app can call SDK). |
| Remove card   | DELETE | /users/me/cards/:cardId   | 204 or 200. |

User identity: use existing auth; all endpoints are scoped to “current user.”

The existing **POST /payments/paymob/session** and **GET /orders/:merchant_order_id/payment-status** stay unchanged. The app will continue to create a session for every payment (new or saved card) and then either pass only `payment_key` (new card) or `payment_key` + token + masked_pan (saved card) to the Paymob SDK.
