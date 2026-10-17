// W2: GET /api/perspectives/[clusterId]. Part 1 follows tests/l0/routes.test.ts (a dead DB, a fast 400
// from fetch): the route answers a sanctioned status, never a 500. Part 2 mocks the DB half and pins the
// 200 body, the fallback when nothing is stored, the stored answer when there is one, and the cache header.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/perspectives/[clusterId]/route';
import { PerspectivesResponseSchema, type ClusterArticle, type StoredPerspectives } from '@/server/perspectives/build';
import { getClusterSources } from '@/server/perspectives';

vi.mock('@/server/perspectives', () => ({ getClusterSources: vi.fn() }));

const ORIGIN = 'http://localhost:3000';
const CLUSTER = '84b4576e-1b2c-4d3e-8f90-a1b2c3d4e5f6';
const req = (id: string) => new Request(`${ORIGIN}/api/perspectives/${id}`);
const ctx = (clusterId: string) => ({ params: Promise.resolve({ clusterId }) });
const SANCTIONED = [400, 401, 403, 404, 501, 503];

const article = (id: string, sourceId: string, sourceName: string, headline: string): ClusterArticle => ({
  id,
  sourceId,
  sourceName,
  title: headline,
  headline,
  url: `https://${sourceId}.example/${id}`,
  summary: `${headline}. More detail follows.`,
  publishedAt: '2026-10-16T08:00:00.000Z',
});

const found = {
  cluster: { id: CLUSTER, headline: 'White House spokeswoman let go from role', sourceCount: 2, importance: 1 },
  articles: [article('a1', 'bbc', 'BBC News', 'White House spokeswoman dismissed'), article('a2', 'dawn', 'Dawn', 'US press secretary out after briefing row')],
  stored: null as StoredPerspectives | null,
};

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:9');
  vi.stubEnv('SUPABASE_SECRET_KEY', 'sb_secret_test');
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ message: 'db unavailable in tests' }), { status: 400, headers: { 'content-type': 'application/json' } })));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.mocked(getClusterSources).mockReset();
});

describe('GET /api/perspectives/[clusterId] contract', () => {
  it('400 on anything that is not a uuid, before touching the DB', async () => {
    for (const bad of ['nope', '123', '84b4576e', "' or 1=1 --"]) {
      const res = await GET(req(bad), ctx(bad));
      expect(res.status, bad).toBe(400);
      expect(await res.json()).toMatchObject({ error: expect.any(String) });
    }
    expect(getClusterSources).not.toHaveBeenCalled();
  });

  it('a 200 parses with PerspectivesResponseSchema; otherwise a sanctioned status, never a 500', async () => {
    vi.mocked(getClusterSources).mockRejectedValueOnce(new Error('clusters read failed: db unavailable in tests'));
    const res = await GET(req(CLUSTER), ctx(CLUSTER));
    if (res.status === 200) expect(PerspectivesResponseSchema.safeParse(await res.json()).success).toBe(true);
    else expect(SANCTIONED).toContain(res.status);
  });

  it('503 when the DB read throws, 404 when the cluster does not exist', async () => {
    vi.mocked(getClusterSources).mockRejectedValueOnce(new Error('boom'));
    expect((await GET(req(CLUSTER), ctx(CLUSTER))).status).toBe(503);
    vi.mocked(getClusterSources).mockResolvedValueOnce(null);
    expect((await GET(req(CLUSTER), ctx(CLUSTER))).status).toBe(404);
  });
});

describe('GET /api/perspectives/[clusterId] body', () => {
  it("answers the deterministic fallback from the sources' own words when nothing is stored, privately cached", async () => {
    vi.mocked(getClusterSources).mockResolvedValueOnce({ ...found, stored: null });
    const res = await GET(req(CLUSTER), ctx(CLUSTER));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, max-age=300');
    const body = PerspectivesResponseSchema.parse(await res.json());
    expect(body.perspectives.provider).toBe('fallback');
    expect(body.perspectives.model).toBeNull();
    expect(body.perspectives.summary).toBe('White House spokeswoman let go from role');
    expect(body.perspectives.disagreements).toEqual([]);
    expect(body.perspectives.confidence).toBe('low');
    expect(body.sources.map((s) => s.name)).toEqual(['BBC News', 'Dawn']);
    expect(body.sources[0]).toMatchObject({ articleId: 'a1', url: 'https://bbc.example/a1', headline: 'White House spokeswoman dismissed' });
    expect(Date.parse(body.perspectives.computedAt)).not.toBeNaN();
  });

  it('answers the stored Gemini perspectives when there are some', async () => {
    const stored: StoredPerspectives = {
      summary: 'The spokeswoman left her post this week.',
      angles: [
        { source: 'BBC News', angle: 'Frames it as a dismissal.', headline: 'White House spokeswoman dismissed' },
        { source: 'Dawn', angle: 'Ties it to the briefing row.', headline: 'US press secretary out after briefing row' },
      ],
      disagreements: ['BBC News says she was dismissed; Dawn says she resigned.'],
      confidence: 'medium',
      provider: 'gemini',
      model: 'gemini-3.5-flash-lite',
      computedAt: '2026-10-17T03:00:00.000Z',
    };
    vi.mocked(getClusterSources).mockResolvedValueOnce({ ...found, stored });
    const res = await GET(req(CLUSTER), ctx(CLUSTER));
    expect(res.status).toBe(200);
    const body = PerspectivesResponseSchema.parse(await res.json());
    expect(body.perspectives).toEqual(stored);
    expect(body.sources).toHaveLength(2);
  });
});
