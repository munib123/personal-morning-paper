import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase, type Query, type Result } from './__fixtures__/fakeSupabase';

let resolver: (q: Query) => Result | undefined = () => undefined;
let calls: Query[] = [];
vi.mock(import('@/server/db/admin'), () => ({
  createSupabaseAdminClient: () => {
    const f = fakeSupabase((q) => resolver(q));
    calls = f.calls;
    return f.client as never;
  },
}));

const { loadUserModel, saveUserModel, loadRecentEvents } = await import('./store');

const has = (q: Query, f: string, col: string, val?: unknown) => q.filters.some(([a, b, c]) => a === f && b === col && (val === undefined || JSON.stringify(c) === JSON.stringify(val)));

beforeEach(() => {
  resolver = () => undefined;
});

describe('loadUserModel', () => {
  it('maps profile, interests and the derived lists; seen ids are relative to targetDate', async () => {
    resolver = (q) => {
      if (q.table === 'profiles') return { data: { pos_emb: '[1,0]', neg_emb: null, n_engaged: 12, depth_pref: 1, time_budget: 30, depth: 'expert', lang: 'en' } };
      if (q.table === 'user_interests')
        return { data: [{ slug: 'sports', alpha: 3, beta: 1, prior_alpha: 2, prior_beta: 1, picked: true, muted: false, pinned: true }] };
      if (q.table === 'editions')
        return { data: [{ id: 'e1', edition_date: '2026-10-16', edition_items: [{ article_id: 'a1', rank: 1 }, { article_id: 'r1', rank: 22 }] }] };
      if (q.table === 'events' && has(q, 'eq', 'type', 'skip')) return { data: [{ article_id: 'x', articles: { cluster_id: 'k9' } }] };
      if (q.table === 'events' && has(q, 'eq', 'type', 'hide_source'))
        return { data: [{ meta: { sourceId: 'geo' }, articles: null }, { meta: {}, articles: { source_id: 'dawn' } }] };
      if (q.table === 'events')
        return {
          data: [
            { article_id: 'b2', occurred_at: '2026-10-16T03:00:00Z', articles: { id: 'b2', embedding: '[0,1]', headline: null, title: 'Rust 2.0 lands' } },
            { article_id: 'b2', occurred_at: '2026-10-15T03:00:00Z', articles: { id: 'b2', embedding: '[0,1]', headline: null, title: 'Rust 2.0 lands' } },
            { article_id: 'b1', occurred_at: '2026-10-14T03:00:00Z', articles: { id: 'b1', embedding: null, headline: 'H1', title: 'T1' } },
          ],
        };
      return undefined;
    };
    const m = await loadUserModel('u1', { targetDate: '2026-10-17' });
    expect(m.pos && Array.from(m.pos)).toEqual([1, 0]);
    expect(m.nEngaged).toBe(12);
    expect(m.depthPref).toBe(1);
    expect(m.presentation).toEqual({ timeBudget: 30, depth: 'expert', lang: 'en' });
    expect(m.interests.sports).toEqual({ alpha: 3, beta: 1, priorAlpha: 2, priorBeta: 1, picked: true, muted: false, pinned: true });
    expect(m.seenArticleIds).toEqual(['a1']); // the reserve (rank 22) was never shown
    expect(m.dismissedClusterIds).toEqual(['k9']);
    expect(m.mutedSourceIds.sort()).toEqual(['dawn', 'geo']);
    expect(m.engaged.map((e) => [e.articleId, e.headline, e.at])).toEqual([
      ['b2', 'Rust 2.0 lands', '2026-10-16T03:00:00Z'],
      ['b1', 'H1', '2026-10-14T03:00:00Z'],
    ]);
    const editions = calls.find((q) => q.table === 'editions')!;
    expect(has(editions, 'lt', 'edition_date', '2026-10-17')).toBe(true);
    expect(editions.limit).toBe(7);
  });

  it('a profile-less user gets an empty model with default presentation', async () => {
    const m = await loadUserModel('nobody');
    expect(m).toMatchObject({ interests: {}, pos: null, nEngaged: 0, depthPref: 0, presentation: { timeBudget: 15, depth: 'basics', lang: 'en' }, seenArticleIds: [] });
  });
});

