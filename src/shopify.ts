import { assertStorefrontConfigured, Config, PublicError } from './config';

interface GraphqlResponse<T> { data?: T; errors?: Array<{ message?: string }>; }

export interface ShopifyCart {
  id: string;
  checkoutUrl: string;
  totalQuantity: number;
  cost: { totalAmount: { amount: string; currencyCode: string } };
  lines: { nodes: Array<{ id: string; quantity: number; merchandise: { id: string; title: string; product: { handle: string; title: string } } }> };
}

interface CartMutationResult { cart?: ShopifyCart | null; userErrors: Array<{ field?: string[] | null; message: string }>; }

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

const CART_FIELDS = `id checkoutUrl totalQuantity cost { totalAmount { amount currencyCode } } lines(first: 100) { nodes { id quantity merchandise { ... on ProductVariant { id title product { handle title } } } } }`;

function cartFromResult(result: CartMutationResult): ShopifyCart {
  if (result.userErrors.length) throw new PublicError('SHOPIFY_CART_REJECTED', result.userErrors[0].message, 422);
  if (!result.cart) throw new PublicError('SHOPIFY_CART_UNAVAILABLE', 'The Shopify cart could not be updated.', 502);
  return result.cart;
}

export async function getCart(config: Config, id: string): Promise<ShopifyCart> {
  const data = await storefront<{ cart: ShopifyCart | null }>(config, `query Cart($id: ID!) { cart(id: $id) { ${CART_FIELDS} } }`, { id });
  if (!data.cart) throw new PublicError('CART_NOT_FOUND', 'The requested cart was not found.', 404);
  return data.cart;
}

export async function createCart(config: Config, lines: Array<{ merchandiseId: string; quantity: number }>): Promise<ShopifyCart> {
  const data = await storefront<{ cartCreate: CartMutationResult }>(config, `mutation CartCreate($input: CartInput!) { cartCreate(input: $input) { cart { ${CART_FIELDS} } userErrors { field message } } }`, { input: { lines } });
  return cartFromResult(data.cartCreate);
}

export async function addCartLines(config: Config, cartId: string, lines: Array<{ merchandiseId: string; quantity: number }>): Promise<ShopifyCart> {
  const data = await storefront<{ cartLinesAdd: CartMutationResult }>(config, `mutation CartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) { cartLinesAdd(cartId: $cartId, lines: $lines) { cart { ${CART_FIELDS} } userErrors { field message } } }`, { cartId, lines });
  return cartFromResult(data.cartLinesAdd);
}

export async function updateCartLine(config: Config, cartId: string, lineId: string, quantity: number): Promise<ShopifyCart> {
  const data = await storefront<{ cartLinesUpdate: CartMutationResult }>(config, `mutation CartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) { cartLinesUpdate(cartId: $cartId, lines: $lines) { cart { ${CART_FIELDS} } userErrors { field message } } }`, { cartId, lines: [{ id: lineId, quantity }] });
  return cartFromResult(data.cartLinesUpdate);
}
