CREATE TABLE IF NOT EXISTS payment_intents (
  id TEXT PRIMARY KEY,
  shopify_cart_id TEXT NOT NULL,
  cart_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('created', 'awaiting_transaction', 'submitted', 'confirming', 'confirmed', 'order_updated', 'failed', 'expired', 'manual_review')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transaction_attempts (
  chain_id INTEGER NOT NULL,
  transaction_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  payment_intent_id TEXT NOT NULL REFERENCES payment_intents(id),
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (chain_id, transaction_hash, log_index),
  UNIQUE (payment_intent_id)
);

CREATE TABLE IF NOT EXISTS shopify_order_links (
  payment_intent_id TEXT PRIMARY KEY REFERENCES payment_intents(id),
  shopify_order_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shopify_webhooks (
  webhook_id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  received_at TEXT NOT NULL
);
