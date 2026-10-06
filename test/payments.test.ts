import { describe, expect, it } from 'vitest';
import { verifyTransaction } from '../src/payments';

const signature = '1'.repeat(64);
const payer = 'Payer1111111111111111111111111111111111111';
const recipient = 'Recipient111111111111111111111111111111111';
const intent = { expected_raw_amount: '50000000', recipient } as any;

function transaction(overrides: Record<string, unknown> = {}) {
  return {
    blockTime: 1_790_000_000,
    meta: { err: null, preBalances: [1_000_000_000, 0], postBalances: [949_000_000, 50_000_000], innerInstructions: [] },
    transaction: { signatures: [signature], message: { accountKeys: [{ pubkey: payer, signer: true }, { pubkey: recipient, signer: false }], instructions: [{ programId: '11111111111111111111111111111111', parsed: { type: 'transfer', info: { source: payer, destination: recipient, lamports: 50_000_000 } } }] } },
    ...overrides,
  };
}

describe('native SOL payment verification', () => {
  it('accepts an exact finalized native SOL transfer', () => {
    expect(verifyTransaction(transaction(), signature, intent)).toEqual({ payer, blockTime: 1_790_000_000 });
  });

  it('rejects a transfer whose recipient balance delta differs from the intent', () => {
    const tx = transaction({ meta: { err: null, preBalances: [1_000_000_000, 0], postBalances: [949_000_000, 49_999_999], innerInstructions: [] } });
    expect(() => verifyTransaction(tx, signature, intent)).toThrow('expected native SOL transfer');
  });

  it('rejects a self-transfer', () => {
    const selfIntent = { expected_raw_amount: '50000000', recipient: payer } as any;
    expect(() => verifyTransaction(transaction(), signature, selfIntent)).toThrow('payer could not be verified');
  });
});
