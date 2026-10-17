import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ancestorsOf, rootOf } from './taxonomy';
import { SIGNAL_TYPES } from './signals';
import * as api from './api';
import {
  ArchiveEntrySchema,
  ArchiveQuerySchema,
  ArticleCardSchema,
  DemoClockRequestSchema,
  DescribeRequestSchema,
  EditionSchema,
  ErrorSchema,
  EventsResultSchema,
  FastForwardRequestSchema,
  HealthSchema,
  HeatmapDaySchema,
  InterestEditSchema,
  InterestWeightSchema,
  LearningQuerySchema,
  LearningViewSchema,
  OnboardingInputSchema,
  PdfFallbackSchema,
  ProfilePatchSchema,
  ProfileSchema,
  RecallQuestionSchema,
  ROUTES,
  SignalBatchSchema,
  SignalEventSchema,
  SimulationResultSchema,
  StreakViewSchema,
  TasteCardSchema,
  TasteQuerySchema,
  TopicSlugSchema,
} from './api';
import * as fixtures from './fixtures';
import {
  FIXTURE_ARCHIVE,
  FIXTURE_ARTICLES,
  FIXTURE_EDITION,
  FIXTURE_EVENTS_RESULT,
  FIXTURE_HEATMAP,
  FIXTURE_INTEREST_WEIGHTS,
  FIXTURE_LEARNING,
  FIXTURE_PROFILE,
  FIXTURE_SIMULATION,
  FIXTURE_STREAK,
  FIXTURE_TASTE_CARDS,
  FIXTURE_TAXONOMY,
  FIXTURE_USER_ID,
} from './fixtures';
import { BRAND } from '../lib/brand';
import topicExtras from '../../seed/topic-extras.json';

const range = (a: number, b: number): number[] => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const readText = (repoPath: string): string => readFileSync(new URL(`../../${repoPath}`, import.meta.url), 'utf8');
const words = (s: string): number => s.split(/\s+/).filter(Boolean).length;
const allItems = [...FIXTURE_EDITION.items, ...FIXTURE_EDITION.reserve];

it('ancestorsOf/rootOf', () => {
  expect(ancestorsOf('technical.cs.web-dev')).toEqual(['technical', 'technical.cs']);
  expect(rootOf('sports.cricket.pakistan')).toBe('sports');
  expect(ancestorsOf('news')).toEqual([]);
});

it('SignalBatchSchema caps at 50 and rejects unknown types', () => {
  const ev = { type: 'open', articleId: FIXTURE_ARTICLES[0].id };
  expect(SignalBatchSchema.safeParse({ events: Array(50).fill(ev) }).success).toBe(true);
  expect(SignalBatchSchema.safeParse({ events: Array(51).fill(ev) }).success).toBe(false);
  expect(SignalBatchSchema.safeParse({ events: [{ type: 'like' }] }).success).toBe(false);
  expect(SignalBatchSchema.safeParse({ events: [] }).success).toBe(false);
  expect(SignalBatchSchema.safeParse({}).success).toBe(false);
});

describe('SignalEventSchema', () => {
  it('accepts every SignalType and the §9.7 meta shapes', () => {
    for (const type of SIGNAL_TYPES) expect(SignalEventSchema.safeParse({ type }).success).toBe(true);
    const ok = SignalEventSchema.safeParse({
      type: 'skip',
      articleId: FIXTURE_ARTICLES[3].id,
      editionId: FIXTURE_EDITION.id,
      value: 1,
      meta: { reason: 'not_interested', slot: 'core', chosen: 2, fromPrint: false },
    });
    expect(ok.success).toBe(true);
  });

  it('rejects nested meta values and treats null optional fields as absent', () => {
    expect(SignalEventSchema.safeParse({ type: 'open', meta: { nested: { a: 1 } } }).success).toBe(false);
    expect(SignalEventSchema.safeParse({ type: 'open', value: 'fast' }).success).toBe(false);
    const parsed = SignalEventSchema.parse({ type: 'pdf_download', editionId: null, articleId: null, value: null, meta: null });
    expect(parsed).toEqual({ type: 'pdf_download' });
  });
});

