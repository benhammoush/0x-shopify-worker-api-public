import { Config, Env, PublicError } from './config';
import { error, success } from './http';
import { CAMPAIGN_MEDIA_IDS, CAMPAIGN_MEDIA_QUERY, PRODUCTS_QUERY, storefront } from './shopify';
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
    if (images.length !== CAMPAIGN_MEDIA_IDS.length) throw new PublicError('CAMPAIGN_MEDIA_UNAVAILABLE', 'Campaign images could not be loaded.', 502);
    return success({ main: images[0], alt1: images[1], alt2: images[2] }, id, origin, { source: 'shopify' });
  }
  if (path.startsWith('/v1/crypto/')) return error('CRYPTO_DISABLED', 'Crypto checkout is disabled until its testnet payment specification is approved.', 503, id, origin);
  throw new PublicError('NOT_FOUND', 'The requested resource was not found.', 404);
}
