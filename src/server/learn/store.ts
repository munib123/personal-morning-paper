// Supabase load/save of the UserModel (ARCHITECTURE §9.3) and the event log the refold replays.
import type { EngagedItem, InterestState, UserModel } from '@/contracts/engine';
import type { Depth, Lang, TimeBudget } from '@/contracts/profile';
import type { SignalEvent } from '@/contracts/signals';
import type { TopicSlug } from '@/contracts/taxonomy';
import { createSupabaseAdminClient } from '@/server/db/admin';
import { parseVector, toPgVector } from '@/server/db/vector';
import { addDays } from '@/server/time';
import { CANDIDATE_COLUMNS, rowToCandidate, type CandidateRow } from '@/server/edition/pool';
import { RANK_V1_FIXED } from '@/server/rank/params';
import type { LoggedEvent } from './refold';

const ENGAGED_TYPES = ['open', 'read_original', 'qr_scan', 'save', 'share', 'more'] as const;
const DAY_MS = 86_400_000;

export const asTimeBudget = (v: unknown): TimeBudget => (v === 5 || v === 15 || v === 30 ? v : 15);
export const asDepth = (v: unknown): Depth => (v === 'new' || v === 'expert' ? v : 'basics');
export const asLang = (v: unknown): Lang => (v === 'ur' ? 'ur' : 'en');
const asDepthPref = (v: unknown): -1 | 0 | 1 => (v === -1 || v === 1 ? v : 0);

function fail(what: string, error: { message?: string } | null): never {
  throw new Error(`${what}: ${error?.message ?? 'unknown error'}`);
}

type Meta = Record<string, string | number | boolean>;
const asMeta = (m: unknown): Meta => (m && typeof m === 'object' && !Array.isArray(m) ? (m as Meta) : {});

/**
 * The reader's model: interests, profile embeddings and presentation, plus the derived exclusion lists.
 * seenArticleIds = rank ≤ 20 items of the last 7 editions dated before `targetDate` (a rebuild never
 * excludes its own paper); dismissed = clusters skipped in the last 7 days; muted = hidden sources;
 * engaged = distinct articles read in the last 14 days, newest first, at most 50.
 */
export async function loadUserModel(userId: string, opts: { targetDate?: string } = {}): Promise<UserModel> {
  const db = createSupabaseAdminClient();
  const target = opts.targetDate;

  let editionsQ = db.from('editions').select('id, edition_date, edition_items(article_id, rank)').eq('user_id', userId);
  if (target) editionsQ = editionsQ.lt('edition_date', target);
  let skipsQ = db.from('events').select('article_id, articles(cluster_id)').eq('user_id', userId).eq('type', 'skip');
  if (target) skipsQ = skipsQ.gte('local_date', addDays(target, -7));
  let engagedQ = db
    .from('events')
    .select('article_id, occurred_at, articles(id, embedding, headline, title)')
    .eq('user_id', userId)
    .in('type', [...ENGAGED_TYPES])
    .not('article_id', 'is', null);
  if (target) engagedQ = engagedQ.gte('local_date', addDays(target, -RANK_V1_FIXED.engagedDays));

  const [profile, interests, editions, skips, hides, engaged] = await Promise.all([
    db.from('profiles').select('pos_emb, neg_emb, n_engaged, depth_pref, time_budget, depth, lang').eq('user_id', userId).maybeSingle(),
    db.from('user_interests').select('slug, alpha, beta, prior_alpha, prior_beta, picked, muted, pinned').eq('user_id', userId),
    editionsQ.order('edition_date', { ascending: false }).limit(RANK_V1_FIXED.seenEditions),
    skipsQ.limit(2000),
    db.from('events').select('meta, articles(source_id)').eq('user_id', userId).eq('type', 'hide_source').limit(2000),
    engagedQ.order('occurred_at', { ascending: false }).limit(1000),
  ]);
  for (const [what, r] of [['profiles', profile], ['user_interests', interests], ['editions', editions], ['skips', skips], ['hides', hides], ['engaged', engaged]] as const) {
    if (r.error) fail(`loadUserModel ${what}`, r.error);
  }

  const p = profile.data as { pos_emb: string | null; neg_emb: string | null; n_engaged: number; depth_pref: number; time_budget: number; depth: string; lang: string } | null;
  const model: UserModel = {
    userId,
    interests: {},
    pos: parseVector(p?.pos_emb ?? null),
    neg: parseVector(p?.neg_emb ?? null),
    nEngaged: p?.n_engaged ?? 0,
    depthPref: asDepthPref(p?.depth_pref),
    presentation: { timeBudget: asTimeBudget(p?.time_budget), depth: asDepth(p?.depth), lang: asLang(p?.lang) },
    seenArticleIds: [],
    dismissedClusterIds: [],
    mutedSourceIds: [],
    engaged: [],
  };

  for (const r of (interests.data ?? []) as { slug: string; alpha: number; beta: number; prior_alpha: number; prior_beta: number; picked: boolean; muted: boolean; pinned: boolean }[]) {
    model.interests[r.slug] = { alpha: r.alpha, beta: r.beta, priorAlpha: r.prior_alpha, priorBeta: r.prior_beta, picked: r.picked, muted: r.muted, pinned: r.pinned };
  }

  const seen = new Set<string>();
  for (const e of (editions.data ?? []) as { edition_items: { article_id: string; rank: number }[] | null }[]) {
    for (const it of e.edition_items ?? []) if (it.rank <= 20) seen.add(it.article_id);
  }
  model.seenArticleIds = [...seen];

  const dismissed = new Set<string>();
  for (const s of (skips.data ?? []) as { articles: { cluster_id: string | null } | null }[]) {
    if (s.articles?.cluster_id) dismissed.add(s.articles.cluster_id);
  }
  model.dismissedClusterIds = [...dismissed];

  const muted = new Set<string>();
  for (const h of (hides.data ?? []) as { meta: unknown; articles: { source_id: string } | null }[]) {
    const m = asMeta(h.meta);
    const sourceId = typeof m.sourceId === 'string' ? m.sourceId : h.articles?.source_id;
    if (sourceId) muted.add(sourceId);
  }
  model.mutedSourceIds = [...muted];

  const items: EngagedItem[] = [];
  const got = new Set<string>();
  for (const e of (engaged.data ?? []) as { article_id: string | null; occurred_at: string; articles: { id: string; embedding: string | null; headline: string | null; title: string } | null }[]) {
    if (!e.article_id || !e.articles || got.has(e.article_id)) continue;
    got.add(e.article_id);
    items.push({ articleId: e.article_id, embedding: parseVector(e.articles.embedding), headline: e.articles.headline ?? e.articles.title, at: e.occurred_at });
    if (items.length >= RANK_V1_FIXED.engagedMax) break;
  }
  model.engaged = items;
  return model;
}