it('every fixture passes its schema', () => {
  EditionSchema.parse(FIXTURE_EDITION);
  FIXTURE_ARTICLES.forEach((a) => ArticleCardSchema.parse(a));
  StreakViewSchema.parse(FIXTURE_STREAK);
  FIXTURE_HEATMAP.forEach((d) => HeatmapDaySchema.parse(d));
  FIXTURE_ARCHIVE.forEach((e) => ArchiveEntrySchema.parse(e));
  LearningViewSchema.parse(FIXTURE_LEARNING);
  FIXTURE_INTEREST_WEIGHTS.forEach((w) => InterestWeightSchema.parse(w));
  FIXTURE_TASTE_CARDS.forEach((c) => TasteCardSchema.parse(c));
  SimulationResultSchema.parse(FIXTURE_SIMULATION);
  ProfileSchema.parse(FIXTURE_PROFILE);
  EventsResultSchema.parse(FIXTURE_EVENTS_RESULT);
  FIXTURE_EDITION.recall.forEach((q) => RecallQuestionSchema.parse(q));
});

it('fixture shape matches §9.1 counts', () => {
  expect(FIXTURE_TAXONOMY).toHaveLength(67);
  expect(FIXTURE_ARTICLES).toHaveLength(28);
  expect(new Set(FIXTURE_ARTICLES.map((a) => rootOf(a.labels[0].slug))).size).toBeGreaterThanOrEqual(6);
  expect(FIXTURE_EDITION.items.map((i) => i.rank)).toEqual(range(1, 20));
  expect(FIXTURE_EDITION.reserve.map((i) => i.rank)).toEqual(range(21, 28));
  expect(FIXTURE_EDITION.items.filter((i) => i.slot === 'explore')).toHaveLength(2);
  expect(FIXTURE_EDITION.items.filter((i) => i.slot === 'serendipity')).toHaveLength(1);
  expect(FIXTURE_EDITION.leadArticleId).toBe(FIXTURE_EDITION.items[0].article.id);
  expect(FIXTURE_EDITION.recall).toHaveLength(3);
  expect(FIXTURE_TASTE_CARDS.filter((c) => c.wildcard)).toHaveLength(2);
  expect(FIXTURE_ARCHIVE).toHaveLength(10);
});

it('fixtures are internally consistent', () => {
  const slugs = new Set(FIXTURE_TAXONOMY.map((t) => t.slug));
  allItems.forEach((i) => {
    expect(FIXTURE_EDITION.sectionNames[i.sectionSlug]).toBeTruthy();
    i.article.labels.forEach((l) => {
      expect(slugs.has(l.slug)).toBe(true);
      expect(FIXTURE_EDITION.sectionNames[l.slug]).toBeTruthy();
    });
  });
  expect(FIXTURE_ARTICLES.filter((a) => a.recall).length).toBeGreaterThanOrEqual(20);
  FIXTURE_EDITION.recall.forEach((q) => expect(FIXTURE_ARTICLES.find((a) => a.id === q.articleId)?.recall).toEqual(q));
});

