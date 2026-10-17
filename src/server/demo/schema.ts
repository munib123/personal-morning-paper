// W2-shipkit: the shape of public/demo/snapshot.json (DEMO_FALLBACK, ARCHITECTURE §12). Everything the
// reader pages need for the demo persona, in the §9.1 contract shapes wherever one exists, so the
// fallback reads hand the pages exactly what the owners' functions would.
import { z } from 'zod';
import { ArchiveEntrySchema, EditionSchema, LearningViewSchema, ProfileSchema } from '@/contracts/api';
import { SIGNAL_TYPES } from '@/contracts/signals';

export const SNAPSHOT_VERSION = 1;
export const SNAPSHOT_MAX_EVENTS = 200;
export const SNAPSHOT_MAX_BYTES = 3 * 1024 * 1024;

const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a YYYY-MM-DD date');

/** One user_interests row (the Beta posterior and its flags). */
export const SnapshotInterestSchema = z.object({
  slug: z.string(),
  alpha: z.number().positive(),
  beta: z.number().positive(),
  priorAlpha: z.number().positive(),
  priorBeta: z.number().positive(),
  picked: z.boolean(),
  muted: z.boolean(),
  pinned: z.boolean(),
});
export type SnapshotInterest = z.infer<typeof SnapshotInterestSchema>;

/** One daily_activity row: the source of truth the streak is recomputed from. */
export const SnapshotActivitySchema = z.object({
  date: DateString,
  status: z.enum(['read', 'frozen', 'repaired']),
  qualifyingReads: z.number().int().min(0),
  storiesRead: z.number().int().min(0),
  recallCorrect: z.number().int().min(0),
  recallTotal: z.number().int().min(0),
  editionComplete: z.boolean(),
});
export type SnapshotActivity = z.infer<typeof SnapshotActivitySchema>;

/** One events row (newest first in the file). */
export const SnapshotEventSchema = z.object({
  at: z.string(),
  localDate: DateString,
  type: z.enum(SIGNAL_TYPES),
  articleId: z.string().nullable(),
  editionId: z.string().nullable(),
  value: z.number().nullable(),
  meta: z.record(z.string(), z.unknown()),
});
export type SnapshotEvent = z.infer<typeof SnapshotEventSchema>;

/** The clusters the editions reference (importance is per cluster, §10.2). */
export const SnapshotClusterSchema = z.object({
  headline: z.string().nullable(),
  importance: z.number(),
  articleCount: z.number().int().min(0),
  sourceCount: z.number().int().min(0),
});
export type SnapshotCluster = z.infer<typeof SnapshotClusterSchema>;

export const SnapshotSchema = z.object({
  version: z.literal(SNAPSHOT_VERSION),
  generatedAt: z.string(),
  persona: z.object({
    userId: z.string(),
    displayName: z.string().nullable(),
    tz: z.string(),
    latestEditionDate: DateString,
  }),
  profile: ProfileSchema,
  interests: z.array(SnapshotInterestSchema),
  interestSnapshots: z.array(z.object({ date: DateString, weights: z.record(z.string(), z.number()) })),
  // Oldest first. Articles ride inside items[].article / reserve[].article as ArticleCards (no embeddings, no content_text).
  editions: z.array(EditionSchema).min(1),
  // Newest first, as listArchive answers it.
  archive: z.array(ArchiveEntrySchema),
  clusters: z.record(z.string(), SnapshotClusterSchema),
  activity: z.array(SnapshotActivitySchema),
  streak: z
    .object({
      current: z.number().int().min(0),
      longest: z.number().int().min(0),
      totalDays: z.number().int().min(0),
      lastStreakDate: DateString.nullable(),
    })
    .nullable(),
  events: z.array(SnapshotEventSchema).max(SNAPSHOT_MAX_EVENTS),
  learning: LearningViewSchema,
});
export type DemoSnapshot = z.infer<typeof SnapshotSchema>;
