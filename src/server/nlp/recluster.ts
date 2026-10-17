// Re-runs leader clustering over every embedded article from its stored embedding (no re-embedding),
// for when CLUSTER_THRESHOLD changes: fresh clusters replace the old ones; labels are left alone.
import pLimit from 'p-limit';
import { createSupabaseAdminClient } from '@/server/db/admin';
import { parseVector, toPgVector } from '@/server/db/vector';
import { requestNow } from '@/server/time';
import { chunk, selectPaged } from './paged';
import { nlpPlan } from './plan';

export async function reclusterAll(): Promise<{ articles: number; clusters: number; multiSource: number; deleted: number; ms: number }> {
  const started = Date.now();
  const now = await requestNow();
  const db = createSupabaseAdminClient();

  const rows = await selectPaged((from, to) =>
    db
      .from('articles')
      .select('id, source_id, title, published_at, embedding')
      .not('embedding', 'is', null)
      .order('published_at', { ascending: true })
      .order('id')
      .range(from, to),
  );
  const items = rows.flatMap((r) => {
    const e = parseVector(r.embedding);
    return e ? [{ row: { id: r.id, sourceId: r.source_id, title: r.title, publishedAt: new Date(r.published_at) }, e }] : [];
  });
  const oldIds = (await selectPaged((from, to) => db.from('clusters').select('id').order('id').range(from, to))).map((c) => c.id);

  const plan = nlpPlan({
    rows: items.map((i) => i.row),
    embeddings: items.map((i) => i.e),
    topics: [],
    priorsBySource: {},
    clusters: [],
    now,
    newId: () => crypto.randomUUID(),
  });

  for (const part of chunk(plan.clusters, 100)) {
    const { error } = await db.from('clusters').upsert(
      part.map((c) => ({
        id: c.id,
        centroid: toPgVector(c.centroid),
        headline: c.headline,
        first_seen: c.firstSeen.toISOString(),
        last_seen: c.lastSeen.toISOString(),
        article_count: c.articleCount,
        source_count: c.sourceIds.size,
        importance: c.importance,
      })),
    );
    if (error) throw new Error(`clusters upsert: ${error.message}`);
  }

  const limit = pLimit(10);
  await Promise.all(
    plan.articles.map((a) =>
      limit(async () => {
        const { error } = await db.from('articles').update({ cluster_id: a.clusterId }).eq('id', a.id);
        if (error) throw new Error(`articles update ${a.id}: ${error.message}`);
      }),
    ),
  );

  let deleted = 0;
  for (const ids of chunk(oldIds, 100)) {
    const { error, count } = await db.from('clusters').delete({ count: 'exact' }).in('id', ids);
    if (error) console.warn(`[nlp] old clusters not deleted (${error.message})`);
    else deleted += count ?? 0;
  }

  return {
    articles: plan.articles.length,
    clusters: plan.clusters.length,
    multiSource: plan.clusters.filter((c) => c.sourceIds.size > 1).length,
    deleted,
    ms: Date.now() - started,
  };
}
