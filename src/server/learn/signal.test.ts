import { describe, expect, it } from 'vitest';
import type { OnboardingInput } from '@/contracts/profile';
import type { SignalEvent } from '@/contracts/signals';
import { DEFAULT_PARAMS } from '@/server/rank/params';
import { makeCandidate, makeTaxonomy, makeUser } from '@/server/rank/__fixtures__/factory';
import { priorsFromOnboarding } from './priors';
import { applySignal, mergeDeltas, rewardOf, withNames } from './signal';
import { toastFor } from './copy';

const TAX = makeTaxonomy();
const onboard = (picks: string[]): OnboardingInput => ({
  displayName: null,
  paperName: null,
  picks: picks.map((slug) => ({ slug, via: 'tile' as const })),
  blocked: [],
  taste: [],
  presentation: { timeBudget: 15, depth: 'basics', lang: 'en' },
  city: 'Islamabad',
  tz: 'Asia/Karachi',
});
const sportsUser = () => makeUser({ interests: priorsFromOnboarding(onboard(['sports']), TAX, DEFAULT_PARAMS) });
const cricket = (p = {}) => makeCandidate({ id: 'a1', labels: [{ slug: 'sports.cricket', conf: 1 }], clusterId: 'k1', sourceId: 'dawn', ...p });
const ev = (type: SignalEvent['type'], p: Partial<SignalEvent> = {}): SignalEvent => ({ type, articleId: 'a1', ...p });
const apply = (e: SignalEvent, item = cricket(), u = sportsUser()) => applySignal(u, e, item, DEFAULT_PARAMS);

describe('rewardOf', () => {
  it('dwell 60 s on 460 words → 0.35 (expected 120 s)', () => {
    expect(rewardOf(ev('dwell', { value: 60_000 }), cricket({ wordCount: 460 }), DEFAULT_PARAMS)).toBeCloseTo(0.35, 6);
  });

  it('dwell 2 s is a bounce → −0.10', () => {
    expect(rewardOf(ev('dwell', { value: 2_000 }), cricket(), DEFAULT_PARAMS)).toBeCloseTo(-0.1, 6);
  });

  it('dwell 16 s on 20 words → 0.70 (expected floors at 8 s, capped at 1)', () => {
    expect(rewardOf(ev('dwell', { value: 16_000 }), cricket({ wordCount: 20 }), DEFAULT_PARAMS)).toBeCloseTo(0.7, 6);
  });

  it('skip reasons: none / not_interested / absent −0.5, already_seen / not_today 0', () => {
    expect(rewardOf(ev('skip', { meta: { reason: 'none' } }), cricket(), DEFAULT_PARAMS)).toBe(-0.5);
    expect(rewardOf(ev('skip', { meta: { reason: 'not_interested' } }), cricket(), DEFAULT_PARAMS)).toBe(-0.5);
    expect(rewardOf(ev('skip'), cricket(), DEFAULT_PARAMS)).toBe(-0.5);
    expect(rewardOf(ev('skip', { meta: { reason: 'already_seen' } }), cricket(), DEFAULT_PARAMS)).toBe(0);
    expect(rewardOf(ev('skip', { meta: { reason: 'not_today' } }), cricket(), DEFAULT_PARAMS)).toBe(0);
  });

  it('recall_answer: correct 0.40, wrong 0.10', () => {
    expect(rewardOf(ev('recall_answer', { value: 1 }), cricket(), DEFAULT_PARAMS)).toBeCloseTo(0.4, 9);
    expect(rewardOf(ev('recall_answer', { value: 0 }), cricket(), DEFAULT_PARAMS)).toBeCloseTo(0.1, 9);
  });

  it('zero-reward types and a missing item', () => {
    for (const t of ['hide_source', 'weight_edit', 'audio_play', 'taste_skip'] as const) expect(rewardOf(ev(t), cricket(), DEFAULT_PARAMS)).toBe(0);
    expect(rewardOf(ev('more'), null, DEFAULT_PARAMS)).toBe(0);
  });
});

