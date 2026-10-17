// L2 NLP (ARCHITECTURE §9.3, §10.2): raw → embedded, with labels, clusters and importance.
// Runs in the worker (scripts/job-ingest.ts, cli.ts), never on Vercel, and never writes job_runs (§9.7).
import pLimit from 'p-limit';
import type { TopicSlug } from '@/contracts/taxonomy';
import { createSupabaseAdminClient } from '@/server/db/admin';
import { parseVector, toPgVector } from '@/server/db/vector';
import { requestNow } from '@/server/time';
import { CLUSTER_WINDOW_HOURS, type ClusterState } from './cluster';
import { embeddingModelId, embedTexts, embedTopics } from './embed';
import type { TopicVec } from './labels';
import { chunk, selectPaged } from './paged';
import { nlpPlan } from './plan';
import { embeddingInput } from './text';
import { loadTopics } from './topics';

export { embedTexts } from './embed';

export interface NlpStats { embedded: number; labelled: number; clustersNew: number; clustersJoined: number; ms: number; }

const HOUR = 3_600_000;
type Db = ReturnType<typeof createSupabaseAdminClient>;

async function topicVectors(): Promise<TopicVec[]> {
  let topics = await loadTopics();
  if (topics.length > 0 && topics.some((t) => !t.embedding)) {
    console.log(`[nlp] topics missing embeddings: embedding all ${topics.length} first`);
    await embedTopics();
    topics = await loadTopics({ fresh: true });
  }
  return topics.filter((t) => t.embedding).map((t) => ({ slug: t.slug, level: t.level, embedding: t.embedding! }));
}

async function loadClusters(db: Db, since: Date): Promise<ClusterState[]> {
  const rows = await selectPaged((from, to) =>
    db
      .from('clusters')
      .select('id, centroid, headline, first_seen, last_seen, article_count')
      .gte('last_seen', since.toISOString())
      .order('id')
      .range(from, to),
  );
  const sources = new Map<string, Set<string>>();
  for (const ids of chunk(rows.map((r) => r.id), 200)) {
    const pairs = await selectPaged((from, to) =>
      db.from('articles').select('cluster_id, source_id').in('cluster_id', ids).order('id').range(from, to),
    );
    for (const p of pairs) {
      if (!p.cluster_id) continue;
      const set = sources.get(p.cluster_id) ?? new Set<string>();
      set.add(p.source_id);
      sources.set(p.cluster_id, set);
    }
  }
  const out: ClusterState[] = [];
  for (const r of rows) {
    const centroid = parseVector(r.centroid);
    if (!centroid) continue;
    out.push({
      id: r.id,
      centroid,
      firstSeen: new Date(r.first_seen),
      lastSeen: new Date(r.last_seen),
      articleCount: r.article_count,
      sourceIds: sources.get(r.id) ?? new Set<string>(),
      headline: r.headline,
      isNew: false,
      touched: false,
    });
  }
  return out;
}

export async function runNlp(opts?: { limit?: number }): Promise<NlpStats> {
  const started = Date.now();
  const now = await requestNow();
  const db = createSupabaseAdminClient();

  const topics = await topicVectors();
  const rows = await selectPaged(
    (from, to) =>
      db
        .from('articles')
        .select('id, source_id, title, lede, content_text, published_at')
        .eq('status', 'raw')
        .order('published_at', { ascending: true })
        .order('id')
        .range(from, to),
    opts?.limit ?? 2000,
  );
  if (rows.length === 0) return { embedded: 0, labelled: 0, clustersNew: 0, clustersJoined: 0, ms: Date.now() - started };

  const { data: sourceRows, error: sourceError } = await db.from('sources').select('id, topics');
  if (sourceError) throw new Error(`sources: ${sourceError.message}`);
  const priorsBySource: Record<string, TopicSlug[]> = Object.fromEntries((sourceRows ?? []).map((s) => [s.id, s.topics ?? []]));

  const embeddings = await embedTexts(rows.map((r) => embeddingInput({ title: r.title, lede: r.lede, contentText: r.content_text })));
  const modelId = embeddingModelId();
  console.log(`[nlp] embedded ${rows.length} articles via ${modelId}`);

  // Clusters an article may join: last seen within 36 h of the oldest article in this run.
  const oldest = Math.min(now.getTime(), ...rows.map((r) => new Date(r.published_at).getTime()));
  const clusters = await loadClusters(db, new Date(oldest - CLUSTER_WINDOW_HOURS * HOUR));

  const plan = nlpPlan({
    rows: rows.map((r) => ({ id: r.id, sourceId: r.source_id, title: r.title, publishedAt: new Date(r.published_at) })),
    embeddings,
    topics,
    priorsBySource,
    clusters,
    now,
    newId: () => crypto.randomUUID(),
  });

  // Clusters first (articles reference them): every touched cluster, and every cluster of the window,
  // whose importance was just recomputed.
  const windowStart = now.getTime() - CLUSTER_WINDOW_HOURS * HOUR;
  const clusterRows = plan.clusters
    .filter((c) => c.touched || c.lastSeen.getTime() >= windowStart)
    .map((c) => ({
      id: c.id,
      centroid: toPgVector(c.centroid),
      headline: c.headline,
      first_seen: c.firstSeen.toISOString(),
      last_seen: c.lastSeen.toISOString(),
      article_count: c.articleCount,
      source_count: c.sourceIds.size,
      importance: c.importance,
    }));
  for (const part of chunk(clusterRows, 100)) {
    const { error } = await db.from('clusters').upsert(part);
    if (error) throw new Error(`clusters upsert: ${error.message}`);
  }

  const limit = pLimit(10);
  await Promise.all(
    plan.articles.map((a) =>
      limit(async () => {
        const { error } = await db
          .from('articles')
          .update({ embedding: toPgVector(a.embedding), embed_model: modelId, labels: a.labels, cluster_id: a.clusterId, status: 'embedded' })
          .eq('id', a.id);
        if (error) throw new Error(`articles update ${a.id}: ${error.message}`);
      }),
    ),
  );

  return { ...plan.stats, ms: Date.now() - started };
}
