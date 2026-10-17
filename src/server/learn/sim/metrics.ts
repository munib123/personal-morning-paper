// Offline ranking metrics for the 7-day simulation. PURE.
import { cos } from '@/server/rank/vec';

/** Share of the paper's stories the persona truly likes (true affinity ≥ 0.6). */
export function precisionAt20(trues: number[]): number {
  if (trues.length === 0) return 0;
  return trues.filter((t) => t >= 0.6).length / trues.length;
}

const dcg = (rels: number[]) => rels.slice(0, 10).reduce((s, r, i) => s + r / Math.log2(i + 2), 0);

/** nDCG@10 with graded relevance = true affinity; the ideal is the pool's 10 best. */
export function ndcgAt10(rankedTrues: number[], poolTrues: number[]): number {
  const ideal = dcg([...poolTrues].sort((a, b) => b - a));
  return ideal > 0 ? Math.min(1, dcg(rankedTrues) / ideal) : 0;
}

/** The base rate: share of the day's pool she truly likes (what precision@20 a random paper scores on average). */
export function baseRate(poolTrues: number[]): number {
  return poolTrues.length === 0 ? 0 : poolTrues.filter((t) => t >= 0.6).length / poolTrues.length;
}

/** nDCG@10 a uniformly random order scores on average: every slot holds the pool's mean affinity in expectation. */
export function randomNdcgAt10(poolTrues: number[]): number {
  const ideal = dcg([...poolTrues].sort((a, b) => b - a));
  if (ideal <= 0) return 0;
  const mean = poolTrues.reduce((s, t) => s + t, 0) / poolTrues.length;
  return Math.min(1, dcg(poolTrues.map(() => mean)) / ideal);
}

/** Intra-list diversity: 1 − mean pairwise cosine (null embeddings skipped; < 2 vectors → 0). */
export function diversity(embs: (Float32Array | null)[]): number {
  const vs = embs.filter((e): e is Float32Array => !!e);
  if (vs.length < 2) return 0;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < vs.length; i++) {
    for (let j = i + 1; j < vs.length; j++) {
      sum += cos(vs[i], vs[j]);
      n++;
    }
  }
  return Math.max(0, Math.min(1, 1 - sum / n));
}
