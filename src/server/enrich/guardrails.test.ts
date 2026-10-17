import { describe, expect, it } from 'vitest';
import { FIXTURE_TAXONOMY } from '@/contracts/fixtures';
import { PSX_ITEM, PSX_SOURCE } from './__fixtures__/articles';
import { checkEnrichment, wordCount } from './guardrails';
import type { EnrichmentItem } from './schema';

const SLUGS: ReadonlySet<string> = new Set(FIXTURE_TAXONOMY.map((t) => t.slug));

function item(over: Partial<EnrichmentItem> = {}): EnrichmentItem {
  return { ...structuredClone(PSX_ITEM), ...over };
}
const check = (it: EnrichmentItem) => checkEnrichment(it, PSX_SOURCE, SLUGS);

/** `base` padded with the word "shares" to exactly n words, ending in a full stop. */
function words(n: number, base = ''): string {
  const head = base.split(/\s+/).filter(Boolean);
  return [...head, ...Array.from({ length: n - head.length }, () => 'shares')].join(' ') + '.';
}
// summary_std must keep the recall answer ("1,250") so the grounding check stays green.
const std = (n: number) => words(n, 'The KSE-100 index gained 1,250 points');

describe('wordCount', () => {
  it('counts whitespace-separated words', () => {
    expect(wordCount('  The KSE-100   rose 1,250 points. ')).toBe(5);
    expect(wordCount('')).toBe(0);
  });
});

