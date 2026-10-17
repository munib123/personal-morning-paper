// The 7-day simulated reader (ARCHITECTURE §10.5): learning vs onboarding-only vs popularity. PURE, seeded.
import type { Candidate, EngagedItem, RankParams, RankingResult, UserModel } from '@/contracts/engine';
import type { SimulationDay, SimulationResult } from '@/contracts/learning';
import type { OnboardingInput } from '@/contracts/profile';
import type { SignalEvent } from '@/contracts/signals';
import type { TopicNode, TopicSlug } from '@/contracts/taxonomy';
import { buildRanking } from '@/server/rank';
import { hashSeed, mulberry32 } from '@/server/rank/rng';
import { freshnessOf } from '@/server/rank/score';
import { bestPerCluster, sectionOf, type Scored } from '@/server/rank/select';
import { coldStartPos, priorsFromOnboarding } from '../priors';
import { applySignal } from '../signal';
import { thetaOf } from '../theta';
import { diversity, ndcgAt10, precisionAt20 } from './metrics';
import { trueAffinityOf, type Persona } from './persona';

export interface SimInput {
  pool: Candidate[];
  taxonomy: TopicNode[];
  topicEmb: Record<TopicSlug, Float32Array>;
  persona: Persona;
  days: number;
  now: Date;
  params: RankParams;
}

export interface DayTrace {
  day: number; // 1-based
  pool: Candidate[];
  ranking: RankingResult;
  events: SignalEvent[];
  thetaBefore: Record<TopicSlug, number>; // θ̂ of every taxonomy node before that day's reading
  model: UserModel; // after that day's reading
}

/** Day pools: 7 contiguous slices by publish time (N ≥ 280), else a sliding window of up to 120. */
export function dayPools(pool: Candidate[], days: number): Candidate[][] {
  const sorted = [...pool].sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt) || (a.id < b.id ? -1 : 1));
  const n = sorted.length;
  if (n >= 280) {
    return Array.from({ length: days }, (_, d) => sorted.slice(Math.floor((d * n) / days), Math.floor(((d + 1) * n) / days)));
  }
  const size = Math.min(n, 120);
  return Array.from({ length: days }, (_, d) => {
    const start = days > 1 ? Math.floor((d * (n - size)) / (days - 1)) : 0;
    return sorted.slice(start, start + size);
  });
}

/** The day's clock: the newest story in its pool (never after the real `now`). */
const dayNowOf = (pool: Candidate[], now: Date) =>
  new Date(Math.min(now.getTime(), pool.reduce((m, c) => Math.max(m, Date.parse(c.publishedAt)), 0) || now.getTime()));

export function initialModel(i: SimInput): UserModel {
  const input: OnboardingInput = {
    displayName: i.persona.name,
    paperName: null,
    picks: i.persona.picks.map((slug) => ({ slug, via: 'tile' as const })),
    blocked: [],
    taste: [],
    presentation: { timeBudget: 15, depth: 'basics', lang: 'en' },
    city: 'Islamabad',
    tz: 'Asia/Karachi',
  };
  const interests = priorsFromOnboarding(input, i.taxonomy, i.params);
  return {
    userId: `sim-${i.persona.name}`,
    interests,
    pos: coldStartPos(interests, i.topicEmb),
    neg: null,
    nEngaged: 0,
    depthPref: 0,
    presentation: input.presentation,
    seenArticleIds: [],
    dismissedClusterIds: [],
    mutedSourceIds: [],
    engaged: [],
  };
}

const level2 = (taxonomy: TopicNode[]) => taxonomy.filter((t) => t.level <= 2).map((t) => t.slug);
const weightsOf = (m: UserModel, slugs: TopicSlug[], params: RankParams) => Object.fromEntries(slugs.map((s) => [s, Math.round(thetaOf(m, s, params) * 10_000) / 10_000]));

/** The persona reads one paper: an impression per story, opens with p = σ(4·(true − 0.5)), dwells ∝ affinity, "less" below 0.2. */
function readPaper(items: { id: string; c: Candidate; slot: string }[], persona: Persona, params: RankParams, rng: () => number) {
  const events: SignalEvent[] = [];
  const opened: Candidate[] = [];
  for (const { c, slot } of items) {
    const t = trueAffinityOf(persona, c);
    events.push({ type: 'impression', articleId: c.id, meta: { slot } });
    if (rng() < 1 / (1 + Math.exp(-4 * (t - 0.5)))) {
      const expected = Math.max(params.minExpectedDwellMs, (c.wordCount / params.wpm) * 60_000);
      events.push({ type: 'open', articleId: c.id, meta: { mode: 'sheet' } });
      events.push({ type: 'dwell', articleId: c.id, value: Math.round(t * 1.2 * expected), meta: { mode: 'sheet' } });
      opened.push(c);
    }
    if (t < 0.2) events.push({ type: 'less', articleId: c.id });
  }
  return { events, opened };
}

function rankedCandidates(r: RankingResult, byId: Map<string, Candidate>) {
  return r.items.map((i) => ({ id: i.candidateId, c: byId.get(i.candidateId)!, slot: i.slot, special: i.reasons.some((x) => x.code === 'explore' || x.code === 'serendipity') }));
}

