import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventsResultSchema } from '@/contracts/api';
import { FIXTURE_STREAK, FIXTURE_TAXONOMY } from '@/contracts/fixtures';
import { fakeSupabase, type Query, type Result } from '@/server/learn/__fixtures__/fakeSupabase';

const U = '6f1c2a9e-4444-4c4c-9d9d-000000000004';
const A1 = '11111111-1111-4111-8111-111111111111';
const ED = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-10-17T03:00:00Z');
const item = (n: number) => `33333333-3333-4333-8333-${String(n).padStart(12, '0')}`;

const h = vi.hoisted(() => ({ calls: [] as Query[], signedIn: true }));

vi.mock(import('@/server/auth/session'), () => ({
  getSessionUser: vi.fn(async () => (h.signedIn ? { userId: U, isAnonymous: false } : null)),
  requireUser: vi.fn(async () => {
    if (!h.signedIn) throw new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
    return { userId: U, isAnonymous: false };
  }),
}));
vi.mock(import('@/server/time'), async (orig) => ({ ...(await orig()), requestNow: vi.fn(async () => NOW) }));
vi.mock(import('@/server/streaks'), async (orig) => ({ ...(await orig()), recordActivity: vi.fn(async () => FIXTURE_STREAK) }));
vi.mock(import('@/server/edition/taxonomy'), () => ({ loadTaxonomy: vi.fn(async () => FIXTURE_TAXONOMY), loadTopicEmbeddings: vi.fn(async () => ({})) }));
vi.mock(import('@/server/learn/signal'), async (orig) => {
  const mod = await orig();
  return { ...mod, applySignal: vi.fn(mod.applySignal) };
});

const article = (id: string, slug = 'sports.cricket') => ({
  id,
  embedding: null,
  labels: [{ slug, conf: 1 }],
  cluster_id: `k-${id.slice(-2)}`,
  published_at: '2026-10-16T22:00:00Z',
  source_id: 'dawn',
  word_count: 400,
  image_url: null,
  headline: `Headline ${id.slice(-2)}`,
  title: 'T',
  clusters: { importance: 0.5, source_count: 3 },
  sources: { quality: 0.6 },
});
const sportsPriors = [
  { slug: 'sports', alpha: 2, beta: 1, prior_alpha: 2, prior_beta: 1, picked: true, muted: false, pinned: false },
  { slug: 'sports.cricket', alpha: 1.5, beta: 3, prior_alpha: 1.5, prior_beta: 3, picked: false, muted: false, pinned: false },
];

function resolve(q: Query): Result | undefined {
  if (q.table === 'profiles' && q.op === 'select' && q.columns?.includes('onboarded_at'))
    return { data: { user_id: U, display_name: 'Sara', paper_name: 'The Morrow', tz: 'Asia/Karachi', city: 'Lahore', time_budget: 15, depth: 'basics', lang: 'en', delivery_hour: 7, is_demo: false, onboarded_at: '2026-10-10T03:00:00Z' } };
  if (q.table === 'profiles' && q.op === 'select') return { data: { pos_emb: null, neg_emb: null, n_engaged: 0, depth_pref: 0, time_budget: 15, depth: 'basics', lang: 'en' } };
  if (q.table === 'user_interests' && q.op === 'select') return { data: sportsPriors };
  if (q.table === 'articles' && q.op === 'select') {
    const ids = (q.filters.find(([f, c]) => f === 'in' && c === 'id')?.[2] ?? []) as string[];
    return { data: ids.filter((id) => id === A1 || id.startsWith('33333333')).map((id) => article(id)) };
  }
  if (q.table === 'editions' && q.op === 'select' && q.columns?.includes('edition_items') && q.filters.some(([f, c]) => f === 'in' && c === 'id'))
    return { data: [{ id: ED, user_id: U, edition_items: Array.from({ length: 28 }, (_, k) => ({ article_id: item(k + 1), rank: k + 1 })) }] };
  if (q.table === 'editions' && q.op === 'select') return { data: [] };
  if (q.table === 'events' && q.op === 'select') return { data: [] };
  return { data: null };
}

vi.mock(import('@/server/db/admin'), () => ({
  createSupabaseAdminClient: () =>
    fakeSupabase((q) => {
      h.calls.push(q);
      return resolve(q);
    }).client as never,
}));

