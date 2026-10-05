import { assertCryptoConfigured, Config, PublicError } from './config';
import { getCart, ShopifyCart } from './shopify';

const USDC_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const EXPIRY_MS = 15 * 60_000;

interface IntentRow { id: string; shopify_cart_id: string; cart_hash: string; expected_raw_amount: string; recipient: string; expires_at: number; status: string; signature: string | null; payer: string | null; shopify_order_id: string | null; }

export async function createIntent(config: Config, db: D1Database, cartId: string) {
  assertCryptoConfigured(config);
  const cart = await getCart(config, cartId);
  assertPayableCart(cart);
  const now = Date.now();
  const id = crypto.randomUUID();
  const expectedRawAmount = usdRawAmount(cart.cost.totalAmount.amount);
  const cartHash = await hashCart(cart);
  await db.prepare('INSERT INTO solana_payment_intents (id, shopify_cart_id, cart_hash, expected_raw_amount, recipient, expires_at, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, cart.id, cartHash, expectedRawAmount, config.solanaUsdcRecipient, now + EXPIRY_MS, 'created', now, now).run();
  return { id, chain: 'solana-devnet', mint: USDC_MINT, decimals: 6, recipient: config.solanaUsdcRecipient, rawAmount: expectedRawAmount, expiresAt: new Date(now + EXPIRY_MS).toISOString(), displayAmount: formatUsdc(expectedRawAmount), rpc: config.solanaRpcUrl };
}

export async function verifyIntent(config: Config, db: D1Database, intentId: string, signature: string) {
  assertCryptoConfigured(config);
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,100}$/.test(signature)) throw new PublicError('INVALID_REQUEST', 'Transaction signature is invalid.', 400);
  const intent = await db.prepare('SELECT * FROM solana_payment_intents WHERE id = ?').bind(intentId).first<IntentRow>();
  if (!intent) throw new PublicError('PAYMENT_INTENT_NOT_FOUND', 'Payment intent was not found.', 404);
  if (intent.status === 'order_created') return { status: 'Verified testnet transfer', orderId: intent.shopify_order_id };
  if (intent.status === 'verified' && intent.signature === signature) {
    const orderId = await createShopifyOrder(config, intent, signature);
    await db.prepare("UPDATE solana_payment_intents SET status = 'order_created', shopify_order_id = ?, updated_at = ? WHERE id = ?").bind(orderId, Date.now(), intent.id).run();
    return { status: 'Verified testnet transfer', orderId };
  }
  if (intent.signature) throw new PublicError('PAYMENT_ALREADY_CLAIMED', 'This payment intent already has a submitted transaction.', 409);
  const tx = await solanaTransaction(config.solanaRpcUrl, signature);
  if (!tx) return { status: 'Awaiting finalized transaction' };
  const verified = verifyTransaction(tx, signature, intent);
  if (verified.blockTime * 1000 > intent.expires_at) throw new PublicError('PAYMENT_EXPIRED', 'The transaction was submitted after the payment intent expired.', 422);
  const existing = await db.prepare('SELECT id FROM solana_payment_intents WHERE signature = ?').bind(signature).first<{ id: string }>();
  if (existing && existing.id !== intent.id) throw new PublicError('PAYMENT_ALREADY_CLAIMED', 'This transaction is already associated with another intent.', 409);
  const claimed = await db.prepare("UPDATE solana_payment_intents SET signature = ?, payer = ?, status = 'verified', updated_at = ? WHERE id = ? AND signature IS NULL AND status = 'created'").bind(signature, verified.payer, Date.now(), intent.id).run();
  if (!claimed.meta.changes) throw new PublicError('PAYMENT_ALREADY_CLAIMED', 'This payment is already associated with another intent.', 409);
  const orderId = await createShopifyOrder(config, intent, signature);
  await db.prepare("UPDATE solana_payment_intents SET status = 'order_created', shopify_order_id = ?, updated_at = ? WHERE id = ?").bind(orderId, Date.now(), intent.id).run();
  return { status: 'Verified testnet transfer', orderId };
}

