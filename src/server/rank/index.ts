// src/server/rank (L3, PURE: no I/O, no clock, no env). §9.3 exports: RANK_VERSION, DEFAULT_PARAMS, buildRanking.
// rankWithCounts is the counts-aware form buildEdition uses for the "You read {n} stories" chip.
import type { Candidate, RankParams, RankedItem, RankingResult, UserModel } from '@/contracts/engine';
import type { Slot } from '@/contracts/edition';
import type { TopicNode, TopicSlug } from '@/contracts/taxonomy';
import { thetaOf } from '@/server/learn/theta';
import { assignTiers, layout, type Pick } from './layout';
import { namesOf, reasonsFor } from './reasons';
import { hashSeed, mulberry32 } from './rng';
import { eligibilityFor, freshnessOf, scoreCandidate } from './score';
import { bestPerCluster, mmrFill, pickBigStory, pickExplore, pickSerendipity, sectionOf, type Scored } from './select';
import { norm, scoreCosines } from './vec';

export { RANK_VERSION, DEFAULT_PARAMS, RANK_V1_FIXED } from './params';

export function buildRanking(user: UserModel, pool: Candidate[], params: RankParams, seed: string, now: Date, taxonomy: TopicNode[]): RankingResult {
  return rankWithCounts(user, pool, params, seed, now, taxonomy, {});
}

export function rankWithCounts(
  user: UserModel,
  pool: Candidate[],
  params: RankParams,
  seed: string,
  now: Date,
  taxonomy: TopicNode[],
  readCounts: Record<TopicSlug, number>,
): RankingResult {
  const thetaCache = new Map<TopicSlug, number>();
  const theta = (slug: TopicSlug) => {
    let v = thetaCache.get(slug);
    if (v === undefined) {
      v = thetaOf(user, slug, params);
      thetaCache.set(slug, v);
    }
    return v;
  };

  // 1. Score every eligible candidate, keep the best per cluster, shortlist the top N.
  const eligible = eligibilityFor(user);
  const posN = norm(user.pos);
  const negN = norm(user.neg);
  const scored: Scored[] = [];
  for (const c of pool) {
    if (!eligible(c)) continue;
    const { eN, cosPos, cosNeg } = scoreCosines(c.embedding, user.pos, posN, user.neg, negN);
    const fresh = freshnessOf(c, now, params);
    scored.push({ c, b: scoreCandidate(user, c, params, now, theta, { cosPos, cosNeg, fresh }), fresh, root: sectionOf(c), norm: eN });
  }
  const best = bestPerCluster(scored);
  if (best.length === 0) return { items: [], reserve: [], sectionOrder: [], leadId: '' };
  const short = best.slice(0, params.shortlist);

  // 2–4. The special slots, then 5. MMR to editionSize and 6. the reserve, in one continuing loop.
  const rng = mulberry32(hashSeed(seed));
  const picks: Pick[] = [];
  const taken = () => picks.map((p) => p.s);
  for (const s of pickBigStory(best, params)) picks.push({ s, slot: 'bigstory' });
  for (const e of pickExplore(user, best, taken(), rng, params)) picks.push({ s: e.item, slot: 'explore', exploreSlug: e.slug });
  for (const s of pickSerendipity(user, best, taken(), params)) picks.push({ s, slot: 'serendipity' });
  const room = Math.max(0, params.editionSize - picks.length);
  const filled = mmrFill(short, taken(), room + params.reserveSize, params);
  for (const s of filled.slice(0, room)) picks.push({ s, slot: 'core' });
  const reserve = filled.slice(room);

  // Layout, tiers and chips.
  const { ordered, sectionOrder } = layout(picks);
  const itemTheta = (s: Scored) => {
    let num = 0;
    let den = 0;
    for (const l of s.c.labels) {
      num += l.conf * theta(l.slug);
      den += l.conf;
    }
    return den > 0 ? num / den : 0;
  };
  const tiers = assignTiers(ordered, reserve, user, params, itemTheta);
  const names = namesOf(taxonomy);
  const ctx = { readCounts, theta, names, engagedNorms: user.engaged.map((e) => norm(e.embedding)) };
  const toRanked = (s: Scored, rank: number, slot: Slot, origin: Slot, tier: RankedItem['tier'], exploreSlug?: TopicSlug): RankedItem => ({
    candidateId: s.c.id,
    rank,
    slot,
    sectionSlug: s.root,
    tier,
    score: s.b.total,
    breakdown: s.b,
    reasons: reasonsFor(s, user, origin, taxonomy, params, { ...ctx, exploreSlug }),
  });
  const items = ordered.map((p, i) => toRanked(p.s, i + 1, p.slot, p.origin, tiers.items[i], p.exploreSlug));
  const reserveItems = reserve.map((s, i) => toRanked(s, items.length + i + 1, 'reserve', 'reserve', tiers.reserve[i]));
  return { items, reserve: reserveItems, sectionOrder, leadId: items[0]?.candidateId ?? '' };
}
