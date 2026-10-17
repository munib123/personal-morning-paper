// ARCHITECTURE §9.1 / §9.2 (binding): one zod schema per request and response, plus the ROUTES constants.
// Each schema is annotated z.ZodType<T> against its contract type, so a contract change that the schema
// does not follow fails the typecheck. Route handlers parse with these and answer 400 { error, issues } on failure.
import { z } from 'zod';
import type { TopicSlug } from './taxonomy';
import type { InterestPick, InterestWeight, OnboardingInput, Presentation, Profile, TasteCard } from './profile';
import type { ArticleCard, RecallQuestion } from './article';
import type { ArchiveEntry, Edition, EditionItem, EditionReceipt, Reason, ScoreBreakdown } from './edition';
import { SIGNAL_TYPES } from './signals';
import type { EventsResult, SignalEvent, WeightDelta } from './signals';
import type { HeatmapDay, StreakView } from './streak';
import type { LearningView, SimulationDay, SimulationResult } from './learning';

// ── Shared pieces (not exported: the exported names are exactly the §9.1 list) ─────────────────
const TOPIC_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*){0,2}$/; // 1–3 kebab segments
const TOPIC_SLUG_MAX = 64;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TASTE_PICKS = 20;

const DateStringSchema = z.string().regex(DATE_RE, 'Expected a YYYY-MM-DD date');
const TierSchema = z.enum(['brief', 'std', 'deep']);
const SlotSchema = z.enum(['lead', 'top', 'core', 'bigstory', 'explore', 'serendipity', 'reserve']);
const SignalTypeSchema = z.enum(SIGNAL_TYPES);
// A beacon may send null for an absent optional field (e.g. editionId before the edition loads); treat it as absent.
const optionalString = () => z.string().nullish().transform((v) => v ?? undefined);

// ── Taxonomy and profile ───────────────────────────────────────────────────────────────────────
export const TopicSlugSchema: z.ZodType<TopicSlug> = z
  .string()
  .max(TOPIC_SLUG_MAX)
  .regex(TOPIC_SLUG_RE, 'Expected a topic slug such as technical.cs.web-dev');

const PresentationObject = z.object({
  timeBudget: z.union([z.literal(5), z.literal(15), z.literal(30)]),
  depth: z.enum(['new', 'basics', 'expert']),
  lang: z.enum(['en', 'ur']),
});
export const PresentationSchema: z.ZodType<Presentation> = PresentationObject;

export const InterestPickSchema: z.ZodType<InterestPick> = z.object({
  slug: TopicSlugSchema,
  via: z.enum(['tile', 'chip', 'search', 'describe']),
});

export const OnboardingInputSchema: z.ZodType<OnboardingInput> = z.object({
  displayName: z.string().max(60).nullable(),
  paperName: z.string().max(80).nullable(),
  picks: z.array(InterestPickSchema).max(100),
  blocked: z.array(TopicSlugSchema).max(100),
  taste: z.array(z.object({ articleId: z.string().max(64), verdict: z.enum(['more', 'less', 'skip']) })).max(20),
  presentation: PresentationSchema,
  city: z.string().max(80),
  tz: z.string().max(64),
});

export const OnboardingResponseSchema: z.ZodType<{ editionDate: string }> = z.object({ editionDate: DateStringSchema });

export const DescribeRequestSchema: z.ZodType<{ text: string }> = z.object({ text: z.string().trim().min(1).max(1000) });

export const DescribeResponseSchema: z.ZodType<{ picks: TopicSlug[]; blocked: TopicSlug[]; provider: 'gemini' | 'keyword' }> =
  z.object({
    picks: z.array(TopicSlugSchema),
    blocked: z.array(TopicSlugSchema),
    provider: z.enum(['gemini', 'keyword']),
  });

// GET /api/taste?picks=a,b,c — the query arrives as an optional comma string and leaves as clean slugs:
// trimmed, lower-cased, invalid entries dropped, de-duplicated, at most 20. It never fails on a string.
export const TasteQuerySchema: z.ZodType<{ picks: TopicSlug[] }, { picks?: string }> = z.object({
  picks: z
    .string()
    .optional()
    .transform((raw) => {
      const out: TopicSlug[] = [];
      for (const part of (raw ?? '').split(',')) {
        const slug = part.trim().toLowerCase();
        if (slug.length <= TOPIC_SLUG_MAX && TOPIC_SLUG_RE.test(slug) && !out.includes(slug)) out.push(slug);
        if (out.length === MAX_TASTE_PICKS) break;
      }
      return out;
    }),
});

