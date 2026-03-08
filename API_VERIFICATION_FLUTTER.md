# API Verification for Flutter Mobile Client

## 1. Base URL and Port

| Context | Base URL |
|---------|----------|
| Local (same machine) | `http://localhost:3000` |
| Android emulator | `http://10.0.2.2:3000` |
| iOS simulator | `http://localhost:3000` |
| Physical device | `http://<YOUR_MACHINE_IP>:3000` |

Port comes from env (`PORT` in `.env`, default 3000).

---

## 2. Listen Address

The server uses `app.listen(PORT)` without a host argument, so Node.js binds to **all interfaces (0.0.0.0)** by default.

- ✅ Reachable from localhost
- ✅ Reachable from Android emulator via `10.0.2.2`
- ✅ Reachable from physical devices on same LAN via your machine's IP

---

## 3. Endpoints

### POST /payments/paymob/session

Creates a Paymob order and payment key. **Request:** JSON body. **Success:** 200. **Errors:** 400 (validation), 502 (Paymob failure).

**Request body:**
```json
{
  "merchant_order_id": "string",
  "amount_cents": 12345,
  "currency": "EGP",
  "customer": {
    "id": "string",
    "email": "string",
    "first_name": "string",
    "last_name": "string",
    "phone": "string"
  },
  "billing": {
    "apartment": "string",
    "floor": "string",
    "street": "string",
    "building": "string",
    "city": "string",
    "state": "string",
    "country": "string",
    "postal_code": "string"
  }
}
```

**Response (200):**
```json
{
  "merchant_order_id": "string",
  "paymob_order_id": 123456,
  "payment_key": "ZXlK...",
  "status": "PENDING"
}
```

---

### GET /orders/:merchant_order_id/payment-status

Returns payment status for an order. **Request:** Path param `merchant_order_id`. **Success:** 200. **Error:** 404.

**Response (200):**
```json
{
  "status": "PENDING" | "PAID" | "FAILED",
  "amount_cents": 12345,
  "currency": "EGP",
  "paymob_order_id": 123456,
  "updatedAt": "2026-02-18T22:38:16.096Z"
}
```

---

### POST /demo/orders

Creates a dummy order id for testing. **Request:** No body required (empty JSON or none). **Success:** 200.

**Response (200):**
```json
{
  "merchant_order_id": "demo-<uuid>"
}
```

---

## 4. CORS

There is **no CORS middleware** configured. For a native Flutter app using Dio/http, this is fine—CORS only applies to browser requests. If you ever use a WebView or web frontend to call this API, you will need to add CORS headers.

---

## 5. Testing

### Curl Examples

**POST /demo/orders:**
```bash
curl -X POST http://localhost:3000/demo/orders \
  -H "Content-Type: application/json"
```

Expected response: `{"merchant_order_id":"demo-<uuid>"}`

---

**POST /payments/paymob/session:**
```bash
curl -X POST http://localhost:3000/payments/paymob/session \
  -H "Content-Type: application/json" \
  -d '{
    "merchant_order_id": "order-1",
    "amount_cents": 10000,
    "currency": "EGP",
    "customer": {
      "id": "c1",
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
  }'
```

---

**GET /orders/:merchant_order_id/payment-status:**
```bash
curl http://localhost:3000/orders/order-1/payment-status
```

---

### Flutter Dio Equivalent (POST /demo/orders)

```dart
final response = await Dio().post(
  'http://10.0.2.2:3000/demo/orders',
  options: Options(headers: {'Content-Type': 'application/json'}),
);
// response.data = {"merchant_order_id": "demo-..."}
```
