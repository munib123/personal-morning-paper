// Leader clustering and importance (ARCHITECTURE §10.2, §9.7). Pure, no I/O.
// An article joins the most similar cluster with cos ≥ CLUSTER_THRESHOLD that was last seen within 36 h
// and holds fewer than 12 articles; otherwise it starts a new one. The centroid is a running mean,
// re-normalized.
import { cosine, normalize } from './vector';

export interface ClusterState {
  id: string;
  centroid: Float32Array;
  firstSeen: Date;
  lastSeen: Date;
  articleCount: number;
  sourceIds: Set<string>;
  headline: string | null;
  isNew: boolean;
  touched: boolean;
}

// Tuned on the first real corpus (1,676 articles, 1.3 M pairs within 36 h, gte-small): pairs at
// 0.80–0.88 are mostly different stories on one topic, 0.90–0.92 are mostly the same story, ≥ 0.92 almost
// always. The spec's starting value 0.82 chained unrelated stories into 117 clusters of 12. Re-tune if the
// embedding model changes (MiniLM and Gemini have different cosine ranges).
export const CLUSTER_THRESHOLD = 0.9;
export const CLUSTER_WINDOW_HOURS = 36;
export const CLUSTER_MAX_SIZE = 12;
// Vectors are Float32: a cos of exactly 0.82 computes as 0.8199999…, and must still join.
const COS_EPSILON = 1e-6;

/** Index of the best cluster to join, or -1 when none is eligible. */
export function assignCluster(
  e: Float32Array,
  clusters: ClusterState[],
  at: Date,
  opts: { threshold?: number; windowHours?: number; maxSize?: number } = {},
): number {
  const threshold = opts.threshold ?? CLUSTER_THRESHOLD;
  const windowMs = (opts.windowHours ?? CLUSTER_WINDOW_HOURS) * 3_600_000;
  const maxSize = opts.maxSize ?? CLUSTER_MAX_SIZE;
  let best = -1;
  let bestCos = -Infinity;
  for (let i = 0; i < clusters.length; i++) {
    const c = clusters[i];
    if (c.articleCount >= maxSize) continue;
    if (at.getTime() - c.lastSeen.getTime() > windowMs) continue;
    const cos = cosine(e, c.centroid);
    if (cos + COS_EPSILON >= threshold && cos > bestCos) {
      best = i;
      bestCos = cos;
    }
  }
  return best;
}

/** Adds one article to the cluster in place: running-mean centroid (re-normalized), count, sources, seen times. */
export function joinCluster(c: ClusterState, e: Float32Array, sourceId: string, at: Date): void {
  const n = c.articleCount;
  const mean = new Float32Array(c.centroid.length);
  for (let i = 0; i < mean.length; i++) mean[i] = (c.centroid[i] * n + (e[i] ?? 0)) / (n + 1);
  c.centroid = normalize(mean);
  c.articleCount = n + 1;
  c.sourceIds.add(sourceId);
  if (at.getTime() > c.lastSeen.getTime()) c.lastSeen = at;
  if (at.getTime() < c.firstSeen.getTime()) c.firstSeen = at;
  c.touched = true;
}

/** log(1 + d) / log(1 + max), clamped to [0, 1]; 0 when no cluster has 2+ sources (max ≤ 1). */
export function importance(distinctSources: number, maxDistinctSources: number): number {
  if (maxDistinctSources <= 1 || distinctSources <= 0) return 0;
  const v = Math.log(1 + distinctSources) / Math.log(1 + maxDistinctSources);
  return Math.min(1, Math.max(0, v));
}