export const TasteCardSchema: z.ZodType<TasteCard> = z.object({
  articleId: z.string(),
  headline: z.string(),
  sourceName: z.string(),
  topicSlug: TopicSlugSchema,
  topicName: z.string(),
  imageUrl: z.string().nullable(),
  wildcard: z.boolean(),
});

// ── Articles and editions ──────────────────────────────────────────────────────────────────────
export const RecallQuestionSchema: z.ZodType<RecallQuestion> = z.object({
  articleId: z.string(),
  question: z.string().min(1),
  options: z.tuple([z.string(), z.string(), z.string()]),
  answerIndex: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  explanation: z.string(),
});

export const ArticleCardSchema: z.ZodType<ArticleCard> = z.object({
  id: z.string(),
  url: z.string(),
  sourceId: z.string(),
  sourceName: z.string(),
  sourceDomain: z.string(),
  title: z.string(),
  headline: z.string(),
  summary: z.object({ brief: z.string(), std: z.string(), deep: z.string() }),
  whyItMatters: z.string().nullable(),
  keyFact: z.string().nullable(),
  imageUrl: z.string().nullable(),
  publishedAt: z.string(),
  readingMinutes: z.number().min(0),
  labels: z.array(z.object({ slug: TopicSlugSchema, conf: z.number().min(0).max(1) })),
  clusterId: z.string().nullable(),
  alsoCoveredBy: z.array(z.string()),
  aiProvider: z.enum(['gemini', 'extractive']),
  recall: RecallQuestionSchema.nullable(),
  ur: z.object({ headline: z.string(), summaryStd: z.string() }).nullable(),
});

export const ReasonSchema: z.ZodType<Reason> = z.object({
  code: z.enum(['topic', 'similar', 'bigstory', 'explore', 'serendipity', 'fresh', 'pinned']),
  text: z.string(),
  weight: z.number(),
});

export const ScoreBreakdownSchema: z.ZodType<ScoreBreakdown> = z.object({
  topic: z.number(),
  similarity: z.number(),
  negative: z.number(),
  importance: z.number(),
  freshness: z.number(),
  source: z.number(),
  total: z.number(),
});

export const EditionItemSchema: z.ZodType<EditionItem> = z.object({
  rank: z.number().int().min(1),
  slot: SlotSchema,
  sectionSlug: TopicSlugSchema,
  tier: TierSchema,
  score: z.number(),
  breakdown: ScoreBreakdownSchema,
  reasons: z.array(ReasonSchema),
  article: ArticleCardSchema,
});

export const EditionReceiptSchema: z.ZodType<EditionReceipt> = z.object({
  buildMs: z.number().min(0),
  articlesConsidered: z.number().int().min(0),
  clustersConsidered: z.number().int().min(0),
  llmCallsThisEdition: z.number().int().min(0),
  aiShare: z.object({ gemini: z.number().min(0), extractive: z.number().min(0) }),
  algoVersion: z.string(),
});

export const EditionSchema: z.ZodType<Edition> = z.object({
  id: z.string(),
  userId: z.string(),
  date: DateStringSchema,
  number: z.number().int().min(1),
  paperName: z.string(),
  editorNote: z.string(),
  editorNoteSource: z.enum(['gemini', 'template']),
  sectionOrder: z.array(TopicSlugSchema),
  leadArticleId: z.string(),
  sectionNames: z.record(z.string(), z.string()),
  items: z.array(EditionItemSchema),
  reserve: z.array(EditionItemSchema),
  recall: z.array(RecallQuestionSchema).max(3),
  presentation: PresentationSchema,
  receipt: EditionReceiptSchema,
  pdfUrl: z.string().nullable(),
  createdAt: z.string(),
});

export const ArchiveEntrySchema: z.ZodType<ArchiveEntry> = z.object({
  date: DateStringSchema,
  number: z.number().int().min(1),
  leadHeadline: z.string(),
  storiesRead: z.number().int().min(0),
  qualified: z.boolean(),
  pdfUrl: z.string().nullable(),
});

