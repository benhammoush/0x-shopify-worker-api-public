export interface Env {
  CORS_ORIGINS?: string;
  SHOPIFY_API_VERSION?: string;
  SHOPIFY_STORE_DOMAIN?: string;
  SHOPIFY_STOREFRONT_TOKEN?: string;
  SOLANA_USDC_RECIPIENT?: string;
  SOLANA_RPC_URL?: string;
  DB: D1Database;
}

export interface Config {
  corsOrigins: string[];
  shopifyApiVersion: string;
  shopifyStoreDomain?: string;
  storefrontToken?: string;
  solanaUsdcRecipient?: string;
  solanaRpcUrl: string;
}

export function getConfig(env: Env): Config {
  const shopifyStoreDomain = env.SHOPIFY_STORE_DOMAIN?.trim().toLowerCase();
  const solanaUsdcRecipient = env.SOLANA_USDC_RECIPIENT?.trim();
  const solanaRpcUrl = env.SOLANA_RPC_URL?.trim() || 'https://api.devnet.solana.com';
  if (shopifyStoreDomain && !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shopifyStoreDomain)) throw new Error('SHOPIFY_STORE_DOMAIN must be a valid myshopify.com domain.');
  if (solanaUsdcRecipient && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(solanaUsdcRecipient)) throw new Error('SOLANA_USDC_RECIPIENT must be a valid Solana public key.');
  try { const url = new URL(solanaRpcUrl); if (url.protocol !== 'https:') throw new Error(); } catch { throw new Error('SOLANA_RPC_URL must be an HTTPS URL.'); }
  return { corsOrigins: (env.CORS_ORIGINS || '').split(',').map((origin) => origin.trim()).filter(Boolean), shopifyApiVersion: env.SHOPIFY_API_VERSION || '2026-10', shopifyStoreDomain, storefrontToken: env.SHOPIFY_STOREFRONT_TOKEN?.trim(), solanaUsdcRecipient, solanaRpcUrl };
}

export function assertStorefrontConfigured(config: Config): asserts config is Config & Required<Pick<Config, 'shopifyStoreDomain' | 'storefrontToken'>> {
  if (!config.shopifyStoreDomain || !config.storefrontToken) throw new PublicError('SHOPIFY_NOT_CONFIGURED', 'The Shopify catalog is not configured yet.', 503);
}

export class PublicError extends Error { constructor(public readonly code: string, message: string, public readonly status: number) { super(message); } }
