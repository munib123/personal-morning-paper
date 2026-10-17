// Every Supabase read and write of the ingest lane (L1). Uses the admin (secret key) client.
import type { Json, TablesInsert } from '@/contracts/database.types';
import { createSupabaseAdminClient } from '@/server/db/admin';
import { nextHealth } from './health';
import type { FeedCache, IngestSource, PreparedArticle, SourceKind, SourceResult } from './types';

const db = () => createSupabaseAdminClient();

const KINDS: readonly SourceKind[] = ['rss', 'hn', 'devto', 'arxiv'];
const isKind = (k: string): k is SourceKind => (KINDS as readonly string[]).includes(k);

export const HASH_CHUNK = 100;
export const INSERT_CHUNK = 200;

const chunks = <T>(xs: T[], n: number): T[][] => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, (i + 1) * n));

/** sources.last_status → FeedCache; anything that is not our JSON shape is null. */
export function parseCache(raw: string | null): FeedCache | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<FeedCache> | null;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    return {
      httpStatus: typeof v.httpStatus === 'number' ? v.httpStatus : null,
      etag: typeof v.etag === 'string' ? v.etag : null,
      lastModified: typeof v.lastModified === 'string' ? v.lastModified : null,
      error: typeof v.error === 'string' ? v.error : null,
      items: typeof v.items === 'number' ? v.items : 0,
      at: typeof v.at === 'string' ? v.at : '',
    };
  } catch {
    return null;
  }
}

/** Active sources (optionally only these ids). Rows of a kind we have no adapter for are skipped. */
export async function loadSources(sourceIds?: string[]): Promise<IngestSource[]> {
  let q = db().from('sources').select('id,name,url,kind,homepage,last_status,fail_count').eq('active', true);
  if (sourceIds?.length) q = q.in('id', sourceIds);
  const { data, error } = await q;
  if (error) throw new Error(`load sources: ${error.message}`);
  return (data ?? [])
    .filter((r) => isKind(r.kind))
    .map((r) => ({
      id: r.id,
      name: r.name,
      url: r.url,
      kind: r.kind as SourceKind,
      homepage: r.homepage,
      cache: parseCache(r.last_status),
      failCount: r.fail_count,
    }));
}

/** The keyless API sources L1 has adapters for. L0 seeds them (§9.7); these rows are only the fallback. */
export const API_SOURCES: TablesInsert<'sources'>[] = [
  {
    id: 'hacker-news',
    name: 'Hacker News',
    kind: 'hn',
    url: 'https://hacker-news.firebaseio.com/v0/topstories.json',
    homepage: 'https://news.ycombinator.com',
    region: 'global',
    topics: ['technical.cs'],
  },
  {
    id: 'dev-to',
    name: 'DEV Community',
    kind: 'devto',
    url: 'https://dev.to/api/articles',
    homepage: 'https://dev.to',
    region: 'global',
    topics: ['technical.cs.web-dev', 'technical.cs.languages-tools'],
  },
  {
    id: 'arxiv',
    name: 'arXiv',
    kind: 'arxiv',
    url: 'https://export.arxiv.org/api/query',
    homepage: 'https://arxiv.org',
    region: 'global',
    topics: ['technical.cs.research', 'technical.cs.ai-ml'],
  },
];

/**
 * Safety net for the L0-seeded API rows (§9.7): reads every source's kind (active or not) and
 * inserts the API rows whose kind has no row at all (`ON CONFLICT (url) DO NOTHING`).
 */
export async function ensureApiSources(): Promise<void> {
  const { data, error } = await db().from('sources').select('kind');
  if (error) throw new Error(`api sources: ${error.message}`);
  const present = new Set((data ?? []).map((r) => r.kind));
  const missing = API_SOURCES.filter((s) => !present.has(s.kind));
  if (missing.length === 0) return;
  const { error: upsertError } = await db().from('sources').upsert(missing, { onConflict: 'url', ignoreDuplicates: true });
  if (upsertError) throw new Error(`api sources: ${upsertError.message}`);
  console.info(`ingest: ensureApiSources inserted ${missing.map((s) => s.id).join(', ')}`);
}

/** Which of these url_hashes are already in `articles`. Throws on a query error (never insert blind). */
export async function findExistingHashes(hashes: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (const part of chunks([...new Set(hashes)], HASH_CHUNK)) {
    const { data, error } = await db().from('articles').select('url_hash').in('url_hash', part);
    if (error) throw new Error(`existing hashes: ${error.message}`);
    for (const r of data ?? []) found.add(r.url_hash);
  }
  return found;
}

export function toArticleRow(a: PreparedArticle): TablesInsert<'articles'> {
  return {
    source_id: a.sourceId,
    url: a.url,
    url_hash: a.urlHash,
    title: a.title,
    lede: a.lede,
    content_text: a.contentText,
    image_url: a.imageUrl,
    author: a.author,
    published_at: a.publishedAt,
    word_count: a.wordCount,
    lang: 'en',
    status: 'raw',
  };
}

