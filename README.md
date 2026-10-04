# 0x Shopify Worker API

Cloudflare Worker API for the 0x Shopify portfolio storefront. It provides a stable public contract over Shopify Storefront API calls and establishes the secure boundary for a future testnet-only crypto demonstration.

## Security Boundary

- The browser never receives Shopify Admin credentials.
- The Worker is the only component that calls Shopify.
- D1 is reserved for idempotent payment-intent and webhook records.
- Crypto routes are disabled until their exact testnet token, conversion, expiry, and confirmation rules are approved and tested.
- This is not Shopify Payments or a Shopify-approved payment integration.

## Local Setup

```powershell
npm install
Copy-Item .dev.vars.example .dev.vars
npx wrangler d1 migrations apply 0x-demo --local
npm run dev
```

Set `SHOPIFY_STORE_DOMAIN` and `SHOPIFY_STOREFRONT_TOKEN` in `.dev.vars`. Replace the placeholder D1 IDs and production CORS origin before deployment.

## Verification

```powershell
npm run typecheck
npm test
npm run check
```

## API

See `openapi.yaml`. All responses use `{ data, meta }` or `{ error }` envelopes and include `X-Request-Id`.
