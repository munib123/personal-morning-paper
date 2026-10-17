// npm run seed: loads the taxonomy into `topics` and the 117 sources into `sources` (ARCHITECTURE §8, §9.7).
// Idempotent upserts. Topics go in level order so every parent exists first, and `embedding` is never
// sent, so a re-seed keeps L2's topic embeddings. Sources send only id/name/url/kind/homepage/region/topics,
// so quality, active and the fetch-health columns that L1 maintains are never reset.
import './lib/env';

import { readFileSync } from 'node:fs';

import { createSupabaseAdminClient } from '@/server/db/admin';

import { selectSources, topicRows, type FeedEntry } from './lib/seed-data';

async function main(): Promise<void> {
  // Build and validate every row first, so a data error never leaves a half-written seed.
  const topics = topicRows(); // seed/taxonomy.json + seed/topic-extras.json
  const sources = selectSources(JSON.parse(readFileSync('seed/feeds.json', 'utf8')) as FeedEntry[]);

  const db = createSupabaseAdminClient();
  for (const level of [1, 2, 3] as const) {
    const rows = topics.filter((t) => t.level === level);
    if (rows.length === 0) continue;
    const { error } = await db.from('topics').upsert(rows, { onConflict: 'slug' });
    if (error) throw new Error(`topics (level ${level}): ${error.message}`);
  }

  const { error: sourcesError } = await db.from('sources').upsert(sources, { onConflict: 'id' });
  if (sourcesError) throw new Error(`sources: ${sourcesError.message}`);

  const [topicCount, sourceCount] = await Promise.all([
    db.from('topics').select('*', { count: 'exact', head: true }),
    db.from('sources').select('*', { count: 'exact', head: true }),
  ]);
  if (topicCount.error) throw new Error(`count topics: ${topicCount.error.message}`);
  if (sourceCount.error) throw new Error(`count sources: ${sourceCount.error.message}`);
  console.log(`topics=${topicCount.count} sources=${sourceCount.count}`);
}

main().catch((err: unknown) => {
  console.error(`seed failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