describe('reward semantics (Ruling W3): a topic learns her read-through, not how often we showed it', () => {
  const story = () => cricket({ wordCount: 460 }); // expected dwell 120 s
  const net = (evs: SignalEvent[]) => evs.reduce((s, e) => s + rewardOf(e, story(), DEFAULT_PARAMS), 0);
  const imp = ev('impression');

  it('scrolled past = a weak no; a skim nets about zero; a full read = a clear yes; a skip = a no', () => {
    expect(net([imp])).toBeCloseTo(-0.25, 9);
    expect(Math.abs(net([imp, ev('open'), ev('dwell', { value: 43_000 })]))).toBeLessThan(0.01); // 36% of the expected time
    expect(net([imp, ev('open'), ev('dwell', { value: 120_000 })])).toBeCloseTo(0.45, 9);
    expect(net([imp, ev('skip', { meta: { reason: 'not_interested' } })])).toBeLessThan(net([imp]));
  });

  it('an open alone is neutral: the dwell after it carries the evidence', () => {
    expect(rewardOf(ev('open'), story(), DEFAULT_PARAMS)).toBe(0);
  });

  it('an impression moves the topic Beta (β) but never the neg vector; an explicit "less" does', () => {
    const u = sportsUser();
    const item = cricket({ embedding: new Float32Array([0, 1]) });
    const { model } = apply(ev('impression'), item, u);
    expect(model.interests['sports.cricket'].beta).toBeGreaterThan(u.interests['sports.cricket'].beta);
    expect(model.neg).toBeNull();
    expect(apply(ev('less'), item, u).model.neg).not.toBeNull();
  });
});

describe('applySignal', () => {
  it('more on cricket conf 1: cricket α 1.5 → 3.0, sports α 2 → 2.45', () => {
    const { model } = apply(ev('more'));
    expect(model.interests['sports.cricket'].alpha).toBeCloseTo(3.0, 9);
    expect(model.interests.sports.alpha).toBeCloseTo(2.45, 9);
  });

  it('more on an L3 label with conf 0.5: +0.75 / +0.225 / +0.075 up the chain', () => {
    const u = sportsUser();
    const { model } = apply(ev('more'), cricket({ labels: [{ slug: 'sports.cricket.pakistan', conf: 0.5 }] }), u);
    expect(model.interests['sports.cricket.pakistan'].alpha - u.interests['sports.cricket.pakistan'].alpha).toBeCloseTo(0.75, 9);
    expect(model.interests['sports.cricket'].alpha - u.interests['sports.cricket'].alpha).toBeCloseTo(0.225, 9);
    expect(model.interests.sports.alpha - u.interests.sports.alpha).toBeCloseTo(0.075, 9);
  });

  it('less: cricket β 3 → 4.5, sports β 1 → 1.45, neg is set', () => {
    const e = new Float32Array([0, 1, 0]);
    const { model } = apply(ev('less'), cricket({ embedding: e }));
    expect(model.interests['sports.cricket'].beta).toBeCloseTo(4.5, 9);
    expect(model.interests.sports.beta).toBeCloseTo(1.45, 9);
    expect(Array.from(model.neg!)).toEqual([0, 1, 0]);
  });

  it('skip none and skip not_interested: cricket β +0.5, cluster dismissed', () => {
    for (const reason of ['none', 'not_interested']) {
      const u = sportsUser();
      const { model } = apply(ev('skip', { meta: { reason } }), cricket(), u);
      expect(model.interests['sports.cricket'].beta - u.interests['sports.cricket'].beta).toBeCloseTo(0.5, 9);
      expect(model.dismissedClusterIds).toEqual(['k1']);
    }
  });

  it('skip already_seen and not_today: interests unchanged, cluster still dismissed', () => {
    for (const reason of ['already_seen', 'not_today']) {
      const u = sportsUser();
      const { model, deltas } = apply(ev('skip', { meta: { reason } }), cricket(), u);
      expect(model.interests).toEqual(u.interests);
      expect(model.dismissedClusterIds).toEqual(['k1']);
      expect(deltas).toEqual([]);
    }
  });

  it('recall_answer value 0: α +0.10', () => {
    const u = sportsUser();
    const { model } = apply(ev('recall_answer', { value: 0 }), cricket(), u);
    expect(model.interests['sports.cricket'].alpha - u.interests['sports.cricket'].alpha).toBeCloseTo(0.1, 9);
  });

  it('hide_source mutes meta.sourceId (else the item source)', () => {
    expect(apply(ev('hide_source', { meta: { sourceId: 'geo' } })).model.mutedSourceIds).toEqual(['geo']);
    expect(apply(ev('hide_source')).model.mutedSourceIds).toEqual(['dawn']);
  });

  it('EMA: pos [1,0] and a "more" on e [0,1] → pos ≈ [0.9939, 0.1104]', () => {
    const u = { ...sportsUser(), pos: new Float32Array([1, 0]) };
    const { model } = apply(ev('more'), cricket({ embedding: new Float32Array([0, 1]) }), u);
    expect(model.pos![0]).toBeCloseTo(0.9939, 4);
    expect(model.pos![1]).toBeCloseTo(0.1104, 4);
  });

  it('a null pos starts from the item embedding', () => {
    const { model } = apply(ev('dwell', { value: 30_000 }), cricket({ embedding: new Float32Array([3, 4]) }));
    expect(model.pos![0]).toBeCloseTo(0.6, 6);
    expect(model.pos![1]).toBeCloseTo(0.8, 6);
  });

  it('nEngaged counts open, read_original, qr_scan, save, share and more, not impressions', () => {
    let u = sportsUser();
    for (const t of ['open', 'read_original', 'qr_scan', 'save', 'share', 'more', 'impression', 'dwell'] as const) {
      u = applySignal(u, ev(t, { value: 30_000 }), cricket(), DEFAULT_PARAMS).model;
    }
    expect(u.nEngaged).toBe(6);
  });

  it('is pure: the input model is not mutated', () => {
    const u = sportsUser();
    const before = JSON.stringify({ ...u, interests: u.interests });
    apply(ev('more'), cricket({ embedding: new Float32Array([0, 1]) }), u);
    expect(JSON.stringify({ ...u, interests: u.interests })).toBe(before);
  });

  it('deltas for "more" include sports.cricket rising, named by slug until withNames', () => {
    const { deltas } = apply(ev('more'));
    const d = deltas.find((x) => x.slug === 'sports.cricket')!;
    expect(d.after).toBeGreaterThan(d.before);
    expect(d.name).toBe('sports.cricket');
    expect(withNames([d], TAX)[0].name).toBe('Cricket');
  });
});

