import { assertStorefrontConfigured, Config, PublicError } from './config';

interface GraphqlResponse<T> { data?: T; errors?: Array<{ message?: string }>; }

export async function storefront<T>(config: Config, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  assertStorefrontConfigured(config);
  const response = await fetch(`https://${config.shopifyStoreDomain}/api/${config.shopifyApiVersion}/graphql.json`, { method: 'POST', headers: { 'content-type': 'application/json', 'shopify-storefront-private-token': config.storefrontToken }, body: JSON.stringify({ query, variables }) });
  const body = await response.json() as GraphqlResponse<T>;
  if (!response.ok || body.errors?.length || !body.data) {
    console.warn('Shopify Storefront API request failed', {
      status: response.status,
      errors: body.errors?.map((error) => error.message || 'Unknown GraphQL error').slice(0, 3),
    });
    throw new PublicError('SHOPIFY_UNAVAILABLE', 'The Shopify catalog could not be loaded.', 502);
  }
  return body.data;
}

export const PRODUCTS_QUERY = `query Products($first: Int!) { products(first: $first) { nodes { id handle title description availableForSale featuredImage { url altText } priceRange { minVariantPrice { amount currencyCode } } variants(first: 20) { nodes { id title availableForSale price { amount currencyCode } } } } } }`;

export const CAMPAIGN_MEDIA_IDS = [
  'gid://shopify/MediaImage/45490250154288',
  'gid://shopify/MediaImage/45490250055984',
  'gid://shopify/MediaImage/45490250023216',
] as const;

export const CAMPAIGN_MEDIA_QUERY = `query CampaignMedia($ids: [ID!]!) { nodes(ids: $ids) { ... on MediaImage { image { url altText } } } }`;
