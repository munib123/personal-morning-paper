// W2-shipkit: DEMO_FALLBACK=1 serves the demo persona from public/demo/snapshot.json with no network
// (ARCHITECTURE §12, PLAN §6). Each read function mirrors its owner's signature exactly, so the owner adds a
// two-line guard at the top of the real function:
//   if (isDemoFallback()) return snapshotGetEdition(userId, date);
// In fallback mode the demo account is the only reader, so every userId maps to the persona.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { ArticleCard } from '@/contracts/article';
import type { ArchiveEntry, Edition } from '@/contracts/edition';
import type { LearningView } from '@/contracts/learning';
import type { Profile } from '@/contracts/profile';
import type { EventsResult, SignalEvent } from '@/contracts/signals';
import type { HeatmapDay, StreakView } from '@/contracts/streak';
import { buildHeatmap } from '@/server/streaks/activity';
import { localHour } from '@/server/streaks/clock';
import { computeStreak, type DayRecord } from '@/server/streaks/compute';
import { localDate } from '@/server/time';
import { pickLocalPdf } from './format';
import { SnapshotSchema, type DemoSnapshot } from './schema';

// Static path pieces so Next's file tracing can include the JSON in a serverless bundle.
const DEMO_DIR = path.join(process.cwd(), 'public', 'demo');
export const SNAPSHOT_FILE = path.join(process.cwd(), 'public', 'demo', 'snapshot.json');

export const isDemoFallback = (): boolean => process.env.DEMO_FALLBACK === '1';

interface Loaded {
  data: DemoSnapshot;
  byDate: Map<string, Edition>;
  articles: Map<string, ArticleCard>;
  latest: Edition;
  days: DayRecord[];
  pdfs: string[];
}

let cache: Loaded | null = null;

/** Reads and validates a snapshot file (default: public/demo/snapshot.json). Throws on a missing or invalid file. */
export function readSnapshotFile(file: string = SNAPSHOT_FILE): DemoSnapshot {
  return SnapshotSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
}

function listDemoPdfs(): string[] {
  try {
    return readdirSync(DEMO_DIR).filter((f) => f.toLowerCase().endsWith('.pdf'));
  } catch {
    return [];
  }
}

function index(data: DemoSnapshot, pdfs: string[]): Loaded {
  const byDate = new Map<string, Edition>();
  const articles = new Map<string, ArticleCard>();
  for (const e of data.editions) {
    byDate.set(e.date, e);
    for (const it of [...e.items, ...e.reserve]) if (!articles.has(it.article.id)) articles.set(it.article.id, it.article);
  }
  const latest = [...data.editions].sort((a, b) => a.date.localeCompare(b.date)).at(-1)!;
  const days: DayRecord[] = data.activity.map((a) => ({
    date: a.date,
    status: a.status,
    qualifyingReads: a.qualifyingReads,
    storiesRead: a.storiesRead,
    editionComplete: a.editionComplete,
  }));
  return { data, byDate, articles, latest, days, pdfs };
}

function loaded(): Loaded {
  cache ??= index(readSnapshotFile(), listDemoPdfs());
  return cache;
}

/** The validated snapshot, read once per process. */
export function loadSnapshot(): DemoSnapshot {
  return loaded().data;
}

/** Tests and the snapshot script: forget the per-process copy. */
export function resetSnapshotCache(): void {
  cache = null;
}

export function snapshotPersonaId(): string {
  return loaded().data.profile.userId;
}

/** A pre-rendered persona PDF in public/demo for that date, else the stored value. */
function withLocalPdf<T extends { date: string; pdfUrl: string | null }>(x: T, pdfs: string[]): T {
  return x.pdfUrl ? x : { ...x, pdfUrl: pickLocalPdf(x.date, pdfs) };
}

// ── Mirrors of the owners' read functions (§9.3) ────────────────────────────────────────────────

/** getProfile(userId) → the persona, whoever asks. */
export async function snapshotGetProfile(userId: string): Promise<Profile | null> {
  void userId; // fallback mode has one reader
  return loaded().data.profile;
}

/** getEdition(userId, date) → that day's paper as published, or null. */
export async function snapshotGetEdition(userId: string, date: string): Promise<Edition | null> {
  void userId;
  const l = loaded();
  const e = l.byDate.get(date);
  return e ? withLocalPdf(e, l.pdfs) : null;
}

/** buildEdition(userId, now) → the paper of now's local date; when none exists (the clock moved), the latest paper. */
export async function snapshotBuildEdition(userId: string, now: Date, opts: { force?: boolean; awaitNote?: boolean } = {}): Promise<Edition> {
  void userId;
  void opts; // nothing to rebuild offline
  const l = loaded();
  const date = localDate(now, l.data.profile.tz);
  return withLocalPdf(l.byDate.get(date) ?? l.latest, l.pdfs);
}

/** listArchive(userId, limit) → past papers, newest first. */
export async function snapshotListArchive(userId: string, limit = 60): Promise<ArchiveEntry[]> {
  void userId;
  const l = loaded();
  return l.data.archive.slice(0, Math.max(0, limit)).map((a) => withLocalPdf(a, l.pdfs));
}
export const snapshotListEditions = snapshotListArchive;

/** getStreak(userId, now, tz) → recomputed from the snapshot's daily_activity, so the demo clock still works. */
export async function snapshotGetStreak(userId: string, now: Date, tz: string): Promise<StreakView> {
  void userId;
  const c = computeStreak(loaded().days, localDate(now, tz), localHour(now, tz));
  return { ...c.view, milestone: null };
}
export const snapshotGetStreakView = snapshotGetStreak;

/** getHeatmap(userId, days, now, tz) */
export async function snapshotGetHeatmap(userId: string, days: number, now: Date, tz: string): Promise<HeatmapDay[]> {
  void userId;
  return buildHeatmap(loaded().days, localDate(now, tz), days);
}

/** getLearningView(userId, sinceDays, now) → the view exported with the snapshot. */
export async function snapshotGetLearningView(userId: string, sinceDays: number, now: Date): Promise<LearningView> {
  void userId;
  void sinceDays;
  void now; // the exported view is fixed at snapshot time
  return loaded().data.learning;
}

/** For /r/[articleId]: the ArticleCard (with its url) of any story in any snapshot edition. */
export function snapshotGetArticle(articleId: string): ArticleCard | null {
  return loaded().articles.get(articleId) ?? null;
}

/** processSignals(userId, events, now) → accepted but not stored: the snapshot is read-only. */
export async function snapshotProcessSignals(userId: string, events: SignalEvent[], now: Date): Promise<EventsResult> {
  const streak = await snapshotGetStreak(userId, now, loaded().data.profile.tz);
  return { accepted: events.length, streak, deltas: [], toast: null };
}
