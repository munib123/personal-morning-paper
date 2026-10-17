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

describe('scraped boilerplate', () => {
  const BOILER = [
    'To display this content from YouTube, you must enable advertisement tracking and audience measurement.',
    'We use cookies to improve your experience on our site.',
    'Please enable JavaScript to view the comments.',
    'Copyright 2026 Example Media. All rights reserved.',
    'Click here to subscribe to our newsletter.',
    'To watch this content, you may need to disable it on this site.',
    'You’re reading the web edition of STAT’s Health Tech newsletter.',
    'This is today’s edition of The Download, our weekday newsletter that provides a daily dose of what’s going on.',
    'Want to stay on top of the science and politics driving biotech today?',
    'Get your daily dose of health and medicine every weekday with our free Morning Rounds newsletter.',
    'Photo: (dcr).',
    'Cover image: © France 24 01:44 Issued on: 17/10/2026 - 12:41.',
    'Sign up to get it delivered in your inbox every Tuesday and Thursday.',
  ];

  it('never uses a consent, cookie or subscribe banner as the key fact or summary', () => {
    const real = sentence(18, 'The central bank');
    for (const junk of BOILER) {
      const out = extractiveEnrichment({ title: TITLE, lede: null, contentText: `${junk} ${real} ${sentence(15, 'Analysts')}` });
      expect(out.key_fact, junk).toBe(real);
      expect(out.summary_brief, junk).toBe(real);
      expect(out.summary_std, junk).not.toContain(junk);
    }
  });

  it('skips a scraped navigation menu run together into one sentence', () => {
    const nav = 'Home News Sport Weather iPlayer Sounds Bitesize CBeebies CBBC Food Home News Sport Business Technology Health';
    const real = sentence(18, 'Arsenal');
    const out = extractiveEnrichment({ title: TITLE, lede: null, contentText: `${nav} ${real} ${sentence(12, 'Analysts')}` });
    expect(out.key_fact).toBe(real);
  });

  it('drops scraped text glued together without spaces (the real BBC podcast page)', () => {
    const content = 'Home News Sport Weather iPlayer Sounds Bitesize CBeebies CBBC Food Home News Sport Business Technology Health Culture Arts Travel Earth Audio Video Live Use BBC.com or the new BBC App to listen to BBC podcasts, Radio 4 and the World Service outside the UK.Find out how to listen to other BBC stationsEpisode detailsRadio 5 Live,·17 Oct 2026,·13 minsAvailable for over a yearAlex Scott sits down with Kasper and Peter Schmeichel on the latest Football Interview on the Football Daily podcast. The father-son duo reflect on their Premier League title wins, and discuss what it was like for Kasper growing up as the son of Peter Schmeichel. And with Kasper having just retired, how do footballers deal with the end of a career?';
    const out = extractiveEnrichment({ title: 'Football Daily', lede: 'Alex Scott sits down with Kasper and Peter Schmeichel.', contentText: content });
    expect(out.key_fact).toBe('The father-son duo reflect on their Premier League title wins, and discuss what it was like for Kasper growing up as the son of Peter Schmeichel.');
  });

  it('keeps a sentence with a couple of camel-case product names', () => {
    const real = 'Teams using TypeScript and GitHub Actions ship faster, the annual developer survey found.';
    expect(extractiveEnrichment({ title: TITLE, lede: null, contentText: real }).key_fact).toBe(real);
  });

  it('keeps a real sentence that starts with a few capitalised names', () => {
    const real = 'Arsenal, Chelsea and Manchester United all won on Saturday as the title race tightened.';
    expect(extractiveEnrichment({ title: TITLE, lede: null, contentText: real }).key_fact).toBe(real);
  });

  it('falls back to the title when every sentence is boilerplate', () => {
    const out = extractiveEnrichment({ title: TITLE, lede: null, contentText: BOILER.join(' ') });
    expect(out.key_fact).toBe(TITLE);
    expect(out.summary_deep).toBe(TITLE);
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
