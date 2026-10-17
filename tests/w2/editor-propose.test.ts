// W2 "Tell your editor": the pure proposal. The reader's verbs decide the direction; mapTextToTopics'
// slugs decide the topics (propose never adds a topic the mapper did not return).
import { describe, expect, it } from 'vitest';
import { FIXTURE_TAXONOMY } from '@/contracts/fixtures';
import type { InterestWeight } from '@/contracts/profile';
import { ADD_WEIGHT, MAX_CHANGES, STEP, editsFor, proposeChanges, setValueFor } from '@/server/editor/propose';

const node = (slug: string) => {
  const n = FIXTURE_TAXONOMY.find((t) => t.slug === slug);
  if (!n) throw new Error(`no topic ${slug}`);
  return n;
};

/** A weight whose own mean equals its θ̂ (alpha/(alpha+beta) = theta), so the arithmetic stays readable. */
const w = (slug: string, theta: number, o: Partial<InterestWeight> = {}): InterestWeight => ({
  slug,
  name: node(slug).name,
  level: node(slug).level,
  theta,
  alpha: theta * 4,
  beta: (1 - theta) * 4,
  picked: true,
  muted: false,
  pinned: false,
  ...o,
});

const INTERESTS: InterestWeight[] = [
  w('sports.cricket', 0.6),
  w('technical.cs.ai-ml', 0.55),
  w('technical.industry', 0.3, { picked: false }),
  w('entertainment', 0.4),
  w('entertainment.pakistani-showbiz', 0.35),
  w('science.space', 0.25, { picked: false }),
  w('business.crypto', 0.5),
  w('sports.football', 0.3),
  w('sports.tennis', 0.3),
  w('entertainment.film', 0.3),
  w('entertainment.music', 0.3),
  w('lifestyle.travel', 0.3),
  w('lifestyle.food', 0.3),
  w('entertainment.gaming', 0.3),
];

const propose = (text: string, picks: string[], blocked: string[] = [], interests = INTERESTS) =>
  proposeChanges({ text, picks: { picks, blocked }, interests, topics: FIXTURE_TAXONOMY });

describe('proposeChanges: each verb', () => {
  it('"more X" raises X by one step and quotes the reader', () => {
    const { changes, unmatched } = propose('more cricket', ['sports.cricket']);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ slug: 'sports.cricket', name: 'Cricket', action: 'raise', before: 0.6 });
    expect(changes[0].after).toBeCloseTo(0.6 + STEP, 4);
    expect(changes[0].reason).toContain('"more cricket"');
    expect(unmatched).toEqual([]);
  });

  it.each(['I love cricket', "I'm interested in cricket", 'curious about cricket', 'More of cricket please'])('"%s" raises', (text) => {
    const [c] = propose(text, ['sports.cricket']).changes;
    expect(c.action).toBe('raise');
    expect(c.after).toBeGreaterThan(c.before);
  });

  it('a topic the reader never picked is added at a modest weight', () => {
    const [c] = propose('curious about astronomy', ['science.space']).changes;
    expect(c).toMatchObject({ slug: 'science.space', action: 'add', before: 0.25 });
    expect(c.after).toBeCloseTo(ADD_WEIGHT, 4);
    expect(c.reason).toContain('"curious about astronomy"');
  });

  it.each(['less crypto', 'fewer crypto stories', 'stop crypto', 'no more crypto'])('"%s" lowers', (text) => {
    const [c] = propose(text, ['business.crypto']).changes;
    expect(c).toMatchObject({ slug: 'business.crypto', action: 'lower', before: 0.5 });
    expect(c.after).toBeCloseTo(0.5 - STEP, 4);
  });

  it('lowering wins even when the keyword mapper filed the topic as a pick ("less" is not a negation there)', () => {
    const [c] = propose('less showbiz', ['entertainment']).changes;
    expect(c).toMatchObject({ slug: 'entertainment', action: 'lower' });
    expect(c.reason).toContain('"less showbiz"');
  });

  it.each(['only cricket', 'always cricket'])('"%s" pins without moving the weight', (text) => {
    const [c] = propose(text, ['sports.cricket']).changes;
    expect(c).toMatchObject({ slug: 'sports.cricket', action: 'pin', before: 0.6, after: 0.6 });
    expect(c.reason).toContain(`"${text}"`);
  });

  it.each(['never crypto', 'hide crypto'])('"%s" mutes (the paper uses 0 for it)', (text) => {
    const [c] = propose(text, ['business.crypto']).changes;
    expect(c).toMatchObject({ slug: 'business.crypto', action: 'mute', before: 0.5, after: 0 });
  });

  it('"never miss X" pins, not mutes (the longest cue wins)', () => {
    expect(propose('never miss cricket', ['sports.cricket']).changes[0].action).toBe('pin');
  });

  it('a bare mention with no verb raises a pick and lowers a blocked topic', () => {
    expect(propose('cricket', ['sports.cricket']).changes[0].action).toBe('raise');
    expect(propose('crypto', [], ['business.crypto']).changes[0].action).toBe('lower');
  });

  it.each([
    ['I only want cricket', 'sports.cricket', 'pin'],
    ["I'd like to see less crypto", 'business.crypto', 'lower'],
    ["I don't want any more crypto", 'business.crypto', 'mute'],
    ['I want more cricket', 'sports.cricket', 'raise'],
  ])('chained verbs read as one: "%s"', (text, slug, action) => {
    const [c] = propose(text, [slug]).changes;
    expect(c).toMatchObject({ slug, action });
  });

  it('"but" ends a verb\'s reach, and the words after it keep their own verb', () => {
    const { changes } = propose('more cricket but hide crypto', ['sports.cricket', 'business.crypto']);
    expect(changes.map((c) => [c.slug, c.action])).toEqual([
      ['sports.cricket', 'raise'],
      ['business.crypto', 'mute'],
    ]);
    expect(changes[1].reason).toContain('"hide crypto"');
  });

  it('a pick the text never names is left out when no "more" clause can justify it', () => {
    expect(propose('less crypto', ['business.crypto', 'science.space']).changes.map((c) => c.slug)).toEqual(['business.crypto']);
  });

  it('"not X" inside a "more" sentence lowers X', () => {
    const { changes } = propose('more cricket, not crypto', ['sports.cricket', 'business.crypto']);
    expect(changes.map((c) => [c.slug, c.action])).toEqual([
      ['sports.cricket', 'raise'],
      ['business.crypto', 'lower'],
    ]);
  });
});

