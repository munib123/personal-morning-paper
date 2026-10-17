import { describe, expect, it } from 'vitest';
import { cosine, normalize } from './vector';

const v = (...xs: number[]) => Float32Array.from(xs);

describe('cosine', () => {
  it('cosine of identical normalized vectors is 1', () => {
    const a = normalize(v(0.3, -0.2, 0.9));
    expect(cosine(a, a)).toBeCloseTo(1, 6);
  });

  it('cosine of orthogonal is 0', () => {
    expect(cosine(v(1, 0, 0), v(0, 1, 0))).toBe(0);
  });

  it('is scale invariant', () => {
    expect(cosine(v(1, 1), v(3, 3))).toBeCloseTo(1, 6);
  });

  it('returns 0 when either norm is 0', () => {
    expect(cosine(v(0, 0, 0), v(1, 2, 3))).toBe(0);
    expect(cosine(v(1, 2, 3), v(0, 0, 0))).toBe(0);
  });
});

describe('normalize', () => {
  it('normalize([3,4]) → [0.6,0.8]', () => {
    const n = normalize(v(3, 4));
    expect(n[0]).toBeCloseTo(0.6, 6);
    expect(n[1]).toBeCloseTo(0.8, 6);
  });

  it('returns a new array and leaves the input untouched', () => {
    const input = v(3, 4);
    const n = normalize(input);
    expect(n).not.toBe(input);
    expect(Array.from(input)).toEqual([3, 4]);
  });

  it('keeps a zero vector at zero', () => {
    expect(Array.from(normalize(v(0, 0)))).toEqual([0, 0]);
  });
});
