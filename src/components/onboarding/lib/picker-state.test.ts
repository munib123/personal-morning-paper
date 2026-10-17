import { describe, expect, test } from 'vitest';
import { FIXTURE_TAXONOMY } from '@/contracts/fixtures';
import type { TopicNode } from '@/contracts/taxonomy';
import {
  MIN_PICKS,
  chipHint,
  childrenOf,
  ctaLabel,
  pickCounterText,
  pickedDescendantCount,
  pickerReducer,
  type PickerAction,
  type PickerState,
} from './picker-state';

const tax = FIXTURE_TAXONOMY;
const EMPTY: PickerState = { picks: [], blocked: [], open: [] };
const run = (actions: PickerAction[], from: PickerState = EMPTY, taxonomy: TopicNode[] = tax) =>
  actions.reduce((s, a) => pickerReducer(s, a, taxonomy), from);

describe('tree helpers', () => {
  test('childrenOf(null) lists the 9 roots in taxonomy order', () => {
    const roots = childrenOf(tax, null);
    expect(roots).toHaveLength(9);
    expect(roots.map((n) => n.slug)).toEqual(['news', 'business', 'technical', 'science', 'health', 'sports', 'entertainment', 'arts', 'lifestyle']);
  });

  test('childrenOf a level-2 node lists its level-3 chips', () => {
    expect(childrenOf(tax, 'technical.cs').map((n) => n.slug)).toContain('technical.cs.ai-ml');
    expect(childrenOf(tax, 'technical.cs.ai-ml')).toEqual([]);
  });
});

describe('toggle', () => {
  test('a root picks as a tile, a deeper topic as a chip, and the parent chip counts it', () => {
    const s1 = run([{ type: 'toggle', slug: 'technical' }]);
    expect(s1.picks).toEqual([{ slug: 'technical', via: 'tile' }]);
    const s2 = pickerReducer(s1, { type: 'toggle', slug: 'technical.cs.ai-ml' }, tax);
    expect(s2.picks).toEqual([{ slug: 'technical', via: 'tile' }, { slug: 'technical.cs.ai-ml', via: 'chip' }]);
    expect(pickedDescendantCount('technical', s2.picks)).toBe(1);
    expect(chipHint('technical.cs', s2.picks)).toBe('1 picked');
    expect(chipHint('sports', s2.picks)).toBeUndefined();
  });

  test('toggling a picked topic off keeps its sub-topic picks', () => {
    const s = run([
      { type: 'toggle', slug: 'technical' },
      { type: 'toggle', slug: 'technical.cs.ai-ml' },
      { type: 'toggle', slug: 'technical' },
    ]);
    expect(s.picks).toEqual([{ slug: 'technical.cs.ai-ml', via: 'chip' }]);
  });

  test('an unknown slug changes nothing', () => {
    const s = run([{ type: 'toggle', slug: 'not.a.topic' }]);
    expect(s).toEqual(EMPTY);
  });
});

describe('toggleDisclosure', () => {
  test('opens and closes a panel', () => {
    const s1 = run([{ type: 'toggleDisclosure', slug: 'technical.cs' }]);
    expect(s1.open).toContain('technical.cs');
    const s2 = pickerReducer(s1, { type: 'toggleDisclosure', slug: 'technical.cs' }, tax);
    expect(s2.open).not.toContain('technical.cs');
  });

  test('panels in other roots stay open', () => {
    const s = run([
      { type: 'toggleDisclosure', slug: 'technical.cs' },
      { type: 'toggleDisclosure', slug: 'sports.cricket' },
    ]);
    expect(s.open.sort()).toEqual(['sports.cricket', 'technical.cs']);
  });

  test('opening a sibling in the same root closes the other', () => {
    const small: TopicNode[] = [
      { slug: 'a', parentSlug: null, level: 1, name: 'A', description: '', emoji: null, synonyms: [] },
      { slug: 'a.x', parentSlug: 'a', level: 2, name: 'X', description: '', emoji: null, synonyms: [] },
      { slug: 'a.x.1', parentSlug: 'a.x', level: 3, name: 'X1', description: '', emoji: null, synonyms: [] },
      { slug: 'a.y', parentSlug: 'a', level: 2, name: 'Y', description: '', emoji: null, synonyms: [] },
      { slug: 'a.y.1', parentSlug: 'a.y', level: 3, name: 'Y1', description: '', emoji: null, synonyms: [] },
    ];
    const s = run([
      { type: 'toggleDisclosure', slug: 'a.x' },
      { type: 'toggleDisclosure', slug: 'a.y' },
    ], EMPTY, small);
    expect(s.open).toEqual(['a.y']);
  });

  test('a topic without children never opens', () => {
    expect(run([{ type: 'toggleDisclosure', slug: 'technical.cs.ai-ml' }]).open).toEqual([]);
  });
});

