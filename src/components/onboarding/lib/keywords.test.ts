import { describe, expect, test } from 'vitest';
import { FIXTURE_TAXONOMY } from '@/contracts/fixtures';
import { keywordTopics } from './keywords';

const tax = FIXTURE_TAXONOMY;
const slugOf = (name: string) => tax.find((n) => n.name === name)!.slug;

describe('keywordTopics', () => {
  test('more cricket, less celebrity gossip', () => {
    const r = keywordTopics('more cricket, less celebrity gossip', tax);
    expect(r.picks).toContain(slugOf('Cricket'));
    expect(r.blocked).toEqual(['entertainment.pakistani-showbiz']);
    expect(r.picks).not.toContain('entertainment.pakistani-showbiz');
  });

  test('empty or meaningless text matches nothing', () => {
    expect(keywordTopics('', tax)).toEqual({ picks: [], blocked: [] });
    expect(keywordTopics('   ', tax)).toEqual({ picks: [], blocked: [] });
    expect(keywordTopics('hello there', tax)).toEqual({ picks: [], blocked: [] });
  });

  test('is case- and diacritic-insensitive and matches whole words only', () => {
    expect(keywordTopics('CRICKET and Café culture', tax).picks).toContain('sports.cricket');
    expect(keywordTopics('Crème de la crème of FOOTBALL', tax).picks).toContain('sports.football');
    expect(keywordTopics('more CRÍCKÉT', tax).picks).toContain('sports.cricket');
    // "art" is not a whole word inside "smartphone", and "tech" is not inside "technique".
    const r = keywordTopics('smartphones with better technique', tax);
    expect(r.picks).toContain('technical.gadgets');
    expect(r.picks).not.toContain('arts');
    expect(r.picks).not.toContain('technical');
  });

  test('matches each part of a name joined by "&" and synonyms', () => {
    const r = keywordTopics('more climate tech and pakistani startups', tax);
    expect(r.picks).toContain('science.climate-environment');
    expect(r.picks).toContain('business.startups');
    expect(r.picks).toContain('technical');
    expect(r.blocked).toEqual([]);
  });

  test('puts the deepest topics first and caps at 6', () => {
    const r = keywordTopics('AI, web development, cricket, football, tennis, movies, music, gaming, food, travel', tax);
    expect(r.picks).toHaveLength(6);
    expect(r.picks.slice(0, 2)).toEqual(['technical.cs.ai-ml', 'technical.cs.web-dev']);
    const levels = r.picks.map((s) => s.split('.').length);
    expect([...levels].sort((a, b) => b - a)).toEqual(levels);
  });

  test('a negation within 3 words blocks; a clause break or "more" resets it', () => {
    expect(keywordTopics('I hate politics and football', tax).blocked).toContain('sports.football');
    expect(keywordTopics('no crypto please', tax).blocked).toEqual(['business.crypto']);
    expect(keywordTopics('avoid the latest bitcoin news', tax).blocked).toEqual(['business.crypto']);
    const far = keywordTopics('not really into any of the cricket', tax);
    expect(far.picks).toContain('sports.cricket');
    const reset = keywordTopics('less gossip, cricket please', tax);
    expect(reset.picks).toContain('sports.cricket');
    expect(reset.blocked).toEqual([]);
    const more = keywordTopics('less celebrity more cricket', tax);
    expect(more.blocked).toEqual(['entertainment.pakistani-showbiz']);
    expect(more.picks).toContain('sports.cricket');
  });

  test('a topic both wanted and refused ends up blocked only', () => {
    const r = keywordTopics('cricket. actually no cricket', tax);
    expect(r.blocked).toEqual(['sports.cricket']);
    expect(r.picks).not.toContain('sports.cricket');
  });

  test('every slug it returns is in the taxonomy', () => {
    const known = new Set(tax.map((n) => n.slug));
    const r = keywordTopics('CS student into cricket, hates politics, loves AI, no crypto, some urdu poetry', tax);
    for (const s of [...r.picks, ...r.blocked]) expect(known.has(s)).toBe(true);
    expect(r.picks).toContain('technical.cs.ai-ml');
    expect(r.picks).toContain('arts.books-literature');
  });

  test('handles 5000 characters quickly', () => {
    const text = 'cricket and football and more '.repeat(170);
    const t0 = performance.now();
    const r = keywordTopics(text, tax);
    expect(performance.now() - t0).toBeLessThan(500);
    expect(r.picks).toContain('sports.cricket');
  });
});
