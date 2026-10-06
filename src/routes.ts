import { Config, Env, PublicError } from './config';
import { error, success } from './http';
import { addCartLines, CAMPAIGN_MEDIA_IDS, CAMPAIGN_MEDIA_QUERY, createCart, getCart, PRODUCTS_QUERY, replaceCartDeliveryAddress, selectCartDeliveryOptions, storefront, updateCartLine } from './shopify';
import { API_VERSION } from './version';
import { createIntent, verifyIntent } from './payments';

export async function route(request: Request, _env: Env, config: Config, id: string, origin?: string): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (request.method === 'GET' && path === '/health') return success({ service: '0x-shopify-api', version: API_VERSION, mode: 'testnet-demo' }, id, origin);
  if (request.method === 'GET' && path === '/ready') return success({ shopifyConfigured: Boolean(config.shopifyStoreDomain && config.storefrontToken), solanaRecipientConfigured: Boolean(config.solanaRecipient), solanaRpcConfigured: Boolean(config.solanaRpcUrl), jupiterConfigured: Boolean(config.jupiterApiKey), cryptoEnabled: Boolean(config.solanaRecipient && config.jupiterApiKey && config.shopifyAdminClientId && config.shopifyAdminClientSecret) }, id, origin);
  if (request.method === 'GET' && path === '/v1/status') return success({ version: API_VERSION, mode: 'testnet-demo', crypto: config.solanaRecipient && config.jupiterApiKey && config.shopifyAdminClientId && config.shopifyAdminClientSecret ? 'enabled-testnet-only' : 'disabled-awaiting-crypto-configuration' }, id, origin);
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
  const deliveryAddressMatch = path.match(/^\/v1\/carts\/(gid%3A%2F%2Fshopify%2FCart%2F[^/]+|gid:\/\/shopify\/Cart\/[^/]+)\/delivery-address$/i);
  if (request.method === 'POST' && deliveryAddressMatch) {
    const body = await requestBody(request);
    return success({ cart: await replaceCartDeliveryAddress(config, decodeURIComponent(deliveryAddressMatch[1]), deliveryAddress(body)) }, id, origin, { source: 'shopify' });
  }
  const deliveryOptionsMatch = path.match(/^\/v1\/carts\/(gid%3A%2F%2Fshopify%2FCart%2F[^/]+|gid:\/\/shopify\/Cart\/[^/]+)\/delivery-options$/i);
  if (request.method === 'POST' && deliveryOptionsMatch) {
    const body = await requestBody(request);
    return success({ cart: await selectCartDeliveryOptions(config, decodeURIComponent(deliveryOptionsMatch[1]), deliveryOptions(body)) }, id, origin, { source: 'shopify' });
  }
  const cartLineMatch = path.match(/^\/v1\/carts\/(gid%3A%2F%2Fshopify%2FCart%2F[^/]+|gid:\/\/shopify\/Cart\/[^/]+)\/lines\/(gid%3A%2F%2Fshopify%2FCartLine%2F[^/]+|gid:\/\/shopify\/CartLine\/[^/]+)$/i);
  if (request.method === 'POST' && cartLineMatch) {
    const body = await requestBody(request);
    return success({ cart: await updateCartLine(config, decodeURIComponent(cartLineMatch[1]), decodeURIComponent(cartLineMatch[2]), quantity(body)) }, id, origin, { source: 'shopify' });
  }
  if (request.method === 'POST' && path === '/v1/crypto/intents') { const body = await requestBody(request); return success({ intent: await createIntent(config, _env.DB, cartId(body)) }, id, origin); }
  const intentMatch = path.match(/^\/v1\/crypto\/intents\/([0-9a-f-]{36})\/verify$/i);
  if (request.method === 'POST' && intentMatch) { const body = await requestBody(request); return success(await verifyIntent(config, _env.DB, intentMatch[1], signature(body)), id, origin); }
  if (path.startsWith('/v1/crypto/')) return error('CRYPTO_DISABLED', 'Crypto checkout is disabled until its configuration is complete.', 503, id, origin);
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

function deliveryAddress(body: unknown): Record<string, string> {
  if (!body || typeof body !== 'object') throw new PublicError('INVALID_REQUEST', 'A delivery address is required.', 400);
  const input = body as Record<string, unknown>;
  const required = ['firstName', 'lastName', 'address1', 'city', 'zip', 'countryCode'] as const;
  const address: Record<string, string> = {};
  for (const key of required) {
    const value = input[key];
    if (typeof value !== 'string' || !value.trim() || value.length > 100) throw new PublicError('INVALID_REQUEST', `Delivery address ${key} is required.`, 400);
    address[key] = value.trim();
  }
  if (!/^[A-Z]{2}$/.test(address.countryCode)) throw new PublicError('INVALID_REQUEST', 'Delivery address countryCode must be a two-letter uppercase code.', 400);
  for (const key of ['address2', 'provinceCode'] as const) if (typeof input[key] === 'string' && input[key].trim()) address[key] = input[key].trim();
  return address;
}

function deliveryOptions(body: unknown): Array<{ deliveryGroupId: string; deliveryOptionHandle: string }> {
  if (!body || typeof body !== 'object' || !Array.isArray((body as { options?: unknown }).options) || !(body as { options: unknown[] }).options.length || (body as { options: unknown[] }).options.length > 10) throw new PublicError('INVALID_REQUEST', 'At least one delivery option is required.', 400);
  return (body as { options: unknown[] }).options.map((option) => {
    if (!option || typeof option !== 'object') throw new PublicError('INVALID_REQUEST', 'Delivery options must be objects.', 400);
    const { deliveryGroupId, deliveryOptionHandle } = option as { deliveryGroupId?: unknown; deliveryOptionHandle?: unknown };
    if (typeof deliveryGroupId !== 'string' || !deliveryGroupId.startsWith('gid://shopify/CartDeliveryGroup/') || typeof deliveryOptionHandle !== 'string' || !deliveryOptionHandle || deliveryOptionHandle.length > 255) throw new PublicError('INVALID_REQUEST', 'Delivery option is invalid.', 400);
    return { deliveryGroupId, deliveryOptionHandle };
  });
}

function cartId(body: unknown): string { const value = body && typeof body === 'object' ? (body as { cartId?: unknown }).cartId : undefined; if (typeof value !== 'string' || !value.startsWith('gid://shopify/Cart/')) throw new PublicError('INVALID_REQUEST', 'A Shopify cart ID is required.', 400); return value; }
function signature(body: unknown): string { const value = body && typeof body === 'object' ? (body as { signature?: unknown }).signature : undefined; if (typeof value !== 'string') throw new PublicError('INVALID_REQUEST', 'A transaction signature is required.', 400); return value; }
