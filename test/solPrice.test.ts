import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSolUsdQuote, lamportsForUsdMinorUnits, usdMinorUnits } from '../src/solPrice';

describe('SOL pricing', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('converts USD minor units to lamports with ceiling rounding', () => {
    expect(usdMinorUnits('10.00')).toBe(1000n);
    expect(lamportsForUsdMinorUnits(1000n, '200')).toBe(50_000_000n);
    expect(lamportsForUsdMinorUnits(1n, '3')).toBe(3_333_334n);
    expect(lamportsForUsdMinorUnits(1000n, '2e2')).toBe(50_000_000n);
  });

  it('rejects malformed Shopify totals', () => {
    expect(() => usdMinorUnits('1.001')).toThrow('Cart total must be a USD amount');
  });

  it('accepts a complete Jupiter quote', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ So11111111111111111111111111111111111111112: { usdPrice: 147.5, blockId: 123, decimals: 9 } }), { status: 200 })));
    await expect(getSolUsdQuote('test-key')).resolves.toEqual({ usdPrice: '147.5', blockId: 123 });
  });

  it('rejects an incomplete Jupiter quote', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 })));
    await expect(getSolUsdQuote('test-key')).rejects.toMatchObject({ code: 'SOL_PRICE_UNAVAILABLE' });
  });
});
