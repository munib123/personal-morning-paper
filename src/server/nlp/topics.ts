// The topics table with its embeddings, cached per process. DB only: no model code here, so the
// Next.js app can import it (mapTextToTopics) without pulling in transformers.js.
import type { TopicNode } from '@/contracts/taxonomy';
import { createSupabaseAdminClient } from '@/server/db/admin';
import { parseVector } from '@/server/db/vector';

export interface TopicRow extends TopicNode { embedding: Float32Array | null }

let cached: Promise<TopicRow[]> | null = null;

async function fetchTopics(): Promise<TopicRow[]> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db
    .from('topics')
    .select('slug, parent_slug, level, name, description, emoji, synonyms, embedding')
    .order('slug')
    .abortSignal(AbortSignal.timeout(5_000)); // mapTextToTopics runs on a request path: never hang it
  if (error) throw new Error(`topics: ${error.message}`);
  return (data ?? []).map((r) => ({
    slug: r.slug,
    parentSlug: r.parent_slug,
    level: r.level as 1 | 2 | 3,
    name: r.name,
    description: r.description,
    emoji: r.emoji,
    synonyms: r.synonyms ?? [],
    embedding: parseVector(r.embedding),
  }));
}

/** All topics (67), cached per process; `fresh` re-reads the table. A failed read is not cached. */
export function loadTopics(opts: { fresh?: boolean } = {}): Promise<TopicRow[]> {
  if (!cached || opts.fresh) {
    const p = fetchTopics();
    cached = p;
    p.catch(() => {
      if (cached === p) cached = null;
    });
  }
  return cached;
}
