// Extractive backfill: every `embedded` article becomes rankable `fallback` stock right away, with
// enriched_at = null, so the next runEnrich upgrades it with Gemini (Task 4 of the L2 plan).
// With from = 'unusable' it revives articles Gemini rejected (e.g. after the usable rule changed).
import pLimit from 'p-limit';
import { createSupabaseAdminClient } from '@/server/db/admin';
import { selectPaged } from '@/server/nlp/paged';
import { extractiveUpdate } from './extractive';

export async function extractiveBackfill(from: 'embedded' | 'unusable' = 'embedded'): Promise<number> {
  const db = createSupabaseAdminClient();
  const rows = await selectPaged((start, end) =>
    db.from('articles').select('id, title, lede, content_text').eq('status', from).order('id').range(start, end),
  );
  const limit = pLimit(10);
  await Promise.all(
    rows.map((r) =>
      limit(async () => {
        const patch = { ...extractiveUpdate({ title: r.title, lede: r.lede, contentText: r.content_text }), enriched_at: null };
        const { error } = await db.from('articles').update(patch).eq('id', r.id).eq('status', from);
        if (error) throw new Error(`articles update ${r.id}: ${error.message}`);
      }),
    ),
  );
  return rows.length;
}
