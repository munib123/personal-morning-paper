import { describe, expect, it } from 'vitest';
import { FIXTURE_EDITION } from '@/contracts/fixtures';
import type { EditionItem, ScoreBreakdown } from '@/contracts/edition';
import {
  alsoCoveredLabel,
  breakdownRows,
  faithfulnessBadge,
  feedbackNote,
  firstName,
  formatEditionDate,
  matchPct,
  outboundHref,
  readingTimeLabel,
  sectionLabel,
  summaryFor,
  takeawaysOf,
  timeAgo,
  topReasons,
} from './format';

const b: ScoreBreakdown = { topic: 0.3, similarity: 0.1, negative: 0.05, importance: 0.1, freshness: 0.05, source: 0.02, total: 0.52 };

describe('timeAgo', () => {
  const now = '2026-10-17T06:00:00Z';
  it('reads like a newspaper', () => {
    expect(timeAgo('2026-10-17T05:59:30Z', now)).toBe('just now');
    expect(timeAgo('2026-10-17T05:15:00Z', now)).toBe('45m ago');
    expect(timeAgo('2026-10-17T05:00:00Z', now)).toBe('1h ago');
    expect(timeAgo('2026-10-17T03:00:00Z', now)).toBe('3h ago');
    expect(timeAgo('2026-10-16T04:00:00Z', now)).toBe('yesterday');
    expect(timeAgo('2026-10-14T06:00:00Z', now)).toBe('3 days ago');
  });
  it('treats future and unusable timestamps calmly', () => {
    expect(timeAgo('2026-10-17T07:00:00Z', now)).toBe('just now');
    expect(timeAgo('not a date', now)).toBe('');
  });
});

describe('dates, reading time, reasons, outlets, links', () => {
  it('writes the edition date in full', () => {
    expect(formatEditionDate('2026-10-17')).toBe('Saturday, 17 October 2026');
    expect(formatEditionDate('2026-01-05')).toBe('Monday, 5 January 2026');
  });
  it('labels reading time', () => {
    expect(readingTimeLabel(6)).toBe('6 min read');
    expect(readingTimeLabel(0)).toBe('1 min read');
  });
  it('keeps the strongest reasons first', () => {
    const reasons = [
      { code: 'topic' as const, text: 'a', weight: 0.1 },
      { code: 'similar' as const, text: 'b', weight: 0.5 },
      { code: 'fresh' as const, text: 'c', weight: 0.3 },
    ];
    expect(topReasons(reasons).map((r) => r.text)).toEqual(['b', 'c']);
    expect(topReasons(reasons, 1).map((r) => r.text)).toEqual(['b']);
    expect(topReasons([])).toEqual([]);
  });
  it('counts other outlets', () => {
    expect(alsoCoveredLabel([])).toBeNull();
    expect(alsoCoveredLabel(['Dawn'])).toBe('Also covered by 1 outlet');
    expect(alsoCoveredLabel(['Dawn', 'BBC'])).toBe('Also covered by 2 outlets');
  });
  it('links out through /r', () => {
    expect(outboundHref('a1', 'ed1')).toBe('/r/a1?src=web&e=ed1');
    expect(outboundHref('a1', null)).toBe('/r/a1?src=web');
  });
});

describe('sectionLabel', () => {
  it('uses the exact name, then the nearest ancestor, then the humanized slug', () => {
    expect(sectionLabel('technical.cs.ai-ml', { 'technical.cs.ai-ml': 'AI & ML' })).toBe('AI & ML');
    expect(sectionLabel('technical.cs.ai-ml', { technical: 'Technical' })).toBe('Technical');
    expect(sectionLabel('technical.cs.ai-ml', { technical: 'Technical', 'technical.cs': 'Computer Science' })).toBe('Computer Science');
    expect(sectionLabel('arts.books', {})).toBe('Books');
    expect(sectionLabel('lifestyle.food-drink', {})).toBe('Food drink');
  });
});

