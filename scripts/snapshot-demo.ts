// npm run demo:snapshot  (= tsx --env-file=.env.local scripts/snapshot-demo.ts [--user=<uuid>] [--out=<path>])
// Exports everything the reader pages need for the demo persona (profiles.is_demo = true) into
// public/demo/snapshot.json, so DEMO_FALLBACK=1 can serve her paper with the network off (ARCHITECTURE §12).
// Editions are hydrated by L3's own getEdition (contract shapes; no embeddings, no content_text), the
// archive by listArchive; streak days, interests, snapshots and the last 200 events ride along as rows.
import './lib/env';

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { ArticleCard } from '@/contracts/article';
import type { Edition } from '@/contracts/edition';
import { FIXTURE_LEARNING } from '@/contracts/fixtures';
import type { LearningView } from '@/contracts/learning';
import { SIGNAL_TYPES, type SignalType } from '@/contracts/signals';
import { createSupabaseAdminClient } from '@/server/db/admin';
import { deriveLearningView } from '@/server/demo/derive';
import { stableStringify } from '@/server/demo/format';
import {
  SNAPSHOT_MAX_BYTES,
  SNAPSHOT_MAX_EVENTS,
  SNAPSHOT_VERSION,
  SnapshotSchema,
  type DemoSnapshot,
  type SnapshotActivity,
  type SnapshotCluster,
  type SnapshotEvent,
  type SnapshotInterest,
} from '@/server/demo/schema';
import { SNAPSHOT_FILE } from '@/server/demo/snapshot';
import { getEdition, listArchive, loadTaxonomy } from '@/server/edition';
import { getLearningView } from '@/server/learn';
import { getProfile } from '@/server/profile';

const LEARNING_DAYS = 7;
const ARCHIVE_LIMIT = 60;
const CHUNK = 200;
const SIGNAL_SET = new Set<string>(SIGNAL_TYPES);

function flags(argv: string[]): { user?: string; out: string } {
  const out: { user?: string; out: string } = { out: SNAPSHOT_FILE };
  for (const a of argv) {
    if (a.startsWith('--user=')) out.user = a.slice('--user='.length);
    else if (a.startsWith('--out=')) out.out = path.resolve(a.slice('--out='.length));
    else {
      console.error(`snapshot-demo: unknown flag ${a} (known: --user=<uuid> --out=<path>)`);
      process.exit(2);
    }
  }
  return out;
}

function must<T>(what: string, r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
}

const iso = (t: string) => new Date(t).toISOString();
const asMeta = (m: unknown): Record<string, unknown> => (m && typeof m === 'object' && !Array.isArray(m) ? (m as Record<string, unknown>) : {});

async function findPersona(db: ReturnType<typeof createSupabaseAdminClient>): Promise<string> {
  const rows = must(
    'profiles',
    await db.from('profiles').select('user_id, onboarded_at').eq('is_demo', true).not('onboarded_at', 'is', null).order('onboarded_at', { ascending: false }).limit(1),
  ) as { user_id: string }[];
  if (!rows?.[0]) throw new Error('no profile with is_demo = true; run `npx tsx scripts/seed-demo-persona.ts` first, or pass --user=<uuid>');
  return rows[0].user_id;
}

