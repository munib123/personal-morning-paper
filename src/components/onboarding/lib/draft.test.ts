import { describe, expect, test } from 'vitest';
import { OnboardingInputSchema } from '@/contracts/api';
import {
  DEFAULT_DRAFT,
  DEFAULT_PICKS,
  DRAFT_KEY,
  buildOnboardingInput,
  clearDraft,
  cleanName,
  loadDraft,
  saveDraft,
} from './draft';

// A Map-backed Storage, so the tests never touch a real localStorage.
function fakeStorage(init: Record<string, string>): Storage {
  const m = new Map(Object.entries(init));
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => { m.delete(k); },
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
  };
}

describe('draft defaults', () => {
  test('defaults', () => {
    expect(DEFAULT_DRAFT.presentation).toEqual({ timeBudget: 15, depth: 'basics', lang: 'en' });
    expect(DEFAULT_DRAFT.city).toBe('Islamabad');
    expect(DEFAULT_DRAFT.deliveryHour).toBe(7);
    expect(DEFAULT_DRAFT.step).toBe(1);
    expect(DEFAULT_PICKS.map((p) => p.slug)).toEqual(['news', 'technical', 'sports', 'business']);
    expect(DEFAULT_PICKS.every((p) => p.via === 'tile')).toBe(true);
    expect(DRAFT_KEY).toBe('subah:onboarding-draft:v2');
  });
});

describe('draft storage', () => {
  test('loadDraft survives throwing / corrupt / old-shape storage', () => {
    const throwing = { getItem: () => { throw new Error('denied'); } } as unknown as Storage;
    expect(loadDraft(throwing)).toEqual(DEFAULT_DRAFT);
    expect(loadDraft(fakeStorage({ [DRAFT_KEY]: '{not json' }))).toEqual(DEFAULT_DRAFT);
    expect(loadDraft(fakeStorage({ [DRAFT_KEY]: JSON.stringify({ step: 9 }) }))).toEqual(DEFAULT_DRAFT);
    expect(
      loadDraft(fakeStorage({ [DRAFT_KEY]: JSON.stringify({ ...DEFAULT_DRAFT, presentation: { timeBudget: 10, depth: 'basics', lang: 'en' } }) })),
    ).toEqual(DEFAULT_DRAFT);
    expect(loadDraft(fakeStorage({ [DRAFT_KEY]: 'null' }))).toEqual(DEFAULT_DRAFT);
    expect(loadDraft(fakeStorage({}))).toEqual(DEFAULT_DRAFT);
    expect(loadDraft(null)).toEqual(DEFAULT_DRAFT);
  });

  test('a draft with over-long text is kept, with the text cut to fit', () => {
    const s = fakeStorage({});
    const long = {
      ...DEFAULT_DRAFT,
      step: 3 as const,
      picks: [{ slug: 'sports.cricket', via: 'chip' as const }],
      name: 'n'.repeat(300),
      words: 'w'.repeat(6000),
      avoidSources: 'a'.repeat(2000),
      city: 'c'.repeat(300),
    };
    expect(saveDraft(long, s)).toBe(true);
    const d = loadDraft(s);
    expect(d.step).toBe(3);
    expect(d.picks).toEqual([{ slug: 'sports.cricket', via: 'chip' }]);
    expect(d.name).toHaveLength(200);
    expect(d.words).toHaveLength(5000);
    expect(d.avoidSources).toHaveLength(1000);
    expect(d.city).toHaveLength(200);
  });

  test('loadDraft ignores a v1 draft under the old key', () => {
    const s = fakeStorage({ 'subah:onboarding-draft:v1': JSON.stringify({ ...DEFAULT_DRAFT, name: 'Old' }) });
    expect(loadDraft(s)).toEqual(DEFAULT_DRAFT);
  });

  test('saveDraft returns false on quota error', () => {
    const full = { setItem: () => { throw new DOMException('q', 'QuotaExceededError'); } } as unknown as Storage;
    expect(saveDraft(DEFAULT_DRAFT, full)).toBe(false);
    expect(saveDraft(DEFAULT_DRAFT, null)).toBe(false);
  });

  test('round-trips', () => {
    const s = fakeStorage({});
    const d = { ...DEFAULT_DRAFT, step: 3 as const, name: 'Ayesha', picks: [{ slug: 'sports.cricket', via: 'chip' as const }] };
    expect(saveDraft(d, s)).toBe(true);
    expect(loadDraft(s)).toEqual(d);
  });

  test('clearDraft removes the draft and never throws', () => {
    const s = fakeStorage({});
    saveDraft({ ...DEFAULT_DRAFT, name: 'Ayesha' }, s);
    clearDraft(s);
    expect(loadDraft(s)).toEqual(DEFAULT_DRAFT);
    const throwing = { removeItem: () => { throw new Error('denied'); } } as unknown as Storage;
    expect(() => clearDraft(throwing)).not.toThrow();
    expect(() => clearDraft(null)).not.toThrow();
  });
});