describe('FIXTURE_EDITION', () => {
  it('has the plan header: 2026-10-17, No. 14, The Morrow, Standard 15', () => {
    expect(FIXTURE_EDITION).toMatchObject({ date: '2026-10-17', number: 14, paperName: 'The Morrow', userId: FIXTURE_USER_ID });
    expect(FIXTURE_EDITION.presentation.timeBudget).toBe(15);
  });

  it('uses articles 0–19 for items and 20–27 for the reserve, with the plan slots', () => {
    expect(FIXTURE_EDITION.items.map((i) => i.article.id)).toEqual(FIXTURE_ARTICLES.slice(0, 20).map((a) => a.id));
    expect(FIXTURE_EDITION.reserve.map((i) => i.article.id)).toEqual(FIXTURE_ARTICLES.slice(20).map((a) => a.id));
    const slots = FIXTURE_EDITION.items.map((i) => i.slot);
    expect(slots[0]).toBe('lead');
    expect(slots.slice(1, 4)).toEqual(['top', 'top', 'top']);
    expect(slots.filter((s) => s === 'lead')).toHaveLength(1);
    expect(slots.filter((s) => s === 'bigstory')).toHaveLength(1);
    expect(slots.filter((s) => s === 'core')).toHaveLength(12);
    expect(FIXTURE_EDITION.reserve.every((i) => i.slot === 'reserve')).toBe(true);
  });

  it('follows the rank-v1 rules it claims (§10.4)', () => {
    const lead = FIXTURE_EDITION.items[0];
    expect(lead.tier).toBe('deep');
    expect(lead.article.imageUrl).not.toBeNull();
    // Lead = argmax s·(1 + importance) among items with an image and importance ≥ 0.5 (breakdown.importance = 0.15·importance).
    const importanceOf = (i: (typeof allItems)[number]) => i.breakdown.importance / 0.15;
    const leadValue = (i: (typeof allItems)[number]) => i.score * (1 + importanceOf(i));
    const eligible = FIXTURE_EDITION.items.filter((i) => i.article.imageUrl && importanceOf(i) >= 0.5);
    expect(eligible.map(leadValue).every((v) => v <= leadValue(lead))).toBe(true);
    // Big story = the highest importance overall, and at least 0.5.
    const big = FIXTURE_EDITION.items.find((i) => i.slot === 'bigstory');
    expect(importanceOf(big!)).toBeGreaterThanOrEqual(0.5);
    allItems.forEach((i) => expect(importanceOf(i)).toBeLessThanOrEqual(importanceOf(big!) + 1e-9));
    // Serendipity needs importance ≥ 0.4.
    FIXTURE_EDITION.items.filter((i) => i.slot === 'serendipity').forEach((i) => expect(importanceOf(i)).toBeGreaterThanOrEqual(0.4));
    expect(new Set(allItems.map((i) => i.article.clusterId)).size).toBe(28); // one item per cluster
    const perRoot = new Map<string, number>();
    const perSource = new Map<string, number>();
    for (const i of FIXTURE_EDITION.items) {
      perRoot.set(i.sectionSlug, (perRoot.get(i.sectionSlug) ?? 0) + 1);
      perSource.set(i.article.sourceId, (perSource.get(i.article.sourceId) ?? 0) + 1);
    }
    expect(Math.max(...perRoot.values())).toBeLessThanOrEqual(5);
    expect(Math.max(...perSource.values())).toBeLessThanOrEqual(3);
    // The pinned bonus follows the interest model (a label or its ancestor is pinned), even when the
    // "You pinned" chip is not among the top 2 reasons.
    const pinnedSlugs = new Set(FIXTURE_INTEREST_WEIGHTS.filter((w) => w.pinned).map((w) => w.slug));
    const isPinned = (slugs: string[]) => slugs.some((s) => [s, ...ancestorsOf(s)].some((x) => pinnedSlugs.has(x)));
    for (const i of allItems) {
      const b = i.breakdown;
      expect(i.sectionSlug).toBe(rootOf(i.article.labels[0].slug));
      expect(i.score).toBe(b.total);
      const sum = b.topic + b.similarity - b.negative + b.importance + b.freshness + b.source;
      const pinned = isPinned(i.article.labels.map((l) => l.slug)) ? 0.1 : 0;
      if (i.reasons.some((r) => r.code === 'pinned')) expect(pinned).toBe(0.1);
      expect(b.total).toBeCloseTo(sum + pinned, 3);
      expect(b.total).toBeGreaterThan(0);
      expect(b.total).toBeLessThanOrEqual(1.1);
    }
  });

  it('orders sections by Σ score over the core items and names every section', () => {
    const core = FIXTURE_EDITION.items.filter((i) => i.slot === 'core');
    const sum = (slug: string) => core.filter((i) => i.sectionSlug === slug).reduce((s, i) => s + i.score, 0);
    expect(new Set(FIXTURE_EDITION.sectionOrder)).toEqual(new Set(core.map((i) => i.sectionSlug)));
    const sums = FIXTURE_EDITION.sectionOrder.map(sum);
    expect([...sums].sort((a, b) => b - a)).toEqual(sums);
    FIXTURE_EDITION.sectionOrder.forEach((s) => expect(FIXTURE_EDITION.sectionNames[s]).toBeTruthy());
    const taxonomyName = new Map(FIXTURE_TAXONOMY.map((t) => [t.slug, t.name]));
    for (const [slug, name] of Object.entries(FIXTURE_EDITION.sectionNames)) expect(name).toBe(taxonomyName.get(slug));
  });

  it('gives every item 1–2 reasons in §10.4 chip copy, sorted by weight', () => {
    const chipCopy = [
      /^You follow .+$/,
      /^You've been reading .+$/,
      /^Because you read ".+"$/,
      /^Covered by \d+ outlets today$/,
      /^Trying something new: .+$/,
      /^A step outside your usual$/,
      /^You pinned .+$/,
      /^Fresh this morning$/,
    ];
    for (const i of allItems) {
      expect(i.reasons.length).toBeGreaterThanOrEqual(1);
      expect(i.reasons.length).toBeLessThanOrEqual(2);
      i.reasons.forEach((r) => expect(chipCopy.some((re) => re.test(r.text))).toBe(true));
      expect(i.reasons.map((r) => r.weight)).toEqual([...i.reasons.map((r) => r.weight)].sort((a, b) => b - a));
      const fresh = i.reasons.filter((r) => r.code === 'fresh');
      if (fresh.length > 0) expect(i.reasons).toHaveLength(1); // only when no other reason applies
    }
    const bySlot = (slot: string) => FIXTURE_EDITION.items.filter((i) => i.slot === slot).map((i) => i.reasons[0].code);
    expect(bySlot('explore')).toEqual(['explore', 'explore']);
    expect(bySlot('serendipity')).toEqual(['serendipity']);
    expect(bySlot('bigstory')).toEqual(['bigstory']);
  });

  it('takes Morning Recall from three item articles and counts the AI share among the 20', () => {
    const itemIds = new Set(FIXTURE_EDITION.items.map((i) => i.article.id));
    FIXTURE_EDITION.recall.forEach((q) => expect(itemIds.has(q.articleId)).toBe(true));
    const { aiShare } = FIXTURE_EDITION.receipt;
    expect(aiShare.gemini + aiShare.extractive).toBe(20);
    expect(aiShare.extractive).toBe(FIXTURE_EDITION.items.filter((i) => i.article.aiProvider === 'extractive').length);
    expect(FIXTURE_EDITION.receipt.llmCallsThisEdition).toBe(0);
    expect(Number.isInteger(FIXTURE_EDITION.receipt.buildMs)).toBe(true);
  });
});

