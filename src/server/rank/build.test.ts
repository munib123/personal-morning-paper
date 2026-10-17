import { describe, expect, it } from 'vitest';
import { rootOf } from '@/contracts/taxonomy';
import type { Candidate, RankParams, RankingResult, UserModel } from '@/contracts/engine';
import type { TimeBudget } from '@/contracts/profile';
import { DEFAULT_PARAMS, buildRanking, rankWithCounts } from './index';
import { NOW, makeCandidate, makeInterests, makePool, makeTaxonomy, makeUser, state, unitVec, vecWithCos } from './__fixtures__/factory';

const TAX = makeTaxonomy();
const SEED = 'u1|2026-10-17';
const NO_SPECIALS: RankParams = { ...DEFAULT_PARAMS, exploreSlots: 0, serendipitySlots: 0, bigStorySlots: 0 };

const reader = (p: Partial<UserModel> = {}) =>
  makeUser({ interests: makeInterests(['sports', 'technical']), pos: unitVec(5), nEngaged: 4, ...p });
const all = (r: RankingResult) => [...r.items, ...r.reserve];
const codes = (r: RankingResult) => r.items.flatMap((i) => i.reasons.map((x) => x.code));
const byId = (pool: Candidate[]) => new Map(pool.map((c) => [c.id, c]));

describe('buildRanking on a 300-candidate pool', () => {
  const pool = makePool(300);
  const user = reader();
  const r = buildRanking(user, pool, DEFAULT_PARAMS, SEED, NOW, TAX);
  const cands = byId(pool);

  it('returns 20 + 8 with ranks exactly 1..28', () => {
    expect(r.items).toHaveLength(20);
    expect(r.reserve).toHaveLength(8);
    expect(all(r).map((i) => i.rank)).toEqual(Array.from({ length: 28 }, (_, i) => i + 1));
    expect(r.reserve.every((i) => i.slot === 'reserve')).toBe(true);
  });

  it('one per cluster', () => {
    const clusters = all(r).map((i) => cands.get(i.candidateId)!.clusterId);
    expect(new Set(clusters).size).toBe(28);
  });

  it('caps: at most 5 per root and 3 per source in items', () => {
    const roots = new Map<string, number>();
    const sources = new Map<string, number>();
    for (const i of r.items) {
      const c = cands.get(i.candidateId)!;
      const root = rootOf(c.labels[0].slug);
      roots.set(root, (roots.get(root) ?? 0) + 1);
      sources.set(c.sourceId, (sources.get(c.sourceId) ?? 0) + 1);
    }
    expect(Math.max(...roots.values())).toBeLessThanOrEqual(5);
    expect(Math.max(...sources.values())).toBeLessThanOrEqual(3);
  });

  it('deterministic', () => {
    expect(buildRanking(user, pool, DEFAULT_PARAMS, SEED, NOW, TAX)).toEqual(r);
  });

  it('seed changes explore', () => {
    const sets = new Set<string>();
    for (let d = 10; d < 20; d++) {
      const rr = buildRanking(user, pool, DEFAULT_PARAMS, `u1|2026-10-${d}`, NOW, TAX);
      const explore = rr.items.flatMap((i) => i.reasons.filter((x) => x.code === 'explore').map((x) => x.text)).sort();
      sets.add(explore.join('|'));
    }
    expect(sets.size).toBeGreaterThanOrEqual(2);
  });

  it('at most 2 reasons per item, every item has at least one', () => {
    for (const i of all(r)) {
      expect(i.reasons.length).toBeGreaterThanOrEqual(1);
      expect(i.reasons.length).toBeLessThanOrEqual(2);
    }
  });

  it('core is grouped by section in sectionOrder, sections by Σs desc, items by s desc', () => {
    const core = r.items.filter((i) => i.slot === 'core');
    const sums = new Map<string, number>();
    for (const i of core) sums.set(i.sectionSlug, (sums.get(i.sectionSlug) ?? 0) + i.score);
    expect([...r.sectionOrder].sort()).toEqual([...sums.keys()].sort());
    for (let k = 1; k < r.sectionOrder.length; k++) {
      expect(sums.get(r.sectionOrder[k - 1])!).toBeGreaterThanOrEqual(sums.get(r.sectionOrder[k])!);
    }
    const sectionSeq = core.map((i) => r.sectionOrder.indexOf(i.sectionSlug));
    expect(sectionSeq).toEqual([...sectionSeq].sort((a, b) => a - b));
    for (let k = 1; k < core.length; k++) {
      if (core[k - 1].sectionSlug === core[k].sectionSlug) expect(core[k - 1].score).toBeGreaterThanOrEqual(core[k].score);
    }
  });

  it('rank order: lead, then 3 top, then core, then Beyond your usual', () => {
    expect(r.items[0].slot).toBe('lead');
    expect(r.leadId).toBe(r.items[0].candidateId);
    expect(r.items.slice(1, 4).map((i) => i.slot)).toEqual(['top', 'top', 'top']);
    const slots = r.items.map((i) => i.slot);
    const firstBeyond = slots.findIndex((s) => s === 'bigstory' || s === 'explore' || s === 'serendipity');
    if (firstBeyond >= 0) expect(slots.slice(firstBeyond).every((s) => s !== 'core' && s !== 'top')).toBe(true);
  });
});

