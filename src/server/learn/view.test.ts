import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LearningViewSchema } from '@/contracts/api';
import { FIXTURE_EVENTS_RESULT, FIXTURE_LEARNING, FIXTURE_TAXONOMY, FIXTURE_USER_ID } from '@/contracts/fixtures';
import { DEFAULT_PARAMS } from '@/server/rank/params';
import { makeUser, state } from '@/server/rank/__fixtures__/factory';
import { fakeSupabase, type Query, type Result } from './__fixtures__/fakeSupabase';

const U = '6f1c2a9e-5555-4c4c-9d9d-000000000005';
const NOW = new Date('2026-10-17T03:00:00Z');
const h = vi.hoisted(() => ({ calls: [] as Query[], resolve: (() => undefined) as (q: Query) => Result | undefined }));

vi.mock(import('@/server/db/admin'), () => ({
  createSupabaseAdminClient: () =>
    fakeSupabase((q) => {
      h.calls.push(q);
      return h.resolve(q);
    }).client as never,
}));
vi.mock(import('@/server/edition/taxonomy'), () => ({ loadTaxonomy: vi.fn(async () => FIXTURE_TAXONOMY), loadTopicEmbeddings: vi.fn(async () => ({})) }));
vi.mock(import('./signals'), async (orig) => ({ ...(await orig()), processSignals: vi.fn(async (_u: string, events: unknown[]) => ({ ...FIXTURE_EVENTS_RESULT, accepted: events.length })) }));

const signals = await import('./signals');
const { changeSummary, editInterest, getLearningView, toInterestWeights } = await import('./view');

const d = (name: string, before: number, after: number) => ({ slug: name, name, before, after });
const profileRow = { user_id: U, display_name: 'Sara', paper_name: 'The Morrow', tz: 'Asia/Karachi', city: 'Lahore', time_budget: 15, depth: 'basics', lang: 'en', delivery_hour: 7, is_demo: false, onboarded_at: '2026-10-01T03:00:00Z' };

beforeEach(() => {
  h.calls = [];
  h.resolve = () => undefined;
  vi.clearAllMocks();
});

describe('changeSummary (Morrow voice)', () => {
  it('two risers and a faller', () => {
    expect(changeSummary([d('Cricket', 0.4, 0.48), d('AI & Machine Learning', 0.5, 0.55), d('Pakistani Showbiz', 0.3, 0.24)])).toBe(
      'More Cricket and AI & Machine Learning, less Pakistani Showbiz, based on what you read.',
    );
  });

  it('nothing moved → the still-learning sentence', () => {
    expect(changeSummary([])).toBe('Your paper is still learning. Read or skip a few stories and this will change.');
  });
});

describe('toInterestWeights', () => {
  it('every taxonomy node in taxonomy order, with θ̂ and flags; missing nodes read as the unpicked prior', () => {
    const w = toInterestWeights(makeUser({ interests: { sports: state(2, 1, { picked: true, pinned: true }) } }), FIXTURE_TAXONOMY, DEFAULT_PARAMS);
    expect(w.map((x) => x.slug)).toEqual(FIXTURE_TAXONOMY.map((t) => t.slug));
    expect(w.find((x) => x.slug === 'sports')).toMatchObject({ name: 'Sports', level: 1, alpha: 2, beta: 1, picked: true, pinned: true, muted: false });
    expect(w.find((x) => x.slug === 'sports')!.theta).toBeCloseTo(0.6667, 3);
    expect(w.find((x) => x.slug === 'arts')).toMatchObject({ alpha: 1, beta: 3, theta: 0.25 });
  });
});