describe('FIXTURE_ARTICLES', () => {
  it('spreads over all 9 roots with valid, unique ids and fixture-pattern ids', () => {
    expect(new Set(FIXTURE_ARTICLES.map((a) => rootOf(a.labels[0].slug))).size).toBe(9);
    expect(new Set(FIXTURE_ARTICLES.map((a) => a.id)).size).toBe(28);
    FIXTURE_ARTICLES.forEach((a, i) => expect(a.id).toBe(`00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`));
  });

  it('has ~24 Gemini stories with recall and key fact, the rest extractive', () => {
    const gemini = FIXTURE_ARTICLES.filter((a) => a.aiProvider === 'gemini');
    const extractive = FIXTURE_ARTICLES.filter((a) => a.aiProvider === 'extractive');
    expect(gemini.length).toBe(24);
    gemini.forEach((a) => {
      expect(a.recall).not.toBeNull();
      expect(a.keyFact).toBeTruthy();
      expect(a.whyItMatters).toBeTruthy();
      expect(a.recall?.articleId).toBe(a.id);
      expect(new Set(a.recall?.options).size).toBe(3);
    });
    extractive.forEach((a) => {
      expect(a.recall).toBeNull();
      expect(a.whyItMatters).toBeNull();
      expect(a.headline).toBe(a.title);
      expect(a.summary.std.startsWith(a.summary.brief)).toBe(true);
      expect(a.summary.deep.startsWith(a.summary.std)).toBe(true);
    });
  });

  it('keeps summary tiers near their §10.3 word targets and ends on a sentence', () => {
    for (const a of FIXTURE_ARTICLES) {
      expect(words(a.headline)).toBeLessThanOrEqual(14);
      expect(words(a.summary.brief)).toBeGreaterThanOrEqual(14);
      expect(words(a.summary.brief)).toBeLessThanOrEqual(39);
      expect(words(a.summary.std)).toBeGreaterThanOrEqual(39);
      expect(words(a.summary.std)).toBeLessThanOrEqual(85);
      expect(words(a.summary.deep)).toBeGreaterThanOrEqual(77);
      expect(words(a.summary.deep)).toBeLessThanOrEqual(182);
      for (const tier of [a.summary.brief, a.summary.std, a.summary.deep]) expect(tier).toMatch(/[.!?]$/);
      if (a.recall) expect(words(a.recall.explanation)).toBeLessThanOrEqual(20);
      if (a.whyItMatters) expect(words(a.whyItMatters)).toBeLessThanOrEqual(25);
    }
  });

  it('has images on about 20 stories, labels most specific first that sum to 1', () => {
    const withImages = FIXTURE_ARTICLES.filter((a) => a.imageUrl);
    expect(withImages.length).toBeGreaterThanOrEqual(18);
    expect(withImages.length).toBeLessThanOrEqual(22);
    withImages.forEach((a) => expect(a.imageUrl).toMatch(/^https:\/\/picsum\.photos\/seed\/subah-\d{2}\/1200\/675$/));
    for (const a of FIXTURE_ARTICLES) {
      expect(a.labels.length).toBeGreaterThanOrEqual(1);
      expect(a.labels.length).toBeLessThanOrEqual(3);
      expect(a.labels.reduce((s, l) => s + l.conf, 0)).toBeCloseTo(1, 6);
      expect(a.alsoCoveredBy.length).toBeLessThanOrEqual(5);
      expect(a.alsoCoveredBy).not.toContain(a.sourceName);
      expect(Date.parse(a.publishedAt)).toBeLessThan(Date.parse(FIXTURE_EDITION.createdAt));
    }
  });

  it('uses sources that exist in the verified core feeds (id = slugify(name))', () => {
    const slugify = (name: string) =>
      name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const feeds = JSON.parse(readText('docs/research/feeds.json')) as { name: string; verified: boolean; notes?: string }[];
    const core = new Map(feeds.filter((f) => f.verified && /tier=core/.test(f.notes ?? '')).map((f) => [slugify(f.name), f.name]));
    const allNames = new Set(feeds.filter((f) => f.verified).map((f) => f.name));
    for (const a of FIXTURE_ARTICLES) {
      expect(core.get(a.sourceId)).toBe(a.sourceName);
      a.alsoCoveredBy.forEach((name) => expect(allNames.has(name)).toBe(true));
    }
  });
});

