import { describe, expect, it } from 'vitest';
import worker from '../src/index';
import type { Env } from '../src/config';

const env = { CORS_ORIGINS: 'http://localhost:5173' } as unknown as Env;
describe('0x Worker', () => {
  it('reports its testnet-only health status', async () => { const response = await worker.fetch(new Request('https://example.test/health'), env); expect(response.status).toBe(200); await expect(response.json()).resolves.toMatchObject({ data: { mode: 'testnet-demo' } }); });
  it('rejects unknown browser origins', async () => { const response = await worker.fetch(new Request('https://example.test/health', { headers: { origin: 'https://attacker.test' } }), env); expect(response.status).toBe(403); await expect(response.json()).resolves.toMatchObject({ error: { code: 'CORS_ORIGIN_DENIED' } }); });
});