describe('editInterest', () => {
  it('set 0.8 on (2,3) keeps the mass: α 4, β 1 (and the prior), then logs a weight_edit', async () => {
    h.resolve = (q) => {
      if (q.table === 'user_interests' && q.op === 'select' && q.single) return { data: { slug: 'sports.cricket', alpha: 2, beta: 3, prior_alpha: 2, prior_beta: 3, picked: false, muted: false, pinned: false } };
      if (q.table === 'user_interests' && q.op === 'select') return { data: [{ slug: 'sports.cricket', alpha: 4, beta: 1, prior_alpha: 4, prior_beta: 1, picked: false, muted: false, pinned: false }] };
      return { data: null };
    };
    const weights = await editInterest(U, { slug: 'sports.cricket', action: 'set', value: 0.8 }, NOW);
    const up = h.calls.find((q) => q.table === 'user_interests' && q.op === 'upsert')!;
    expect(up.values).toMatchObject({ user_id: U, slug: 'sports.cricket', alpha: 4, beta: 1, prior_alpha: 4, prior_beta: 1 });
    expect(vi.mocked(signals.processSignals)).toHaveBeenCalledWith(U, [{ type: 'weight_edit', value: 0.8, meta: { slug: 'sports.cricket', action: 'set' } }], NOW);
    expect(weights.find((w) => w.slug === 'sports.cricket')).toMatchObject({ alpha: 4, beta: 1 });
  });

  it('pin / mute flip their flag on a node with no row yet (from the unpicked prior)', async () => {
    h.resolve = (q) => (q.table === 'user_interests' && q.single ? { data: null } : { data: [] });
    await editInterest(U, { slug: 'arts', action: 'mute' }, NOW);
    const up = h.calls.find((q) => q.table === 'user_interests' && q.op === 'upsert')!;
    expect(up.values).toMatchObject({ slug: 'arts', alpha: 1, beta: 3, muted: true });
    expect(vi.mocked(signals.processSignals).mock.calls[0][1]).toEqual([{ type: 'weight_edit', meta: { slug: 'arts', action: 'mute' } }]);
  });
});

describe('getLearningView', () => {
  it('fixture mode: FIXTURE_USER_ID gets FIXTURE_LEARNING', async () => {
    expect(await getLearningView(FIXTURE_USER_ID, 7, NOW)).toBe(FIXTURE_LEARNING);
  });

  it('movers against the snapshot on or before today − since, the summary sentence and the timeline', async () => {
    h.resolve = (q) => {
      if (q.table === 'profiles' && q.columns?.includes('onboarded_at')) return { data: profileRow };
      if (q.table === 'profiles') return { data: { pos_emb: null, neg_emb: null, n_engaged: 3, depth_pref: 0, time_budget: 15, depth: 'basics', lang: 'en' } };
      if (q.table === 'user_interests') return { data: [{ slug: 'sports.cricket', alpha: 6, beta: 3, prior_alpha: 1.5, prior_beta: 3, picked: false, muted: false, pinned: false }] };
      if (q.table === 'interest_snapshots') return { data: { snap_date: '2026-10-10', weights: { 'sports.cricket': 0.3, sports: 0.25 } } };
      if (q.table === 'events' && q.limit === 20)
        return { data: [{ type: 'more', occurred_at: '2026-10-16T03:00:00Z', meta: { effect: 'Cricket +4%' }, articles: { headline: 'Pakistan win', title: 'T' } }, { type: 'open', occurred_at: '2026-10-16T02:00:00Z', meta: {}, articles: null }] };
      return { data: [] };
    };
    const v = await getLearningView(U, 7, NOW);
    expect(LearningViewSchema.safeParse(v).success).toBe(true);
    expect(v.sinceDate).toBe('2026-10-10');
    expect(v.movers[0]).toMatchObject({ slug: 'sports.cricket', name: 'Cricket', before: 0.3 });
    expect(v.movers[0].after).toBeGreaterThan(0.3);
    expect(v.changeSummary).toMatch(/^More Cricket/);
    expect(v.timeline).toEqual([
      { at: '2026-10-16T03:00:00Z', type: 'more', headline: 'Pakistan win', effect: 'Cricket +4%' },
      { at: '2026-10-16T02:00:00Z', type: 'open', headline: null, effect: 'open' },
    ]);
    const snapQ = h.calls.find((q) => q.table === 'interest_snapshots')!;
    expect(snapQ.filters).toContainEqual(['lte', 'snap_date', '2026-10-10']);
  });
});
