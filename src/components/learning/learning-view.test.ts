import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FIXTURE_LEARNING } from '@/contracts/fixtures';
import type { InterestWeight } from '@/contracts/profile';
import { InterestBars } from './InterestBars';
import { LearnedTab } from './LearnedTab';
import { barRows, deltaLabel, splitMovers, timeAgo, timelineLabel } from './learning-view';

const w = (slug: string, theta: number, over: Partial<InterestWeight> = {}): InterestWeight => ({
  slug,
  name: slug.toUpperCase(),
  level: (slug.split('.').length as 1 | 2 | 3),
  theta,
  alpha: 2,
  beta: 2,
  picked: false,
  muted: false,
  pinned: false,
  ...over,
});

const weights = [
  w('sports', 0.4),
  w('sports.cricket', 0.8),
  w('sports.cricket.pakistan', 0.9),
  w('science', 0.6),
  w('science.space', 0.5),
  w('entertainment', 0.3, { muted: true }),
  w('business.startups', 0.45), // its root 'business' is missing
];

describe('deltaLabel', () => {
  it('reads changes in points', () => {
    expect(deltaLabel(0.42, 0.54)).toBe('+12 pts');
    expect(deltaLabel(0.5, 0.47)).toBe('−3 pts');
    expect(deltaLabel(0.5, 0.5)).toBe('no change');
    expect(deltaLabel(0.5, 0.501)).toBe('no change');
  });
});

describe('barRows', () => {
  it('sorts roots by theta and nests every descendant under its root', () => {
    const rows = barRows(weights, []);
    expect(rows.map((r) => r.slug)).toEqual(['science', 'business.startups', 'sports']);
    const sports = rows.find((r) => r.slug === 'sports');
    expect(sports?.children.map((c) => c.slug)).toEqual(['sports.cricket.pakistan', 'sports.cricket']);
    expect(rows.find((r) => r.slug === 'science')?.children.map((c) => c.slug)).toEqual(['science.space']);
  });

  it('leaves muted rows out unless asked', () => {
    expect(barRows(weights, []).some((r) => r.slug === 'entertainment')).toBe(false);
    const all = barRows(weights, [], undefined, { includeMuted: true });
    expect(all.find((r) => r.slug === 'entertainment')).toMatchObject({ muted: true });
  });

  it('puts a mover’s delta on its slug, and override replaces theta', () => {
    const rows = barRows(weights, [{ slug: 'sports.cricket', name: 'Cricket', before: 0.7, after: 0.8 }], { sports: 0.95 });
    const sports = rows.find((r) => r.slug === 'sports');
    expect(sports?.theta).toBe(0.95);
    expect(rows[0].slug).toBe('sports');
    expect(sports?.children.find((c) => c.slug === 'sports.cricket')?.delta).toBeCloseTo(0.1);
    expect(sports?.delta).toBeNull();
  });
});

describe('timeline', () => {
  it('labels signals in plain words', () => {
    expect(timelineLabel('open')).toBe('Opened');
    expect(timelineLabel('skip')).toBe('Skipped');
    expect(timelineLabel('recall_answer')).toBe('Answered recall');
    expect(timelineLabel('read_original')).toBe('Read the original');
  });

  it('timeAgo', () => {
    const now = '2026-10-17T05:00:00.000Z';
    expect(timeAgo('2026-10-17T04:59:40.000Z', now)).toBe('just now');
    expect(timeAgo('2026-10-17T04:42:00.000Z', now)).toBe('18m ago');
    expect(timeAgo('2026-10-17T03:42:00.000Z', now)).toBe('1h ago');
    expect(timeAgo('2026-10-15T03:42:00.000Z', now)).toBe('2d ago');
  });

  it('splitMovers sorts ups and downs by size', () => {
    const { up, down } = splitMovers(FIXTURE_LEARNING.movers);
    expect(up.map((m) => m.slug)).toEqual(['sports.cricket', 'science.space', 'technical.cs.ai-ml', 'business.startups']);
    expect(down.map((m) => m.slug)).toEqual(['entertainment.pakistani-showbiz']);
  });
});

describe('learning components', () => {
  it('LearnedTab shows a calm empty state with no movers and no timeline', () => {
    const html = renderToStaticMarkup(createElement(LearnedTab, { initial: { ...FIXTURE_LEARNING, movers: [], timeline: [] }, nowIso: '2026-10-17T05:00:00.000Z' }));
    expect(html).toContain('Read a few stories and your paper starts adjusting.');
  });

  it('LearnedTab shows the summary, movers in pen and the timeline', () => {
    const html = renderToStaticMarkup(createElement(LearnedTab, { initial: FIXTURE_LEARNING, nowIso: '2026-10-17T05:00:00.000Z' }));
    expect(html).toContain('class="deck');
    expect(html).toContain('+8 pts');
    expect(html).toContain('−9 pts');
    expect(html).toContain('text-pen');
    expect(html).toContain('Opened');
  });

  it('LearnedTab offers Try again when the view failed to load', () => {
    const html = renderToStaticMarkup(createElement(LearnedTab, { initial: null, nowIso: '2026-10-17T05:00:00.000Z' }));
    expect(html).toContain('Couldn&#x27;t load your learning just now.');
    expect(html).toContain('Try again');
  });

  it('InterestBars draws an ink bar per row with its width and a disclosure for children', () => {
    const html = renderToStaticMarkup(createElement(InterestBars, { rows: barRows(weights, []), dayLabel: 'Day 1' }));
    expect(html).toContain('Day 1');
    expect(html).toContain('width:60%');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('sec-');
  });
});
