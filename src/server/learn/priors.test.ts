import { describe, expect, it } from 'vitest';
import type { OnboardingInput } from '@/contracts/profile';
import { DEFAULT_PARAMS } from '@/server/rank/params';
import { makeTaxonomy } from '@/server/rank/__fixtures__/factory';
import { coldStartPos, priorsFromOnboarding } from './priors';

const TAX = makeTaxonomy();
const input = (picks: string[], blocked: string[] = []): OnboardingInput => ({
  displayName: 'Ayesha',
  paperName: null,
  picks: picks.map((slug) => ({ slug, via: 'tile' as const })),
  blocked,
  taste: [],
  presentation: { timeBudget: 15, depth: 'basics', lang: 'en' },
  city: 'Islamabad',
  tz: 'Asia/Karachi',
});
const ab = (s: { alpha: number; beta: number }) => [s.alpha, s.beta];

describe('priorsFromOnboarding', () => {
  it('covers every taxonomy node', () => {
    expect(Object.keys(priorsFromOnboarding(input(['sports']), TAX, DEFAULT_PARAMS)).sort()).toEqual(TAX.map((t) => t.slug).sort());
  });

  it('L1 pick: sports (2,1), its child propagates (1.5,3), the grandchild stays (1,3)', () => {
    const p = priorsFromOnboarding(input(['sports']), TAX, DEFAULT_PARAMS);
    expect(ab(p.sports)).toEqual([2, 1]);
    expect(p.sports.picked).toBe(true);
    expect(ab(p['sports.cricket'])).toEqual([1.5, 3]);
    expect(p['sports.cricket'].picked).toBe(false);
    expect(ab(p['sports.cricket.pakistan'])).toEqual([1, 3]);
  });

  it('L2 pick: technical.cs (3,1), its child (2,3), the parent stays unpicked (1,3)', () => {
    const p = priorsFromOnboarding(input(['technical.cs']), TAX, DEFAULT_PARAMS);
    expect(ab(p['technical.cs'])).toEqual([3, 1]);
    expect(ab(p['technical.cs.ai-ml'])).toEqual([2, 3]);
    expect(ab(p.technical)).toEqual([1, 3]);
  });

  it('L3 pick: technical.cs.ai-ml (4,1)', () => {
    const p = priorsFromOnboarding(input(['technical.cs.ai-ml']), TAX, DEFAULT_PARAMS);
    expect(ab(p['technical.cs.ai-ml'])).toEqual([4, 1]);
  });

  it('blocked topics are muted', () => {
    const p = priorsFromOnboarding(input(['sports'], ['entertainment.pakistani-showbiz']), TAX, DEFAULT_PARAMS);
    expect(p['entertainment.pakistani-showbiz'].muted).toBe(true);
    expect(p.sports.muted).toBe(false);
  });

  it('priors equal state: alpha === priorAlpha and beta === priorBeta everywhere', () => {
    const p = priorsFromOnboarding(input(['sports', 'technical.cs']), TAX, DEFAULT_PARAMS);
    for (const s of Object.values(p)) {
      expect(s.alpha).toBe(s.priorAlpha);
      expect(s.beta).toBe(s.priorBeta);
    }
  });

  it('ignores picks that are not in the taxonomy', () => {
    const p = priorsFromOnboarding(input(['sports', 'not.a-topic']), TAX, DEFAULT_PARAMS);
    expect(p['not.a-topic']).toBeUndefined();
  });
});

describe('coldStartPos', () => {
  it('is the normalized mean-weighted sum of picked topic embeddings', () => {
    const p = priorsFromOnboarding(input(['sports', 'technical']), TAX, DEFAULT_PARAMS);
    const emb = { sports: new Float32Array([1, 0]), technical: new Float32Array([0, 1]), science: new Float32Array([1, 1]) };
    const pos = coldStartPos(p, emb)!;
    // both picked L1 → mean 2/3 each → direction [1,1]/√2
    expect(pos[0]).toBeCloseTo(Math.SQRT1_2, 5);
    expect(pos[1]).toBeCloseTo(Math.SQRT1_2, 5);
  });

  it('is null when no picked topic has an embedding', () => {
    const p = priorsFromOnboarding(input(['sports']), TAX, DEFAULT_PARAMS);
    expect(coldStartPos(p, {})).toBeNull();
  });
});