/** Upserts every interest row and the profile's learned fields. */
export async function saveUserModel(model: UserModel): Promise<void> {
  const db = createSupabaseAdminClient();
  const rows = Object.entries(model.interests).map(([slug, s]: [TopicSlug, InterestState]) => ({
    user_id: model.userId,
    slug,
    alpha: s.alpha,
    beta: s.beta,
    prior_alpha: s.priorAlpha,
    prior_beta: s.priorBeta,
    picked: s.picked,
    muted: s.muted,
    pinned: s.pinned,
  }));
  if (rows.length > 0) {
    const { error } = await db.from('user_interests').upsert(rows, { onConflict: 'user_id,slug' });
    if (error) fail('saveUserModel user_interests', error);
  }
  const { error } = await db
    .from('profiles')
    .update({
      pos_emb: model.pos ? toPgVector(model.pos) : null,
      neg_emb: model.neg ? toPgVector(model.neg) : null,
      n_engaged: model.nEngaged,
      depth_pref: model.depthPref,
    })
    .eq('user_id', model.userId);
  if (error) fail('saveUserModel profiles', error);
}

interface EventRow {
  type: string;
  value: number | null;
  meta: unknown;
  article_id: string | null;
  edition_id: string | null;
  occurred_at: string;
  articles: CandidateRow | null;
}

/** The reader's events of the last `days` (oldest first), each with its article as a Candidate. */
export async function loadRecentEvents(userId: string, now: Date, days = 28): Promise<LoggedEvent[]> {
  const since = new Date(now.getTime() - days * DAY_MS).toISOString();
  const { data, error } = await createSupabaseAdminClient()
    .from('events')
    .select(`type, value, meta, article_id, edition_id, occurred_at, articles(${CANDIDATE_COLUMNS})`)
    .eq('user_id', userId)
    .gte('occurred_at', since)
    .lte('occurred_at', now.toISOString())
    .order('occurred_at', { ascending: true })
    .limit(5000);
  if (error) fail('loadRecentEvents', error);
  return ((data ?? []) as unknown as EventRow[]).map((r) => {
    const ev: SignalEvent = { type: r.type as SignalEvent['type'] };
    if (r.article_id) ev.articleId = r.article_id;
    if (r.edition_id) ev.editionId = r.edition_id;
    if (r.value !== null && r.value !== undefined) ev.value = r.value;
    const meta = asMeta(r.meta);
    if (Object.keys(meta).length > 0) ev.meta = meta;
    return { ev, item: r.articles ? rowToCandidate(r.articles) : null, occurredAt: r.occurred_at };
  });
}
