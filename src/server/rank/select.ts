// Selection for rank-v1 (ARCHITECTURE §10.4): one per cluster → bigstory → explore ×2 (Thompson
// sampling) → serendipity ×1 → MMR fill with caps → reserve. PURE and deterministic for a seed.
import type { Candidate, RankParams, UserModel } from '@/contracts/engine';
import type { ScoreBreakdown } from '@/contracts/edition';
import { ancestorsOf, rootOf, type TopicSlug } from '@/contracts/taxonomy';
import { meanOf, thetaOf } from '@/server/learn/theta';
import { RANK_V1_FIXED } from './params';
import { sampleBeta } from './rng';
import { cos, cosN, norm } from './vec';

/**
 * A scored candidate. `fresh` is the unweighted exp(−age/24); `root` is the root of its top label;
 * `norm` is the embedding length (0 when null), cached for the MMR and similar-chip hot paths.
 */
export interface Scored {
  c: Candidate;
  b: ScoreBreakdown;
  fresh: number;
  root: TopicSlug;
  norm?: number;
}

const normOf = (s: Scored): number => (s.norm ??= norm(s.c.embedding));

/** The label with the highest confidence (the first on ties), or null for an unlabelled article. */
export function topLabel(c: Candidate): { slug: TopicSlug; conf: number } | null {
  let best: { slug: TopicSlug; conf: number } | null = null;
  for (const l of c.labels) if (!best || l.conf > best.conf) best = l;
  return best;
}

/** Section of an article = root of its top label ('news' when it has no labels). */
export function sectionOf(c: Candidate): TopicSlug {
  const t = topLabel(c);
  return t ? rootOf(t.slug) : 'news';
}

/** Score desc, then id asc: the one total order every step uses, so ties never depend on input order. */
export function byScore(a: Scored, b: Scored): number {
  return b.b.total - a.b.total || (a.c.id < b.c.id ? -1 : a.c.id > b.c.id ? 1 : 0);
}

/** The best-scored item of each cluster (a null cluster is its own cluster), sorted by score. */
export function bestPerCluster(scored: Scored[]): Scored[] {
  const best = new Map<string, Scored>();
  for (const s of scored) {
    const key = s.c.clusterId ?? `article:${s.c.id}`;
    const cur = best.get(key);
    if (!cur || byScore(s, cur) < 0) best.set(key, s);
  }
  return [...best.values()].sort(byScore);
}

/** bigstory: the most important story of the day, if it clears bigStoryMinImportance. */
export function pickBigStory(best: Scored[], params: RankParams): Scored[] {
  if (params.bigStorySlots <= 0) return [];
  return best
    .filter((s) => s.c.importance >= params.bigStoryMinImportance)
    .sort((a, b) => b.c.importance - a.c.importance || byScore(a, b))
    .slice(0, params.bigStorySlots);
}

const levelOf = (slug: TopicSlug): number => slug.split('.').length;
const labelledWith = (c: Candidate, node: TopicSlug): boolean =>
  c.labels.some((l) => l.slug === node || l.slug.startsWith(`${node}.`));

/**
 * explore ×exploreSlots: Thompson-sample Beta(α, β) for every node the reader has not picked, that is
 * not muted, not among their top-5 θ̂ nodes and at most level 2, and that has an untaken story. The best
 * draws win; each brings its most important + freshest untaken story.
 */
export function pickExplore(u: UserModel, best: Scored[], taken: Scored[], rng: () => number, params: RankParams): { item: Scored; slug: TopicSlug }[] {
  if (params.exploreSlots <= 0) return [];
  const universe = new Set<TopicSlug>(Object.keys(u.interests));
  for (const s of best) for (const l of s.c.labels) for (const n of [l.slug, ...ancestorsOf(l.slug)]) universe.add(n);
  const nodes = [...universe].sort();
  const muted = (n: TopicSlug) => u.interests[n]?.muted === true;
  const theta = new Map(nodes.map((n) => [n, thetaOf(u, n, params)]));
  const top = new Set(
    nodes
      .filter((n) => !muted(n))
      .sort((a, b) => theta.get(b)! - theta.get(a)! || (a < b ? -1 : 1))
      .slice(0, RANK_V1_FIXED.exploreExcludeTop),
  );
  const takenIds = new Set(taken.map((t) => t.c.id));
  const eligible = nodes.filter(
    (n) =>
      levelOf(n) <= RANK_V1_FIXED.exploreMaxLevel &&
      !muted(n) &&
      !top.has(n) &&
      u.interests[n]?.picked !== true &&
      best.some((s) => !takenIds.has(s.c.id) && labelledWith(s.c, n)),
  );
  const [ua, ub] = params.priors.unpicked;
  const draws = eligible.map((n) => {
    const st = u.interests[n];
    return { n, d: sampleBeta(rng, st ? st.alpha : ua, st ? st.beta : ub) };
  });
  draws.sort((a, b) => b.d - a.d || (a.n < b.n ? -1 : 1));
  const out: { item: Scored; slug: TopicSlug }[] = [];
  for (const { n } of draws) {
    if (out.length >= params.exploreSlots) break;
    let pick: Scored | null = null;
    for (const s of best) {
      if (takenIds.has(s.c.id) || !labelledWith(s.c, n)) continue;
      const v = s.c.importance + s.fresh;
      const pv = pick ? pick.c.importance + pick.fresh : -Infinity;
      if (!pick || v > pv || (v === pv && s.c.id < pick.c.id)) pick = s;
    }
    if (pick) {
      out.push({ item: pick, slug: n });
      takenIds.add(pick.c.id);
    }
  }
  return out;
}