const signal = await import('@/server/learn/signal');
const streaks = await import('@/server/streaks');
const { POST } = await import('./route');

const post = (body: unknown, type = 'application/json') =>
  POST(new Request('http://localhost/api/events', { method: 'POST', headers: { 'content-type': type }, body: typeof body === 'string' ? body : JSON.stringify(body) }));
const inserted = () => (h.calls.find((q) => q.table === 'events' && q.op === 'insert')?.values ?? []) as Record<string, unknown>[];

beforeEach(() => {
  h.calls = [];
  h.signedIn = true;
  vi.clearAllMocks();
});

describe('POST /api/events (the one signal pipeline)', () => {
  it('401 without a session', async () => {
    h.signedIn = false;
    expect((await post({ events: [{ type: 'open', articleId: A1 }] })).status).toBe(401);
  });

  it('a text/plain sendBeacon body parses (Review Focus 3)', async () => {
    const res = await post(JSON.stringify({ events: [{ type: 'open', articleId: A1, meta: { mode: 'sheet' } }] }), 'text/plain;charset=UTF-8');
    expect(res.status).toBe(200);
    expect(EventsResultSchema.parse(await res.json()).accepted).toBe(1);
  });

  it('51 events → 400', async () => {
    expect((await post({ events: Array(51).fill({ type: 'impression', articleId: A1 }) })).status).toBe(400);
  });

  it('malformed JSON and unknown types → 400', async () => {
    expect((await post('{"events": [', 'text/plain')).status).toBe(400);
    expect((await post({ events: [{ type: 'like' }] })).status).toBe(400);
  });

  it('an unknown articleId is still logged, with article_id null, and teaches nothing', async () => {
    const res = await post({ events: [{ type: 'more', articleId: 'fixture-card-7' }] });
    const body = EventsResultSchema.parse(await res.json());
    expect(body.deltas).toEqual([]);
    expect(inserted()).toEqual([expect.objectContaining({ user_id: U, type: 'more', article_id: null, local_date: '2026-10-17' })]);
  });

  it('"more" on a cricket story → a rising delta, the Morrow toast, recordActivity once with the raw batch', async () => {
    const events = [
      { type: 'impression', articleId: A1, meta: { slot: 'core' } },
      { type: 'more', articleId: A1, editionId: ED },
    ];
    const res = await post({ events });
    expect(res.status).toBe(200);
    const body = EventsResultSchema.parse(await res.json());
    expect(body.accepted).toBe(2);
    expect(body.deltas[0].after).toBeGreaterThan(body.deltas[0].before);
    expect(body.deltas.find((d) => d.slug === 'sports.cricket')?.name).toBe('Cricket');
    expect(body.toast).toBe('Got it. More Cricket tomorrow.');
    expect(vi.mocked(streaks.recordActivity)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(streaks.recordActivity).mock.calls[0][1]).toEqual(events);
    const rows = inserted();
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ article_id: A1, edition_id: ED, type: 'more' });
    expect(String((rows[1].meta as Record<string, unknown>).effect)).toMatch(/^Cricket \+\d+%$/);
    expect(h.calls.some((q) => q.table === 'user_interests' && q.op === 'upsert')).toBe(true);
  });

  it('pdf_download with an editionId → applySignal once per paper story (20)', async () => {
    const res = await post({ events: [{ type: 'pdf_download', editionId: ED }] });
    expect(res.status).toBe(200);
    expect(vi.mocked(signal.applySignal)).toHaveBeenCalledTimes(20);
    expect(inserted()).toEqual([expect.objectContaining({ type: 'pdf_download', edition_id: ED, article_id: null })]);
  });

  it('skip with meta.reason not_today → no deltas, no toast', async () => {
    const body = EventsResultSchema.parse(await (await post({ events: [{ type: 'skip', articleId: A1, meta: { reason: 'not_today' } }] })).json());
    expect(body.deltas).toEqual([]);
    expect(body.toast).toBeNull();
  });

  it('an editionId that is not the reader’s is stored as null', async () => {
    await post({ events: [{ type: 'open', articleId: A1, editionId: '99999999-9999-4999-8999-999999999999' }] });
    expect(inserted()[0]).toMatchObject({ edition_id: null, article_id: A1 });
  });
});
