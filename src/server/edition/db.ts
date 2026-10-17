// The edition tables (editions, edition_items, interest_snapshots) and the reads buildEdition needs.
// Thin queries only; the orchestration lives in build.ts / read.ts.
import type { RecallQuestion } from '@/contracts/article';
import type { Json } from '@/contracts/database.types';
import type { TopicSlug } from '@/contracts/taxonomy';
import { createSupabaseAdminClient } from '@/server/db/admin';
import { addDays } from '@/server/time';
import { ARTICLE_COLUMNS, toRecall, type ArticleRow } from './hydrate';

const db = () => createSupabaseAdminClient();

/** A Postgres error that keeps its SQLSTATE code (23505 = unique violation). */
export class DbError extends Error {
  constructor(
    what: string,
    readonly code: string | undefined,
    message: string | undefined,
  ) {
    super(`${what}: ${message ?? 'unknown error'}`);
  }
}

function check<T>(what: string, r: { data: T; error: { code?: string; message?: string } | null }): T {
  if (r.error) throw new DbError(what, r.error.code, r.error.message);
  return r.data;
}

const json = (v: unknown): Json => v as Json;

export interface EditionItemRow {
  rank: number;
  article_id: string;
  slot: string;
  section_slug: string;
  tier: string;
  score: number;
  breakdown: unknown;
  reasons: unknown;
}

export interface EditionRow {
  id: string;
  user_id: string;
  edition_date: string;
  number: number;
  paper_name: string;
  editor_note: string;
  editor_note_source: string;
  section_order: string[];
  lead_article_id: string;
  recall: unknown;
  presentation: unknown;
  receipt: unknown;
  pdf_path: string | null;
  created_at: string;
  edition_items: EditionItemRow[] | null;
}

export const EDITION_COLUMNS =
  'id, user_id, edition_date, number, paper_name, editor_note, editor_note_source, section_order, lead_article_id, recall, presentation, receipt, pdf_path, created_at, edition_items(rank, article_id, slot, section_slug, tier, score, breakdown, reasons)';

export async function findEditionRow(userId: string, date: string): Promise<{ id: string; number: number } | null> {
  const r = await db().from('editions').select('id, number').eq('user_id', userId).eq('edition_date', date).maybeSingle();
  return check('findEditionRow', r) as { id: string; number: number } | null;
}

export async function readEditionRow(userId: string, date: string): Promise<EditionRow | null> {
  const r = await db().from('editions').select(EDITION_COLUMNS).eq('user_id', userId).eq('edition_date', date).maybeSingle();
  return check('readEditionRow', r) as unknown as EditionRow | null;
}

export async function countEditionsBefore(userId: string, date: string): Promise<number> {
  const r = await db().from('editions').select('id', { count: 'exact', head: true }).eq('user_id', userId).lt('edition_date', date);
  if (r.error) throw new DbError('countEditionsBefore', r.error.code, r.error.message);
  return r.count ?? 0;
}

