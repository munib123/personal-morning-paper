// Candidate scoring for rank-v1 (ARCHITECTURE §10.4). PURE: `now` is a parameter, never the clock.
//   s = 0.40·T + c_u·0.25·cos(pos,e) − 0.15·max(0,cos(neg,e)) + 0.15·importance + 0.15·fresh + 0.05·sourceQuality (+0.10 pinned)
//   T = Σ conf·θ̂(label),  c_u = min(1, nEngaged/engagedRamp),  fresh = exp(−ageHours/24)
import type { Candidate, RankParams, UserModel } from '@/contracts/engine';
import type { ScoreBreakdown } from '@/contracts/edition';
import { ancestorsOf, type TopicSlug } from '@/contracts/taxonomy';
import { thetaOf } from '@/server/learn/theta';
import { cos } from './vec';

export { cos, normalize } from './vec';

const chains = new Map<TopicSlug, TopicSlug[]>();
/** The node itself, then its ancestors from the nearest up (memoized: slugs are few and immutable). */
export function selfAndAncestors(slug: TopicSlug): TopicSlug[] {
  let c = chains.get(slug);
  if (!c) {
    c = [slug, ...ancestorsOf(slug).reverse()];
    chains.set(slug, c);
  }
  return c;
}

/** The hard filters, with the reader's lists turned into sets once per build. */
export function eligibilityFor(u: UserModel): (c: Candidate) => boolean {
  const seen = new Set(u.seenArticleIds);
  const mutedSources = new Set(u.mutedSourceIds);
  const dismissed = new Set(u.dismissedClusterIds);
  return (c) => {
    if (seen.has(c.id) || mutedSources.has(c.sourceId)) return false;
    if (c.clusterId && dismissed.has(c.clusterId)) return false;
    for (const l of c.labels) {
      for (const s of selfAndAncestors(l.slug)) if (u.interests[s]?.muted) return false;
    }
    return true;
  };
}

/** Hard filters: muted topics (or a muted ancestor), muted sources, already-seen articles, dismissed clusters. */
export function isEligible(u: UserModel, c: Candidate): boolean {
  return eligibilityFor(u)(c);
}

/** The most specific pinned node among the candidate's labels and their ancestors, or null. */
export function pinnedNodeOf(u: UserModel, c: Candidate): TopicSlug | null {
  for (const l of c.labels) {
    for (const s of selfAndAncestors(l.slug)) if (u.interests[s]?.pinned) return s;
  }
  return null;
}

/** exp(−ageHours / freshnessHalfLifeHours); an article "from the future" counts as brand new. */
export function freshnessOf(c: Candidate, now: Date, params: RankParams): number {
  const ageHours = Math.max(0, (now.getTime() - Date.parse(c.publishedAt)) / 3_600_000);
  const f = Math.exp(-ageHours / params.freshnessHalfLifeHours);
  return Number.isFinite(f) ? f : 0;
}

/**
 * Each field is a weighted contribution, so the "Why this story?" popover can show them as they add up.
 * `theta` lets the ranker pass a per-build θ̂ cache; `pre` lets it pass cosines it already computed.
 */
export function scoreCandidate(
  u: UserModel,
  c: Candidate,
  params: RankParams,
  now: Date,
  theta: (slug: TopicSlug) => number = (slug) => thetaOf(u, slug, params),
  pre?: { cosPos: number; cosNeg: number; fresh: number },
): ScoreBreakdown {
  const w = params.weights;
  let t = 0;
  for (const l of c.labels) t += l.conf * theta(l.slug);
  const cu = Math.min(1, u.nEngaged / params.engagedRamp);
  const cosPos = pre ? pre.cosPos : cos(u.pos, c.embedding);
  const cosNeg = pre ? pre.cosNeg : cos(u.neg, c.embedding);
  const fresh = pre ? pre.fresh : freshnessOf(c, now, params);
  const topic = w.topic * t;
  const similarity = cu * w.similarity * cosPos;
  const negative = -w.negative * Math.max(0, cosNeg);
  const importance = w.importance * c.importance;
  const freshness = w.freshness * fresh;
  const source = w.source * c.sourceQuality;
  const pinned = pinnedNodeOf(u, c) ? w.pinnedBonus : 0;
  const total = topic + similarity + negative + importance + freshness + source + pinned;
  return { topic, similarity, negative, importance, freshness, source, total };
}