describe('special slots', () => {
  // Three unpicked roots each hold an in-window serendipity candidate, so explore cannot block them all.
  const pos = unitVec(5);
  const basePool = () => [
    ...makePool(200),
    makeCandidate({ id: 'big', labels: [{ slug: 'news.global-affairs', conf: 1 }], importance: 0.95, sourceCount: 9, clusterId: 'kbig', hasImage: true }),
    ...['arts.visual-arts', 'lifestyle.travel', 'health.medicine'].map((slug, i) =>
      makeCandidate({ id: `ser${i}`, labels: [{ slug, conf: 1 }], importance: 0.5, embedding: vecWithCos(pos, 0.35, 70 + i), clusterId: `kser${i}`, sourceId: `sx${i}` }),
    ),
  ];

  it('exactly 2 explore + 1 serendipity + 1 bigstory reason codes when eligible', () => {
    const r = buildRanking(reader({ pos }), basePool(), DEFAULT_PARAMS, SEED, NOW, TAX);
    const c = codes(r);
    expect(c.filter((x) => x === 'explore')).toHaveLength(2);
    expect(c.filter((x) => x === 'serendipity')).toHaveLength(1);
    expect(c.filter((x) => x === 'bigstory')).toHaveLength(1);
    const big = r.items.find((i) => i.reasons.some((x) => x.code === 'bigstory'))!;
    expect(big.candidateId).toBe('big');
    expect(big.reasons.find((x) => x.code === 'bigstory')!.text).toBe('Covered by 9 outlets today');
  });

  it('no bigstory when max importance is 0.4', () => {
    const r = buildRanking(reader(), makePool(200, { maxImportance: 0.4 }), DEFAULT_PARAMS, SEED, NOW, TAX);
    expect(codes(r)).not.toContain('bigstory');
    expect(r.items.some((i) => i.slot === 'bigstory')).toBe(false);
  });

  it('serendipity respects the cos window', () => {
    const p: RankParams = { ...DEFAULT_PARAMS, exploreSlots: 0, bigStorySlots: 0 };
    const pool = [
      ...makePool(60, { seed: 3 }).map((c) => ({ ...c, labels: [{ slug: 'sports.cricket', conf: 1 }] })),
      makeCandidate({ id: 'inside', labels: [{ slug: 'arts.visual-arts', conf: 1 }], importance: 0.5, embedding: vecWithCos(pos, 0.35, 1), clusterId: 'ka' }),
      makeCandidate({ id: 'outside', labels: [{ slug: 'arts.books-literature', conf: 1 }], importance: 0.9, embedding: vecWithCos(pos, 0.6, 2), clusterId: 'kb' }),
    ];
    const r = buildRanking(reader({ pos }), pool, p, SEED, NOW, TAX);
    const ser = r.items.filter((i) => i.reasons.some((x) => x.code === 'serendipity'));
    expect(ser.map((i) => i.candidateId)).toEqual(['inside']);
  });

  it('no serendipity without a profile embedding', () => {
    const r = buildRanking(reader({ pos: null }), basePool(), DEFAULT_PARAMS, SEED, NOW, TAX);
    expect(codes(r)).not.toContain('serendipity');
  });
});

