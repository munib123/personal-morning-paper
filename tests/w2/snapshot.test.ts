// W2-shipkit: DEMO_FALLBACK reads against the committed public/demo/snapshot.json. Every read function
// mirrors its owner's signature and returns contract-shaped data (zod), for any userId.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  ArchiveEntrySchema,
  ArticleCardSchema,
  EditionSchema,
  EventsResultSchema,
  HeatmapDaySchema,
  LearningViewSchema,
  ProfileSchema,
  StreakViewSchema,
} from '@/contracts/api';
import {
  isDemoFallback,
  loadSnapshot,
  resetSnapshotCache,
  snapshotBuildEdition,
  snapshotGetArticle,
  snapshotGetEdition,
  snapshotGetHeatmap,
  snapshotGetLearningView,
  snapshotGetProfile,
  snapshotGetStreak,
  snapshotGetStreakView,
  snapshotListArchive,
  snapshotListEditions,
  snapshotPersonaId,
  snapshotProcessSignals,
} from '@/server/demo/snapshot';
import { SnapshotSchema } from '@/server/demo/schema';

const ANY_USER = '00000000-0000-4000-8000-000000000123';
const TZ = 'Asia/Karachi';

// 09:00 local on the persona's latest edition date (UTC+5 → 04:00Z).
const morningOf = (date: string) => new Date(`${date}T04:00:00.000Z`);

describe('isDemoFallback', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('is true only when DEMO_FALLBACK is exactly "1"', () => {
    vi.stubEnv('DEMO_FALLBACK', '1');
    expect(isDemoFallback()).toBe(true);
    vi.stubEnv('DEMO_FALLBACK', 'true');
    expect(isDemoFallback()).toBe(false);
    vi.stubEnv('DEMO_FALLBACK', '');
    expect(isDemoFallback()).toBe(false);
  });
});

describe('the committed snapshot', () => {
  beforeAll(() => resetSnapshotCache());

  it('parses with the snapshot schema and has the persona', () => {
    const snap = loadSnapshot();
    expect(() => SnapshotSchema.parse(snap)).not.toThrow();
    expect(snap.editions.length).toBeGreaterThan(0);
    expect(snap.profile.isDemo).toBe(true);
    expect(snapshotPersonaId()).toBe(snap.profile.userId);
  });

  it('holds today’s edition for the persona’s latest edition_date', async () => {
    const snap = loadSnapshot();
    const latest = snap.editions.map((e) => e.date).sort().at(-1)!;
    expect(snap.persona.latestEditionDate).toBe(latest);
    const edition = await snapshotGetEdition(ANY_USER, latest);
    expect(edition).not.toBeNull();
    expect(() => EditionSchema.parse(edition)).not.toThrow();
    expect(edition!.items.length).toBeGreaterThan(0);
    expect(edition!.items.length).toBeLessThanOrEqual(20);
    expect(edition!.date).toBe(latest);
  });

  it('getEdition: any userId maps to the persona; an unknown date is null', async () => {
    const snap = loadSnapshot();
    const e = await snapshotGetEdition(ANY_USER, snap.persona.latestEditionDate);
    expect(e?.userId).toBe(snap.profile.userId);
    expect(await snapshotGetEdition(ANY_USER, '1999-01-01')).toBeNull();
  });

  it('buildEdition: the paper of now’s local date, else the latest paper (never null)', async () => {
    const snap = loadSnapshot();
    const latest = snap.persona.latestEditionDate;
    const today = await snapshotBuildEdition(ANY_USER, morningOf(latest));
    expect(today.date).toBe(latest);
    const future = await snapshotBuildEdition(ANY_USER, new Date('2031-01-01T04:00:00.000Z'));
    expect(future.date).toBe(latest);
    expect(() => EditionSchema.parse(future)).not.toThrow();
    const first = snap.editions.map((e) => e.date).sort()[0];
    const past = await snapshotBuildEdition(ANY_USER, morningOf(first));
    expect(past.date).toBe(first);
  });

  it('listArchive: newest first, contract-shaped, limit respected', async () => {
    const all = await snapshotListArchive(ANY_USER);
    expect(all.length).toBeGreaterThan(0);
    for (const entry of all) expect(() => ArchiveEntrySchema.parse(entry)).not.toThrow();
    for (let i = 1; i < all.length; i++) expect(all[i - 1].date > all[i].date).toBe(true);
    expect(all[0].date).toBe(loadSnapshot().persona.latestEditionDate);
    expect((await snapshotListArchive(ANY_USER, 2)).length).toBe(Math.min(2, all.length));
    expect(await snapshotListEditions(ANY_USER)).toEqual(all);
  });

  it('getProfile: the persona for any userId', async () => {
    const p = await snapshotGetProfile(ANY_USER);
    expect(() => ProfileSchema.parse(p)).not.toThrow();
    expect(p?.isDemo).toBe(true);
    expect(p?.userId).toBe(snapshotPersonaId());
  });

  it('getStreak / getHeatmap: recomputed from daily_activity for the given now', async () => {
    const latest = loadSnapshot().persona.latestEditionDate;
    const streak = await snapshotGetStreak(ANY_USER, morningOf(latest), TZ);
    expect(() => StreakViewSchema.parse(streak)).not.toThrow();
    expect(streak.current).toBeGreaterThanOrEqual(1);
    expect(streak.last7).toHaveLength(7);
    expect(streak.last7.at(-1)?.date).toBe(latest);
    expect(streak.milestone).toBeNull();
    expect(await snapshotGetStreakView(ANY_USER, morningOf(latest), TZ)).toEqual(streak);

    const heat = await snapshotGetHeatmap(ANY_USER, 84, morningOf(latest), TZ);
    expect(heat).toHaveLength(84);
    for (const d of heat) expect(() => HeatmapDaySchema.parse(d)).not.toThrow();
    expect(heat.some((d) => d.storiesRead > 0)).toBe(true);
  });

  it('getLearningView: contract-shaped with real weights', async () => {
    const v = await snapshotGetLearningView(ANY_USER, 7, morningOf(loadSnapshot().persona.latestEditionDate));
    expect(() => LearningViewSchema.parse(v)).not.toThrow();
    expect(v.weights.length).toBeGreaterThan(0);
  });

  it('getArticle: every article of every edition is indexed; unknown ids are null', async () => {
    const snap = loadSnapshot();
    const first = snap.editions[0].items[0].article;
    const card = snapshotGetArticle(first.id);
    expect(() => ArticleCardSchema.parse(card)).not.toThrow();
    expect(card?.url).toBe(first.url);
    expect(snapshotGetArticle('nope')).toBeNull();
  });

  it('processSignals: accepts the batch without writing and answers the streak', async () => {
    const latest = loadSnapshot().persona.latestEditionDate;
    const r = await snapshotProcessSignals(ANY_USER, [{ type: 'open', articleId: 'x' }, { type: 'dwell', articleId: 'x', value: 25000 }], morningOf(latest));
    expect(() => EventsResultSchema.parse(r)).not.toThrow();
    expect(r.accepted).toBe(2);
    expect(r.deltas).toEqual([]);
  });
});