describe('checkEnrichment', () => {
  it('passes a faithful item', () => {
    const r = check(item());
    expect(r.failures).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('numbers guardrail normalizes separators', () => {
    expect(check(item({ summary_brief: 'The KSE-100 index rose 1250 points on Friday to a record 98400 as investors bought banking and energy shares.' })).ok).toBe(true);
    expect(check(item({ summary_brief: 'The KSE-100 index rose 1,250 points on Friday to a record 98,400 as investors bought banking and energy shares.' })).ok).toBe(true);
    expect(check(item({ why_it_matters: 'Banking shares rose 2.1 percent, a sign of confidence that borrowing costs will keep falling in 2026.' })).ok).toBe(true);
    const invented = check(item({ summary_brief: 'The KSE-100 index rose 1,300 points on Friday to a record 98,400 as investors bought banking and energy shares.' }));
    expect(invented.failures).toContain('numbers');
    expect(invented.ok).toBe(false);
  });

  it('checks numbers in the headline, every summary, why_it_matters and key_fact', () => {
    expect(check(item({ headline: 'KSE-100 gains 777 points to close at a record 98,400' })).failures).toContain('numbers');
    for (const field of ['summary_brief', 'summary_std', 'summary_deep', 'why_it_matters', 'key_fact'] as const) {
      const r = check(item({ [field]: `${PSX_ITEM[field]} It rose 777 times.` }));
      expect(r.failures, field).toContain('numbers');
    }
  });

  it('a number must match between non-digit boundaries', () => {
    // "25" is not in the source: "1,250" normalizes to "1250", which only contains it.
    expect(check(item({ key_fact: 'The index gained 25 points.' })).failures).toContain('numbers');
  });

  it('headline over 14 words fails', () => {
    expect(check(item({ headline: words(15).slice(0, -1) })).failures).toContain('headline_length');
    expect(check(item({ headline: words(14).slice(0, -1) })).failures).not.toContain('headline_length');
  });

  it('headline voice rejects ! ? and emoji', () => {
    for (const headline of ['PSX hits record high!', 'Will PSX hit a record?', 'PSX hits record high 📈']) {
      expect(check(item({ headline })).failures, headline).toContain('headline_voice');
    }
    expect(check(item({ headline: 'PSX closes at a record 98,400' })).ok).toBe(true);
  });

  it('length bands', () => {
    // brief: target 25 → [18, 32]
    expect(check(item({ summary_brief: words(17) })).failures).toContain('brief_length');
    expect(check(item({ summary_brief: words(18) })).ok).toBe(true);
    expect(check(item({ summary_brief: words(32) })).ok).toBe(true);
    expect(check(item({ summary_brief: words(33) })).failures).toContain('brief_length');
    // std: target 60 → [42, 78]
    expect(check(item({ summary_std: std(41) })).failures).toContain('std_length');
    expect(check(item({ summary_std: std(42) })).ok).toBe(true);
    expect(check(item({ summary_std: std(78) })).ok).toBe(true);
    expect(check(item({ summary_std: std(79) })).failures).toContain('std_length');
    // deep: target 125 → [88, 162]
    expect(check(item({ summary_deep: words(87) })).failures).toContain('deep_length');
    expect(check(item({ summary_deep: words(88) })).ok).toBe(true);
    expect(check(item({ summary_deep: words(162) })).ok).toBe(true);
    expect(check(item({ summary_deep: words(163) })).failures).toContain('deep_length');
    // why_it_matters: at most 32 words
    expect(check(item({ why_it_matters: words(32) })).ok).toBe(true);
    expect(check(item({ why_it_matters: words(33) })).failures).toContain('why_length');
  });

  it('entities not in source are dropped, not failed', () => {
    const r = check(item({ entities: ['KSE-100', 'Elon Musk', 'state bank of pakistan', 'kse-100'] }));
    expect(r.ok).toBe(true);
    expect(r.cleaned.entities).toEqual(['KSE-100', 'state bank of pakistan']); // case-insensitive, deduped
    const inSource = ['KSE-100', 'Pakistan Stock Exchange', 'State Bank of Pakistan', 'Friday', 'November', 'September', 'banking', 'energy', 'circular debt', 'power producers'];
    expect(check(item({ entities: inSource })).cleaned.entities).toEqual(inSource.slice(0, 8));
  });

  it('invalid slugs are dropped', () => {
    expect(check(item({ topic_slugs: ['business.markets', 'business.fake'] })).cleaned.topic_slugs).toEqual(['business.markets']);
    const r = check(item({ topic_slugs: ['business.markets', 'business.markets', 'science.space', 'sports.cricket', 'arts.visual-arts'] }));
    expect(r.cleaned.topic_slugs).toEqual(['business.markets', 'science.space', 'sports.cricket']);
    expect(r.ok).toBe(true);
  });

  it('recall needs 3 distinct options', () => {
    const four = check(item({ recall: { ...PSX_ITEM.recall, options: ['1,250', '980', '640', '18'] } }));
    expect(four.failures).toContain('recall_shape');
    const dupes = check(item({ recall: { ...PSX_ITEM.recall, options: ['A', 'a ', 'B'] } }));
    expect(dupes.failures).toContain('recall_options');
    expect(check(item({ recall: { ...PSX_ITEM.recall, answer_index: 3 } })).failures).toContain('recall_shape');
    expect(check(item({ recall: { ...PSX_ITEM.recall, answer_index: 1.5 } })).failures).toContain('recall_shape');
  });

  it('recall answer must be grounded in summary_std', () => {
    const recall = (options: string[], answer_index: number) => item({ recall: { ...PSX_ITEM.recall, options, answer_index } });
    expect(check(recall(['Textile exporters', 'Banking and energy shares', 'Cement makers'], 1)).ok).toBe(true);
    expect(check(recall(['Textile exporters', 'Banking and energy shares', 'Cement makers'], 0)).failures).toContain('recall_grounding');
    // At least half (rounded up) of the key tokens: 2 of 3 passes, 1 of 3 fails.
    expect(check(recall(['Banking and energy companies', 'Cement makers', 'Textile exporters'], 0)).ok).toBe(true);
    expect(check(recall(['Banking stocks and tea', 'Cement makers', 'Textile exporters'], 0)).failures).toContain('recall_grounding');
  });

  it('usable:false skips every check except shape', () => {
    const r = check(
      item({
        usable: false,
        headline: 'Will PSX hit 1,000,000?',
        summary_brief: 'Short.',
        recall: { question: 'q', options: ['a', 'b', 'c', 'd'], answer_index: 7, explanation: '' },
      }),
    );
    expect(r).toMatchObject({ ok: true, failures: [] });
  });
});
