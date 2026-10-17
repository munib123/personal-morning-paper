import { describe, expect, it } from 'vitest';
import { FIXTURE_EDITION } from '@/contracts/fixtures';
import type { Edition, EditionReceipt } from '@/contracts/edition';
import type { WeightDelta } from '@/contracts/signals';
import { SHORTLIST_DEFAULT, aiShareOf, editionFunnel } from './receipt';
import { tomorrowLine } from './tomorrow';

describe('editionFunnel', () => {
  it('runs considered → stories → shortlist → picked', () => {
    const steps = editionFunnel(FIXTURE_EDITION);
    const r = FIXTURE_EDITION.receipt;
    expect(steps.map((s) => s.key)).toEqual(['considered', 'stories', 'shortlist', 'picked']);
    expect(steps.map((s) => s.value)).toEqual([
      r.articlesConsidered,
      r.clustersConsidered,
      Math.min(SHORTLIST_DEFAULT, r.clustersConsidered),
      FIXTURE_EDITION.items.length,
    ]);
    expect(SHORTLIST_DEFAULT).toBe(200);
    expect(steps[3].label).toBe('20 picked + 8 reserve');
  });

  it('takes a shortlist from the receipt when one is present, clamped to the stories', () => {
    const withShortlist = (receipt: Partial<EditionReceipt> & { shortlist?: number }): Edition =>
      ({ ...FIXTURE_EDITION, receipt: { ...FIXTURE_EDITION.receipt, ...receipt } }) as Edition;
    expect(editionFunnel(withShortlist({ shortlist: 150 }))[2].value).toBe(150);
    expect(editionFunnel(withShortlist({ clustersConsidered: 90 }))[2].value).toBe(90);
  });
});

describe('aiShareOf', () => {
  it('splits AI summaries and publisher excerpts', () => {
    const r = { ...FIXTURE_EDITION.receipt, aiShare: { gemini: 15, extractive: 5 } };
    expect(aiShareOf(r)).toEqual({ aiPct: 75, extractivePct: 25, total: 20 });
  });
  it('never divides by zero', () => {
    const r = { ...FIXTURE_EDITION.receipt, aiShare: { gemini: 0, extractive: 0 } };
    expect(aiShareOf(r)).toEqual({ aiPct: 0, extractivePct: 0, total: 0 });
  });
});

describe('tomorrowLine', () => {
  const names = FIXTURE_EDITION.sectionNames;
  const items = FIXTURE_EDITION.items;
  const d = (slug: string, name: string, before: number, after: number): WeightDelta => ({ slug, name, before, after });

  it('names the biggest rise and the biggest fall', () => {
    const deltas = [d('sports.cricket', 'Cricket', 0.5, 0.56), d('science.space', 'Space', 0.4, 0.5), d('entertainment', 'Showbiz', 0.3, 0.2)];
    expect(tomorrowLine(deltas, {}, items, names)).toBe('Tomorrow your paper leans a little more toward Space and a little less toward Showbiz.');
  });

  it('uses the display name when a delta carries only its slug', () => {
    expect(tomorrowLine([d('technical', 'technical', 0.4, 0.5)], {}, items, names)).toBe(
      `Tomorrow your paper leans a little more toward ${names.technical ?? 'Technical'}.`,
    );
  });

  it('falls back to this session’s More and Less', () => {
    const more = items[0];
    const less = items[1];
    const line = tomorrowLine([], { [more.article.id]: 'more', [less.article.id]: 'less' }, items, names);
    expect(line).toBe(
      `Tomorrow your paper leans a little more toward ${names[more.sectionSlug]} and a little less toward ${names[less.sectionSlug]}.`,
    );
    expect(tomorrowLine([], { [less.article.id]: 'less' }, items, names)).toBe(
      `Tomorrow your paper leans a little less toward ${names[less.sectionSlug]}.`,
    );
  });

  it('says something calm when nothing changed', () => {
    expect(tomorrowLine([], {}, items, names)).toBe("Tomorrow's paper builds on what you read today.");
  });
});
