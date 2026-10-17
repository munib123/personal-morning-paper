import { describe, expect, it } from 'vitest';
import { splitSentences } from '@/server/nlp/text';
import { extractiveEnrichment, extractiveUpdate, wholeSentences } from './extractive';
import { wordCount } from './guardrails';

const FILLER = ['markets', 'rose', 'after', 'the', 'central', 'bank', 'kept', 'its', 'policy', 'steady', 'through', 'the', 'week'];

/** A sentence of exactly n words that starts with `lead` and ends with a full stop. */
function sentence(n: number, lead: string): string {
  const head = lead.split(' ');
  const rest = Array.from({ length: n - head.length }, (_, i) => FILLER[i % FILLER.length]);
  return `${[...head, ...rest].join(' ')}.`;
}

const TITLE = 'Markets rise as the central bank holds steady';

describe('wholeSentences', () => {
  it('keeps whole sentences while the total stays within budget × 1.15', () => {
    const text = [sentence(20, 'Alpha'), sentence(20, 'Bravo'), sentence(20, 'Charlie')].join(' ');
    expect(wordCount(wholeSentences(text, 40))).toBe(40); // a third sentence would make 60 > 46
    expect(wordCount(wholeSentences(text, 60))).toBe(60);
  });

  it('always returns at least the first sentence', () => {
    const text = [sentence(30, 'Alpha'), sentence(10, 'Bravo')].join(' ');
    expect(wholeSentences(text, 0)).toBe(sentence(30, 'Alpha'));
  });
});

describe('extractiveEnrichment', () => {
  it('builds brief, std and deep from whole sentences', () => {
    const s = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'].map((lead) => sentence(20, lead));
    const f = extractiveEnrichment({ title: TITLE, lede: null, contentText: s.join(' ') });
    expect(f.summary_brief).toBe(s[0]);
    expect(f.summary_std).toBe(s.slice(0, 3).join(' ')); // a 4th would make 80 > 69
    expect(wordCount(f.summary_std)).toBe(60);
    expect(f.summary_deep).toBe(s.join(' ')); // 100 ≤ 138
    expect(f.headline).toBe(TITLE);
    expect(f.key_fact).toBe(s[0]);
    expect(f.recall).toBeNull();
    expect(f.why_it_matters).toBeNull();
    expect(f.entities).toEqual([]);
  });

  it('extractive keeps a long first sentence whole', () => {
    const long = sentence(90, 'Alpha');
    const f = extractiveEnrichment({ title: TITLE, lede: long, contentText: null });
    for (const tier of [f.summary_brief, f.summary_std, f.summary_deep]) {
      expect(tier).toBe(long);
      expect(wordCount(tier)).toBe(90);
      expect(tier).not.toContain('…');
    }
  });

  it('extractive output always ends on a sentence boundary', () => {
    const text = [
      sentence(12, 'Alpha'),
      sentence(30, 'Officials said Dr. Khan'),
      sentence(25, 'Charlie'),
      `${sentence(39, 'Delta').slice(0, -1)} "steady."`,
      sentence(18, 'Echo'),
    ].join(' ');
    const all = splitSentences(text);
    expect(all).toHaveLength(5);
    const f = extractiveEnrichment({ title: TITLE, lede: null, contentText: text });
    const checks: [string, number][] = [
      [f.summary_brief, 0],
      [f.summary_std, 60],
      [f.summary_deep, 120],
    ];
    for (const [tier, budget] of checks) {
      const n = all.findIndex((_, i) => all.slice(0, i + 1).join(' ') === tier) + 1;
      expect(n, tier).toBeGreaterThanOrEqual(1);
      expect(tier).toMatch(/[.!?]["'”’)]*$/);
      if (n > 1) expect(wordCount(tier)).toBeLessThanOrEqual(budget * 1.15);
    }
    expect(f.summary_std).toBe(all.slice(0, 3).join(' ')); // 12 + 30 + 25 = 67 ≤ 69
    expect(f.summary_deep).toBe(all.join(' ')); // 125 ≤ 138
  });

  it('drops a trailing fragment that has no end punctuation', () => {
    const f = extractiveEnrichment({ title: TITLE, lede: 'Markets rose on Friday. Analysts expect the rally to continue into…', contentText: null });
    expect(f.summary_brief).toBe('Markets rose on Friday.');
    expect(f.summary_deep).toBe('Markets rose on Friday.');
  });

  it('extractive handles title-only articles', () => {
    const f = extractiveEnrichment({ title: 'Show HN: a tiny database', lede: null, contentText: null });
    expect(f.summary_brief).toBe('Show HN: a tiny database');
    expect(f.summary_std).toBe('Show HN: a tiny database');
    expect(f.summary_deep).toBe('Show HN: a tiny database');
    expect(f.key_fact).toBe('Show HN: a tiny database');
    expect(f.headline).toBe('Show HN: a tiny database');
  });

  it('extractive prefers content when it has more words than the lede', () => {
    const lede = sentence(10, 'Lede');
    const content = ['Alpha', 'Bravo', 'Charlie'].map((l) => sentence(20, l)).join(' ');
    expect(extractiveEnrichment({ title: TITLE, lede, contentText: content }).summary_std).toBe(content);
    expect(extractiveEnrichment({ title: TITLE, lede: content, contentText: lede }).summary_std).toBe(content);
  });
});

describe('extractiveUpdate', () => {
  it('is the fallback row patch', () => {
    const patch = extractiveUpdate({ title: TITLE, lede: sentence(20, 'Alpha'), contentText: null });
    expect(patch).toMatchObject({ status: 'fallback', enrich_provider: 'extractive', headline: TITLE, recall: null, why_it_matters: null, entities: [] });
  });
});