describe('FIXTURE_TAXONOMY and the seed files', () => {
  it('is the 67-node tree from seed/taxonomy.json, parents first', () => {
    expect(FIXTURE_TAXONOMY.filter((t) => t.level === 1)).toHaveLength(9);
    expect(FIXTURE_TAXONOMY.filter((t) => t.level === 2)).toHaveLength(44);
    expect(FIXTURE_TAXONOMY.filter((t) => t.level === 3)).toHaveLength(14);
    expect(new Set(FIXTURE_TAXONOMY.map((t) => t.slug)).size).toBe(67);
    const seen = new Set<string>();
    for (const t of FIXTURE_TAXONOMY) {
      if (t.parentSlug !== null) expect(seen.has(t.parentSlug)).toBe(true);
      expect(t.level).toBe(t.slug.split('.').length);
      expect(t.parentSlug).toBe(t.level === 1 ? null : t.slug.split('.').slice(0, -1).join('.'));
      expect(TopicSlugSchema.safeParse(t.slug).success).toBe(true);
      seen.add(t.slug);
    }
    expect(FIXTURE_TAXONOMY.find((t) => t.slug === 'technical.cs.ai-ml')).toMatchObject({ parentSlug: 'technical.cs', level: 3 });
  });

  it('gets emoji and 2–4 synonyms for levels 1–2 from seed/topic-extras.json, none for level 3', () => {
    const levelOneTwo = FIXTURE_TAXONOMY.filter((t) => t.level < 3);
    expect(Object.keys(topicExtras).sort()).toEqual(levelOneTwo.map((t) => t.slug).sort());
    for (const t of levelOneTwo) {
      expect(t.emoji).toBeTruthy();
      expect(t.synonyms.length).toBeGreaterThanOrEqual(2);
      expect(t.synonyms.length).toBeLessThanOrEqual(4);
      t.synonyms.forEach((s) => expect(s).toBe(s.toLowerCase()));
    }
    FIXTURE_TAXONOMY.filter((t) => t.level === 3).forEach((t) => {
      expect(t.emoji).toBeNull();
      expect(t.synonyms).toEqual([]);
    });
    // "football" must mean only Football, so the keyword mapper can block it precisely (L2 test).
    FIXTURE_TAXONOMY.filter((t) => t.slug !== 'sports.football').forEach((t) =>
      t.synonyms.forEach((s) => expect(s).not.toMatch(/\bfootball\b/)),
    );
  });

  it('keeps seed/taxonomy.json a byte copy of docs/research/taxonomy.json', () => {
    expect(readText('seed/taxonomy.json')).toBe(readText('docs/research/taxonomy.json'));
  });
});

