// W2: the pure half of "Other angles" (src/server/perspectives/build.ts).
import { describe, expect, it } from 'vitest';
import {
  acceptPerspectives,
  buildPerspectivesPrompt,
  clipWords,
  fallbackPerspectives,
  firstSentence,
  MAX_ANGLE_WORDS,
  MAX_DISAGREEMENT_WORDS,
  MAX_DISAGREEMENTS,
  MAX_SUMMARY_WORDS,
  PerspectivesResponseSchema,
  PerspectivesSchema,
  perspectivesVoiceOk,
  pickRepresentatives,
  sourcesOf,
  StoredPerspectivesSchema,
  stripHtml,
  wordCount,
  type ClusterArticle,
  type ClusterInfo,
  type Perspectives,
} from '@/server/perspectives/build';

const cluster: ClusterInfo = { id: '0b2b1c2e-1111-4f0a-9c1f-aaaaaaaaaaaa', headline: 'Government cuts petrol price by Rs3.63', sourceCount: 3, importance: 0.81 };

const article = (over: Partial<ClusterArticle>): ClusterArticle => ({
  id: 'a1',
  sourceId: 'dawn',
  sourceName: 'Dawn',
  title: 'Petrol price cut by Rs3.63 per litre',
  headline: 'Petrol price cut by Rs3.63 per litre',
  url: 'https://www.dawn.com/news/1',
  summary: 'The government cut the petrol price by Rs3.63 per litre on Thursday. Diesel went up by Rs1.20.',
  publishedAt: '2026-10-16T08:00:00.000Z',
  ...over,
});

const articles: ClusterArticle[] = [
  article({}),
  article({
    id: 'a2',
    sourceId: 'geo',
    sourceName: 'Geo News',
    title: 'Relief at the pump as petrol gets cheaper',
    headline: 'Relief at the pump as petrol gets cheaper',
    url: 'https://www.geo.tv/2',
    summary: '<p>Petrol falls <b>Rs3.63</b> &amp; diesel rises.</p> Transporters say fares will not change.',
    publishedAt: '2026-10-16T09:30:00.000Z',
  }),
  article({ id: 'a3', sourceId: 'tribune', sourceName: 'The Express Tribune', title: 'Fuel prices revised for the next fortnight', headline: null, url: 'https://tribune.com.pk/3', summary: null, publishedAt: '2026-10-16T07:00:00.000Z' }),
  // Dawn again: a second article from the same outlet must not become a second source
  article({ id: 'a4', title: 'Petrol price cut: what it means for you', headline: 'Petrol price cut: what it means for you', url: 'https://www.dawn.com/news/4', publishedAt: '2026-10-15T20:00:00.000Z' }),
];

const lorem = (n: number) => Array.from({ length: n }, (_, i) => `w${i + 1}`).join(' ');

const valid: Perspectives = {
  summary: 'The government cut the petrol price by Rs3.63 per litre.',
  angles: [
    { source: 'Dawn', angle: 'Leads with the diesel increase.', headline: 'Petrol price cut by Rs3.63 per litre' },
    { source: 'Geo News', angle: 'Focuses on transport fares staying put.', headline: 'Relief at the pump as petrol gets cheaper' },
  ],
  disagreements: ['Dawn reports diesel up Rs1.20; Geo News gives no figure.'],
  confidence: 'medium',
};

describe('text helpers', () => {
  it('counts and clips words, ending a cut text with an ellipsis', () => {
    expect(wordCount('  one two   three ')).toBe(3);
    expect(clipWords('one two three', 5)).toBe('one two three');
    const cut = clipWords(lorem(80), 60);
    expect(wordCount(cut)).toBe(60);
    expect(cut.endsWith('…')).toBe(true);
    expect(clipWords('a, b, c,', 2)).toBe('a, b…');
  });

  it('strips HTML and decodes entities; first sentence stops at the first full stop', () => {
    expect(stripHtml('<p>Petrol falls <b>Rs3.63</b> &amp; diesel rises.</p>')).toBe('Petrol falls Rs3.63 & diesel rises.');
    expect(stripHtml('a&#39;s &nbsp; b')).toBe("a's b");
    expect(firstSentence('<p>Petrol falls <b>Rs3.63</b> &amp; diesel rises.</p> Transporters say fares will not change.')).toBe('Petrol falls Rs3.63 & diesel rises.');
    expect(firstSentence('no sentence end here')).toBe('no sentence end here');
  });
});