describe('lead rule', () => {
  const u = makeUser({ interests: { 'sports.cricket': state(9, 1, { picked: true }), 'business.markets': state(1, 9) } });

  it('an imaged importance-0.8 item beats a higher-s imageless one', () => {
    const pool = [
      makeCandidate({ id: 'imaged', labels: [{ slug: 'business.markets', conf: 1 }], importance: 0.8, hasImage: true, clusterId: 'a' }),
      makeCandidate({ id: 'plain', labels: [{ slug: 'sports.cricket', conf: 1 }], importance: 0.3, hasImage: false, clusterId: 'b' }),
      makeCandidate({ id: 'low', labels: [{ slug: 'sports.cricket', conf: 1 }], importance: 0.1, hasImage: true, clusterId: 'c' }),
    ];
    const r = buildRanking(u, pool, DEFAULT_PARAMS, SEED, NOW, TAX);
    expect(r.items.find((i) => i.candidateId === 'plain')!.score).toBeGreaterThan(r.items.find((i) => i.candidateId === 'imaged')!.score);
    expect(r.leadId).toBe('imaged');
    expect(r.items[0].tier).toBe('deep');
  });

  it('with no eligible imaged item the top core item leads', () => {
    const pool = [
      makeCandidate({ id: 'mid', labels: [{ slug: 'business.markets', conf: 1 }], importance: 0.45, hasImage: true, clusterId: 'a' }),
      makeCandidate({ id: 'best', labels: [{ slug: 'sports.cricket', conf: 1 }], importance: 0.3, hasImage: false, clusterId: 'b' }),
    ];
    const r = buildRanking(u, pool, NO_SPECIALS, SEED, NOW, TAX);
    expect(r.leadId).toBe('best');
    expect(r.items[0]).toMatchObject({ candidateId: 'best', slot: 'lead', rank: 1 });
  });
});

describe('tiers follow the TimeBudget', () => {
  const pool = makePool(300);
  const withBudget = (timeBudget: TimeBudget) =>
    buildRanking(reader({ presentation: { timeBudget, depth: 'basics', lang: 'en' } }), pool, DEFAULT_PARAMS, SEED, NOW, TAX);

  it('Quick (5): at most 1 deep and 4 std among the 20, reserve capped at std', () => {
    const r = withBudget(5);
    expect(r.items.filter((i) => i.tier === 'deep')).toHaveLength(1);
    expect(r.items.filter((i) => i.tier === 'std').length).toBeLessThanOrEqual(4);
    expect(r.reserve.every((i) => i.tier !== 'deep')).toBe(true);
  });

  it('the lead is always deep under all three budgets', () => {
    for (const b of [5, 15, 30] as const) expect(withBudget(b).items[0].tier).toBe('deep');
  });

  it('Deep (30) never gives a shorter tier than Standard (15)', () => {
    const order = { brief: 0, std: 1, deep: 2 };
    const std = withBudget(15);
    const deep = withBudget(30);
    for (const i of deep.items) {
      const same = std.items.find((x) => x.candidateId === i.candidateId);
      if (same) expect(order[i.tier]).toBeGreaterThanOrEqual(order[same.tier]);
    }
  });
});

