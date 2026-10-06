import { PublicError } from './config';

const LAMPORTS_PER_SOL = 1_000_000_000n;
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const JUPITER_PRICE_URL = `https://api.jup.ag/price/v3?ids=${SOL_MINT}`;

export interface SolUsdQuote { usdPrice: string; blockId: number; }

export async function getSolUsdQuote(apiKey: string): Promise<SolUsdQuote> {
  let response: Response;
  try {
    response = await fetch(JUPITER_PRICE_URL, { headers: { 'x-api-key': apiKey } });
  } catch {
    throw new PublicError('SOL_PRICE_UNAVAILABLE', 'The SOL/USD quote service is unavailable.', 502);
  }
  let body: Record<string, { usdPrice?: unknown; blockId?: unknown; decimals?: unknown }>;
  try { body = await response.json() as Record<string, { usdPrice?: unknown; blockId?: unknown; decimals?: unknown }>; } catch { throw new PublicError('SOL_PRICE_UNAVAILABLE', 'The SOL/USD quote service returned an invalid response.', 502); }
  const price = body[SOL_MINT];
  const usdPrice = typeof price?.usdPrice === 'string' || typeof price?.usdPrice === 'number' ? String(price.usdPrice) : '';
  if (!response.ok || !price || price.decimals !== 9 || !Number.isInteger(price.blockId) || !isPositiveDecimal(usdPrice)) throw new PublicError('SOL_PRICE_UNAVAILABLE', 'A reliable SOL/USD quote is unavailable.', 502);
  return { usdPrice, blockId: price.blockId as number };
}

export function usdMinorUnits(amount: string): bigint {
  if (!/^\d+(\.\d{1,2})?$/.test(amount)) throw new PublicError('CART_NOT_READY', 'Cart total must be a USD amount with at most two decimals.', 422);
  const [dollars, cents = ''] = amount.split('.');
  return BigInt(dollars) * 100n + BigInt((cents + '00').slice(0, 2));
}

export function lamportsForUsdMinorUnits(minorUnits: bigint, usdPrice: string): bigint {
  const { numerator, scale } = decimalRational(usdPrice);
  const dividend = minorUnits * LAMPORTS_PER_SOL * 10n ** BigInt(scale);
  const divisor = 100n * numerator;
  return (dividend + divisor - 1n) / divisor;
}

export function formatSol(lamports: string): string {
  const value = BigInt(lamports);
  return `${value / LAMPORTS_PER_SOL}.${(value % LAMPORTS_PER_SOL).toString().padStart(9, '0')}`;
}

function isPositiveDecimal(value: string): boolean {
  try { return decimalRational(value).numerator > 0n; } catch { return false; }
}

function decimalRational(value: string): { numerator: bigint; scale: number } {
  const match = value.match(/^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i);
  if (!match) throw new Error('Invalid decimal.');
  const exponent = Number(match[3] || '0');
  if (!Number.isSafeInteger(exponent)) throw new Error('Invalid decimal exponent.');
  const digits = `${match[1]}${match[2] || ''}`.replace(/^0+(?=\d)/, '');
  let numerator = BigInt(digits);
  let scale = (match[2] || '').length - exponent;
  if (scale < 0) { numerator *= 10n ** BigInt(-scale); scale = 0; }
  while (scale > 0 && numerator % 10n === 0n) { numerator /= 10n; scale -= 1; }
  if (scale > 100 || numerator <= 0n) throw new Error('Invalid decimal.');
  return { numerator, scale };
}