describe('PerspectivesSchema bounds', () => {
  it('accepts a well-formed answer unchanged', () => {
    expect(PerspectivesSchema.parse(valid)).toEqual(valid);
  });

  it(`clips the summary to ${MAX_SUMMARY_WORDS} words, angles to ${MAX_ANGLE_WORDS}, disagreements to ${MAX_DISAGREEMENTS} × ${MAX_DISAGREEMENT_WORDS}`, () => {
    const out = PerspectivesSchema.parse({
      summary: lorem(90),
      angles: [{ source: 'Dawn', angle: lorem(40), headline: 'h' }],
      disagreements: [lorem(50), 'two', 'three', 'four', 'five'],
      confidence: 'high',
    });
    expect(wordCount(out.summary)).toBeLessThanOrEqual(MAX_SUMMARY_WORDS);
    expect(wordCount(out.angles[0].angle)).toBeLessThanOrEqual(MAX_ANGLE_WORDS);
    expect(out.disagreements).toHaveLength(MAX_DISAGREEMENTS);
    for (const d of out.disagreements) expect(wordCount(d)).toBeLessThanOrEqual(MAX_DISAGREEMENT_WORDS);
  });

  it('rejects an unknown confidence or missing angles (callLLM then steps down the ladder)', () => {
    expect(PerspectivesSchema.safeParse({ ...valid, confidence: 'certain' }).success).toBe(false);
    expect(PerspectivesSchema.safeParse({ ...valid, angles: undefined }).success).toBe(false);
  });

  it('the stored and response shapes extend it with provider, model and computedAt', () => {
    const stored = { ...valid, provider: 'gemini', model: 'gemini-3.5-flash-lite', computedAt: '2026-10-17T03:00:00.000Z' };
    expect(StoredPerspectivesSchema.parse(stored)).toEqual(stored);
    expect(StoredPerspectivesSchema.safeParse({ ...valid, provider: 'openai', model: null, computedAt: 'x' }).success).toBe(false);
    expect(PerspectivesResponseSchema.safeParse({ perspectives: stored, sources: sourcesOf(articles) }).success).toBe(true);
  });
});

describe('sources', () => {
  it('keeps one article per outlet, the newest first, and never a duplicate outlet', () => {
    const reps = pickRepresentatives(articles);
    expect(reps.map((a) => a.sourceName)).toEqual(['Geo News', 'Dawn', 'The Express Tribune']);
    expect(reps.find((a) => a.sourceName === 'Dawn')?.id).toBe('a1');
    expect(sourcesOf(articles)).toEqual([
      { articleId: 'a2', name: 'Geo News', url: 'https://www.geo.tv/2', headline: 'Relief at the pump as petrol gets cheaper', publishedAt: '2026-10-16T09:30:00.000Z' },
      { articleId: 'a1', name: 'Dawn', url: 'https://www.dawn.com/news/1', headline: 'Petrol price cut by Rs3.63 per litre', publishedAt: '2026-10-16T08:00:00.000Z' },
      { articleId: 'a3', name: 'The Express Tribune', url: 'https://tribune.com.pk/3', headline: 'Fuel prices revised for the next fortnight', publishedAt: '2026-10-16T07:00:00.000Z' },
    ]);
  });
});

