import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index';
import type { Env } from '../src/config';

const env = { CORS_ORIGINS: 'http://localhost:5173' } as unknown as Env;
const configuredEnv = { CORS_ORIGINS: 'http://localhost:5173', SHOPIFY_STORE_DOMAIN: '0x-clothing-oiuwwxac.myshopify.com', SHOPIFY_STOREFRONT_TOKEN: 'test-token' } as unknown as Env;
describe('0x Worker', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('reports its testnet-only health status', async () => { const response = await worker.fetch(new Request('https://example.test/health'), env); expect(response.status).toBe(200); await expect(response.json()).resolves.toMatchObject({ data: { mode: 'testnet-demo' } }); });
  it('rejects unknown browser origins', async () => { const response = await worker.fetch(new Request('https://example.test/health', { headers: { origin: 'https://attacker.test' } }), env); expect(response.status).toBe(403); await expect(response.json()).resolves.toMatchObject({ error: { code: 'CORS_ORIGIN_DENIED' } }); });
  it('returns the configured Shopify campaign images in their assigned roles', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { nodes: [{ image: { url: 'https://cdn.shopify.com/alt-1.jpg', altText: 'alt 1' } }, { image: { url: 'https://cdn.shopify.com/main.jpg', altText: 'main' } }, { image: { url: 'https://cdn.shopify.com/alt-2.jpg', altText: 'alt 2' } }] } }), { status: 200 })));
    const response = await worker.fetch(new Request('https://example.test/v1/campaign-media'), configuredEnv);
    await expect(response.json()).resolves.toMatchObject({ data: { main: { url: 'https://cdn.shopify.com/main.jpg' }, alt1: { url: 'https://cdn.shopify.com/alt-1.jpg' }, alt2: { url: 'https://cdn.shopify.com/alt-2.jpg' } } });
  });
});