describe('proposeChanges: a mixed sentence', () => {
  const TEXT = "more on cricket and AI policy, less showbiz, and I'm curious about astronomy";

  it('keyword-shaped picks: every topic gets the verb in front of it, in the order the reader wrote them', () => {
    const { changes, unmatched } = propose(TEXT, ['sports.cricket', 'technical.cs.ai-ml', 'technical.industry', 'entertainment', 'science.space']);
    expect(changes.map((c) => [c.slug, c.action])).toEqual([
      ['sports.cricket', 'raise'],
      ['technical.cs.ai-ml', 'raise'],
      ['technical.industry', 'add'],
      ['entertainment', 'lower'],
      ['science.space', 'add'],
    ]);
    expect(changes[0].reason).toContain('"more on cricket"');
    expect(changes[1].reason).toContain('AI policy');
    expect(changes[3].reason).toContain('"less showbiz"');
    expect(changes[4].reason).toContain('"curious about astronomy"');
    expect(unmatched).toEqual([]);
  });

  it('gemini-shaped picks: a blocked topic the text never names takes the first "less/never" clause', () => {
    const { changes } = propose(TEXT, ['sports.cricket', 'technical.cs.ai-ml', 'science.space'], ['entertainment.pakistani-showbiz']);
    const showbiz = changes.find((c) => c.slug === 'entertainment.pakistani-showbiz');
    expect(showbiz).toMatchObject({ action: 'lower', before: 0.35 });
    expect(showbiz?.reason).toContain('less showbiz');
    expect(changes.find((c) => c.slug === 'science.space')?.action).toBe('add');
  });

  it('a pick the text never names takes the first "more" clause (and that clause is not reported unmatched)', () => {
    const { changes, unmatched } = propose('more about the stars', ['science.space']);
    expect(changes[0]).toMatchObject({ slug: 'science.space', action: 'add' });
    expect(changes[0].reason).toContain('"more about the stars"');
    expect(unmatched).toEqual([]);
  });
});

