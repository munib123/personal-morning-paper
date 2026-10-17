// Process-cached taxonomy and topic embeddings for the engine.
import type { TopicNode, TopicSlug } from '@/contracts/taxonomy';
import { FIXTURE_TAXONOMY } from '@/contracts/fixtures';
import { createSupabaseAdminClient } from '@/server/db/admin';
import { parseVector } from '@/server/db/vector';
import { getTaxonomy } from '@/server/onboarding';

let taxonomy: Promise<TopicNode[]> | null = null;
let topicEmb: Promise<Record<TopicSlug, Float32Array>> | null = null;

/** getTaxonomy() (L5), cached per process; the seed taxonomy when it comes back empty or fails. */
export function loadTaxonomy(): Promise<TopicNode[]> {
  taxonomy ??= getTaxonomy()
    .then((t) => (t.length > 0 ? t : FIXTURE_TAXONOMY))
    .catch(() => FIXTURE_TAXONOMY);
  return taxonomy;
}

/** topics.embedding by slug, cached per process (empty when the DB has none yet). */
export function loadTopicEmbeddings(): Promise<Record<TopicSlug, Float32Array>> {
  topicEmb ??= (async () => {
    const { data, error } = await createSupabaseAdminClient().from('topics').select('slug, embedding').not('embedding', 'is', null);
    if (error) throw new Error(`loadTopicEmbeddings: ${error.message}`);
    const out: Record<TopicSlug, Float32Array> = {};
    for (const r of (data ?? []) as { slug: string; embedding: string | null }[]) {
      const v = parseVector(r.embedding);
      if (v) out[r.slug] = v;
    }
    return out;
  })().catch((e) => {
    topicEmb = null; // retry next time
    throw e;
  });
  return topicEmb;
}