describe('score breakdown', () => {
  it('orders the rows, labels them and shows each share of the total weight', () => {
    const rows = breakdownRows(b);
    expect(rows.map((r) => r.key)).toEqual(['topic', 'similarity', 'importance', 'freshness', 'source', 'negative']);
    expect(rows[0]).toMatchObject({ label: 'Matches your interests', pct: 48, negative: false }); // .3 / .62, rounded
    expect(rows.map((r) => r.label)).toEqual([
      'Matches your interests',
      'Like stories you read',
      "How widely it's covered",
      'How recent it is',
      'Source quality',
      'Like stories you skipped',
    ]);
    expect(rows.at(-1)).toMatchObject({ label: 'Like stories you skipped', negative: true, value: 0.05, pct: 8 });
  });
  it('never divides by zero', () => {
    const zero = { topic: 0, similarity: 0, negative: 0, importance: 0, freshness: 0, source: 0, total: 0 };
    expect(breakdownRows(zero).every((r) => r.pct === 0)).toBe(true);
  });
  it('clamps the match to 0–100', () => {
    expect(matchPct(b)).toBe(52);
    expect(matchPct({ ...b, total: -0.1 })).toBe(0);
    expect(matchPct({ ...b, total: 1.08 })).toBe(100);
    expect(matchPct({ ...b, total: Number.NaN })).toBe(0);
  });
});

describe('faithfulness badge and feedback note', () => {
  it('labels the summary source', () => {
    expect(faithfulnessBadge('gemini')).toMatchObject({ label: 'AI summary · facts checked against source', icon: 'check' });
    expect(faithfulnessBadge('extractive')).toMatchObject({ label: "Publisher's excerpt", icon: 'external' });
    expect(faithfulnessBadge('gemini').tooltip).toMatch(/number/i);
    expect(faithfulnessBadge('gemini').tooltip).toBe(
      "Written by AI from this article alone. Every number in it appears in the source text, names are checked against the source, and a summary that fails a check is replaced by the publisher's own sentences.",
    );
    expect(faithfulnessBadge('extractive').tooltip).toMatch(/no AI/i);
    expect(faithfulnessBadge('extractive').tooltip).toBe(
      "The publisher's own opening sentences, unedited and cut on a sentence boundary. No AI rewrote this summary.",
    );
  });
  it('confirms more and less in one calm line', () => {
    expect(feedbackNote('more', 'Climate tech')).toBe('Got it. More Climate tech tomorrow.');
    expect(feedbackNote('less', 'Cricket')).toBe('Got it. Less Cricket tomorrow.');
  });
});

describe('firstName', () => {
  it('takes the first word of the display name, or null', () => {
    expect(firstName('Ayesha Khan')).toBe('Ayesha');
    expect(firstName('  Bilal  ')).toBe('Bilal');
    expect(firstName('')).toBeNull();
    expect(firstName('   ')).toBeNull();
    expect(firstName(null)).toBeNull();
  });
});

describe('summaryFor and takeawaysOf', () => {
  const item = FIXTURE_EDITION.items[1];
  const withTier = (tier: EditionItem['tier']): EditionItem => ({ ...item, tier });
  it('picks the summary tier by variant', () => {
    expect(summaryFor(item, 'lead')).toBe(item.article.summary.deep);
    expect(summaryFor(withTier('brief'), 'standard')).toBe(item.article.summary.brief);
    expect(summaryFor(withTier('std'), 'standard')).toBe(item.article.summary.std);
    expect(summaryFor(item, 'brief')).toBe(item.article.summary.brief);
    expect(summaryFor(item, 'compact')).toBeUndefined();
  });
  it('turns the top stories into takeaways', () => {
    const three = FIXTURE_EDITION.items.slice(0, 3);
    const names = FIXTURE_EDITION.sectionNames;
    const out = takeawaysOf(three, 'ed1', names);
    expect(out).toHaveLength(3);
    out.forEach((t, i) => {
      const a = three[i].article;
      expect(t.text).toBe(a.keyFact ?? a.headline);
      expect(t.kicker).toBe(sectionLabel(three[i].sectionSlug, names));
      expect(t.href).toBe(`/r/${a.id}?src=web&e=ed1`);
    });
    const noFact = { ...three[0], article: { ...three[0].article, keyFact: null } };
    expect(takeawaysOf([noFact], null, names)[0]).toMatchObject({ text: three[0].article.headline, href: `/r/${three[0].article.id}?src=web` });
  });
});