describe('proposeChanges: no match, cap and clamping', () => {
  it('no topics: nothing to change, and the words come back as unmatched', () => {
    expect(propose('hello there', [])).toEqual({ changes: [], unmatched: ['hello there'] });
    expect(propose("I'm curious about quilting", [])).toEqual({ changes: [], unmatched: ['quilting'] });
  });

  it('the words of a clause that matched nothing are unmatched; the rest still applies', () => {
    const { changes, unmatched } = propose('more cricket and quilting', ['sports.cricket']);
    expect(changes.map((c) => c.slug)).toEqual(['sports.cricket']);
    expect(unmatched).toEqual(['quilting']);
  });

  it(`caps the proposal at ${MAX_CHANGES} changes, first mentioned first`, () => {
    const slugs = ['sports.cricket', 'sports.football', 'sports.tennis', 'entertainment.film', 'entertainment.music', 'lifestyle.travel', 'lifestyle.food', 'entertainment.gaming'];
    const { changes } = propose('more cricket, football, tennis, film, music, travel, food and video games', slugs);
    expect(MAX_CHANGES).toBe(6);
    expect(changes).toHaveLength(6);
    expect(changes.map((c) => c.slug)).toEqual(slugs.slice(0, 6));
  });

  it('numbers stay in [0, 1]: raising near the top, lowering near the bottom, junk θ in', () => {
    const top = propose('more cricket', ['sports.cricket'], [], [w('sports.cricket', 0.97)]).changes[0];
    expect(top.after).toBeLessThanOrEqual(1);
    expect(top.after).toBeGreaterThan(top.before);
    const bottom = propose('less crypto', ['business.crypto'], [], [w('business.crypto', 0.04)]).changes[0];
    expect(bottom.after).toBeGreaterThanOrEqual(0);
    expect(bottom.after).toBeLessThan(bottom.before);
    const junk = propose('less crypto', ['business.crypto'], [], [w('business.crypto', 1.7, { alpha: 7, beta: -3 })]).changes[0];
    for (const v of [junk.before, junk.after]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('drops edits that change nothing (already pinned, already muted)', () => {
    expect(propose('always cricket', ['sports.cricket'], [], [w('sports.cricket', 0.6, { pinned: true })]).changes).toEqual([]);
    expect(propose('never crypto', ['business.crypto'], [], [w('business.crypto', 0.5, { muted: true })]).changes).toEqual([]);
  });

  it('a topic missing from the interests list is added from the unpicked prior, named from the taxonomy', () => {
    const [c] = propose('more cricket', ['sports.cricket'], [], []).changes;
    expect(c).toMatchObject({ slug: 'sports.cricket', name: 'Cricket', action: 'add', before: 0.25 });
  });

  it('one slug appears once, at its first mention', () => {
    const { changes } = propose('more cricket, but never cricket', ['sports.cricket']);
    expect(changes).toHaveLength(1);
    expect(changes[0].action).toBe('raise');
  });
});

describe('editsFor: the /me edits that carry out one change, read against the weights as they are now', () => {
  const change = (slug: string, action: 'raise' | 'lower' | 'pin' | 'mute' | 'add', before: number, after: number) => ({ slug, name: slug, before, after, action, reason: 'You said "x".' });

  it('raise / add / lower become one set whose value lands θ̂ on `after`', () => {
    expect(editsFor(change('sports.cricket', 'raise', 0.6, 0.75), w('sports.cricket', 0.6))).toEqual([{ slug: 'sports.cricket', action: 'set', value: 0.825 }]);
    expect(editsFor(change('entertainment', 'lower', 0.4, 0.25), w('entertainment', 0.4))).toEqual([{ slug: 'entertainment', action: 'set', value: 0.25 }]);
  });

  it('a raise on a muted topic unmutes it first; a lower leaves the mute alone', () => {
    const muted = w('business.crypto', 0.5, { muted: true });
    expect(editsFor(change('business.crypto', 'add', 0.5, 0.65), muted).map((e) => e.action)).toEqual(['unmute', 'set']);
    expect(editsFor(change('business.crypto', 'lower', 0.5, 0.35), muted).map((e) => e.action)).toEqual(['set']);
  });

  it('pin unmutes; mute unpins; nothing is sent twice', () => {
    expect(editsFor(change('sports.cricket', 'pin', 0.6, 0.6), w('sports.cricket', 0.6, { muted: true })).map((e) => e.action)).toEqual(['unmute', 'pin']);
    expect(editsFor(change('sports.cricket', 'mute', 0.6, 0), w('sports.cricket', 0.6, { pinned: true })).map((e) => e.action)).toEqual(['unpin', 'mute']);
    expect(editsFor(change('sports.cricket', 'pin', 0.6, 0.6), w('sports.cricket', 0.6, { pinned: true }))).toEqual([]);
  });

  it('recomputes the set value from the fresh θ̂ (the proposal may be a few minutes old)', () => {
    const [e] = editsFor(change('sports.cricket', 'raise', 0.6, 0.75), w('sports.cricket', 0.7));
    expect(e.action).toBe('set');
    expect(e.value).toBeCloseTo(0.7 + 0.05 * 1.5, 4);
  });
});

describe('setValueFor: the own weight that lands the blended θ̂ on the target', () => {
  it('a level-1 topic is its own mean', () => {
    expect(setValueFor({ theta: 0.4, alpha: 1.6, beta: 2.4, level: 1 }, 0.55)).toEqual({ value: 0.55, after: 0.55 });
  });

  it('a level-2 topic moves its own mean 1.5× the θ̂ change (blend 0.6 / 0.9)', () => {
    const r = setValueFor({ theta: 0.6, alpha: 2.4, beta: 1.6, level: 2 }, 0.75);
    expect(r.value).toBeCloseTo(0.825, 4);
    expect(r.after).toBeCloseTo(0.75, 4);
  });

  it('clamps the own mean to [0, 1] and reports the θ̂ that is actually reachable', () => {
    const r = setValueFor({ theta: 0.95, alpha: 3.8, beta: 0.2, level: 2 }, 1.1);
    expect(r.value).toBe(1);
    expect(r.after).toBeCloseTo(0.95 + 0.05 / 1.5, 4);
    expect(r.after).toBeLessThanOrEqual(1);
  });
});
