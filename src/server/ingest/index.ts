// L1 Ingest (§9.3, §10.1): every source → `articles` (status 'raw'). Used by scripts/job-ingest.ts
// (the worker, which writes the job='ingest' job_runs row) and /api/cron/ingest (job='ingest-cron').
// runIngest itself never writes job_runs (§9.7).
import pLimit from 'p-limit';
import { requestNow } from '@/server/time';
import { prepareArticle } from './prepare';
import { failedResult, processSource } from './source';
import { ensureApiSources, findExistingHashes, insertArticles, loadSources, recordSourceHealth } from './store';
import type { PreparedArticle, SourceResult } from './types';

export interface IngestStats { sources: number; fetched: number; inserted: number; skippedOld: number; failedSources: string[]; ms: number; }

export const DEFAULT_MAX_PER_SOURCE = 60;
export const DEFAULT_SINCE_HOURS = 48;
export const SOURCE_CONCURRENCY = 8;

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

// Two feeds of one outlet can carry the same story: keep the copy with an image, then the longer text.
const better = (a: PreparedArticle, b: PreparedArticle) =>
  Number(!!a.imageUrl) !== Number(!!b.imageUrl) ? (a.imageUrl ? a : b) : a.wordCount >= b.wordCount ? a : b;

export async function runIngest(opts?: { sourceIds?: string[]; maxPerSource?: number; sinceHours?: number }): Promise<IngestStats> {
  const t0 = performance.now();
  const now = await requestNow();
  const o = { sinceHours: opts?.sinceHours ?? DEFAULT_SINCE_HOURS, maxPerSource: opts?.maxPerSource ?? DEFAULT_MAX_PER_SOURCE };

  try {
    await ensureApiSources();
  } catch (err) {
    console.warn(`ingest: ensureApiSources failed (${message(err)}); continuing with the seeded sources`);
  }
  const sources = await loadSources(opts?.sourceIds);

  // 1. Every source through a pool of 8. A throw becomes a failed result; health is written per source.
  const limit = pLimit(SOURCE_CONCURRENCY);
  const results: SourceResult[] = await Promise.all(
    sources.map((src) =>
      limit(async () => {
        let result: SourceResult;
        try {
          result = await processSource(src, now, o);
        } catch (err) {
          result = failedResult(src, now, err);
        }
        try {
          await recordSourceHealth(src, result);
        } catch (err) {
          console.warn(`ingest: health not recorded for ${src.id} (${message(err)})`);
        }
        return result;
      }),
    ),
  );

  // 2. Canonicalize, hash and dedupe in memory, then against the DB.
  const byHash = new Map<string, PreparedArticle>();
  for (const r of results) {
    for (const raw of r.items) {
      const a = prepareArticle(raw, null, now);
      if (!a) continue;
      const prev = byHash.get(a.urlHash);
      byHash.set(a.urlHash, prev ? better(prev, a) : a);
    }
  }
  const existing = byHash.size ? await findExistingHashes([...byHash.keys()]) : new Set<string>();
  const fresh = [...byHash.values()].filter((a) => !existing.has(a.urlHash));

  // 3. Insert (ON CONFLICT (url_hash) DO NOTHING).
  const { inserted, errors, bySource } = fresh.length ? await insertArticles(fresh) : { inserted: 0, errors: [], bySource: {} };

  const stats: IngestStats = {
    sources: sources.length,
    fetched: results.reduce((n, r) => n + r.fetched, 0),
    inserted,
    skippedOld: results.reduce((n, r) => n + r.skippedOld, 0),
    failedSources: results.filter((r) => !r.ok).map((r) => r.sourceId),
    ms: Math.round(performance.now() - t0),
  };
  const withImage = fresh.filter((a) => a.imageUrl).length;
  console.info(
    `ingest detail ${JSON.stringify({
      imageShare: fresh.length ? Number((withImage / fresh.length).toFixed(3)) : null,
      candidates: fresh.length,
      insertedBySource: bySource ?? {},
      insertErrors: errors,
    })}`,
  );
  return stats;
}