// GET /api/editions?limit=60 — query values are strings, so they are coerced. Range clamping is the handler's job.
export const ArchiveQuerySchema: z.ZodType<{ limit: number }, { limit?: unknown }> = z.object({
  limit: z.coerce.number().int().default(60),
});

export const RebuildRequestSchema: z.ZodType<{ date?: string }> = z.object({ date: DateStringSchema.optional() });

export const WeightDeltaSchema: z.ZodType<WeightDelta> = z.object({
  slug: TopicSlugSchema,
  name: z.string(),
  before: z.number(),
  after: z.number(),
});

export const RebuildResponseSchema: z.ZodType<{ edition: Edition; deltas: WeightDelta[] }> = z.object({
  edition: EditionSchema,
  deltas: z.array(WeightDeltaSchema),
});

export const PdfFallbackSchema: z.ZodType<{ fallback: string }> = z.object({ fallback: z.string() });

// ── Signals, streaks, learning ────────────────────────────────────────────────────────────────
export const SignalEventSchema: z.ZodType<SignalEvent> = z.object({
  type: SignalTypeSchema,
  articleId: optionalString(),
  editionId: optionalString(),
  value: z.number().nullish().transform((v) => v ?? undefined),
  meta: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .nullish()
    .transform((v) => v ?? undefined),
});

export const SignalBatchSchema: z.ZodType<{ events: SignalEvent[] }> = z.object({
  events: z.array(SignalEventSchema).min(1).max(50),
});

export const StreakViewSchema: z.ZodType<StreakView> = z.object({
  state: z.enum(['new', 'pending', 'done_today', 'at_risk', 'frozen', 'repairable', 'broken']),
  current: z.number().int().min(0),
  longest: z.number().int().min(0),
  totalDays: z.number().int().min(0),
  freezesAvailable: z.number().int().min(0),
  todayQualified: z.boolean(),
  todayStoriesRead: z.number().int().min(0),
  editionComplete: z.boolean(),
  milestone: z.number().int().nullable(),
  last7: z
    .array(z.object({ date: DateStringSchema, status: z.enum(['read', 'frozen', 'repaired', 'missed', 'today', 'future']) }))
    .max(7),
});

export const HeatmapDaySchema: z.ZodType<HeatmapDay> = z.object({
  date: DateStringSchema,
  storiesRead: z.number().int().min(0),
  level: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
});

export const StreakResponseSchema: z.ZodType<{ streak: StreakView; heatmap: HeatmapDay[] }> = z.object({
  streak: StreakViewSchema,
  heatmap: z.array(HeatmapDaySchema),
});

export const EventsResultSchema: z.ZodType<EventsResult> = z.object({
  accepted: z.number().int().min(0),
  streak: StreakViewSchema,
  deltas: z.array(WeightDeltaSchema),
  toast: z.string().nullable(),
});

// GET /api/me/learning?since=7 — coerced like ArchiveQuerySchema; the handler clamps the range.
export const LearningQuerySchema: z.ZodType<{ since: number }, { since?: unknown }> = z.object({
  since: z.coerce.number().int().default(7),
});

export const InterestWeightSchema: z.ZodType<InterestWeight> = z.object({
  slug: TopicSlugSchema,
  name: z.string(),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  theta: z.number().min(0).max(1),
  alpha: z.number().positive(),
  beta: z.number().positive(),
  picked: z.boolean(),
  muted: z.boolean(),
  pinned: z.boolean(),
});

export const LearningViewSchema: z.ZodType<LearningView> = z.object({
  weights: z.array(InterestWeightSchema),
  movers: z.array(WeightDeltaSchema),
  changeSummary: z.string(),
  sinceDate: DateStringSchema,
  timeline: z.array(
    z.object({ at: z.string(), type: SignalTypeSchema, headline: z.string().nullable(), effect: z.string() }),
  ),
});

// PATCH /api/me/interests. 'set' moves the weight to value ∈ [0, 1] (keeps α+β); the other actions flip a flag.
export const InterestEditSchema: z.ZodType<{
  slug: TopicSlug;
  action: 'pin' | 'unpin' | 'mute' | 'unmute' | 'set';
  value?: number;
}> = z.object({
  slug: TopicSlugSchema,
  action: z.enum(['pin', 'unpin', 'mute', 'unmute', 'set']),
  value: z.number().min(0).max(1).optional(),
});