function assertPayableCart(cart: ShopifyCart) {
  if (!cart.lines.nodes.length || cart.cost.totalAmount.currencyCode !== 'USD' || !cart.deliveryGroups.nodes.length || cart.deliveryGroups.nodes.some((group) => !group.selectedDeliveryOption)) throw new PublicError('CART_NOT_READY', 'Select a Shopify delivery option before starting crypto checkout.', 422);
}
function usdRawAmount(amount: string): string { if (!/^\d+(\.\d{1,2})?$/.test(amount)) throw new PublicError('CART_NOT_READY', 'Cart total must be a USD amount with at most two decimals.', 422); const [dollars, cents = ''] = amount.split('.'); return (BigInt(dollars) * 1_000_000n + BigInt((cents + '00').slice(0, 2)) * 10_000n).toString(); }
function formatUsdc(raw: string) { const value = BigInt(raw); return `${value / 1_000_000n}.${(value % 1_000_000n).toString().padStart(6, '0')}`; }
async function hashCart(cart: ShopifyCart) { const text = JSON.stringify({ id: cart.id, total: cart.cost.totalAmount, lines: cart.lines.nodes.map((line) => [line.merchandise.id, line.quantity]), delivery: cart.deliveryGroups.nodes.map((group) => [group.id, group.selectedDeliveryOption?.handle]) }); const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))); return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join(''); }
async function solanaTransaction(rpc: string, signature: string): Promise<any | null> { const response = await fetch(rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTransaction', params: [signature, { encoding: 'jsonParsed', commitment: 'finalized', maxSupportedTransactionVersion: 0 }] }) }); const body = await response.json() as { result?: unknown; error?: unknown }; if (!response.ok || body.error) throw new PublicError('SOLANA_UNAVAILABLE', 'Solana verification is unavailable.', 502); return body.result as any || null; }
function verifyTransaction(tx: any, signature: string, intent: IntentRow) { if (tx.meta?.err || tx.transaction?.signatures?.[0] !== signature || typeof tx.blockTime !== 'number') throw new PublicError('PAYMENT_NOT_VERIFIED', 'The transaction could not be verified.', 422); const keys = tx.transaction.message.accountKeys as Array<{ pubkey: string; signer: boolean }>; const payer = keys?.[0]; if (!payer?.signer) throw new PublicError('PAYMENT_NOT_VERIFIED', 'The transaction payer could not be verified.', 422); const pre = new Map<number, any>((tx.meta.preTokenBalances || []).map((balance: any) => [balance.accountIndex, balance])); const match = (tx.meta.postTokenBalances || []).find((balance: any) => balance.mint === USDC_MINT && balance.owner === intent.recipient && balance.programId === TOKEN_PROGRAM); const destination = match && keys[match.accountIndex]?.pubkey; const instructions = [...(tx.transaction.message.instructions || []), ...(tx.meta.innerInstructions || []).flatMap((item: any) => item.instructions || [])]; const transfer = instructions.some((instruction: any) => { const info = instruction.parsed?.info; return (instruction.parsed?.type === 'transfer' || instruction.parsed?.type === 'transferChecked') && info?.destination === destination && info?.mint === USDC_MINT && String(info?.tokenAmount?.amount || info?.amount) === intent.expected_raw_amount; }); if (!match || !destination || !transfer || match.uiTokenAmount?.decimals !== 6 || BigInt(match.uiTokenAmount.amount) - BigInt(pre.get(match.accountIndex)?.uiTokenAmount?.amount || '0') !== BigInt(intent.expected_raw_amount)) throw new PublicError('PAYMENT_NOT_VERIFIED', 'The expected test USDC transfer was not found.', 422); return { payer: payer.pubkey, blockTime: tx.blockTime }; }
async function createShopifyOrder(config: Config, intent: IntentRow, signature: string): Promise<string> { const tokenResponse = await fetch(`https://${config.shopifyStoreDomain}/admin/oauth/access_token`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_id: config.shopifyAdminClientId, client_secret: config.shopifyAdminClientSecret, grant_type: 'client_credentials' }) }); const token = await tokenResponse.json() as { access_token?: string }; if (!tokenResponse.ok || !token.access_token) throw new PublicError('SHOPIFY_ADMIN_UNAVAILABLE', 'The Shopify order service is unavailable.', 502); const cart = await getCart(config, intent.shopify_cart_id); const data = await fetch(`https://${config.shopifyStoreDomain}/admin/api/${config.shopifyApiVersion}/graphql.json`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-shopify-access-token': token.access_token }, body: JSON.stringify({ query: 'mutation CreateOrder($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) { orderCreate(order: $order, options: $options) { order { id } userErrors { message } } }', variables: { order: { currency: 'USD', presentmentCurrency: 'USD', lineItems: cart.lines.nodes.map((line) => ({ variantId: line.merchandise.id, quantity: line.quantity })), financialStatus: 'PENDING', test: true, tags: ['testnet-crypto-demo'], note: 'Verified Solana Devnet test-USDC transfer.', customAttributes: [{ key: 'payment_signature', value: signature }, { key: 'payment_intent_id', value: intent.id }, { key: 'payment_usdc_raw_amount', value: intent.expected_raw_amount }] }, options: { inventoryBehaviour: 'BYPASS', sendReceipt: false, sendFulfillmentReceipt: false } } }) }); const body = await data.json() as any; const result = body.data?.orderCreate; if (!data.ok || body.errors?.length || result?.userErrors?.length || !result?.order?.id) throw new PublicError('SHOPIFY_ORDER_FAILED', 'The verified payment could not be recorded in Shopify.', 502); return result.order.id; }
