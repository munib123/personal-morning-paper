// The pure core of runNlp: label every article, cluster it, then recompute cluster importance.
// runNlp (index.ts) does the I/O around it.
import type { TopicSlug } from '@/contracts/taxonomy';
import { assignCluster, CLUSTER_WINDOW_HOURS, importance, joinCluster, type ClusterState } from './cluster';
import type { NlpStats } from './index';
import { assignLabels, type TopicVec } from './labels';
import { normalize } from './vector';

export interface NlpPlanRow { id: string; sourceId: string; title: string; publishedAt: Date }

export interface NlpPlanInput {
  rows: NlpPlanRow[];
  embeddings: Float32Array[]; // embeddings[i] belongs to rows[i]
  topics: TopicVec[];
  priorsBySource: Record<string, TopicSlug[]>;
  clusters: ClusterState[]; // existing clusters (last seen within the window); not mutated
  now: Date;
  newId: () => string;
}

export interface NlpPlanArticle { id: string; embedding: Float32Array; labels: { slug: TopicSlug; conf: number }[]; clusterId: string }

export interface NlpPlan {
  articles: NlpPlanArticle[];
  clusters: (ClusterState & { importance: number })[];
  stats: Omit<NlpStats, 'ms'>;
}

const cloneCluster = (c: ClusterState): ClusterState => ({ ...c, centroid: Float32Array.from(c.centroid), sourceIds: new Set(c.sourceIds) });

export function nlpPlan(input: NlpPlanInput): NlpPlan {
  const clusters = input.clusters.map(cloneCluster);
  const ordered = input.rows
    .map((row, i) => ({ row, embedding: input.embeddings[i] }))
    .sort((a, b) => a.row.publishedAt.getTime() - b.row.publishedAt.getTime());

  const articles: NlpPlanArticle[] = [];
  let labelled = 0;
  let clustersNew = 0;
  let clustersJoined = 0;

  for (const { row, embedding } of ordered) {
    const labels = assignLabels(embedding, input.topics, input.priorsBySource[row.sourceId] ?? []);
    if (labels.length > 0) labelled++;

    const idx = assignCluster(embedding, clusters, row.publishedAt);
    let cluster: ClusterState;
    if (idx >= 0) {
      cluster = clusters[idx];
      joinCluster(cluster, embedding, row.sourceId, row.publishedAt);
      clustersJoined++;
    } else {
      cluster = {
        id: input.newId(),
        centroid: normalize(embedding),
        firstSeen: row.publishedAt,
        lastSeen: row.publishedAt,
        articleCount: 1,
        sourceIds: new Set([row.sourceId]),
        headline: row.title,
        isNew: true,
        touched: true,
      };
      clusters.push(cluster);
      clustersNew++;
    }
    articles.push({ id: row.id, embedding, labels, clusterId: cluster.id });
  }

  // Importance is relative to the biggest story of the window (§10.2): max = most distinct sources
  // among the clusters seen in the last 36 h.
  const windowStart = input.now.getTime() - CLUSTER_WINDOW_HOURS * 3_600_000;
  const max = clusters.reduce((m, c) => (c.lastSeen.getTime() >= windowStart ? Math.max(m, c.sourceIds.size) : m), 0);

  return {
    articles,
    clusters: clusters.map((c) => ({ ...c, importance: importance(c.sourceIds.size, max) })),
    stats: { embedded: input.rows.length, labelled, clustersNew, clustersJoined },
  };
}
