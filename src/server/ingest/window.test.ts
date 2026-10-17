import { describe, expect, it } from 'vitest';
import type { RawItem } from './types';
import { filterAndCap, resolvePublishedAt } from './window';

const now = new Date('2026-10-17T06:00:00Z');
const HOUR = 3_600_000;

function item(hoursAgo: number, i = 0): RawItem {
  return {
    sourceId: 's',
    link: `https://s.com/${i}`,
    title: `Item ${i}`,
    descriptionHtml: null,
    contentHtml: null,
    imageUrl: null,
    author: null,
    publishedRaw: new Date(now.getTime() - hoursAgo * HOUR).toISOString(),
  };
}

describe('resolvePublishedAt', () => {
  it('uses now (first-seen time) when the date is missing or unparseable', () => {
    expect(resolvePublishedAt(undefined, now)).toEqual(now);
    expect(resolvePublishedAt(null, now)).toEqual(now);
    expect(resolvePublishedAt('garbage', now)).toEqual(now);
  });

  it('clamps a date more than 1 h in the future to now, and keeps one within the hour', () => {
    expect(resolvePublishedAt('2026-10-18T09:00:00Z', now)).toEqual(now);
    expect(resolvePublishedAt('2026-10-17T06:30:00Z', now).toISOString()).toBe('2026-10-17T06:30:00.000Z');
  });

  it('parses RFC 822 dates with an offset', () => {
    expect(resolvePublishedAt('Sat, 17 Oct 2026 04:00:00 +0500', now).toISOString()).toBe('2026-10-16T23:00:00.000Z');
  });

  it('reads numbers below 1e12 as epoch seconds and larger ones as epoch ms', () => {
    expect(resolvePublishedAt(1760680800, now).toISOString()).toBe('2025-10-17T06:00:00.000Z');
    expect(resolvePublishedAt(1760680800000, now).toISOString()).toBe('2025-10-17T06:00:00.000Z');
  });
});

describe('filterAndCap', () => {
  it('keeps an item 47 h old and drops one 49 h old', () => {
    const { kept, skippedOld } = filterAndCap([item(47, 1), item(49, 2)], now, 48, 60);
    expect(kept.map((k) => k.link)).toEqual(['https://s.com/1']);
    expect(skippedOld).toBe(1);
  });

  it('caps at maxPerSource, keeping the newest first', () => {
    const items = Array.from({ length: 100 }, (_, i) => item(i * 0.25, i)).reverse(); // oldest first
    const { kept, skippedOld } = filterAndCap(items, now, 48, 60);
    expect(kept).toHaveLength(60);
    expect(skippedOld).toBe(0);
    expect(kept[0].link).toBe('https://s.com/0');
    expect(kept[59].link).toBe('https://s.com/59');
  });

  it('keeps undated items (they count as first seen now)', () => {
    const undated = { ...item(0, 7), publishedRaw: null };
    expect(filterAndCap([undated], now, 48, 60).kept).toHaveLength(1);
  });
});
