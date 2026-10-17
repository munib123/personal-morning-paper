// The ranker's embedding space (rank-v1, Ruling W3 in ARCHITECTURE §10.4). PURE.
// gte-small sentence vectors share one large common direction: on the live pool every pair of articles
// has cos ≈ 0.75, so cos(pos, e), cos(neg, e), the MMR penalty and the serendipity band came out nearly
// the same for every story. Subtracting the pool's mean vector (the standard fix for anisotropic
// embeddings) leaves the part that tells stories apart: centred pairwise cos ≈ 0.01 on the same pool.
// The reader's pos / neg / engaged vectors are moved by the same mean, so every cosine the ranker takes
// (score, MMR, serendipity, the 'similar' chip) is between centred vectors. Inputs are never mutated.
import type { Candidate, UserModel } from '@/contracts/engine';
import { RANK_V1_FIXED } from './params';

/** Mean of the pool's embeddings (one dimension, the first seen); null below `minVectors` embedded candidates. */
export function poolMean(pool: Candidate[], minVectors: number = RANK_V1_FIXED.centerMinPool): Float32Array | null {
  let acc: Float64Array | null = null;
  let n = 0;
  for (const c of pool) {
    const e = c.embedding;
    if (!e || e.length === 0) continue;
    if (!acc) acc = new Float64Array(e.length);
    if (e.length !== acc.length) continue;
    for (let i = 0; i < e.length; i++) acc[i] += e[i];
    n++;
  }
  if (!acc || n < minVectors) return null;
  return Float32Array.from(acc, (x) => x / n);
}

/** v − μ (null stays null; a vector of another dimension is left as is). */
export function centerVec(v: Float32Array | null, mu: Float32Array | null): Float32Array | null {
  if (!v || !mu || v.length !== mu.length) return v;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] - mu[i];
  return out;
}

/** The pool and the reader moved into the pool-mean-centred space (returned as is when the pool is too small). */
export function centerSpace(user: UserModel, pool: Candidate[]): { user: UserModel; pool: Candidate[] } {
  const mu = poolMean(pool);
  if (!mu) return { user, pool };
  const d = mu.length;
  const buf = new Float32Array(pool.length * d); // one allocation; each centred vector is a view into it
  return {
    pool: pool.map((c, k) => {
      const e = c.embedding;
      if (!e || e.length !== d) return c;
      const out = buf.subarray(k * d, (k + 1) * d);
      for (let i = 0; i < d; i++) out[i] = e[i] - mu[i];
      return { ...c, embedding: out };
    }),
    user: {
      ...user,
      pos: centerVec(user.pos, mu),
      neg: centerVec(user.neg, mu),
      engaged: user.engaged.map((e) => (e.embedding ? { ...e, embedding: centerVec(e.embedding, mu) } : e)),
    },
  };
}
