import { assertStorefrontConfigured, Config, PublicError } from './config';

interface GraphqlResponse<T> { data?: T; errors?: Array<{ message?: string }>; }

export async function storefront<T>(config: Config, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  assertStorefrontConfigured(config);
  const response = await fetch(`https://${config.shopifyStoreDomain}/api/${config.shopifyApiVersion}/graphql.json`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-shopify-storefront-access-token': config.storefrontToken }, body: JSON.stringify({ query, variables }) });
  const body = await response.json() as GraphqlResponse<T>;
  if (!response.ok || body.errors?.length || !body.data) throw new PublicError('SHOPIFY_UNAVAILABLE', 'The Shopify catalog could not be loaded.', 502);
  return body.data;
}

export const PRODUCTS_QUERY = `query Products($first: Int!) { products(first: $first) { nodes { id handle title description availableForSale featuredImage { url altText } priceRange { minVariantPrice { amount currencyCode } } variants(first: 20) { nodes { id title availableForSale price { amount currencyCode } } } } } }`;
