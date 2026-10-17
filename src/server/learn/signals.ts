// processSignals (§9.3): the ONE pipeline for /api/events, /r/[articleId] and weight edits.
//   load model → log the rows (server local_date) → applySignal per article event → save → streaks → EventsResult
import type { Candidate } from '@/contracts/engine';
import type { Json } from '@/contracts/database.types';
import type { EventsResult, SignalEvent, WeightDelta } from '@/contracts/signals';
import type { TopicSlug } from '@/contracts/taxonomy';
import { FIXTURE_EVENTS_RESULT } from '@/contracts/fixtures';
import { createSupabaseAdminClient } from '@/server/db/admin';
import { CANDIDATE_COLUMNS, rowToCandidate, type CandidateRow } from '@/server/edition/pool';
import { loadTaxonomy } from '@/server/edition/taxonomy';
import { getProfile, isFixtureUser } from '@/server/profile';
import { DEFAULT_PARAMS } from '@/server/rank/params';
import { recordActivity } from '@/server/streaks';
import { localDate } from '@/server/time';
import { toastFor } from './copy';
import { applySignal, mergeDeltas, withNames } from './signal';
import { loadUserModel, saveUserModel } from './store';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_TZ = 'Asia/Karachi';

const articleIdOf = (ev: SignalEvent): string | undefined => {
  const id = ev.articleId ?? (typeof ev.meta?.articleId === 'string' ? ev.meta.articleId : undefined);
  return id && UUID.test(id) ? id : undefined;
};

/** "Cricket +4%" for the biggest move an event caused (shown in the /me timeline). */
const effectOf = (d: WeightDelta[]): string | null => {
  const top = mergeDeltas(d)[0];
  if (!top) return null;
  const pts = Math.round((top.after - top.before) * 100);
  return pts === 0 ? null : `${top.name} ${pts > 0 ? '+' : ''}${pts}%`;
};

export async function processSignals(userId: string, events: SignalEvent[], now: Date): Promise<EventsResult> {
  if (isFixtureUser(userId)) return { ...FIXTURE_EVENTS_RESULT, accepted: events.length };
  const db = createSupabaseAdminClient();
  const profile = await getProfile(userId);
  const tz = profile?.tz ?? DEFAULT_TZ;
  const date = localDate(now, tz);

  const articleIds = [...new Set(events.map(articleIdOf).filter((x): x is string => !!x))];
  const editionIds = [...new Set(events.map((e) => e.editionId).filter((x): x is string => !!x && UUID.test(x)))];
  const [model0, taxonomy, articles, editions] = await Promise.all([
    loadUserModel(userId, { targetDate: date }),
    loadTaxonomy(),
    articleIds.length ? db.from('articles').select(CANDIDATE_COLUMNS).in('id', articleIds) : Promise.resolve({ data: [], error: null }),
    editionIds.length ? db.from('editions').select('id, user_id, edition_items(article_id, rank)').in('id', editionIds).eq('user_id', userId) : Promise.resolve({ data: [], error: null }),
  ]);
  if (articles.error) throw new Error(`processSignals articles: ${articles.error.message}`);
  if (editions.error) throw new Error(`processSignals editions: ${editions.error.message}`);
  const cands = new Map<string, Candidate>(((articles.data ?? []) as unknown as CandidateRow[]).map((r) => [r.id, rowToCandidate(r)]));
  const ownEditions = new Map(
    ((editions.data ?? []) as unknown as { id: string; edition_items: { article_id: string; rank: number }[] | null }[]).map((e) => [e.id, (e.edition_items ?? []).filter((i) => i.rank <= 20).map((i) => i.article_id)]),
  );

  // pdf_download teaches a little about every story of that paper (§9.7): fetch those articles too.
  const pdfIds = [...new Set(events.filter((e) => e.type === 'pdf_download' && e.editionId && ownEditions.has(e.editionId)).flatMap((e) => ownEditions.get(e.editionId!)!))].filter((id) => !cands.has(id));
  if (pdfIds.length) {
    const r = await db.from('articles').select(CANDIDATE_COLUMNS).in('id', pdfIds);
    if (r.error) throw new Error(`processSignals pdf articles: ${r.error.message}`);
    for (const row of (r.data ?? []) as unknown as CandidateRow[]) cands.set(row.id, rowToCandidate(row));
  }

  let model = model0;
  const all: WeightDelta[] = [];
  const touched = new Set<TopicSlug>();
  let toast: string | null = null;
  const rows = events.map((ev) => {
    const evDeltas: WeightDelta[] = [];
    const learn = (e: SignalEvent, item: Candidate | null) => {
      const r = applySignal(model, e, item, DEFAULT_PARAMS);
      model = r.model;
      evDeltas.push(...r.deltas);
    };
    const aid = articleIdOf(ev);
    const item = aid ? (cands.get(aid) ?? null) : null;
    if (ev.type === 'pdf_download' && ev.editionId && ownEditions.has(ev.editionId)) {
      for (const id of ownEditions.get(ev.editionId)!) {
        const c = cands.get(id);
        if (c) learn({ ...ev, articleId: id }, c);
      }
    } else {
      learn(ev, item);
    }
    const named = withNames(evDeltas, taxonomy);
    for (const d of named) touched.add(d.slug);
    all.push(...named);
    toast = toastFor(ev, item, taxonomy) ?? toast;
    const effect = effectOf(named);
    const meta: Record<string, string | number | boolean> = { ...(ev.meta ?? {}) };
    if (effect) meta.effect = effect;
    return {
      user_id: userId,
      edition_id: ev.editionId && ownEditions.has(ev.editionId) ? ev.editionId : null,
      article_id: item ? item.id : null,
      type: ev.type,
      value: ev.value ?? null,
      meta: meta as Json,
      occurred_at: now.toISOString(),
      local_date: date,
    };
  });

  const ins = await db.from('events').insert(rows);
  if (ins.error) throw new Error(`processSignals events: ${ins.error.message}`);
  const changed = touched.size > 0 || model.nEngaged !== model0.nEngaged || model.pos !== model0.pos || model.neg !== model0.neg;
  if (changed) {
    const known = new Set(taxonomy.map((t) => t.slug)); // user_interests.slug references topics
    const interests = Object.fromEntries([...touched].filter((s) => known.has(s) && model.interests[s]).map((s) => [s, model.interests[s]]));
    await saveUserModel({ ...model, interests });
  }
  const streak = await recordActivity(userId, events, now, tz);
  return { accepted: events.length, streak, deltas: mergeDeltas(all).slice(0, 5), toast };
}
