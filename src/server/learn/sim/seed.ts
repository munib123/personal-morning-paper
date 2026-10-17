// The demo persona (Ayesha) with 7 days of real history: her simulated week on the real pool, written as
// real editions, events, daily activity, snapshots and a streak. planDemoHistory is pure; seedDemoPersona
// does the I/O (scripts/seed-demo-persona.ts). Idempotent: it resets her rows and rewrites them.
import type { RecallQuestion } from '@/contracts/article';
import type { RankingResult } from '@/contracts/engine';
import type { OnboardingInput } from '@/contracts/profile';
import type { SignalEvent, WeightDelta } from '@/contracts/signals';
import type { TopicSlug } from '@/contracts/taxonomy';
import { BRAND } from '@/lib/brand';
import { createSupabaseAdminClient } from '@/server/db/admin';
import { toPgVector } from '@/server/db/vector';
import { buildEdition, loadCandidatePool, loadTaxonomy, loadTopicEmbeddings, moversBetween, persistEdition } from '@/server/edition';
import { firstNameOf, templateNote } from '@/server/edition/note';
import { selectRecall } from '@/server/edition/recall';
import { toRecall } from '@/server/edition/hydrate';
import { DEFAULT_PARAMS, RANK_VERSION } from '@/server/rank';
import { hashSeed, mulberry32 } from '@/server/rank/rng';
import { addDays, localDate } from '@/server/time';
import { coldStartPos, priorsFromOnboarding } from '../priors';
import { saveUserModel } from '../store';
import { thetaOf } from '../theta';
import { AYESHA, trueAffinityOf, type Persona } from './persona';
import { runLearningArm, type DayTrace } from './run';

export type TimedEvent = SignalEvent & { occurredAt: string };

export interface DemoDay {
  date: string;
  number: number;
  ranking: RankingResult;
  recall: RecallQuestion[];
  events: TimedEvent[];
  activity: { qualifyingReads: number; storiesRead: number; recallCorrect: number; recallTotal: number };
  snapshot: Record<TopicSlug, number>;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Minutes the zone is ahead of UTC at `at` (Asia/Karachi → 300). */
function tzOffsetMinutes(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return (Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - at.getTime()) / 60_000;
}

/** The UTC instant of local `hh:mm` on `date` in `tz`. */
export function zonedUtc(date: string, hh: number, mm: number, tz: string): number {
  const guess = Date.parse(`${date}T${pad(hh)}:${pad(mm)}:00Z`);
  return guess - tzOffsetMinutes(new Date(guess), tz) * 60_000;
}

const READER_TYPES = new Set(['impression', 'open', 'dwell', 'less']);
const QUALIFYING_DWELL_MS = 20_000; // §9.7: open + dwell ≥ 20 s in the sheet

function qualifyingIds(events: SignalEvent[]): Set<string> {
  const opened = new Set(events.filter((e) => e.type === 'open' && e.articleId).map((e) => e.articleId!));
  return new Set(events.filter((e) => e.type === 'dwell' && (e.value ?? 0) >= QUALIFYING_DWELL_MS && e.articleId && opened.has(e.articleId)).map((e) => e.articleId!));
}

export function planDemoHistory(i: { trace: DayTrace[]; recallOf: (articleId: string) => RecallQuestion | null; today: string; tz: string; seed: string; persona?: Persona }): DemoDay[] {
  const persona = i.persona ?? AYESHA;
  const out: DemoDay[] = [];
  let prevItems: { articleId: string; rank: number; recall: RecallQuestion | null }[] = [];
  let prevReads: { articleId: string; at: string }[] = [];

  i.trace.forEach((t, d) => {
    const date = addDays(i.today, d - i.trace.length);
    const rng = mulberry32(hashSeed(`${i.seed}|${date}`));
    const byId = new Map(t.pool.map((c) => [c.id, c]));

    // The reader's own signals, grouped per story in rank order.
    const perItem = new Map<string, SignalEvent[]>();
    for (const r of t.ranking.items) perItem.set(r.candidateId, []);
    for (const e of t.events) {
      if (!READER_TYPES.has(e.type) || !e.articleId || !perItem.has(e.articleId)) continue;
      perItem.get(e.articleId)!.push(e.type === 'dwell' ? { ...e, meta: { ...e.meta, mode: 'sheet' } } : e);
    }

    // At least 3 qualifying reads a day: the persona reads the stories she likes most to the end.
    const q = qualifyingIds([...perItem.values()].flat());
    const byTaste = t.ranking.items
      .map((r) => byId.get(r.candidateId))
      .filter((c): c is NonNullable<typeof c> => !!c && !q.has(c.id))
      .sort((a, b) => trueAffinityOf(persona, b) - trueAffinityOf(persona, a) || (a.id < b.id ? -1 : 1));
    for (const c of byTaste) {
      if (q.size >= 3) break;
      const evs = perItem.get(c.id)!;
      if (!evs.some((e) => e.type === 'open')) evs.push({ type: 'open', articleId: c.id, meta: { mode: 'sheet' } });
      evs.push({ type: 'dwell', articleId: c.id, value: QUALIFYING_DWELL_MS + Math.round(rng() * 25_000), meta: { mode: 'sheet' } });
      q.add(c.id);
    }

    // Morning Recall about yesterday's reads, answered first thing (~80% right).
    const recall = d === 0 ? [] : selectRecall(prevItems, prevReads);
    const answers: SignalEvent[] = recall.map((question) => {
      const correct = rng() < 0.8;
      const chosen = correct ? question.answerIndex : (question.answerIndex + 1 + Math.floor(rng() * 2)) % 3;
      return { type: 'recall_answer', articleId: question.articleId, value: correct ? 1 : 0, meta: { chosen } };
    });

    // Times spread over 07:30–08:30 local, in reading order.
    const ordered = [...answers, ...t.ranking.items.flatMap((r) => perItem.get(r.candidateId) ?? [])];
    const start = zonedUtc(date, 7, 30, i.tz);
    const step = (60 * 60_000) / (ordered.length + 1);
    const events: TimedEvent[] = ordered.map((e, k) => ({ ...e, occurredAt: new Date(Math.round(start + (k + 1) * step)).toISOString() }));

    const opened = new Set(events.filter((e) => e.type === 'open').map((e) => e.articleId));
    const lastAt = new Map<string, string>();
    for (const e of events) if (e.articleId) lastAt.set(e.articleId, e.occurredAt);
    out.push({
      date,
      number: d + 1,
      ranking: t.ranking,
      recall,
      events,
      activity: {
        qualifyingReads: q.size + answers.length,
        storiesRead: opened.size,
        recallCorrect: answers.filter((a) => a.value === 1).length,
        recallTotal: answers.length,
      },
      snapshot: t.thetaBefore,
    });
    prevItems = t.ranking.items.map((r) => ({ articleId: r.candidateId, rank: r.rank, recall: i.recallOf(r.candidateId) }));
    prevReads = [...q].map((articleId) => ({ articleId, at: lastAt.get(articleId)! }));
  });
  return out;
}

export interface SeedSummary {
  userId: string;
  pool: number;
  editions: number;
  dates: string[];
  events: number;
  recallAnswers: number;
  streak: number;
  movers: WeightDelta[];
  today: { number: number; items: number; recall: number; date: string; editorNoteSource: string };
  warnings: string[];
}

const TZ = 'Asia/Karachi';

async function findOrCreateUser(email: string, password: string): Promise<string> {
  const admin = createSupabaseAdminClient();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit.id;
    if (data.users.length < 1000) break;
  }
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
  return data.user.id;
}