/** Yesterday's paper (the latest before `date`): its items with their MCQs, and the reader's qualifying reads of it. */
export async function previousEditionForRecall(
  userId: string,
  date: string,
): Promise<{ prev: { articleId: string; rank: number; recall: RecallQuestion | null }[]; reads: { articleId: string; at: string }[] }> {
  // Both queries in one round trip: the reads come from the last 7 days and are matched to the paper's items.
  const [edition, events] = await Promise.all([
    db()
      .from('editions')
      .select('id, edition_date, edition_items(article_id, rank, articles(recall))')
      .eq('user_id', userId)
      .lt('edition_date', date)
      .order('edition_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    db()
      .from('events')
      .select('article_id, type, value, occurred_at, local_date')
      .eq('user_id', userId)
      .in('type', ['open', 'dwell', 'read_original'])
      .not('article_id', 'is', null)
      .gte('local_date', addDays(date, -7))
      .lte('local_date', date)
      .limit(5000),
  ]);
  const e = check('previousEdition', edition) as unknown as {
    id: string;
    edition_date: string;
    edition_items: { article_id: string; rank: number; articles: { recall: unknown } | null }[] | null;
  } | null;
  if (!e) return { prev: [], reads: [] };
  const prev = (e.edition_items ?? [])
    .filter((i) => i.rank <= 20)
    .map((i) => ({ articleId: i.article_id, rank: i.rank, recall: toRecall(i.article_id, i.articles?.recall ?? null) }));
  const ids = new Set(prev.map((p) => p.articleId));
  const evs = (check('previousEditionReads', events) as { article_id: string; type: string; value: number | null; occurred_at: string; local_date: string }[]).filter(
    (ev) => ids.has(ev.article_id) && ev.local_date >= e.edition_date,
  );
  const per = new Map<string, { open: boolean; dwell: number; original: boolean; at: string }>();
  for (const ev of evs) {
    const cur = per.get(ev.article_id) ?? { open: false, dwell: 0, original: false, at: ev.occurred_at };
    if (ev.type === 'open') cur.open = true;
    if (ev.type === 'dwell') cur.dwell = Math.max(cur.dwell, ev.value ?? 0);
    if (ev.type === 'read_original') cur.original = true;
    if (Date.parse(ev.occurred_at) > Date.parse(cur.at)) cur.at = ev.occurred_at;
    per.set(ev.article_id, cur);
  }
  const reads = [...per.entries()].filter(([, v]) => (v.open && v.dwell >= 20_000) || v.original).map(([articleId, v]) => ({ articleId, at: v.at }));
  return { prev, reads };
}

/** The latest interest snapshot dated before `date` (or on it, with `inclusive`). */
export async function snapshotBefore(userId: string, date: string, inclusive = false): Promise<{ date: string; weights: Record<TopicSlug, number> } | null> {
  let q = db().from('interest_snapshots').select('snap_date, weights').eq('user_id', userId);
  q = inclusive ? q.lte('snap_date', date) : q.lt('snap_date', date);
  const r = check('snapshotBefore', await q.order('snap_date', { ascending: false }).limit(1).maybeSingle()) as { snap_date: string; weights: unknown } | null;
  return r ? { date: r.snap_date, weights: (r.weights ?? {}) as Record<TopicSlug, number> } : null;
}

export async function earliestSnapshot(userId: string): Promise<{ date: string; weights: Record<TopicSlug, number> } | null> {
  const r = check(
    'earliestSnapshot',
    await db().from('interest_snapshots').select('snap_date, weights').eq('user_id', userId).order('snap_date', { ascending: true }).limit(1).maybeSingle(),
  ) as { snap_date: string; weights: unknown } | null;
  return r ? { date: r.snap_date, weights: (r.weights ?? {}) as Record<TopicSlug, number> } : null;
}

export async function fetchArticleRows(ids: string[]): Promise<ArticleRow[]> {
  if (ids.length === 0) return [];
  return check('fetchArticleRows', await db().from('articles').select(ARTICLE_COLUMNS).in('id', ids)) as unknown as ArticleRow[];
}

/** Source names per cluster (for "Also covered by"). */
export async function fetchClusterSources(clusterIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (clusterIds.length === 0) return out;
  const rows = check('fetchClusterSources', await db().from('articles').select('cluster_id, source_id, sources(name)').in('cluster_id', clusterIds).limit(2000)) as unknown as {
    cluster_id: string | null;
    source_id: string;
    sources: { name: string } | null;
  }[];
  for (const r of rows ?? []) {
    if (!r.cluster_id) continue;
    const list = out.get(r.cluster_id) ?? [];
    const name = r.sources?.name ?? r.source_id;
    if (!list.includes(name)) list.push(name);
    out.set(r.cluster_id, list);
  }
  return out;
}

export interface EditionInsert {
  user_id: string;
  edition_date: string;
  number: number;
  paper_name: string;
  editor_note: string;
  editor_note_source: 'template' | 'gemini';
  section_order: string[];
  lead_article_id: string;
  recall: unknown;
  presentation: unknown;
  receipt: unknown;
  algo_version: string;
  params: unknown;
  pdf_path: null;
}

/** Insert (first build) or upsert on (user_id, edition_date) (forced rebuild, keeps the id). Returns the id. */
export async function writeEditionRow(row: EditionInsert, upsert: boolean): Promise<string> {
  const payload = { ...row, recall: json(row.recall), presentation: json(row.presentation), receipt: json(row.receipt), params: json(row.params) };
  const q = upsert ? db().from('editions').upsert(payload, { onConflict: 'user_id,edition_date' }) : db().from('editions').insert(payload);
  const r = check('writeEditionRow', await q.select('id').single()) as { id: string };
  return r.id;
}

export async function deleteEditionItems(editionId: string): Promise<void> {
  check('deleteEditionItems', await db().from('edition_items').delete().eq('edition_id', editionId));
}

export async function insertEditionItems(editionId: string, items: EditionItemRow[]): Promise<void> {
  if (items.length === 0) return;
  const rows = items.map((i) => ({ ...i, edition_id: editionId, breakdown: json(i.breakdown), reasons: json(i.reasons) }));
  check('insertEditionItems', await db().from('edition_items').insert(rows));
}

export async function upsertSnapshot(userId: string, date: string, weights: Record<TopicSlug, number>): Promise<void> {
  check('upsertSnapshot', await db().from('interest_snapshots').upsert({ user_id: userId, snap_date: date, weights: json(weights) }, { onConflict: 'user_id,snap_date' }));
}

export async function updateEditionRow(id: string, patch: { editor_note?: string; editor_note_source?: 'gemini' | 'template'; receipt?: unknown }): Promise<void> {
  const p: { editor_note?: string; editor_note_source?: string; receipt?: Json } = { ...patch, receipt: patch.receipt === undefined ? undefined : json(patch.receipt) };
  if (p.receipt === undefined) delete p.receipt;
  check('updateEditionRow', await db().from('editions').update(p).eq('id', id));
}

export async function archiveRows(userId: string, limit: number): Promise<{ id: string; edition_date: string; number: number; pdf_path: string | null; articles: { headline: string | null; title: string } | null }[]> {
  const r = await db()
    .from('editions')
    .select('id, edition_date, number, pdf_path, articles(headline, title)')
    .eq('user_id', userId)
    .order('edition_date', { ascending: false })
    .limit(limit);
  return (check('archiveRows', r) ?? []) as unknown as { id: string; edition_date: string; number: number; pdf_path: string | null; articles: { headline: string | null; title: string } | null }[];
}

export async function activityByDate(userId: string, dates: string[]): Promise<Map<string, { storiesRead: number; qualifyingReads: number }>> {
  const out = new Map<string, { storiesRead: number; qualifyingReads: number }>();
  if (dates.length === 0) return out;
  const rows = check('activityByDate', await db().from('daily_activity').select('local_date, stories_read, qualifying_reads').eq('user_id', userId).in('local_date', dates)) as {
    local_date: string;
    stories_read: number;
    qualifying_reads: number;
  }[];
  for (const r of rows ?? []) out.set(r.local_date, { storiesRead: r.stories_read, qualifyingReads: r.qualifying_reads });
  return out;
}