describe('streak, heatmap, archive, learning, taste, profile', () => {
  it('FIXTURE_STREAK is done_today, current 6, 3 read today, edition not complete, 7 days', () => {
    expect(FIXTURE_STREAK).toMatchObject({ state: 'done_today', current: 6, todayStoriesRead: 3, editionComplete: false, todayQualified: true });
    expect(FIXTURE_STREAK.last7.map((d) => d.date)).toEqual(range(11, 17).map((d) => `2026-10-${d}`));
    expect(FIXTURE_STREAK.last7.at(-1)?.status).toBe('read');
    expect(FIXTURE_STREAK.longest).toBeGreaterThanOrEqual(FIXTURE_STREAK.current);
    expect(FIXTURE_EVENTS_RESULT.streak).toEqual(FIXTURE_STREAK);
  });

  it('FIXTURE_HEATMAP covers the 84 days ending 2026-10-17 and agrees with the archive', () => {
    expect(FIXTURE_HEATMAP).toHaveLength(84);
    expect(FIXTURE_HEATMAP[0].date).toBe('2026-07-26');
    expect(FIXTURE_HEATMAP[83].date).toBe('2026-10-17');
    const heat = new Map(FIXTURE_HEATMAP.map((d) => [d.date, d]));
    for (const e of FIXTURE_ARCHIVE) {
      expect(heat.get(e.date)?.storiesRead).toBe(e.storiesRead);
      expect(e.qualified).toBe(e.storiesRead > 0);
    }
    expect(heat.get('2026-10-17')?.storiesRead).toBe(FIXTURE_STREAK.todayStoriesRead);
    expect(FIXTURE_HEATMAP.filter((d) => d.storiesRead > 0)).toHaveLength(FIXTURE_STREAK.totalDays);
  });

  it('FIXTURE_ARCHIVE is newest first and starts with today', () => {
    expect(FIXTURE_ARCHIVE.map((e) => e.number)).toEqual(range(5, 14).reverse());
    expect(FIXTURE_ARCHIVE[0]).toMatchObject({ date: FIXTURE_EDITION.date, number: FIXTURE_EDITION.number, pdfUrl: null });
    expect(FIXTURE_ARCHIVE[0].leadHeadline).toBe(FIXTURE_EDITION.items[0].article.headline);
  });

  it('FIXTURE_LEARNING agrees with FIXTURE_INTEREST_WEIGHTS', () => {
    expect(FIXTURE_INTEREST_WEIGHTS.map((w) => w.slug)).toEqual(FIXTURE_TAXONOMY.map((t) => t.slug));
    expect(FIXTURE_LEARNING.weights).toEqual(FIXTURE_INTEREST_WEIGHTS);
    const theta = new Map(FIXTURE_INTEREST_WEIGHTS.map((w) => [w.slug, w.theta]));
    for (const m of FIXTURE_LEARNING.movers) expect(m.after).toBe(theta.get(m.slug));
    for (const d of FIXTURE_EVENTS_RESULT.deltas) expect(d.after).toBeGreaterThan(d.before);
    expect(FIXTURE_LEARNING.sinceDate).toBe('2026-10-10');
    expect(FIXTURE_INTEREST_WEIGHTS.some((w) => w.picked)).toBe(true);
    expect(FIXTURE_INTEREST_WEIGHTS.some((w) => w.muted)).toBe(true);
    expect(FIXTURE_INTEREST_WEIGHTS.some((w) => w.pinned)).toBe(true);
  });

  it('FIXTURE_TASTE_CARDS: 8 cards, wildcards at 2 and 5, from fixture articles', () => {
    expect(FIXTURE_TASTE_CARDS).toHaveLength(8);
    expect(FIXTURE_TASTE_CARDS.map((c) => c.wildcard)).toEqual([false, false, true, false, false, true, false, false]);
    const ids = new Set(FIXTURE_ARTICLES.map((a) => a.id));
    FIXTURE_TASTE_CARDS.forEach((c) => expect(ids.has(c.articleId)).toBe(true));
  });

  it('FIXTURE_PROFILE is the Ayesha demo persona', () => {
    expect(FIXTURE_PROFILE).toMatchObject({
      userId: FIXTURE_USER_ID,
      displayName: 'Ayesha',
      paperName: 'The Morrow',
      tz: 'Asia/Karachi',
      city: 'Islamabad',
      isDemo: true,
    });
    expect(FIXTURE_PROFILE.presentation).toEqual(FIXTURE_EDITION.presentation);
  });

  it('FIXTURE_SIMULATION has 7 days per arm and a snapshot per day', () => {
    for (const arm of [FIXTURE_SIMULATION.learning, FIXTURE_SIMULATION.onboardingOnly, FIXTURE_SIMULATION.popularity]) {
      expect(arm.map((d) => d.day)).toEqual(range(1, 7));
    }
    expect(FIXTURE_SIMULATION.snapshots.map((s) => s.day)).toEqual(range(1, 7));
  });
});