describe('block and unblock', () => {
  test('block drops the topic and its sub-topics; toggling a blocked topic unblocks and picks it', () => {
    const s1 = run([
      { type: 'toggle', slug: 'technical.cs.ai-ml' },
      { type: 'toggle', slug: 'sports.cricket' },
      { type: 'block', slug: 'technical' },
    ]);
    expect(s1.picks).toEqual([{ slug: 'sports.cricket', via: 'chip' }]);
    expect(s1.blocked).toEqual(['technical']);
    const s2 = pickerReducer(s1, { type: 'toggle', slug: 'technical' }, tax);
    expect(s2.blocked).toEqual([]);
    expect(s2.picks).toContainEqual({ slug: 'technical', via: 'tile' });
  });

  test('unblock only removes the block', () => {
    const s = run([{ type: 'block', slug: 'entertainment' }, { type: 'unblock', slug: 'entertainment' }]);
    expect(s.blocked).toEqual([]);
    expect(s.picks).toEqual([]);
  });

  test('blocking twice keeps one entry', () => {
    expect(run([{ type: 'block', slug: 'entertainment' }, { type: 'block', slug: 'entertainment' }]).blocked).toEqual(['entertainment']);
  });
});

describe('merge (step 3 describe result)', () => {
  test('adds one describe pick and blocks', () => {
    const s = run([{ type: 'merge', picks: ['sports.cricket', 'sports.cricket'], blocked: ['entertainment'] }]);
    expect(s.picks).toEqual([{ slug: 'sports.cricket', via: 'describe' }]);
    expect(s.blocked).toEqual(['entertainment']);
  });

  test('keeps an existing pick as it was and never re-adds a blocked slug', () => {
    const s = run([
      { type: 'toggle', slug: 'sports.cricket' },
      { type: 'block', slug: 'entertainment.pakistani-showbiz' },
      { type: 'merge', picks: ['sports.cricket', 'entertainment.pakistani-showbiz', 'science.climate-environment'], blocked: [] },
    ]);
    expect(s.picks).toEqual([
      { slug: 'sports.cricket', via: 'chip' },
      { slug: 'science.climate-environment', via: 'describe' },
    ]);
    expect(s.blocked).toEqual(['entertainment.pakistani-showbiz']);
  });

  test('ignores slugs that are not in the taxonomy', () => {
    const s = run([{ type: 'merge', picks: ['../x', 'made.up'], blocked: ['nope'] }]);
    expect(s).toEqual(EMPTY);
  });

  test('a block in the same result removes a pick under it', () => {
    const s = run([{ type: 'merge', picks: ['sports.cricket'], blocked: ['sports'] }]);
    expect(s.picks).toEqual([]);
    expect(s.blocked).toEqual(['sports']);
  });
});

describe('set', () => {
  test('replaces the value and keeps the open panels', () => {
    const s = run([
      { type: 'toggleDisclosure', slug: 'technical.cs' },
      { type: 'set', value: { picks: [{ slug: 'news', via: 'tile' }], blocked: ['business.crypto'] } },
    ]);
    expect(s).toEqual({ picks: [{ slug: 'news', via: 'tile' }], blocked: ['business.crypto'], open: ['technical.cs'] });
  });
});

describe('copy', () => {
  test('counter and CTA', () => {
    expect(MIN_PICKS).toBe(3);
    expect(ctaLabel(0)).toBe('Pick 3 more');
    expect(ctaLabel(2)).toBe('Pick 1 more');
    expect(ctaLabel(3)).toBe('Continue');
    expect(ctaLabel(9)).toBe('Continue');
    expect(pickCounterText(0)).toBe('0 topics picked');
    expect(pickCounterText(1)).toBe('1 topic picked');
    expect(pickCounterText(4)).toBe('4 topics picked');
  });
});
