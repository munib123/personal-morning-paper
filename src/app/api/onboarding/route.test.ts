import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingResponseSchema } from '@/contracts/api';
import { FIXTURE_EDITION, FIXTURE_EVENTS_RESULT, FIXTURE_TAXONOMY } from '@/contracts/fixtures';
import { fakeSupabase, type Query } from '@/server/learn/__fixtures__/fakeSupabase';

const U = '6f1c2a9e-3333-4c4c-9d9d-000000000003';
const NOW = new Date('2026-10-17T02:00:00Z');

const h = vi.hoisted(() => ({ signedIn: true, calls: [] as Query[] }));

vi.mock(import('@/server/auth/session'), () => ({
  getSessionUser: vi.fn(async () => (h.signedIn ? { userId: U, isAnonymous: true } : null)),
  requireUser: vi.fn(async () => {
    if (!h.signedIn) throw new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
    return { userId: U, isAnonymous: true };
  }),
}));
vi.mock(import('@/server/time'), async (orig) => ({ ...(await orig()), requestNow: vi.fn(async () => NOW) }));
vi.mock(import('@/server/db/admin'), () => ({
  createSupabaseAdminClient: () =>
    fakeSupabase((q) => {
      h.calls.push(q);
      return { data: null };
    }).client as never,
}));
vi.mock(import('@/server/edition'), async (orig) => ({
  ...(await orig()),
  buildEdition: vi.fn(async () => FIXTURE_EDITION),
  loadTaxonomy: vi.fn(async () => FIXTURE_TAXONOMY),
  loadTopicEmbeddings: vi.fn(async () => ({})),
}));
vi.mock(import('@/server/learn'), async (orig) => ({
  ...(await orig()),
  processSignals: vi.fn(async (_u: string, events: unknown[]) => ({ ...FIXTURE_EVENTS_RESULT, accepted: events.length })),
  saveUserModel: vi.fn(async () => undefined),
}));

const edition = await import('@/server/edition');
const learn = await import('@/server/learn');
const { POST } = await import('./route');

const body = (p: Record<string, unknown> = {}) => ({
  displayName: 'Ayesha Khan',
  paperName: null,
  picks: [{ slug: 'sports', via: 'tile' }, { slug: 'technical.cs', via: 'chip' }],
  blocked: ['entertainment.pakistani-showbiz'],
  taste: [],
  presentation: { timeBudget: 15, depth: 'basics', lang: 'en' },
  city: 'Islamabad',
  tz: 'Asia/Karachi',
  ...p,
});
const post = (b: unknown) => POST(new Request('http://localhost/api/onboarding', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }));
const profileUpsert = () => h.calls.find((q) => q.table === 'profiles' && q.op === 'upsert');

beforeEach(() => {
  h.signedIn = true;
  h.calls = [];
  vi.clearAllMocks();
});

describe('POST /api/onboarding', () => {
  it('401 without a session', async () => {
    h.signedIn = false;
    expect((await post(body())).status).toBe(401);
  });

  it('400 on an invalid body (picks not an array)', async () => {
    const res = await post(body({ picks: 'sports' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'invalid' });
  });

  it('400 when timeBudget is not 5 | 15 | 30', async () => {
    expect((await post(body({ presentation: { timeBudget: 20, depth: 'basics', lang: 'en' } }))).status).toBe(400);
  });

  it('200 → { editionDate } after the first build (force)', async () => {
    const res = await post(body());
    expect(res.status).toBe(200);
    expect(OnboardingResponseSchema.parse(await res.json())).toEqual({ editionDate: FIXTURE_EDITION.date });
    expect(vi.mocked(edition.buildEdition)).toHaveBeenCalledWith(U, NOW, { force: true });
  });

  it('writes the profile (paperName null → "The Morrow", onboarded now) and the priors', async () => {
    await post(body());
    expect(profileUpsert()?.values).toMatchObject({
      user_id: U,
      display_name: 'Ayesha Khan',
      paper_name: 'The Morrow',
      time_budget: 15,
      tz: 'Asia/Karachi',
      city: 'Islamabad',
      onboarded_at: NOW.toISOString(),
    });
    const model = vi.mocked(learn.saveUserModel).mock.calls[0][0];
    expect(model.userId).toBe(U);
    expect(model.interests.sports).toMatchObject({ alpha: 2, beta: 1, picked: true });
    expect(model.interests['technical.cs']).toMatchObject({ alpha: 3, beta: 1, picked: true });
    expect(model.interests['entertainment.pakistani-showbiz'].muted).toBe(true);
  });

  it('a chosen paper name is kept', async () => {
    await post(body({ paperName: 'The Islamabad Morning' }));
    expect(profileUpsert()?.values).toMatchObject({ paper_name: 'The Islamabad Morning' });
  });

  it('taste [] → processSignals is not called', async () => {
    await post(body());
    expect(vi.mocked(learn.processSignals)).not.toHaveBeenCalled();
  });

  it('taste "more" → a taste_more signal with meta.articleId; skips send nothing', async () => {
    await post(body({ taste: [{ articleId: 'a1', verdict: 'more' }, { articleId: 'a2', verdict: 'less' }, { articleId: 'a3', verdict: 'skip' }] }));
    expect(vi.mocked(learn.processSignals)).toHaveBeenCalledTimes(1);
    const [, events, now] = vi.mocked(learn.processSignals).mock.calls[0];
    expect(events).toEqual([
      { type: 'taste_more', meta: { articleId: 'a1' } },
      { type: 'taste_less', meta: { articleId: 'a2' } },
    ]);
    expect(now).toBe(NOW);
  });

  it('an unknown taste articleId does not fail onboarding', async () => {
    vi.mocked(learn.processSignals).mockRejectedValueOnce(new Error('article not found'));
    const res = await post(body({ taste: [{ articleId: 'not-a-real-id', verdict: 'more' }] }));
    expect(res.status).toBe(200);
  });
});
