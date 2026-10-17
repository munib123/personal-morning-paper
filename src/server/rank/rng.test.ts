import { describe, expect, it } from 'vitest';
import { hashSeed, mulberry32, sampleBeta } from './rng';

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const draws = (n: number, f: () => number) => Array.from({ length: n }, f);

describe('seeded RNG', () => {
  it('same seed same stream', () => {
    const a = mulberry32(hashSeed('u1|2026-10-17'));
    const b = mulberry32(hashSeed('u1|2026-10-17'));
    const xs = draws(5, a);
    const ys = draws(5, b);
    expect(xs).toEqual(ys);
    for (const x of xs) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('different seeds differ', () => {
    const xs = draws(5, mulberry32(hashSeed('u1|2026-10-17')));
    const ys = draws(5, mulberry32(hashSeed('u1|2026-10-18')));
    expect(xs).not.toEqual(ys);
  });

  it('hashSeed is FNV-1a 32-bit', () => {
    // Reference values of FNV-1a 32 (offset basis 2166136261, prime 16777619).
    expect(hashSeed('')).toBe(2166136261);
    expect(hashSeed('a')).toBe(0xe40c292c);
    expect(hashSeed('foobar')).toBe(0xbf9cf968);
  });
});

describe('Beta sampler (Marsaglia–Tsang)', () => {
  it('Beta(2,3) mean over 5000 draws is 0.40 ± 0.02', () => {
    const rng = mulberry32(hashSeed('beta-2-3'));
    expect(Math.abs(mean(draws(5000, () => sampleBeta(rng, 2, 3))) - 0.4)).toBeLessThan(0.02);
  });

  it('Beta(1,3) mean over 5000 draws is 0.25 ± 0.02', () => {
    const rng = mulberry32(hashSeed('beta-1-3'));
    expect(Math.abs(mean(draws(5000, () => sampleBeta(rng, 1, 3))) - 0.25)).toBeLessThan(0.02);
  });

  it('Beta(0.5,0.5) draws all lie strictly inside (0,1)', () => {
    const rng = mulberry32(hashSeed('beta-half'));
    const xs = draws(2000, () => sampleBeta(rng, 0.5, 0.5));
    for (const x of xs) {
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(1);
    }
    // Shape < 1 uses the boost; the mean must still be 0.5.
    expect(Math.abs(mean(xs) - 0.5)).toBeLessThan(0.04);
  });
});