describe('request schemas', () => {
  it('TasteQuerySchema turns the optional comma string into clean slugs', () => {
    expect(TasteQuerySchema.parse({})).toEqual({ picks: [] });
    expect(TasteQuerySchema.parse({ picks: 'a,../x,,technical.cs.ai-ml,a, Sports ' })).toEqual({
      picks: ['a', 'technical.cs.ai-ml', 'sports'],
    });
    const many = Array.from({ length: 500 }, (_, i) => `topic-${i}`).join(',');
    expect(TasteQuerySchema.parse({ picks: many }).picks).toHaveLength(20);
  });

  it('ArchiveQuerySchema and LearningQuerySchema coerce query strings and default to 60 and 7', () => {
    expect(ArchiveQuerySchema.parse({})).toEqual({ limit: 60 });
    expect(ArchiveQuerySchema.parse({ limit: '12' })).toEqual({ limit: 12 });
    expect(ArchiveQuerySchema.safeParse({ limit: 'abc' }).success).toBe(false);
    expect(LearningQuerySchema.parse({})).toEqual({ since: 7 });
    expect(LearningQuerySchema.parse({ since: '30' })).toEqual({ since: 30 });
  });

  it('DemoClockRequestSchema takes an ISO date-time or null', () => {
    expect(DemoClockRequestSchema.safeParse({ now: '2026-10-18T02:00:00.000Z' }).success).toBe(true);
    expect(DemoClockRequestSchema.safeParse({ now: '2026-10-18T07:00:00+05:00' }).success).toBe(true);
    expect(DemoClockRequestSchema.safeParse({ now: null }).success).toBe(true);
    expect(DemoClockRequestSchema.safeParse({ now: 'yesterday' }).success).toBe(false);
    expect(DemoClockRequestSchema.safeParse({}).success).toBe(false);
  });

  it('ProfilePatchSchema accepts a partial presentation; InterestEditSchema keeps value in [0, 1]', () => {
    expect(ProfilePatchSchema.parse({ presentation: { timeBudget: 5 } })).toEqual({ presentation: { timeBudget: 5 } });
    expect(ProfilePatchSchema.parse({})).toEqual({});
    expect(ProfilePatchSchema.safeParse({ presentation: { timeBudget: 10 } }).success).toBe(false);
    expect(ProfilePatchSchema.safeParse({ paperName: '' }).success).toBe(false);
    expect(InterestEditSchema.safeParse({ slug: 'sports.cricket', action: 'set', value: 0.8 }).success).toBe(true);
    expect(InterestEditSchema.safeParse({ slug: 'sports.cricket', action: 'pin' }).success).toBe(true);
    expect(InterestEditSchema.safeParse({ slug: 'sports.cricket', action: 'set', value: 5 }).success).toBe(false);
    expect(InterestEditSchema.safeParse({ slug: '../etc', action: 'pin' }).success).toBe(false);
  });

  it('OnboardingInputSchema round-trips a valid input unchanged', () => {
    const input = {
      displayName: 'Ayesha',
      paperName: null,
      picks: [{ slug: 'technical.cs.ai-ml', via: 'chip' }, { slug: 'news', via: 'tile' }],
      blocked: ['business.crypto'],
      taste: [],
      presentation: { timeBudget: 15, depth: 'basics', lang: 'en' },
      city: 'Islamabad',
      tz: 'Asia/Karachi',
    };
    expect(OnboardingInputSchema.parse(input)).toEqual(input);
    expect(OnboardingInputSchema.safeParse({ ...input, presentation: { ...input.presentation, timeBudget: 20 } }).success).toBe(false);
  });

  it('DescribeRequestSchema, FastForwardRequestSchema, PdfFallbackSchema, HealthSchema and ErrorSchema', () => {
    expect(DescribeRequestSchema.safeParse({ text: '' }).success).toBe(false);
    expect(DescribeRequestSchema.safeParse({ text: 'CS student into cricket, hates politics' }).success).toBe(true);
    expect(FastForwardRequestSchema.parse({})).toEqual({});
    expect(FastForwardRequestSchema.parse({ days: 7 })).toEqual({ days: 7 });
    expect(PdfFallbackSchema.parse({ fallback: '/paper/2026-10-17/print' })).toEqual({ fallback: '/paper/2026-10-17/print' });
    expect(HealthSchema.safeParse({ db: true, gemini: 'missing', lastIngest: null, fallback: true }).success).toBe(true);
    expect(HealthSchema.safeParse({ db: true, gemini: 'down', lastIngest: null, fallback: true }).success).toBe(false);
    expect(ErrorSchema.safeParse({ error: 'invalid', issues: [{ path: ['events'] }] }).success).toBe(true);
    expect(ErrorSchema.safeParse({ error: 'not found' }).success).toBe(true);
  });

  it('RecallQuestionSchema needs exactly three options and an index of 0–2', () => {
    const q = FIXTURE_EDITION.recall[0];
    expect(RecallQuestionSchema.safeParse({ ...q, options: q.options.slice(0, 2) }).success).toBe(false);
    expect(RecallQuestionSchema.safeParse({ ...q, answerIndex: 3 }).success).toBe(false);
    expect(ArticleCardSchema.safeParse({ ...FIXTURE_ARTICLES[0], recall: null }).success).toBe(true);
  });
});

