// W2-shipkit: the pure helpers behind scripts/snapshot-demo.ts (deterministic JSON, local PDF lookup,
// the derived learning view used while L3's getLearningView is still the L0 stub).
import { describe, expect, it } from 'vitest';
import { LearningViewSchema } from '@/contracts/api';
import { FIXTURE_ARTICLES, FIXTURE_TAXONOMY } from '@/contracts/fixtures';
import type { ArticleCard } from '@/contracts/article';
import { candidateFromCard, deriveLearningView, type LearningInput } from '@/server/demo/derive';
import { pickLocalPdf, stableStringify } from '@/server/demo/format';
import type { SnapshotEvent, SnapshotInterest } from '@/server/demo/schema';

describe('stableStringify', () => {
  it('sorts object keys recursively and keeps array order', () => {
    const a = stableStringify({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: null } });
    const b = stableStringify({ a: { c: null, d: [3, { y: 2, z: 1 }] }, b: 1 });
    expect(a).toBe(b);
    expect(a).toBe('{\n  "a": {\n    "c": null,\n    "d": [\n      3,\n      {\n        "y": 2,\n        "z": 1\n      }\n    ]\n  },\n  "b": 1\n}');
  });

  it('round-trips through JSON.parse and drops undefined like JSON.stringify', () => {
    const text = stableStringify({ k: undefined, n: 1.5, s: 'x', t: true, list: [undefined, 1] });
    expect(JSON.parse(text)).toEqual({ n: 1.5, s: 'x', t: true, list: [null, 1] });
  });
});

describe('pickLocalPdf', () => {
  const files = ['sample.pdf', 'ayesha-2026-10-16.pdf', '2026-10-17.pdf', 'notes-2026-10-17.txt'];
  it('prefers the exact date file, else any pdf whose name holds the date', () => {
    expect(pickLocalPdf('2026-10-17', files)).toBe('/demo/2026-10-17.pdf');
    expect(pickLocalPdf('2026-10-16', files)).toBe('/demo/ayesha-2026-10-16.pdf');
  });
  it('returns null when no pdf matches (the sample is never a persona paper)', () => {
    expect(pickLocalPdf('2026-10-10', files)).toBeNull();
    expect(pickLocalPdf('2026-10-17', [])).toBeNull();
  });
});

describe('candidateFromCard', () => {
  it('builds an engine Candidate from an ArticleCard without an embedding', () => {
    const card = FIXTURE_ARTICLES[0];
    const c = candidateFromCard(card, 0.42);
    expect(c.id).toBe(card.id);
    expect(c.embedding).toBeNull();
    expect(c.labels).toEqual(card.labels);
    expect(c.importance).toBe(0.42);
    expect(c.wordCount).toBe(card.readingMinutes * 230);
    expect(c.headline).toBe(card.headline);
  });
});

describe('deriveLearningView', () => {
  const cricket = FIXTURE_TAXONOMY.find((t) => t.slug.includes('cricket'))!;
  const parent = FIXTURE_TAXONOMY.find((t) => t.slug === cricket.parentSlug)!;
  const science = FIXTURE_TAXONOMY.find((t) => t.level === 1 && t.slug !== parent.slug)!;
  const interests: SnapshotInterest[] = [
    { slug: cricket.slug, alpha: 9, beta: 1, priorAlpha: 4, priorBeta: 1, picked: true, muted: false, pinned: false },
    { slug: parent.slug, alpha: 3, beta: 1, priorAlpha: 2, priorBeta: 1, picked: true, muted: false, pinned: false },
    { slug: science.slug, alpha: 1, beta: 3, priorAlpha: 1, priorBeta: 3, picked: false, muted: false, pinned: false },
    { slug: 'not.in.taxonomy', alpha: 1, beta: 1, priorAlpha: 1, priorBeta: 1, picked: false, muted: false, pinned: false },
  ];
  const article: ArticleCard = { ...FIXTURE_ARTICLES[0], id: 'a-1', headline: 'Spinners seal the series', labels: [{ slug: cricket.slug, conf: 1 }] };
  const events: SnapshotEvent[] = [
    { at: '2026-10-17T03:00:00.000Z', localDate: '2026-10-17', type: 'impression', articleId: 'a-1', editionId: null, value: null, meta: {} },
    { at: '2026-10-17T03:01:00.000Z', localDate: '2026-10-17', type: 'open', articleId: 'a-1', editionId: null, value: null, meta: { mode: 'sheet' } },
    { at: '2026-10-17T03:02:00.000Z', localDate: '2026-10-17', type: 'dwell', articleId: 'a-1', editionId: null, value: 30000, meta: { mode: 'sheet' } },
    { at: '2026-10-16T03:02:00.000Z', localDate: '2026-10-16', type: 'pdf_download', articleId: null, editionId: 'e-1', value: null, meta: {} },
    { at: '2026-10-16T03:03:00.000Z', localDate: '2026-10-16', type: 'skip', articleId: 'missing', editionId: null, value: null, meta: { reason: 'not_interested' } },
  ];
  const input: LearningInput = {
    interests,
    snapshots: [
      { date: '2026-10-10', weights: { [cricket.slug]: 0.5, [parent.slug]: 0.5, [science.slug]: 0.25 } },
      { date: '2026-10-16', weights: { [cricket.slug]: 0.8 } },
    ],
    events,
    articles: new Map([[article.id, article]]),
    taxonomy: FIXTURE_TAXONOMY,
    today: '2026-10-17',
    sinceDays: 7,
  };

  it('returns a contract-shaped LearningView', () => {
    expect(() => LearningViewSchema.parse(deriveLearningView(input))).not.toThrow();
  });

  it('weights: only taxonomy slugs, named, sorted by theta', () => {
    const v = deriveLearningView(input);
    expect(v.weights.map((w) => w.slug)).not.toContain('not.in.taxonomy');
    expect(v.weights[0].slug).toBe(cricket.slug);
    expect(v.weights[0].name).toBe(cricket.name);
    expect(v.weights[0].level).toBe(cricket.level);
    for (let i = 1; i < v.weights.length; i++) expect(v.weights[i - 1].theta).toBeGreaterThanOrEqual(v.weights[i].theta);
  });

  it('movers compare the snapshot taken on or before sinceDate with the current thetas', () => {
    const v = deriveLearningView(input);
    expect(v.sinceDate).toBe('2026-10-10');
    const c = v.movers.find((m) => m.slug === cricket.slug)!;
    expect(c.before).toBe(0.5);
    expect(c.after).toBeGreaterThan(0.5);
    expect(c.name).toBe(cricket.name);
    expect(v.changeSummary).toContain(cricket.name);
  });

  it('timeline: newest first, impressions left out, headline from the article, an effect per row', () => {
    const v = deriveLearningView(input);
    expect(v.timeline.map((t) => t.type)).toEqual(['dwell', 'open', 'skip', 'pdf_download']);
    expect(v.timeline[0].headline).toBe('Spinners seal the series');
    expect(v.timeline[0].effect).toMatch(new RegExp(`^${cricket.name} \\+\\d+(\\.\\d+)?%$`));
    expect(v.timeline[2].headline).toBeNull();
    expect(v.timeline[3].effect).toMatch(/paper/);
  });

  it('with no snapshots and no events the view is still valid and calm', () => {
    const v = deriveLearningView({ ...input, snapshots: [], events: [] });
    expect(v.movers).toEqual([]);
    expect(v.timeline).toEqual([]);
    expect(v.changeSummary.length).toBeGreaterThan(0);
    expect(() => LearningViewSchema.parse(v)).not.toThrow();
  });
});