describe('cleanName', () => {
  test('cleanName', () => {
    expect(cleanName('  ayesha  ')).toBe('Ayesha');
    expect(cleanName('   ')).toBeNull();
    expect(cleanName('')).toBeNull();
    expect(cleanName('x'.repeat(60))!.length).toBe(24);
    expect(cleanName('ayesha    khan')).toBe('Ayesha khan');
  });

  test('an emoji-only name is kept whole and capped by code point', () => {
    expect(cleanName('😀')).toBe('😀');
    const capped = cleanName('😀'.repeat(30))!;
    expect(Array.from(capped)).toHaveLength(24);
    expect(capped).toBe('😀'.repeat(24)); // no half surrogate pair at the end
  });
});

describe('buildOnboardingInput', () => {
  test('buildOnboardingInput validates, names the paper The Morrow, sends no taste', () => {
    const input = buildOnboardingInput({ ...DEFAULT_DRAFT, name: 'Bilal', picks: [{ slug: 'technical.cs.ai-ml', via: 'chip' }] }, 'Asia/Karachi');
    expect(OnboardingInputSchema.parse(input)).toEqual(input);
    expect(input.paperName).toBe('The Morrow');
    expect(input.displayName).toBe('Bilal');
    expect(input.tz).toBe('Asia/Karachi');
    expect(input.taste).toEqual([]);
    expect(input.presentation.timeBudget).toBe(15);
    expect(input.picks).toEqual([{ slug: 'technical.cs.ai-ml', via: 'chip' }]);
  });

  test('skipped picks fall back to DEFAULT_PICKS', () => {
    expect(buildOnboardingInput({ ...DEFAULT_DRAFT, picks: [], skipped: { ...DEFAULT_DRAFT.skipped, picks: true } }).picks).toEqual(DEFAULT_PICKS);
  });

  test('default picks never include a blocked root', () => {
    const input = buildOnboardingInput({ ...DEFAULT_DRAFT, picks: [], blocked: ['sports'] }, 'Asia/Karachi');
    expect(input.picks.map((p) => p.slug)).toEqual(['news', 'technical', 'business']);
    expect(input.blocked).toEqual(['sports']);
  });

  test('empty name → null displayName, blank city → Islamabad', () => {
    const i = buildOnboardingInput({ ...DEFAULT_DRAFT, city: '  ' });
    expect(i.displayName).toBeNull();
    expect(i.paperName).toBe('The Morrow');
    expect(i.city).toBe('Islamabad');
    expect(typeof i.tz).toBe('string');
    expect(i.tz.length).toBeGreaterThan(0);
  });

  test('a long city is trimmed to what the contract accepts', () => {
    const i = buildOnboardingInput({ ...DEFAULT_DRAFT, city: `  ${'k'.repeat(120)}  ` }, 'Asia/Karachi');
    expect(() => OnboardingInputSchema.parse(i)).not.toThrow();
    expect(i.city.length).toBe(80);
  });

  test('delivery time and sources to avoid stay in the draft (contract gap)', () => {
    const i = buildOnboardingInput({ ...DEFAULT_DRAFT, deliveryHour: 6, avoidSources: 'Some Tabloid' }, 'Asia/Karachi');
    expect(Object.keys(i).sort()).toEqual(['blocked', 'city', 'displayName', 'paperName', 'picks', 'presentation', 'taste', 'tz']);
  });
});