async function main() {
  const opts = flags(process.argv.slice(2));
  const db = createSupabaseAdminClient();
  const userId = opts.user ?? (await findPersona(db));

  const profile = await getProfile(userId);
  if (!profile) throw new Error(`profile ${userId} is missing or not onboarded`);

  // Editions, oldest first, through L3's own hydration (identical to what the pages render).
  const dates = (must('editions', await db.from('editions').select('edition_date').eq('user_id', userId).order('edition_date', { ascending: true })) as { edition_date: string }[]).map(
    (r) => r.edition_date,
  );
  if (dates.length === 0) throw new Error('the persona has no editions; run `npx tsx scripts/seed-demo-persona.ts` first');
  const editions: Edition[] = [];
  for (const date of dates) {
    const e = await getEdition(userId, date);
    if (e) editions.push({ ...e, pdfUrl: null }); // signed URLs expire; the reader resolves public/demo PDFs at runtime
  }
  const archive = (await listArchive(userId, ARCHIVE_LIMIT)).map((a) => ({ ...a, pdfUrl: null }));

  // The clusters those stories belong to (importance lives there).
  const articles = new Map<string, ArticleCard>();
  for (const e of editions) for (const it of [...e.items, ...e.reserve]) articles.set(it.article.id, it.article);
  const clusterIds = [...new Set([...articles.values()].map((a) => a.clusterId).filter((c): c is string => !!c))].sort();
  const clusters: Record<string, SnapshotCluster> = {};
  for (let k = 0; k < clusterIds.length; k += CHUNK) {
    const rows = must('clusters', await db.from('clusters').select('id, headline, importance, article_count, source_count').in('id', clusterIds.slice(k, k + CHUNK))) as {
      id: string;
      headline: string | null;
      importance: number;
      article_count: number;
      source_count: number;
    }[];
    for (const r of rows ?? []) clusters[r.id] = { headline: r.headline, importance: r.importance, articleCount: r.article_count, sourceCount: r.source_count };
  }

  const interests: SnapshotInterest[] = (
    must('user_interests', await db.from('user_interests').select('slug, alpha, beta, prior_alpha, prior_beta, picked, muted, pinned').eq('user_id', userId).order('slug')) as {
      slug: string;
      alpha: number;
      beta: number;
      prior_alpha: number;
      prior_beta: number;
      picked: boolean;
      muted: boolean;
      pinned: boolean;
    }[]
  ).map((r) => ({ slug: r.slug, alpha: r.alpha, beta: r.beta, priorAlpha: r.prior_alpha, priorBeta: r.prior_beta, picked: r.picked, muted: r.muted, pinned: r.pinned }));

  const interestSnapshots = (must('interest_snapshots', await db.from('interest_snapshots').select('snap_date, weights').eq('user_id', userId).order('snap_date')) as { snap_date: string; weights: unknown }[]).map(
    (r) => ({ date: r.snap_date, weights: (r.weights ?? {}) as Record<string, number> }),
  );

  const activity: SnapshotActivity[] = (
    must(
      'daily_activity',
      await db.from('daily_activity').select('local_date, status, qualifying_reads, stories_read, recall_correct, recall_total, edition_complete').eq('user_id', userId).order('local_date'),
    ) as { local_date: string; status: string; qualifying_reads: number; stories_read: number; recall_correct: number; recall_total: number; edition_complete: boolean }[]
  ).map((r) => ({
    date: r.local_date,
    status: r.status === 'frozen' || r.status === 'repaired' ? r.status : 'read',
    qualifyingReads: r.qualifying_reads,
    storiesRead: r.stories_read,
    recallCorrect: r.recall_correct,
    recallTotal: r.recall_total,
    editionComplete: r.edition_complete,
  }));

  const streakRow = must('streaks', await db.from('streaks').select('current, longest, total_days, last_streak_date').eq('user_id', userId).maybeSingle()) as {
    current: number;
    longest: number;
    total_days: number;
    last_streak_date: string | null;
  } | null;
  const streak = streakRow ? { current: streakRow.current, longest: streakRow.longest, totalDays: streakRow.total_days, lastStreakDate: streakRow.last_streak_date } : null;

  const events: SnapshotEvent[] = (
    must(
      'events',
      await db
        .from('events')
        .select('id, type, article_id, edition_id, value, meta, occurred_at, local_date')
        .eq('user_id', userId)
        .order('occurred_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(SNAPSHOT_MAX_EVENTS),
    ) as { type: string; article_id: string | null; edition_id: string | null; value: number | null; meta: unknown; occurred_at: string; local_date: string }[]
  )
    .filter((r) => SIGNAL_SET.has(r.type))
    .map((r) => ({ at: iso(r.occurred_at), localDate: r.local_date, type: r.type as SignalType, articleId: r.article_id, editionId: r.edition_id, value: r.value, meta: asMeta(r.meta) }));

  // The learning view: the real one once L3 ships it; derived from her rows while it is the L0 stub.
  const latestEditionDate = dates[dates.length - 1];
  let learning: LearningView | null = null;
  let learningSource: 'server' | 'derived' = 'server';
  try {
    const real = await getLearningView(userId, LEARNING_DAYS, new Date());
    if (real !== FIXTURE_LEARNING) learning = real;
  } catch (err) {
    console.warn(`getLearningView failed, deriving instead: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!learning) {
    learningSource = 'derived';
    learning = deriveLearningView({ interests, snapshots: interestSnapshots, events, articles, taxonomy: await loadTaxonomy(), today: latestEditionDate, sinceDays: LEARNING_DAYS });
  }

  const snapshot: DemoSnapshot = {
    version: SNAPSHOT_VERSION,
    generatedAt: new Date().toISOString(),
    persona: { userId, displayName: profile.displayName, tz: profile.tz, latestEditionDate },
    profile,
    interests,
    interestSnapshots,
    editions,
    archive,
    clusters,
    activity,
    streak,
    events,
    learning,
  };

  const parsed = SnapshotSchema.safeParse(snapshot);
  if (!parsed.success) {
    console.error(z.prettifyError(parsed.error));
    throw new Error('the snapshot does not match SnapshotSchema (see issues above)');
  }

  let text = `${stableStringify(parsed.data)}\n`;
  let bytes = Buffer.byteLength(text);
  if (bytes > SNAPSHOT_MAX_BYTES) {
    // Articles are already capped to those the editions reference; shed the event log next.
    console.warn(`snapshot is ${bytes} bytes (> ${SNAPSHOT_MAX_BYTES}); keeping only the last 50 events`);
    text = `${stableStringify({ ...parsed.data, events: parsed.data.events.slice(0, 50) })}\n`;
    bytes = Buffer.byteLength(text);
    if (bytes > SNAPSHOT_MAX_BYTES) throw new Error(`snapshot is still ${bytes} bytes; trim the persona's editions`);
  }

  mkdirSync(path.dirname(opts.out), { recursive: true });
  writeFileSync(opts.out, text);
  console.log(
    JSON.stringify(
      {
        out: path.relative(process.cwd(), opts.out),
        bytes,
        userId,
        editions: editions.map((e) => ({ date: e.date, number: e.number, items: e.items.length, reserve: e.reserve.length, recall: e.recall.length })),
        articles: articles.size,
        clusters: Object.keys(clusters).length,
        interests: interests.length,
        interestSnapshots: interestSnapshots.length,
        activityDays: activity.length,
        events: events.length,
        learning: { source: learningSource, weights: learning.weights.length, movers: learning.movers.length, timeline: learning.timeline.length },
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
