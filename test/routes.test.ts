import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index';
import type { Env } from '../src/config';

const env = { CORS_ORIGINS: 'http://localhost:5173' } as unknown as Env;
const configuredEnv = { CORS_ORIGINS: 'http://localhost:5173', SHOPIFY_STORE_DOMAIN: '0x-clothing-oiuwwxac.myshopify.com', SHOPIFY_STOREFRONT_TOKEN: 'test-token', SOLANA_USDC_RECIPIENT: 'BJfAiSAqRpsdzs4fScUbQJmkv84tJ4yoRMbVVZQAYDt2' } as unknown as Env;
describe('0x Worker', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('reports its testnet-only health status', async () => { const response = await worker.fetch(new Request('https://example.test/health'), env); expect(response.status).toBe(200); await expect(response.json()).resolves.toMatchObject({ data: { mode: 'testnet-demo' } }); });
  it('reports when the Solana recipient and RPC have been configured without exposing them', async () => { const response = await worker.fetch(new Request('https://example.test/ready'), configuredEnv); await expect(response.json()).resolves.toMatchObject({ data: { solanaRecipientConfigured: true, solanaRpcConfigured: true, cryptoEnabled: false } }); });
  it('rejects unknown browser origins', async () => { const response = await worker.fetch(new Request('https://example.test/health', { headers: { origin: 'https://attacker.test' } }), env); expect(response.status).toBe(403); await expect(response.json()).resolves.toMatchObject({ error: { code: 'CORS_ORIGIN_DENIED' } }); });
  it('returns the configured Shopify campaign images in their assigned roles', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { nodes: [{ image: { url: 'https://cdn.shopify.com/alt-1.jpg', altText: 'alt 1' } }, { image: { url: 'https://cdn.shopify.com/main.jpg', altText: 'main' } }, { image: { url: 'https://cdn.shopify.com/alt-2.jpg', altText: 'alt 2' } }] } }), { status: 200 })));
    const response = await worker.fetch(new Request('https://example.test/v1/campaign-media'), configuredEnv);
    await expect(response.json()).resolves.toMatchObject({ data: { main: { url: 'https://cdn.shopify.com/main.jpg' }, alt1: { url: 'https://cdn.shopify.com/alt-1.jpg' }, alt2: { url: 'https://cdn.shopify.com/alt-2.jpg' } } });
  });
  it('creates carts only from validated Shopify product variants', async () => {
    const cart = { id: 'gid://shopify/Cart/cart-1', checkoutUrl: 'https://shop.test/cart', totalQuantity: 1, cost: { totalAmount: { amount: '10.00', currencyCode: 'USD' } }, lines: { nodes: [] } };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { cartCreate: { cart, userErrors: [] } } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const response = await worker.fetch(new Request('https://example.test/v1/carts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lines: [{ merchandiseId: 'gid://shopify/ProductVariant/1', quantity: 1 }] }) }), configuredEnv);
    await expect(response.json()).resolves.toMatchObject({ data: { cart } });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it('rejects malformed cart creation requests before Shopify is called', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await worker.fetch(new Request('https://example.test/v1/carts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lines: [{ merchandiseId: 'not-a-variant', quantity: 1 }] }) }), configuredEnv);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'INVALID_REQUEST' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('does not issue a crypto intent without Worker-only Shopify Admin credentials', async () => {
    const response = await worker.fetch(new Request('https://example.test/v1/crypto/intents', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cartId: 'gid://shopify/Cart/cart-1' }) }), configuredEnv);
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'CRYPTO_NOT_CONFIGURED' } });
  });
  it('sends validated delivery addresses to Shopify', async () => {
    const cart = { id: 'gid://shopify/Cart/cart-1', checkoutUrl: 'https://shop.test/cart', totalQuantity: 1, cost: { totalAmount: { amount: '10.00', currencyCode: 'USD' } }, lines: { nodes: [] }, deliveryGroups: { nodes: [] } };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { cartDeliveryAddressesReplace: { cart, userErrors: [] } } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const cartId = encodeURIComponent(cart.id);
    const response = await worker.fetch(new Request(`https://example.test/v1/carts/${cartId}/delivery-address`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ firstName: 'Test', lastName: 'Buyer', address1: '1 Main St', city: 'New York', zip: '10001', countryCode: 'US' }) }), configuredEnv);
    await expect(response.json()).resolves.toMatchObject({ data: { cart } });
    expect(fetchMock.mock.calls[0][1].body).toContain('cartDeliveryAddressesReplace');
  });
});
