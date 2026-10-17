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
