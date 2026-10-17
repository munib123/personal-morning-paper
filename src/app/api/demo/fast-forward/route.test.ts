import { afterEach, describe, expect, it, vi } from 'vitest';
import { SimulationResultSchema } from '@/contracts/api';
import { FIXTURE_TAXONOMY } from '@/contracts/fixtures';
import { NOW, makePool } from '@/server/rank/__fixtures__/factory';

const h = vi.hoisted(() => ({ signedIn: true, loads: 0 }));

vi.mock(import('@/server/auth/session'), () => ({
  getSessionUser: vi.fn(async () => (h.signedIn ? { userId: 'u', isAnonymous: false } : null)),
  requireUser: vi.fn(async () => {
    if (!h.signedIn) throw new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
    return { userId: 'u', isAnonymous: false };
  }),
}));
vi.mock(import('@/server/time'), async (orig) => ({ ...(await orig()), requestNow: vi.fn(async () => NOW) }));
vi.mock(import('@/server/edition'), async (orig) => ({
  ...(await orig()),
  loadCandidatePool: vi.fn(async () => {
    h.loads++;
    return makePool(300, { now: NOW });
  }),
  loadTaxonomy: vi.fn(async () => FIXTURE_TAXONOMY),
  loadTopicEmbeddings: vi.fn(async () => ({})),
}));

const { POST } = await import('./route');
const post = (body: unknown = {}) => POST(new Request('http://localhost/api/demo/fast-forward', { method: 'POST', body: JSON.stringify(body) }));

afterEach(() => {
  vi.unstubAllEnvs();
  h.signedIn = true;
});

describe('POST /api/demo/fast-forward', { timeout: 60_000 }, () => {
  it('403 unless DEMO_MODE=1', async () => {
    vi.stubEnv('DEMO_MODE', '');
    expect((await post()).status).toBe(403);
  });

  it('401 without a session in demo mode', async () => {
    vi.stubEnv('DEMO_MODE', '1');
    h.signedIn = false;
    expect((await post()).status).toBe(401);
  });

  it('a measured SimulationResult on the real pool, cached for the next call', async () => {
    vi.stubEnv('DEMO_MODE', '1');
    const res = await post({ days: 7 });
    expect(res.status).toBe(200);
    const body = SimulationResultSchema.parse(await res.json());
    expect(body.persona).toBe('Ayesha');
    expect(body.learning).toHaveLength(7);
    const again = SimulationResultSchema.parse(await (await post({ days: 7 })).json());
    expect(again).toEqual(body);
    expect(h.loads).toBe(1);
  });

  it('400 on an invalid body', async () => {
    vi.stubEnv('DEMO_MODE', '1');
    expect((await post({ days: 0 })).status).toBe(400);
  });
});