function dayMetrics(day: number, ranked: { c: Candidate; special: boolean }[], poolTrues: number[], persona: Persona, openedIds: Set<string>): SimulationDay {
  const trues = ranked.map((x) => trueAffinityOf(persona, x.c));
  return {
    day,
    precisionAt20: precisionAt20(trues),
    ndcgAt10: ndcgAt10(trues, poolTrues),
    diversity: diversity(ranked.map((x) => x.c.embedding)),
    exploreHits: ranked.filter((x) => x.special && openedIds.has(x.c.id)).length,
  };
}

/** The learning arm, day by day: rank → read → applySignal; seen stories never return. */
export function runLearningArm(i: SimInput): DayTrace[] {
  const pools = dayPools(i.pool, i.days);
  const slugs = i.taxonomy.map((t) => t.slug); // every node: the demo seed stores these as interest_snapshots
  let model = initialModel(i);
  const out: DayTrace[] = [];
  pools.forEach((pool, d) => {
    const day = d + 1;
    const byId = new Map(pool.map((c) => [c.id, c]));
    const dayNow = dayNowOf(pool, i.now);
    const thetaBefore = weightsOf(model, slugs, i.params);
    const ranking = buildRanking(model, pool, i.params, `sim|${i.persona.name}|${day}`, dayNow, i.taxonomy);
    const { events, opened } = readPaper(rankedCandidates(ranking, byId), i.persona, i.params, mulberry32(hashSeed(`sim|${i.persona.name}|${day}|reader`)));
    for (const ev of events) model = applySignal(model, ev, ev.articleId ? (byId.get(ev.articleId) ?? null) : null, i.params).model;
    const engaged: EngagedItem[] = opened.map((c) => ({ articleId: c.id, embedding: c.embedding, headline: c.headline, at: dayNow.toISOString() }));
    model = {
      ...model,
      seenArticleIds: [...model.seenArticleIds, ...ranking.items.map((x) => x.candidateId)],
      engaged: [...engaged, ...model.engaged].slice(0, 50),
    };
    out.push({ day, pool, ranking, events, thetaBefore, model });
  });
  return out;
}

/** Popularity baseline: importance + freshness only, one per cluster, top 20. */
function popularityTop(pool: Candidate[], seen: Set<string>, now: Date, params: RankParams): Candidate[] {
  const scored: Scored[] = pool
    .filter((c) => !seen.has(c.id))
    .map((c) => {
      const fresh = freshnessOf(c, now, params);
      const total = c.importance + fresh;
      return { c, fresh, root: sectionOf(c), b: { topic: 0, similarity: 0, negative: 0, importance: c.importance, freshness: fresh, source: 0, total } };
    });
  return bestPerCluster(scored).slice(0, params.editionSize).map((s) => s.c);
}

export function runSimulation(i: SimInput): SimulationResult {
  const trace = runLearningArm(i);
  const learning: SimulationDay[] = [];
  const onboardingOnly: SimulationDay[] = [];
  const popularity: SimulationDay[] = [];
  const frozen = initialModel(i);
  let frozenSeen: string[] = [];
  const popSeen = new Set<string>();

  for (const t of trace) {
    const byId = new Map(t.pool.map((c) => [c.id, c]));
    const poolTrues = t.pool.map((c) => trueAffinityOf(i.persona, c));
    const dayNow = dayNowOf(t.pool, i.now);
    const readerSeed = (arm: string) => mulberry32(hashSeed(`sim|${i.persona.name}|${t.day}|${arm}`));

    const lr = rankedCandidates(t.ranking, byId);
    const lOpened = new Set(t.events.filter((e) => e.type === 'open').map((e) => e.articleId!));
    learning.push(dayMetrics(t.day, lr, poolTrues, i.persona, lOpened));

    const fr = buildRanking({ ...frozen, seenArticleIds: frozenSeen }, t.pool, i.params, `sim|${i.persona.name}|${t.day}`, dayNow, i.taxonomy);
    const fc = rankedCandidates(fr, byId);
    const fOpened = new Set(readPaper(fc, i.persona, i.params, readerSeed('onboarding')).opened.map((c) => c.id));
    onboardingOnly.push(dayMetrics(t.day, fc, poolTrues, i.persona, fOpened));
    frozenSeen = [...frozenSeen, ...fr.items.map((x) => x.candidateId)];

    const pc = popularityTop(t.pool, popSeen, dayNow, i.params).map((c) => ({ id: c.id, c, slot: 'core', special: false }));
    const pOpened = new Set(readPaper(pc, i.persona, i.params, readerSeed('popularity')).opened.map((c) => c.id));
    popularity.push(dayMetrics(t.day, pc, poolTrues, i.persona, pOpened));
    for (const c of pc) popSeen.add(c.id);
  }

  return {
    persona: i.persona.name,
    learning,
    onboardingOnly,
    popularity,
    snapshots: trace.map((t) => ({ day: t.day, weights: Object.fromEntries(level2(i.taxonomy).map((s) => [s, t.thetaBefore[s]])) })),
  };
}