describe('fallbackPerspectives', () => {
  it('is the cluster headline plus each outlet in its own words, no disagreements, low confidence, and schema-valid', () => {
    const fb = fallbackPerspectives(cluster, articles);
    expect(fb.summary).toBe('Government cuts petrol price by Rs3.63');
    expect(fb.angles.map((a) => a.source)).toEqual(['Geo News', 'Dawn', 'The Express Tribune']);
    expect(fb.angles.map((a) => a.headline)).toEqual(['Relief at the pump as petrol gets cheaper', 'Petrol price cut by Rs3.63 per litre', 'Fuel prices revised for the next fortnight']);
    expect(fb.angles[0].angle).toBe('Petrol falls Rs3.63 & diesel rises.');
    expect(fb.angles[2].angle).toBe('');
    expect(fb.disagreements).toEqual([]);
    expect(fb.confidence).toBe('low');
    expect(PerspectivesSchema.parse(fb)).toEqual(fb);
    expect(perspectivesVoiceOk(fb)).toBe(true);
  });

  it("falls back to the newest article's first sentence when the cluster has no headline", () => {
    const fb = fallbackPerspectives({ ...cluster, headline: null }, articles);
    expect(fb.summary).toBe('Petrol falls Rs3.63 & diesel rises.');
  });

  it('survives an empty cluster', () => {
    const fb = fallbackPerspectives({ ...cluster, headline: null }, []);
    expect(fb).toEqual({ summary: '', angles: [], disagreements: [], confidence: 'low' });
  });
});

describe('buildPerspectivesPrompt', () => {
  const { instructions, prompt } = buildPerspectivesPrompt(cluster, articles);

  it("includes every outlet's name, headline and summary, once per outlet", () => {
    for (const name of ['Dawn', 'Geo News', 'The Express Tribune']) expect(prompt).toContain(`: ${name}\n`);
    expect(prompt).toContain('Headline: Petrol price cut by Rs3.63 per litre');
    expect(prompt).toContain('Headline: Relief at the pump as petrol gets cheaper');
    expect(prompt).toContain('Headline: Fuel prices revised for the next fortnight'); // title when headline is null
    expect(prompt).toContain('Summary: The government cut the petrol price by Rs3.63 per litre on Thursday.');
    expect(prompt).toContain('Summary: Petrol falls Rs3.63 & diesel rises. Transporters say fares will not change.');
    expect(prompt).toContain('Summary: (none)');
    expect(prompt.match(/^Source \d+:/gm)).toHaveLength(3);
    expect(prompt).not.toContain('what it means for you'); // the second Dawn article is not a second source
    expect(prompt).toContain('Story: Government cuts petrol price by Rs3.63');
  });

  it('carries no raw HTML, even from a summary that had tags, and bends stray angle brackets', () => {
    expect(prompt).not.toMatch(/<\/?[a-z][^>]*>/i);
    expect(prompt).not.toContain('<');
    const p2 = buildPerspectivesPrompt(cluster, [article({ summary: 'x < y and <notatag' })]).prompt;
    expect(p2).not.toContain('<');
  });

  it('states the bounds and the Morrow voice in the instructions', () => {
    expect(instructions).toContain(`at most ${MAX_SUMMARY_WORDS} words`);
    expect(instructions).toContain(`at most ${MAX_ANGLE_WORDS} words`);
    expect(instructions).toContain(`at most ${MAX_DISAGREEMENT_WORDS} words`);
    expect(instructions).toContain('"you"');
    expect(instructions).toContain('"our AI"');
    expect(instructions).toContain('untrusted');
  });
});

describe('voice', () => {
  const fb = () => fallbackPerspectives(cluster, articles);

  it('passes calm third-person prose', () => {
    expect(perspectivesVoiceOk(valid)).toBe(true);
    expect(acceptPerspectives(valid, fb)).toBe(valid);
  });

  it.each([
    ['an exclamation mark', { ...valid, summary: 'Petrol is cheaper!' }],
    ['first person singular', { ...valid, disagreements: ['I think Dawn is right.'] }],
    ['first person plural', { ...valid, angles: [{ ...valid.angles[0], angle: 'We see the diesel rise as the story.' }] }],
    ['"our AI"', { ...valid, summary: 'Our AI found the sources agree.' }],
    ['an empty summary', { ...valid, summary: '  ' }],
    ['no angles', { ...valid, angles: [] }],
  ])('rejects %s and returns the fallback', (_label, candidate) => {
    expect(acceptPerspectives(candidate as Perspectives, fb)).toEqual(fb());
  });

  it('ignores quoted headlines: a source headline may shout', () => {
    const shouting = { ...valid, angles: [{ ...valid.angles[0], headline: 'Relief at last!' }] };
    expect(perspectivesVoiceOk(shouting)).toBe(true);
  });
});
