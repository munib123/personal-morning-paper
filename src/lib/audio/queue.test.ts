import { describe, expect, it } from 'vitest';
import { FIXTURE_EDITION } from '@/contracts/fixtures';
import type { EditionItem } from '@/contracts/edition';
import { buildReadingQueue, estimateMinutes, splitForSynthesis } from './queue';

const items = FIXTURE_EDITION.items;
const names = FIXTURE_EDITION.sectionNames;

function withSummary(item: EditionItem, summary: Partial<EditionItem['article']['summary']>): EditionItem {
  return { ...item, article: { ...item.article, summary: { ...item.article.summary, ...summary } } };
}

describe('buildReadingQueue', () => {
  it('reads every story in edition order with its id, section, text and word count', () => {
    const q = buildReadingQueue(items, { sectionNames: names });
    expect(q.map((c) => c.id)).toEqual(items.map((i) => i.article.id));
    for (const [i, chunk] of q.entries()) {
      expect(chunk.section).toBe(names[items[i].sectionSlug]);
      expect(chunk.headline).toBe(items[i].article.headline);
      expect(chunk.text).toContain(items[i].article.headline);
      expect(chunk.words).toBe(chunk.text.split(/\s+/).filter(Boolean).length);
      expect(chunk.words).toBeGreaterThan(0);
    }
  });

  it('says the section kicker once when it changes, then the headline, then the summary', () => {
    const a = { ...items[0], sectionSlug: items[0].sectionSlug };
    const b = { ...items[1], sectionSlug: items[0].sectionSlug }; // same section as a
    const c = { ...items[2], sectionSlug: items[3].sectionSlug === items[0].sectionSlug ? items[4].sectionSlug : items[3].sectionSlug };
    const q = buildReadingQueue([a, b, c], { sectionNames: names });
    expect(q[0].announceSection).toBe(true);
    expect(q[1].announceSection).toBe(false);
    expect(q[2].announceSection).toBe(true);
    expect(q[0].text.startsWith(q[0].section)).toBe(true);
    expect(q[1].text.startsWith(q[1].section)).toBe(false);
    const headlineAt = q[0].text.indexOf(a.article.headline);
    const summaryAt = q[0].text.indexOf(a.article.summary[a.tier]);
    expect(headlineAt).toBeGreaterThan(0);
    expect(summaryAt).toBeGreaterThan(headlineAt);
  });

  it('leaves skipped stories out', () => {
    const skipped = [items[0].article.id, items[5].article.id];
    const q = buildReadingQueue(items, { skippedIds: skipped, sectionNames: names });
    expect(q).toHaveLength(items.length - 2);
    expect(q.some((c) => skipped.includes(c.id))).toBe(false);
  });

  it("uses the item's displayed tier by default, a forced tier when given, and falls back when a tier is empty", () => {
    const item = withSummary(items[0], { brief: 'Brief one.', std: 'Standard one.', deep: 'Deep one.' });
    const byTier = buildReadingQueue([{ ...item, tier: 'brief' }], { sectionNames: names })[0];
    expect(byTier.text).toContain('Brief one.');
    expect(byTier.text).not.toContain('Deep one.');
    const forced = buildReadingQueue([{ ...item, tier: 'brief' }], { sectionNames: names, tier: 'deep' })[0];
    expect(forced.text).toContain('Deep one.');
    const empty = buildReadingQueue([{ ...withSummary(item, { deep: '' }), tier: 'deep' }], { sectionNames: names })[0];
    expect(empty.text).toContain('Standard one.');
  });

  it('reads the Urdu headline and summary when asked and the story has them', () => {
    const ur = { headline: 'سرخی', summaryStd: 'خلاصہ یہاں ہے۔' };
    const item = { ...items[0], article: { ...items[0].article, ur } };
    const q = buildReadingQueue([item, items[1]], { sectionNames: names, lang: 'ur' });
    expect(q[0].headline).toBe('سرخی');
    expect(q[0].text).toContain('خلاصہ یہاں ہے۔');
    expect(q[1].headline).toBe(items[1].article.headline); // no Urdu: English stays
  });

  it('names a section from the nearest known ancestor, else a humanized slug', () => {
    const item = { ...items[0], sectionSlug: 'technical.cs.machine-learning' as EditionItem['sectionSlug'] };
    expect(buildReadingQueue([item], { sectionNames: { technical: 'Technical' } as typeof names })[0].section).toBe('Technical');
    expect(buildReadingQueue([item], { sectionNames: {} as typeof names })[0].section).toBe('Machine learning');
  });
});

describe('estimateMinutes', () => {
  it('rounds up at 160 words a minute and is 0 for an empty queue', () => {
    expect(estimateMinutes([])).toBe(0);
    const chunk = (words: number) => ({ id: 'x', section: 's', headline: 'h', text: 't', words, announceSection: false });
    expect(estimateMinutes([chunk(10)])).toBe(1);
    expect(estimateMinutes([chunk(160)])).toBe(1);
    expect(estimateMinutes([chunk(161)])).toBe(2);
    expect(estimateMinutes([chunk(800), chunk(320)])).toBe(7);
    expect(estimateMinutes([chunk(800)], 400)).toBe(2);
  });

  it('is about 7 minutes for a 20-story fixture edition', () => {
    const minutes = estimateMinutes(buildReadingQueue(items, { sectionNames: names }));
    expect(minutes).toBeGreaterThanOrEqual(3);
    expect(minutes).toBeLessThanOrEqual(15);
  });
});

describe('splitForSynthesis', () => {
  it('keeps short text whole and drops empty text', () => {
    expect(splitForSynthesis('Short line.')).toEqual(['Short line.']);
    expect(splitForSynthesis('   ')).toEqual([]);
  });

  it('splits at sentence boundaries so no piece passes the limit', () => {
    const text = 'First sentence is here. Second sentence follows it! Third one asks a question? Fourth closes.';
    const pieces = splitForSynthesis(text, 52);
    expect(pieces).toEqual(['First sentence is here. Second sentence follows it!', 'Third one asks a question? Fourth closes.']);
    for (const p of pieces) expect(p.length).toBeLessThanOrEqual(52);
    expect(pieces.join(' ')).toBe(text);
  });

  it('breaks one very long sentence at a comma, then at a space, never mid-word', () => {
    const long = 'Alpha beta gamma delta, epsilon zeta eta theta, iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon';
    const pieces = splitForSynthesis(long, 40);
    for (const p of pieces) expect(p.length).toBeLessThanOrEqual(40);
    expect(pieces.join(' ').replace(/\s+/g, ' ')).toBe(long);
    expect(pieces[0]).toBe('Alpha beta gamma delta,');
  });

  it('understands Urdu and Devanagari full stops', () => {
    const text = 'پہلا جملہ یہاں ہے۔ دوسرا جملہ یہاں ہے۔';
    expect(splitForSynthesis(text, 20)).toEqual(['پہلا جملہ یہاں ہے۔', 'دوسرا جملہ یہاں ہے۔']);
  });
});