function must(what: string, r: { error: { message: string } | null }) {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
}

export async function seedDemoPersona(realNow: Date, creds: { email: string; password: string }): Promise<SeedSummary> {
  const db = createSupabaseAdminClient();
  const warnings: string[] = [];
  const userId = await findOrCreateUser(creds.email, creds.password);

  // 1. Idempotent reset of everything the seed writes (the auth user and its id stay).
  for (const table of ['editions', 'events', 'interest_snapshots', 'daily_activity', 'streaks', 'user_interests'] as const) {
    must(`reset ${table}`, await db.from(table).delete().eq('user_id', userId));
  }

  // 2. Profile + onboarding priors from broad picks only.
  const today = localDate(realNow, TZ);
  const [taxonomy, topicEmb, pool] = await Promise.all([loadTaxonomy(), loadTopicEmbeddings(), loadCandidatePool(realNow)]);
  const input: OnboardingInput = {
    displayName: AYESHA.name,
    paperName: null,
    picks: AYESHA.picks.map((slug) => ({ slug, via: 'tile' as const })),
    blocked: [],
    taste: [],
    presentation: { timeBudget: 15, depth: 'basics', lang: 'en' },
    city: 'Islamabad',
    tz: TZ,
  };
  const interests = priorsFromOnboarding(input, taxonomy, DEFAULT_PARAMS);
  const pos = coldStartPos(interests, topicEmb);
  must(
    'profile',
    await db.from('profiles').upsert(
      {
        user_id: userId,
        display_name: AYESHA.name,
        paper_name: BRAND.defaultPaperName(AYESHA.name),
        tz: TZ,
        city: 'Islamabad',
        time_budget: 15,
        depth: 'basics',
        lang: 'en',
        is_demo: true,
        onboarded_at: new Date(zonedUtc(addDays(today, -7), 7, 0, TZ)).toISOString(),
        pos_emb: pos ? toPgVector(pos) : null,
        neg_emb: null,
        n_engaged: 0,
        depth_pref: 0,
      },
      { onConflict: 'user_id' },
    ),
  );
  if (pool.length < 280) warnings.push(`pool is ${pool.length} (< 280): the sliding-window days overlap`);
  if (pool.length === 0) throw new Error('seed: the candidate pool is empty');

  // 3. Her simulated week on the real pool.
  const t0 = performance.now();
  const trace = runLearningArm({ pool, taxonomy, topicEmb, persona: AYESHA, days: 7, now: realNow, params: DEFAULT_PARAMS });
  const rankMs = Math.round((performance.now() - t0) / trace.length);
  const traced = [...new Set(trace.flatMap((t) => [...t.ranking.items, ...t.ranking.reserve].map((r) => r.candidateId)))];
  const meta = new Map<string, { recall: RecallQuestion | null; provider: string | null }>();
  for (let k = 0; k < traced.length; k += 200) {
    const r = await db.from('articles').select('id, recall, enrich_provider').in('id', traced.slice(k, k + 200));
    must('articles recall', r);
    for (const a of (r.data ?? []) as { id: string; recall: unknown; enrich_provider: string | null }[]) meta.set(a.id, { recall: toRecall(a.id, a.recall), provider: a.enrich_provider });
  }
  const days = planDemoHistory({ trace, recallOf: (id) => meta.get(id)?.recall ?? null, today, tz: TZ, seed: `demo|${AYESHA.name}` });

  // 4. Write each day: the paper, the reading, the day's activity.
  let events = 0;
  let recallAnswers = 0;
  for (let d = 0; d < days.length; d++) {
    const day = days[d];
    const t = trace[d];
    const byId = new Map(t.pool.map((c) => [c.id, c]));
    const gemini = day.ranking.items.filter((r) => meta.get(r.candidateId)?.provider?.startsWith('gemini')).length;
    const movers = d === 0 ? [] : moversBetween(days[d - 1].snapshot, day.snapshot, taxonomy);
    const editionId = await persistEdition({
      userId,
      date: day.date,
      number: day.number,
      paperName: BRAND.defaultPaperName(AYESHA.name),
      presentation: input.presentation,
      ranking: day.ranking,
      recall: day.recall,
      note: templateNote({ firstName: firstNameOf(AYESHA.name), number: day.number, k: day.ranking.items.length, leadHeadline: byId.get(day.ranking.leadId)?.headline ?? '', movers }),
      receipt: {
        buildMs: rankMs,
        articlesConsidered: t.pool.length,
        clustersConsidered: new Set(t.pool.map((c) => c.clusterId ?? `article:${c.id}`)).size,
        llmCallsThisEdition: 0,
        aiShare: { gemini, extractive: day.ranking.items.length - gemini },
        algoVersion: RANK_VERSION,
      },
      snapshot: day.snapshot,
    });
    const rows = day.events.map((e) => ({
      user_id: userId,
      edition_id: editionId,
      article_id: e.articleId ?? null,
      type: e.type,
      value: e.value ?? null,
      meta: e.meta ?? {},
      occurred_at: e.occurredAt,
      local_date: day.date,
    }));
    must(`events ${day.date}`, await db.from('events').insert(rows));
    events += rows.length;
    recallAnswers += day.activity.recallTotal;
    must(
      `daily_activity ${day.date}`,
      await db.from('daily_activity').insert({
        user_id: userId,
        local_date: day.date,
        qualifying_reads: day.activity.qualifyingReads,
        stories_read: day.activity.storiesRead,
        recall_correct: day.activity.recallCorrect,
        recall_total: day.activity.recallTotal,
        edition_complete: day.activity.storiesRead >= 5 && day.activity.recallTotal === day.recall.length,
        status: 'read',
      }),
    );
  }
  must('streaks', await db.from('streaks').upsert({ user_id: userId, current: 7, longest: 7, total_days: 7, last_streak_date: addDays(today, -1) }, { onConflict: 'user_id' }));
  await saveUserModel({ ...trace[trace.length - 1].model, userId }); // the simulated model carries a sim id

  // 5. Today's paper, No. 8: Morning Recall about yesterday's reads, refold over the seeded week.
  const todayEdition = await buildEdition(userId, realNow, { force: true, awaitNote: true });
  const finalModel = trace[trace.length - 1].model;
  const now = Object.fromEntries(taxonomy.map((n) => [n.slug, Math.round(thetaOf(finalModel, n.slug, DEFAULT_PARAMS) * 10_000) / 10_000]));
  return {
    userId,
    pool: pool.length,
    editions: days.length,
    dates: days.map((d) => d.date),
    events,
    recallAnswers,
    streak: 7,
    movers: moversBetween(days[0].snapshot, now, taxonomy, 3),
    today: { number: todayEdition.number, items: todayEdition.items.length, recall: todayEdition.recall.length, date: todayEdition.date, editorNoteSource: todayEdition.editorNoteSource },
    warnings,
  };
}