export const ProfilePatchSchema: z.ZodType<{ paperName?: string; presentation?: Partial<Presentation>; city?: string }> =
  z.object({
    paperName: z.string().trim().min(1).max(80).optional(),
    presentation: PresentationObject.partial().optional(),
    city: z.string().trim().min(1).max(80).optional(),
  });

export const ProfileSchema: z.ZodType<Profile> = z.object({
  userId: z.string(),
  displayName: z.string().nullable(),
  paperName: z.string(),
  tz: z.string(),
  city: z.string(),
  presentation: PresentationSchema,
  deliveryHour: z.number().int().min(0).max(23),
  isDemo: z.boolean(),
  onboardedAt: z.string().nullable(),
});

// ── Demo, simulation, health, errors ──────────────────────────────────────────────────────────
// POST /api/demo/clock — an ISO 8601 date-time (Z or an offset) sets the demo clock; null resets it.
export const DemoClockRequestSchema: z.ZodType<{ now: string | null }> = z.object({
  now: z.iso.datetime({ offset: true }).nullable(),
});

export const DemoClockResponseSchema: z.ZodType<{ now: string }> = z.object({ now: z.string() });

export const FastForwardRequestSchema: z.ZodType<{ days?: number }> = z.object({
  days: z.number().int().min(1).max(30).optional(),
});

const SimulationDaySchema: z.ZodType<SimulationDay> = z.object({
  day: z.number().int(),
  precisionAt20: z.number(),
  ndcgAt10: z.number(),
  diversity: z.number(),
  exploreHits: z.number().min(0),
});

export const SimulationResultSchema: z.ZodType<SimulationResult> = z.object({
  persona: z.string(),
  learning: z.array(SimulationDaySchema),
  onboardingOnly: z.array(SimulationDaySchema),
  popularity: z.array(SimulationDaySchema),
  snapshots: z.array(z.object({ day: z.number().int(), weights: z.record(z.string(), z.number()) })),
});

export const HealthSchema: z.ZodType<{
  db: boolean;
  gemini: 'ok' | 'limited' | 'missing';
  lastIngest: string | null;
  fallback: boolean;
}> = z.object({
  db: z.boolean(),
  gemini: z.enum(['ok', 'limited', 'missing']),
  lastIngest: z.string().nullable(),
  fallback: z.boolean(),
});

export const ErrorSchema: z.ZodType<{ error: string; issues?: unknown }> = z.object({
  error: z.string(),
  issues: z.unknown().optional(),
});

// ── Routes (§9.2) ─────────────────────────────────────────────────────────────────────────────
const seg = encodeURIComponent;

export const ROUTES = {
  onboarding: '/api/onboarding',
  describe: '/api/onboarding/describe',
  taste: '/api/taste',
  editionsToday: '/api/editions/today',
  editions: '/api/editions',
  edition: (date: string) => `/api/editions/${seg(date)}`,
  rebuild: '/api/editions/rebuild',
  pdf: (date: string) => `/api/editions/${seg(date)}/pdf`,
  events: '/api/events',
  learning: '/api/me/learning',
  interests: '/api/me/interests',
  profile: '/api/me/profile',
  streak: '/api/me/streak',
  demoClock: '/api/demo/clock',
  fastForward: '/api/demo/fast-forward',
  cronIngest: '/api/cron/ingest',
  cronEditions: '/api/cron/editions',
  health: '/api/health',
  // /r/{id}?src=web|print&e={editionId}: logs read_original or qr_scan, then 302s to the source.
  outbound: (articleId: string, src: 'web' | 'print', editionId?: string | null) =>
    `/r/${seg(articleId)}?src=${src}${editionId ? `&e=${seg(editionId)}` : ''}`,
  // Pages
  today: '/today',
  archive: '/archive',
  me: '/me',
  start: '/start',
  demo: '/demo',
  paper: (date: string) => `/paper/${seg(date)}`,
  print: (date: string) => `/paper/${seg(date)}/print`,
} as const;