/**
 * Bulk insert, chunks of 200, `ON CONFLICT (url_hash) DO NOTHING`. `.select()` returns only the rows
 * actually inserted, so `inserted` and `bySource` are exact. A failing chunk is recorded in `errors`
 * and the other chunks still go in; this never throws.
 */
export async function insertArticles(rows: PreparedArticle[]): Promise<{ inserted: number; errors: string[]; bySource: Record<string, number> }> {
  const out = { inserted: 0, errors: [] as string[], bySource: {} as Record<string, number> };
  for (const part of chunks(rows, INSERT_CHUNK)) {
    try {
      const { data, error } = await db()
        .from('articles')
        .upsert(part.map(toArticleRow), { onConflict: 'url_hash', ignoreDuplicates: true })
        .select('id,source_id');
      if (error) {
        out.errors.push(error.message);
        continue;
      }
      for (const r of data ?? []) {
        out.inserted += 1;
        out.bySource[r.source_id] = (out.bySource[r.source_id] ?? 0) + 1;
      }
    } catch (err) {
      out.errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  return out;
}

// ── Image backfill (run-cli --backfill-images) ────────────────────────────────────────────────

/** Rows published in the last `sinceHours` that still have no image, newest first. */
export async function listImageless(sinceHours: number, limit: number): Promise<{ urlHash: string; url: string }[]> {
  const cutoff = new Date(Date.now() - sinceHours * 3_600_000).toISOString();
  const { data, error } = await db()
    .from('articles')
    .select('url_hash,url')
    .is('image_url', null)
    .gte('published_at', cutoff)
    .order('published_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`imageless articles: ${error.message}`);
  return (data ?? []).map((r) => ({ urlHash: r.url_hash, url: r.url }));
}

/** Sets image_url where it is still null; returns how many rows changed. A failing row is skipped. */
export async function updateArticleImages(rows: { urlHash: string; imageUrl: string }[]): Promise<number> {
  let updated = 0;
  for (const r of rows) {
    const { data, error } = await db().from('articles').update({ image_url: r.imageUrl }).eq('url_hash', r.urlHash).is('image_url', null).select('id');
    if (error) {
      console.warn(`ingest: image not saved for ${r.urlHash} (${error.message})`);
      continue;
    }
    updated += data?.length ?? 0;
  }
  return updated;
}

/**
 * Health after each fetch: last_fetched_at, the FeedCache JSON in last_status, and fail_count /
 * active from nextHealth (inactive after 5 failures in a row).
 */
export async function recordSourceHealth(source: IngestSource, result: SourceResult): Promise<void> {
  const health = nextHealth(source, result.ok);
  const patch = {
    last_fetched_at: result.cache.at || new Date().toISOString(),
    last_status: JSON.stringify(result.cache),
    fail_count: health.failCount,
    active: health.active,
  };
  const { error } = await db().from('sources').update(patch).eq('id', source.id);
  if (error) throw new Error(`source health ${source.id}: ${error.message}`);
  if (!health.active) console.warn(`ingest: ${source.id} deactivated after ${health.failCount} failures in a row (${result.cache.error ?? 'unknown error'})`);
}

/** Active/inactive source counts by kind (run-cli --sources). */
export async function sourceKindCounts(): Promise<Record<string, { active: number; inactive: number }>> {
  const { data, error } = await db().from('sources').select('kind,active');
  if (error) throw new Error(`source counts: ${error.message}`);
  const out: Record<string, { active: number; inactive: number }> = {};
  for (const r of data ?? []) {
    out[r.kind] ??= { active: 0, inactive: 0 };
    out[r.kind][r.active ? 'active' : 'inactive'] += 1;
  }
  return out;
}

// ── job_runs: used ONLY by the cron route (§9.7: runIngest never writes job_runs) ──────────────

export async function startJobRun(job: 'ingest-cron'): Promise<number | null> {
  try {
    const { data, error } = await db().from('job_runs').insert({ job }).select('id').single();
    if (error) throw new Error(error.message);
    return data.id;
  } catch (err) {
    console.warn(`ingest: job_runs row not started (${err instanceof Error ? err.message : String(err)})`);
    return null;
  }
}

export async function finishJobRun(id: number | null, status: 'ok' | 'error', stats: Record<string, unknown>): Promise<void> {
  if (id === null) return;
  try {
    const { error } = await db()
      .from('job_runs')
      .update({ finished_at: new Date().toISOString(), status, stats: JSON.parse(JSON.stringify(stats)) as Json })
      .eq('id', id);
    if (error) throw new Error(error.message);
  } catch (err) {
    console.warn(`ingest: job_runs row ${id} not finished (${err instanceof Error ? err.message : String(err)})`);
  }
}