it('exports exactly the §9.1 schema and fixture names', () => {
  const schemaNames = [
    'TopicSlugSchema', 'PresentationSchema', 'InterestPickSchema', 'OnboardingInputSchema', 'OnboardingResponseSchema',
    'DescribeRequestSchema', 'DescribeResponseSchema', 'TasteQuerySchema', 'TasteCardSchema', 'ArticleCardSchema',
    'RecallQuestionSchema', 'ReasonSchema', 'ScoreBreakdownSchema', 'EditionItemSchema', 'EditionReceiptSchema', 'EditionSchema',
    'ArchiveEntrySchema', 'ArchiveQuerySchema', 'RebuildRequestSchema', 'RebuildResponseSchema', 'PdfFallbackSchema',
    'SignalEventSchema', 'SignalBatchSchema', 'WeightDeltaSchema', 'StreakViewSchema', 'HeatmapDaySchema', 'StreakResponseSchema',
    'EventsResultSchema', 'LearningQuerySchema', 'InterestWeightSchema', 'LearningViewSchema', 'InterestEditSchema',
    'ProfilePatchSchema', 'ProfileSchema', 'DemoClockRequestSchema', 'DemoClockResponseSchema', 'FastForwardRequestSchema',
    'SimulationResultSchema', 'HealthSchema', 'ErrorSchema',
  ];
  expect(Object.keys(api).sort()).toEqual([...schemaNames, 'ROUTES'].sort());
  expect(Object.keys(fixtures).sort()).toEqual(
    [
      'FIXTURE_USER_ID', 'FIXTURE_TAXONOMY', 'FIXTURE_ARTICLES', 'FIXTURE_EDITION', 'FIXTURE_ARCHIVE', 'FIXTURE_STREAK',
      'FIXTURE_HEATMAP', 'FIXTURE_LEARNING', 'FIXTURE_INTEREST_WEIGHTS', 'FIXTURE_TASTE_CARDS', 'FIXTURE_SIMULATION',
      'FIXTURE_PROFILE', 'FIXTURE_EVENTS_RESULT',
    ].sort(),
  );
});

it('ROUTES', () => {
  expect(ROUTES.events).toBe('/api/events');
  expect(ROUTES.edition('2026-10-17')).toBe('/api/editions/2026-10-17');
  expect(ROUTES.pdf('2026-10-17')).toBe('/api/editions/2026-10-17/pdf');
  expect(ROUTES.paper('2026-10-17')).toBe('/paper/2026-10-17');
  expect(ROUTES.print('2026-10-17')).toBe('/paper/2026-10-17/print');
  expect(ROUTES.outbound('a1', 'web')).toBe('/r/a1?src=web');
  expect(ROUTES.outbound('a1', 'print', 'e1')).toBe('/r/a1?src=print&e=e1');
  expect(ROUTES.outbound('a1', 'web', null)).toBe('/r/a1?src=web');
  expect([ROUTES.today, ROUTES.archive, ROUTES.me, ROUTES.start, ROUTES.demo]).toEqual(['/today', '/archive', '/me', '/start', '/demo']);
});

it('brand', () => {
  expect(BRAND.defaultPaperName('Ayesha')).toBe('The Morrow');
  expect(BRAND.defaultPaperName(null)).toBe('The Morrow');
  expect(BRAND.defaultPaperName()).toBe('The Morrow');
  expect(BRAND).toMatchObject({ name: 'Morrow', nameplate: 'The Morrow', tagline: 'One paper, every morning, about what you care about' });
});