describe('saveUserModel', () => {
  it('upserts interests on (user_id, slug) and updates the profile vectors', async () => {
    resolver = () => ({ data: null });
    await saveUserModel({
      userId: 'u1',
      interests: { sports: { alpha: 3, beta: 1, priorAlpha: 2, priorBeta: 1, picked: true, muted: false, pinned: false } },
      pos: new Float32Array([0.6, 0.8]),
      neg: null,
      nEngaged: 3,
      depthPref: -1,
      presentation: { timeBudget: 15, depth: 'basics', lang: 'en' },
      seenArticleIds: [],
      dismissedClusterIds: [],
      mutedSourceIds: [],
      engaged: [],
    });
    const up = calls.find((q) => q.table === 'user_interests')!;
    expect(up.op).toBe('upsert');
    expect(up.options).toEqual({ onConflict: 'user_id,slug' });
    expect(up.values).toEqual([{ user_id: 'u1', slug: 'sports', alpha: 3, beta: 1, prior_alpha: 2, prior_beta: 1, picked: true, muted: false, pinned: false }]);
    const prof = calls.find((q) => q.table === 'profiles')!;
    expect(prof.op).toBe('update');
    expect(prof.values).toMatchObject({ neg_emb: null, n_engaged: 3, depth_pref: -1 });
    expect(String((prof.values as { pos_emb: string }).pos_emb)).toMatch(/^\[0\.6\d*,0\.8\d*\]$/);
  });

  it('throws on a DB error', async () => {
    resolver = () => ({ error: { message: 'denied' } });
    await expect(
      saveUserModel({ userId: 'u1', interests: { a: { alpha: 1, beta: 1, priorAlpha: 1, priorBeta: 1, picked: false, muted: false, pinned: false } }, pos: null, neg: null, nEngaged: 0, depthPref: 0, presentation: { timeBudget: 15, depth: 'basics', lang: 'en' }, seenArticleIds: [], dismissedClusterIds: [], mutedSourceIds: [], engaged: [] }),
    ).rejects.toThrow(/denied/);
  });
});

describe('loadRecentEvents', () => {
  it('maps rows to { ev, item, occurredAt } within [now − days, now]', async () => {
    resolver = () => ({
      data: [
        {
          type: 'open',
          value: null,
          meta: { mode: 'sheet' },
          article_id: 'a1',
          edition_id: 'e1',
          occurred_at: '2026-10-16T03:00:00Z',
          articles: { id: 'a1', embedding: null, labels: [{ slug: 'sports', conf: 0.9 }], cluster_id: 'k1', published_at: '2026-10-16T01:00:00Z', source_id: 'dawn', word_count: 300, image_url: null, headline: null, title: 'T', clusters: { importance: 0.4, source_count: 3 }, sources: { quality: 0.7 } },
        },
        { type: 'pdf_download', value: null, meta: {}, article_id: null, edition_id: 'e1', occurred_at: '2026-10-16T04:00:00Z', articles: null },
      ],
    });
    const now = new Date('2026-10-17T02:00:00Z');
    const out = await loadRecentEvents('u1', now, 28);
    expect(out[0]).toEqual({
      ev: { type: 'open', articleId: 'a1', editionId: 'e1', meta: { mode: 'sheet' } },
      item: expect.objectContaining({ id: 'a1', headline: 'T', sourceQuality: 0.7, sourceCount: 3, importance: 0.4, clusterId: 'k1' }),
      occurredAt: '2026-10-16T03:00:00Z',
    });
    expect(out[1]).toEqual({ ev: { type: 'pdf_download', editionId: 'e1' }, item: null, occurredAt: '2026-10-16T04:00:00Z' });
    const q = calls[0];
    expect(has(q, 'gte', 'occurred_at', '2026-09-19T02:00:00.000Z')).toBe(true);
    expect(has(q, 'lte', 'occurred_at', now.toISOString())).toBe(true);
  });
});
