-- Paymob demo: payments table (run when USE_DB=true)
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT,
  merchant_order_id TEXT NOT NULL UNIQUE,
  paymob_order_id BIGINT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL,
  payment_key TEXT,
  raw_webhook JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_paymob_order_id ON payments (paymob_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_merchant_order_id ON payments (merchant_order_id);

-- Saved cards (Paymob tokenization) per user
CREATE TABLE IF NOT EXISTS saved_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  paymob_token TEXT NOT NULL,
  masked_pan TEXT NOT NULL,
  card_brand TEXT,
  last_four TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_cards_user_id ON saved_cards (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_saved_cards_user_token ON saved_cards (user_id, paymob_token);

-- Webhook events (capture every incoming callback payload)
CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_order_id TEXT,
  paymob_order_id BIGINT,
  event_type TEXT,
  headers JSONB,
  raw_body TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_merchant_order_id ON payment_webhook_events (merchant_order_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_paymob_order_id ON payment_webhook_events (paymob_order_id);
