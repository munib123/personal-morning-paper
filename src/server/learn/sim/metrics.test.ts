import { describe, expect, it } from 'vitest';
import { makeCandidate } from '@/server/rank/__fixtures__/factory';
import { baseRate, diversity, ndcgAt10, precisionAt20, randomNdcgAt10 } from './metrics';
import { AYESHA, trueAffinityOf } from './persona';

describe('simulator metrics', () => {
  it('precisionAt20 = share of items with true affinity ≥ 0.6', () => {
    expect(precisionAt20([0.9, 0.7, 0.5, 0.1])).toBe(0.5);
    expect(precisionAt20([])).toBe(0);
  });

  it('ndcgAt10 = 1 for the ideal order', () => {
    expect(ndcgAt10([1, 0, 0], [1, 0, 0])).toBe(1);
  });

  it('ndcgAt10 with the relevant item second ≈ 0.6309', () => {
    expect(ndcgAt10([0, 1], [1, 0])).toBeCloseTo(0.6309, 4);
  });

  it('ndcgAt10 uses the pool top 10 as the ideal, and is 0 for an all-zero pool', () => {
    // ideal DCG = 1/log2(2) + 0.5/log2(3) = 1.31546; ranked DCG = 0.5
    expect(ndcgAt10([0.5], [1, 0.5])).toBeCloseTo(0.3801, 4);
    expect(ndcgAt10([0, 0], [0, 0])).toBe(0);
  });

  it('diversity: identical → 0, orthogonal → 1, nulls skipped', () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([0, 1]);
    expect(diversity([a, a, a])).toBeCloseTo(0, 9);
    expect(diversity([a, b])).toBeCloseTo(1, 9);
    expect(diversity([a, null, b])).toBeCloseTo(1, 9);
    expect(diversity([a])).toBe(0);
  });
});

describe('persona', () => {
  it('true affinity walks up to the first listed ancestor, conf-weighted', () => {
    expect(trueAffinityOf(AYESHA, makeCandidate({ labels: [{ slug: 'sports.cricket.pakistan', conf: 1 }] }))).toBeCloseTo(0.95, 9);
    expect(trueAffinityOf(AYESHA, makeCandidate({ labels: [{ slug: 'science.space', conf: 0.5 }, { slug: 'arts', conf: 0.5 }] }))).toBeCloseTo(0.55, 9);
    expect(trueAffinityOf(AYESHA, makeCandidate({ labels: [] }))).toBe(0.3);
  });

  it('Ayesha onboards with broad picks only', () => {
    expect(AYESHA.picks).toEqual(['sports', 'technical']);
    expect(AYESHA.trueAffinity['science.space']).toBe(0.8);
  });

  it('her self-report is imperfect: a hidden interest she never picked, and a picked topic she rarely reads', () => {
    const picked = (s: string) => AYESHA.picks.some((p) => s === p || s.startsWith(`${p}.`));
    expect(picked('science.space')).toBe(false); // hidden interest
    expect(trueAffinityOf(AYESHA, makeCandidate({ labels: [{ slug: 'science.space', conf: 1 }] }))).toBeGreaterThanOrEqual(0.6);
    expect(picked('sports.football')).toBe(true); // she picked Sports for the cricket…
    expect(trueAffinityOf(AYESHA, makeCandidate({ labels: [{ slug: 'sports.football', conf: 1 }] }))).toBeLessThan(AYESHA.defaultAffinity); // …and rarely reads the rest
    expect(trueAffinityOf(AYESHA, makeCandidate({ labels: [{ slug: 'sports.cricket.leagues', conf: 1 }] }))).toBeCloseTo(0.95, 9);
  });
});

describe('base rates (what a paper picked at random would score)', () => {
  it('baseRate = share of the pool she truly likes', () => {
    expect(baseRate([0.9, 0.3, 0.3, 0.6])).toBe(0.5);
    expect(baseRate([])).toBe(0);
  });

  it('randomNdcgAt10 = mean affinity × Σ 1/log2(k+1) over 10 slots ÷ the ideal DCG', () => {
    const pool = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const h10 = Array.from({ length: 10 }, (_, k) => 1 / Math.log2(k + 2)).reduce((a, b) => a + b, 0);
    expect(randomNdcgAt10(pool)).toBeCloseTo((0.1 * h10) / 1, 9);
    expect(randomNdcgAt10([0.5, 0.5])).toBeCloseTo(1, 9); // fewer than 10 stories: every order is ideal
    expect(randomNdcgAt10([0, 0])).toBe(0);
  });
});
