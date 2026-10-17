// Incremental learning from one reading signal (ARCHITECTURE §10.4–10.5). PURE: returns new objects.
//   reward r → each label × conf: r > 0 → α += r·conf, r < 0 → β += |r|·conf; parent × 0.3, grandparent × 0.1
//   pos ← normalize((1−ηr)·pos + ηr·e), η = 0.10 (r > 0); neg likewise with |r|, η = 0.15 (r < 0); r clipped to 1
import type { Candidate, InterestState, RankParams, UserModel } from '@/contracts/engine';
import type { SignalEvent, WeightDelta } from '@/contracts/signals';
import { ancestorsOf, type TopicNode, type TopicSlug } from '@/contracts/taxonomy';
import { RANK_V1_FIXED } from '@/server/rank/params';
import { normalize } from '@/server/rank/vec';
import { thetaOf } from './theta';

const ENGAGED_TYPES = new Set<SignalEvent['type']>(['open', 'read_original', 'qr_scan', 'save', 'share', 'more']);
const ZERO_SKIPS: readonly string[] = RANK_V1_FIXED.skipZeroReasons;

/** The reward of one signal for its article (0 when there is no article to learn from). */
export function rewardOf(ev: SignalEvent, item: Candidate | null, params: RankParams): number {
  if (!item) return 0;
  switch (ev.type) {
    case 'dwell': {
      const ms = ev.value ?? 0;
      if (ms < params.bounceMs) return RANK_V1_FIXED.bounceReward;
      const expected = Math.max(params.minExpectedDwellMs, (item.wordCount / params.wpm) * 60_000);
      return params.rewards.dwell * Math.min(1, ms / expected);
    }
    case 'skip':
      return typeof ev.meta?.reason === 'string' && ZERO_SKIPS.includes(ev.meta.reason) ? 0 : params.rewards.skip;
    case 'recall_answer':
      return ev.value === 1 ? params.rewards.recall_answer : RANK_V1_FIXED.recallWrongReward;
    default:
      return params.rewards[ev.type] ?? 0;
  }
}

function unpickedState(params: RankParams): InterestState {
  const [a, b] = params.priors.unpicked;
  return { alpha: a, beta: b, priorAlpha: a, priorBeta: b, picked: false, muted: false, pinned: false };
}

/**
 * Adds reward r (× weight, e.g. a decay factor) to every label of `item`, its parent and grandparent.
 * Mutates `interests` (callers pass a copy). Returns the slugs it touched.
 */
export function addReward(interests: Record<TopicSlug, InterestState>, item: Candidate, r: number, params: RankParams): TopicSlug[] {
  if (r === 0) return [];
  const touched: TopicSlug[] = [];
  const bump = (slug: TopicSlug, amount: number) => {
    const cur = interests[slug] ?? unpickedState(params);
    interests[slug] = r > 0 ? { ...cur, alpha: cur.alpha + amount } : { ...cur, beta: cur.beta + amount };
    if (!touched.includes(slug)) touched.push(slug);
  };
  const mag = Math.abs(r);
  for (const l of item.labels) {
    const up = ancestorsOf(l.slug).reverse(); // parent, grandparent
    bump(l.slug, mag * l.conf);
    if (up[0]) bump(up[0], mag * l.conf * params.propagation.toParent);
    if (up[1]) bump(up[1], mag * l.conf * params.propagation.toGrandparent);
  }
  return touched;
}

function ema(v: Float32Array | null, e: Float32Array, eta: number): Float32Array {
  if (!v || v.length !== e.length) return normalize(e);
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = (1 - eta) * v[i] + eta * e[i];
  return normalize(out);
}

export function applySignal(model: UserModel, ev: SignalEvent, item: Candidate | null, params: RankParams): { model: UserModel; deltas: WeightDelta[] } {
  const next: UserModel = { ...model, interests: { ...model.interests } };

  if (ev.type === 'skip' && item?.clusterId && !next.dismissedClusterIds.includes(item.clusterId)) {
    next.dismissedClusterIds = [...next.dismissedClusterIds, item.clusterId];
  }
  if (ev.type === 'hide_source') {
    const sourceId = typeof ev.meta?.sourceId === 'string' ? ev.meta.sourceId : item?.sourceId;
    if (sourceId && !next.mutedSourceIds.includes(sourceId)) next.mutedSourceIds = [...next.mutedSourceIds, sourceId];
  }
  if (ENGAGED_TYPES.has(ev.type) && item) next.nEngaged = model.nEngaged + 1;

  const r = rewardOf(ev, item, params);
  if (!item || r === 0) return { model: next, deltas: [] };

  const touched = addReward(next.interests, item, r, params);
  if (item.embedding) {
    const rc = Math.min(1, Math.abs(r));
    if (r > 0) next.pos = ema(model.pos, item.embedding, params.emaEta * rc);
    else next.neg = ema(model.neg, item.embedding, params.emaEtaNeg * rc);
  }
  const deltas = touched.map((slug) => ({ slug, name: slug, before: thetaOf(model, slug, params), after: thetaOf(next, slug, params) }));
  return { model: next, deltas };
}

/** Resolve display names (applySignal names deltas by slug). */
export function withNames(d: WeightDelta[], taxonomy: TopicNode[]): WeightDelta[] {
  const names = new Map(taxonomy.map((t) => [t.slug, t.name]));
  return d.map((x) => ({ ...x, name: names.get(x.slug) ?? x.name }));
}

/** One delta per slug: the first `before`, the last `after`; biggest move first. */
export function mergeDeltas(all: WeightDelta[]): WeightDelta[] {
  const bySlug = new Map<TopicSlug, WeightDelta>();
  for (const d of all) {
    const cur = bySlug.get(d.slug);
    bySlug.set(d.slug, cur ? { ...cur, after: d.after } : { ...d });
  }
  return [...bySlug.values()].sort((a, b) => Math.abs(b.after - b.before) - Math.abs(a.after - a.before) || (a.slug < b.slug ? -1 : 1));
}
