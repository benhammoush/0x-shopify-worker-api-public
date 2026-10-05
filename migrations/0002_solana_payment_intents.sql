CREATE TABLE IF NOT EXISTS solana_payment_intents (
  id TEXT PRIMARY KEY,
  shopify_cart_id TEXT NOT NULL,
  cart_hash TEXT NOT NULL,
  expected_raw_amount TEXT NOT NULL,
  recipient TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('created', 'verified', 'order_created', 'expired', 'manual_review')),
  signature TEXT UNIQUE,
  payer TEXT,
  shopify_order_id TEXT UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS solana_payment_claims_signature ON solana_payment_intents(signature) WHERE signature IS NOT NULL;
