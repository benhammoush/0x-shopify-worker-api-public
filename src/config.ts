export interface Env {
  CORS_ORIGINS?: string;
  SHOPIFY_API_VERSION?: string;
  SHOPIFY_STORE_DOMAIN?: string;
  SHOPIFY_STOREFRONT_TOKEN?: string;
  DB: D1Database;
}

export interface Config {
  corsOrigins: string[];
  shopifyApiVersion: string;
  shopifyStoreDomain?: string;
  storefrontToken?: string;
}

export function getConfig(env: Env): Config {
  const shopifyStoreDomain = env.SHOPIFY_STORE_DOMAIN?.trim().toLowerCase();
  if (shopifyStoreDomain && !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shopifyStoreDomain)) throw new Error('SHOPIFY_STORE_DOMAIN must be a valid myshopify.com domain.');
  return { corsOrigins: (env.CORS_ORIGINS || '').split(',').map((origin) => origin.trim()).filter(Boolean), shopifyApiVersion: env.SHOPIFY_API_VERSION || '2026-10', shopifyStoreDomain, storefrontToken: env.SHOPIFY_STOREFRONT_TOKEN?.trim() };
}

export function assertStorefrontConfigured(config: Config): asserts config is Config & Required<Pick<Config, 'shopifyStoreDomain' | 'storefrontToken'>> {
  if (!config.shopifyStoreDomain || !config.storefrontToken) throw new PublicError('SHOPIFY_NOT_CONFIGURED', 'The Shopify catalog is not configured yet.', 503);
}

export class PublicError extends Error { constructor(public readonly code: string, message: string, public readonly status: number) { super(message); } }
