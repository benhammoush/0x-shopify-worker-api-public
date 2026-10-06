# 0x Shopify Worker API

Cloudflare Worker API for the 0x Shopify portfolio storefront. It provides a stable public contract over Shopify Storefront API calls and a testnet-only native-SOL payment demonstration.

## Security Boundary

- The browser never receives Shopify Admin credentials.
- The Worker is the only component that calls Shopify.
- D1 is reserved for idempotent payment-intent and webhook records.
- The Worker locks a Jupiter SOL/USD reference quote, converts the canonical Shopify USD total upward to lamports, and verifies finalized native Devnet SOL transfers.
- `SOLANA_RECIPIENT`, `JUPITER_API_KEY`, and Shopify Admin credentials are Worker-only configuration. Crypto routes remain disabled until all are configured.
- This is not Shopify Payments or a Shopify-approved payment integration.

## Local Setup

```powershell
npm install
Copy-Item .dev.vars.example .dev.vars
npx wrangler d1 migrations apply 0x-demo --local
npm run dev
```

Set `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_STOREFRONT_TOKEN`, `SOLANA_RECIPIENT`, `JUPITER_API_KEY`, and Shopify Admin credentials in `.dev.vars`. Apply all D1 migrations before running locally. Replace the placeholder D1 IDs and production CORS origin before deployment.

## Verification

```powershell
npm run typecheck
npm test
npm run check
```

## API

See `openapi.yaml`. All responses use `{ data, meta }` or `{ error }` envelopes and include `X-Request-Id`.