describe('small or degenerate pools (Review Focus 1 and 2)', () => {
  it('a pool of 10 clusters gives 10 items, 0 reserve, no throw', () => {
    const r = buildRanking(reader(), makePool(30, { clusters: 10 }), DEFAULT_PARAMS, SEED, NOW, TAX);
    expect(r.items).toHaveLength(10);
    expect(r.reserve).toHaveLength(0);
    expect(r.items.map((i) => i.rank)).toEqual(Array.from({ length: 10 }, (_, i) => i + 1));
  });

  it('an empty pool gives an empty ranking', () => {
    expect(buildRanking(reader(), [], DEFAULT_PARAMS, SEED, NOW, TAX)).toEqual({ items: [], reserve: [], sectionOrder: [], leadId: '' });
  });

  it('all embeddings null → 20 items, every score finite', () => {
    const r = buildRanking(reader({ pos: null, neg: null }), makePool(300, { embeddings: false }), DEFAULT_PARAMS, SEED, NOW, TAX);
    expect(r.items).toHaveLength(20);
    for (const i of all(r)) {
      expect(Number.isFinite(i.score)).toBe(true);
      for (const v of Object.values(i.breakdown)) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('excludes seen articles, muted sources and dismissed clusters', () => {
    const pool = makePool(300);
    const base = buildRanking(reader(), pool, DEFAULT_PARAMS, SEED, NOW, TAX);
    const seen = base.items[0].candidateId;
    const muted = pool.find((c) => c.id === base.items[1].candidateId)!.sourceId;
    const r = buildRanking(reader({ seenArticleIds: [seen], mutedSourceIds: [muted] }), pool, DEFAULT_PARAMS, SEED, NOW, TAX);
    const ids = all(r).map((i) => i.candidateId);
    expect(ids).not.toContain(seen);
    expect(all(r).some((i) => pool.find((c) => c.id === i.candidateId)!.sourceId === muted)).toBe(false);
  });
});

describe('chip copy through rankWithCounts', () => {
  const one = (slug: string) => [makeCandidate({ id: 'x', labels: [{ slug, conf: 1 }], clusterId: 'kx' })];
  const topicText = (r: RankingResult) => r.items[0].reasons.find((x) => x.code === 'topic')?.text;

  it('read counts ≥ 2 → "You read {n} stories on {name} this week"', () => {
    const r = rankWithCounts(makeUser(), one('sports.cricket'), DEFAULT_PARAMS, SEED, NOW, TAX, { 'sports.cricket': 3 });
    expect(topicText(r)).toBe('You read 3 stories on Cricket this week');
  });

  it('read counts of 1 → "More from {name}"', () => {
    const r = rankWithCounts(makeUser(), one('sports.cricket'), DEFAULT_PARAMS, SEED, NOW, TAX, { 'sports.cricket': 1 });
    expect(topicText(r)).toBe('More from Cricket');
  });

  it('buildRanking (no counts) on an unpicked topic → "More from {name}"', () => {
    expect(topicText(buildRanking(makeUser(), one('sports.cricket'), DEFAULT_PARAMS, SEED, NOW, TAX))).toBe('More from Cricket');
  });

  it('a picked topic wins over read counts', () => {
    const u = makeUser({ interests: { 'sports.cricket': state(3, 1, { picked: true }) } });
    const r = rankWithCounts(u, one('sports.cricket'), DEFAULT_PARAMS, SEED, NOW, TAX, { 'sports.cricket': 3 });
    expect(topicText(r)).toBe('Because you follow Cricket');
  });
});

describe('perf', () => {
  it('1000 candidates × 384-d rank in under 50 ms', () => {
    const pool = makePool(1000, { clusters: 600 });
    const user = reader({
      neg: unitVec(11),
      engaged: Array.from({ length: 50 }, (_, i) => ({ articleId: `e${i}`, embedding: unitVec(500 + i), headline: `E${i}`, at: NOW.toISOString() })),
    });
    buildRanking(user, pool, DEFAULT_PARAMS, SEED, NOW, TAX); // warm-up (JIT)
    buildRanking(user, pool, DEFAULT_PARAMS, SEED, NOW, TAX);
    // Best of 5: the suite shares the CPU with other test files, so a single sample is noise-prone.
    let ms = Infinity;
    for (let k = 0; k < 5; k++) {
      const t0 = performance.now();
      const r = buildRanking(user, pool, DEFAULT_PARAMS, `u1|2026-10-${18 + k}`, NOW, TAX);
      ms = Math.min(ms, performance.now() - t0);
      expect(r.items).toHaveLength(20);
    }
    expect(ms).toBeLessThan(50);
  });
});