describe('mergeDeltas', () => {
  it('keeps the first before and the last after per slug, biggest move first', () => {
    const merged = mergeDeltas([
      { slug: 'a', name: 'a', before: 0.5, after: 0.52 },
      { slug: 'b', name: 'b', before: 0.3, after: 0.31 },
      { slug: 'a', name: 'a', before: 0.52, after: 0.6 },
    ]);
    expect(merged).toEqual([
      { slug: 'a', name: 'a', before: 0.5, after: 0.6 },
      { slug: 'b', name: 'b', before: 0.3, after: 0.31 },
    ]);
  });
});

describe('toastFor (Morrow voice)', () => {
  it('more → "Got it. More Cricket tomorrow."', () => {
    expect(toastFor(ev('more'), cricket(), TAX)).toBe('Got it. More Cricket tomorrow.');
    expect(toastFor(ev('taste_more', { articleId: undefined, meta: { articleId: 'a1' } }), cricket(), TAX)).toBe('Got it. More Cricket tomorrow.');
  });

  it('less, taste_less and skip not_interested → "Got it. Less Cricket tomorrow."', () => {
    expect(toastFor(ev('less'), cricket(), TAX)).toBe('Got it. Less Cricket tomorrow.');
    expect(toastFor(ev('taste_less'), cricket(), TAX)).toBe('Got it. Less Cricket tomorrow.');
    expect(toastFor(ev('skip', { meta: { reason: 'not_interested' } }), cricket(), TAX)).toBe('Got it. Less Cricket tomorrow.');
  });

  it('hide_source → "Got it. Fewer stories from this source tomorrow."', () => {
    expect(toastFor(ev('hide_source'), cricket(), TAX)).toBe('Got it. Fewer stories from this source tomorrow.');
  });

  it('names the most specific top label', () => {
    const item = cricket({ labels: [{ slug: 'technical.cs.ai-ml', conf: 0.7 }, { slug: 'technical', conf: 0.3 }] });
    expect(toastFor(ev('more'), item, TAX)).toBe('Got it. More AI & Machine Learning tomorrow.');
  });

  it('other signals and a plain skip have no toast; no toast contains "!"', () => {
    expect(toastFor(ev('open'), cricket(), TAX)).toBeNull();
    expect(toastFor(ev('skip', { meta: { reason: 'none' } }), cricket(), TAX)).toBeNull();
    const all = (['more', 'less', 'hide_source', 'taste_more', 'taste_less'] as const).map((t) => toastFor(ev(t), cricket(), TAX));
    for (const t of all) expect(t).not.toContain('!');
  });
});
