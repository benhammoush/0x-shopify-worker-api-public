import { Config, Env, PublicError } from './config';
import { error, success } from './http';
import { addCartLines, CAMPAIGN_MEDIA_IDS, CAMPAIGN_MEDIA_QUERY, createCart, getCart, PRODUCTS_QUERY, storefront, updateCartLine } from './shopify';
import { API_VERSION } from './version';

export async function route(request: Request, _env: Env, config: Config, id: string, origin?: string): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (request.method === 'GET' && path === '/health') return success({ service: '0x-shopify-api', version: API_VERSION, mode: 'testnet-demo' }, id, origin);
  if (request.method === 'GET' && path === '/ready') return success({ shopifyConfigured: Boolean(config.shopifyStoreDomain && config.storefrontToken), cryptoEnabled: false }, id, origin);
  if (request.method === 'GET' && path === '/v1/status') return success({ version: API_VERSION, mode: 'testnet-demo', crypto: 'disabled-pending-approved-specification' }, id, origin);
  if (request.method === 'GET' && path === '/v1/products') { const data = await storefront<{ products: { nodes: unknown[] } }>(config, PRODUCTS_QUERY, { first: 24 }); return success({ products: data.products.nodes }, id, origin, { source: 'shopify' }); }
  if (request.method === 'GET' && path === '/v1/campaign-media') {
    const data = await storefront<{ nodes: Array<{ image?: { url: string; altText?: string | null } | null } | null> }>(config, CAMPAIGN_MEDIA_QUERY, { ids: CAMPAIGN_MEDIA_IDS });
    const images = data.nodes.map((node) => node?.image).filter((image): image is { url: string; altText?: string | null } => Boolean(image?.url));
    const byAlt = new Map(images.map((image) => [image.altText?.trim().toLowerCase(), image]));
    const main = byAlt.get('main');
    const alt1 = byAlt.get('alt 1');
    const alt2 = byAlt.get('alt 2');
    if (!main || !alt1 || !alt2) throw new PublicError('CAMPAIGN_MEDIA_UNAVAILABLE', 'Campaign images could not be loaded.', 502);
    return success({ main, alt1, alt2 }, id, origin, { source: 'shopify' });
  }
  if (request.method === 'POST' && path === '/v1/carts') {
    const body = await requestBody(request);
    return success({ cart: await createCart(config, cartLines(body)) }, id, origin, { source: 'shopify' });
  }
  const cartMatch = path.match(/^\/v1\/carts\/(gid%3A%2F%2Fshopify%2FCart%2F[^/]+|gid:\/\/shopify\/Cart\/[^/]+)$/i);
  if (request.method === 'GET' && cartMatch) return success({ cart: await getCart(config, decodeURIComponent(cartMatch[1])) }, id, origin, { source: 'shopify' });
  const cartLinesMatch = path.match(/^\/v1\/carts\/(gid%3A%2F%2Fshopify%2FCart%2F[^/]+|gid:\/\/shopify\/Cart\/[^/]+)\/lines$/i);
  if (request.method === 'POST' && cartLinesMatch) {
    const body = await requestBody(request);
    return success({ cart: await addCartLines(config, decodeURIComponent(cartLinesMatch[1]), cartLines(body)) }, id, origin, { source: 'shopify' });
  }
  const cartLineMatch = path.match(/^\/v1\/carts\/(gid%3A%2F%2Fshopify%2FCart%2F[^/]+|gid:\/\/shopify\/Cart\/[^/]+)\/lines\/(gid%3A%2F%2Fshopify%2FCartLine%2F[^/]+|gid:\/\/shopify\/CartLine\/[^/]+)$/i);
  if (request.method === 'POST' && cartLineMatch) {
    const body = await requestBody(request);
    return success({ cart: await updateCartLine(config, decodeURIComponent(cartLineMatch[1]), decodeURIComponent(cartLineMatch[2]), quantity(body)) }, id, origin, { source: 'shopify' });
  }
  if (path.startsWith('/v1/crypto/')) return error('CRYPTO_DISABLED', 'Crypto checkout is disabled until the Solana recipient and Shopify Admin configuration are set.', 503, id, origin);
  throw new PublicError('NOT_FOUND', 'The requested resource was not found.', 404);
}

async function requestBody(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) throw new PublicError('INVALID_REQUEST', 'Request body must be JSON.', 415);
  const contentLength = Number(request.headers.get('content-length') || '0');
  if (contentLength > 32_768) throw new PublicError('INVALID_REQUEST', 'Request body is too large.', 413);
  try { return await request.json(); } catch { throw new PublicError('INVALID_REQUEST', 'Request body must be valid JSON.', 400); }
}

function cartLines(body: unknown): Array<{ merchandiseId: string; quantity: number }> {
  if (!body || typeof body !== 'object' || !Array.isArray((body as { lines?: unknown }).lines) || !(body as { lines: unknown[] }).lines.length || (body as { lines: unknown[] }).lines.length > 20) throw new PublicError('INVALID_REQUEST', 'A cart requires between 1 and 20 lines.', 400);
  return (body as { lines: unknown[] }).lines.map((line) => {
    if (!line || typeof line !== 'object') throw new PublicError('INVALID_REQUEST', 'Cart lines must be objects.', 400);
    const { merchandiseId, quantity: value } = line as { merchandiseId?: unknown; quantity?: unknown };
    if (typeof merchandiseId !== 'string' || !/^gid:\/\/shopify\/ProductVariant\/[^/]+$/.test(merchandiseId) || typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 100) throw new PublicError('INVALID_REQUEST', 'Cart lines must include a valid merchandise ID and quantity from 1 to 100.', 400);
    return { merchandiseId, quantity: value };
  });
}

function quantity(body: unknown): number {
  if (!body || typeof body !== 'object') throw new PublicError('INVALID_REQUEST', 'A quantity is required.', 400);
  const value = (body as { quantity?: unknown }).quantity;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 100) throw new PublicError('INVALID_REQUEST', 'Quantity must be an integer from 0 to 100.', 400);
  return value;
}