/**
 * serendipity ×serendipitySlots: a story from a root the reader never picked anything in, whose mean is
 * below 0.4 and that has no story in the paper yet, close enough to their taste to be readable
 * (cos(pos, e) inside serendipityCos) and important enough to matter. Needs a profile embedding.
 */
export function pickSerendipity(u: UserModel, best: Scored[], taken: Scored[], params: RankParams): Scored[] {
  if (!u.pos || params.serendipitySlots <= 0) return [];
  const pickedRoots = new Set(Object.entries(u.interests).filter(([, s]) => s.picked).map(([slug]) => rootOf(slug)));
  const takenIds = new Set(taken.map((t) => t.c.id));
  const takenRoots = new Set(taken.map((t) => t.root));
  const [ua, ub] = params.priors.unpicked;
  const rootMean = (r: TopicSlug) => (u.interests[r] ? meanOf(u.interests[r]) : ua / (ua + ub));
  const [lo, hi] = params.serendipityCos;
  const out: Scored[] = [];
  for (const s of best) {
    if (out.length >= params.serendipitySlots) break;
    if (takenIds.has(s.c.id) || s.c.labels.length === 0) continue;
    if (pickedRoots.has(s.root) || takenRoots.has(s.root) || rootMean(s.root) >= 0.4) continue;
    if (s.c.importance < params.serendipityMinImportance) continue;
    const c = cos(u.pos, s.c.embedding);
    if (c < lo || c > hi) continue;
    out.push(s); // `best` is sorted by score, so the first match is the best by s
    takenRoots.add(s.root);
  }
  return out;
}

function jaccard(a: Candidate, b: Candidate): number {
  if (a.labels.length === 0 && b.labels.length === 0) return 0;
  const sa = new Set(a.labels.map((l) => l.slug));
  let inter = 0;
  const sb = new Set(b.labels.map((l) => l.slug));
  for (const s of sb) if (sa.has(s)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Similarity for MMR: cosine of embeddings, or Jaccard of label slugs when either embedding is null. */
export function itemSim(a: Scored, b: Scored): number {
  return a.c.embedding && b.c.embedding ? cosN(a.c.embedding, normOf(a), b.c.embedding, normOf(b)) : jaccard(a.c, b.c);
}

/**
 * MMR: repeatedly take argmax λ·s − (1−λ)·max sim(i, taken), honouring maxPerRoot and maxPerSource
 * over everything taken so far; when no capped candidate remains it continues uncapped.
 *
 * Lazy greedy (exact): max sim only grows as items are taken, so a candidate's value computed against
 * fewer taken items is an upper bound. Only the current front-runner is brought up to date; it is
 * taken once it wins while current. Same result as the eager loop, a fraction of the dot products.
 */
export function mmrFill(short: Scored[], taken: Scored[], n: number, params: RankParams): Scored[] {
  const takenIds = new Set(taken.map((t) => t.c.id));
  const pool = short.filter((s) => !takenIds.has(s.c.id));
  const chosen: Scored[] = [...taken];
  const maxSim = new Float64Array(pool.length);
  const upTo = new Int32Array(pool.length); // how many of `chosen` maxSim[i] already covers
  const used = new Uint8Array(pool.length);
  const roots = new Map<string, number>();
  const sources = new Map<string, number>();
  const count = (s: Scored) => {
    roots.set(s.root, (roots.get(s.root) ?? 0) + 1);
    sources.set(s.c.sourceId, (sources.get(s.c.sourceId) ?? 0) + 1);
  };
  for (const t of taken) count(t);
  const refresh = (i: number) => {
    let m = maxSim[i];
    for (let k = upTo[i]; k < chosen.length; k++) {
      const v = itemSim(pool[i], chosen[k]);
      if (v > m) m = v;
    }
    maxSim[i] = m;
    upTo[i] = chosen.length;
  };
  const lambda = params.mmrLambda;
  // maxSim starts at 0 and only grows (max(0, sims)), so a stale value is an upper bound.
  const value = (i: number) => lambda * pool[i].b.total - (1 - lambda) * maxSim[i];
  const out: Scored[] = [];
  while (out.length < n) {
    let bestIdx = -1;
    for (const capped of [true, false]) {
      for (;;) {
        bestIdx = -1;
        let bestVal = -Infinity;
        for (let i = 0; i < pool.length; i++) {
          if (used[i]) continue;
          const s = pool[i];
          if (capped && ((roots.get(s.root) ?? 0) >= params.maxPerRoot || (sources.get(s.c.sourceId) ?? 0) >= params.maxPerSource)) continue;
          const v = value(i);
          if (v > bestVal || (v === bestVal && bestIdx >= 0 && byScore(s, pool[bestIdx]) < 0)) {
            bestVal = v;
            bestIdx = i;
          }
        }
        if (bestIdx < 0 || upTo[bestIdx] === chosen.length) break;
        refresh(bestIdx); // stale front-runner: bring it up to date and look again
      }
      if (bestIdx >= 0) break;
    }
    if (bestIdx < 0) break;
    used[bestIdx] = 1;
    const pick = pool[bestIdx];
    out.push(pick);
    chosen.push(pick);
    count(pick);
  }
  return out;
}
