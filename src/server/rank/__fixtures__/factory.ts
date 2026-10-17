// Test factories for the rank/learn engine (test-only; never imported by production code).
import { FIXTURE_TAXONOMY } from '@/contracts/fixtures';
import type { Candidate, InterestState, UserModel } from '@/contracts/engine';
import type { TopicNode, TopicSlug } from '@/contracts/taxonomy';
import { mulberry32 } from '../rng';

export const NOW = new Date('2026-10-17T02:00:00.000Z');

export function makeTaxonomy(): TopicNode[] {
  return FIXTURE_TAXONOMY;
}

export function makeUser(p: Partial<UserModel> = {}): UserModel {
  return {
    userId: 'u1',
    interests: {},
    pos: null,
    neg: null,
    nEngaged: 0,
    depthPref: 0,
    presentation: { timeBudget: 15, depth: 'basics', lang: 'en' },
    seenArticleIds: [],
    dismissedClusterIds: [],
    mutedSourceIds: [],
    engaged: [],
    ...p,
  };
}

export function state(alpha: number, beta: number, p: Partial<InterestState> = {}): InterestState {
  return { alpha, beta, priorAlpha: alpha, priorBeta: beta, picked: false, muted: false, pinned: false, ...p };
}

let nextId = 1;
export function makeCandidate(p: Partial<Candidate> = {}): Candidate {
  const id = p.id ?? `c${nextId++}`;
  return {
    id,
    embedding: null,
    labels: [],
    clusterId: null,
    importance: 0,
    sourceCount: 1,
    publishedAt: NOW.toISOString(),
    sourceId: 's1',
    sourceQuality: 0.5,
    wordCount: 400,
    hasImage: false,
    headline: `Headline ${id}`,
    ...p,
  };
}

function normalized(v: Float32Array): Float32Array {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i] * v[i];
  n = Math.sqrt(n) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
  return out;
}

/** A seeded random unit vector. */
export function unitVec(seed: number, d = 384): Float32Array {
  const rng = mulberry32(seed);
  const v = new Float32Array(d);
  for (let i = 0; i < d; i++) v[i] = rng() * 2 - 1;
  return normalized(v);
}

/** A unit vector whose cosine with the unit vector `base` is exactly `cos`. */
export function vecWithCos(base: Float32Array, cos: number, seed: number): Float32Array {
  const r = unitVec(seed, base.length);
  let dot = 0;
  for (let i = 0; i < base.length; i++) dot += r[i] * base[i];
  const perp = new Float32Array(base.length);
  for (let i = 0; i < base.length; i++) perp[i] = r[i] - dot * base[i];
  const u = normalized(perp);
  const s = Math.sqrt(Math.max(0, 1 - cos * cos));
  const out = new Float32Array(base.length);
  for (let i = 0; i < base.length; i++) out[i] = cos * base[i] + s * u[i];
  return out;
}

/** Hours before NOW as an ISO string. */
export function hoursAgo(h: number, now: Date = NOW): string {
  return new Date(now.getTime() - h * 3_600_000).toISOString();
}

export function slugsOf(taxonomy: TopicNode[], level?: 1 | 2 | 3): TopicSlug[] {
  return taxonomy.filter((t) => level === undefined || t.level === level).map((t) => t.slug);
}

/**
 * Hand-written onboarding-style interests over every taxonomy node: picked nodes get the picked prior
 * of their level, unpicked children of a picked node (1.5|2|2.5, 3) by propagation, everything else (1,3).
 */
export function makeInterests(picks: TopicSlug[], taxonomy: TopicNode[] = FIXTURE_TAXONOMY): Record<TopicSlug, InterestState> {
  const pickedPrior: Record<1 | 2 | 3, [number, number]> = { 1: [2, 1], 2: [3, 1], 3: [4, 1] };
  const out: Record<TopicSlug, InterestState> = {};
  for (const t of taxonomy) {
    const picked = picks.includes(t.slug);
    const [a0, b] = picked ? pickedPrior[t.level] : [1, 3];
    let a = a0;
    if (!picked && t.parentSlug && picks.includes(t.parentSlug)) {
      const parent = taxonomy.find((n) => n.slug === t.parentSlug)!;
      a += 0.5 * (pickedPrior[parent.level][0] - 1);
    }
    out[t.slug] = { alpha: a, beta: b, priorAlpha: a, priorBeta: b, picked, muted: false, pinned: false };
  }
  return out;
}

const ROOTS = ['news', 'business', 'technical', 'science', 'health', 'sports', 'entertainment', 'arts', 'lifestyle'];

/**
 * A seeded synthetic pool: `n` candidates over the 9 roots, `clusters` clusters (each cluster within one
 * root), `sources` sources, random 384-d embeddings (or null), importance in [0, 0.9], age 0–36 h.
 */
export function makePool(
  n = 300,
  opts: { clusters?: number; sources?: number; seed?: number; embeddings?: boolean; maxImportance?: number; now?: Date } = {},
): Candidate[] {
  const { clusters = 120, sources = 25, seed = 42, embeddings = true, maxImportance = 0.9, now = NOW } = opts;
  const taxonomy = FIXTURE_TAXONOMY;
  const rng = mulberry32(seed);
  const out: Candidate[] = [];
  for (let i = 0; i < n; i++) {
    const k = i % clusters;
    const root = ROOTS[k % ROOTS.length];
    const under = taxonomy.filter((t) => t.slug.startsWith(`${root}.`));
    const leaf = under[Math.floor(rng() * under.length)]?.slug ?? root;
    const importance = Math.round(rng() * maxImportance * 1000) / 1000;
    out.push({
      id: `p${String(i).padStart(4, '0')}`,
      embedding: embeddings ? unitVec(seed * 100_000 + i) : null,
      labels: [{ slug: leaf, conf: 0.8 }],
      clusterId: `k${k}`,
      importance,
      sourceCount: 1 + Math.floor(importance * 10),
      publishedAt: new Date(now.getTime() - rng() * 36 * 3_600_000).toISOString(),
      sourceId: `s${i % sources}`,
      sourceQuality: 0.3 + 0.4 * rng(),
      wordCount: 200 + Math.floor(rng() * 1000),
      hasImage: rng() > 0.3,
      headline: `Story ${i}`,
    });
  }
  return out;
}
