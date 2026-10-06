ALTER TABLE solana_payment_intents ADD COLUMN asset TEXT NOT NULL DEFAULT 'USDC';
ALTER TABLE solana_payment_intents ADD COLUMN usd_price TEXT;
ALTER TABLE solana_payment_intents ADD COLUMN price_block_id INTEGER;
