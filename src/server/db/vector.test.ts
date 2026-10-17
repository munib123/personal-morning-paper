import { describe, expect, it } from 'vitest';
import { parseVector, toPgVector } from './vector';

describe('parseVector', () => {
  it('parses a pgvector string', () => {
    expect(Array.from(parseVector('[0.5,-1,2]')!)).toEqual([0.5, -1, 2]);
  });
  it('handles spaces and exponents', () => {
    const v = parseVector('[1e-05, -0.5,2]')!;
    expect(v[0]).toBeCloseTo(0.00001);
    expect(v[1]).toBe(-0.5);
    expect(v).toHaveLength(3);
  });
  it('returns null for null or empty input', () => {
    expect(parseVector(null)).toBeNull();
    expect(parseVector('[]')).toBeNull();
    expect(parseVector('')).toBeNull();
  });
  it('returns a Float32Array', () => {
    expect(parseVector('[1,2]')).toBeInstanceOf(Float32Array);
  });
});

describe('toPgVector', () => {
  it('serializes to pgvector text', () => {
    expect(toPgVector(new Float32Array([0.5, 1]))).toBe('[0.5,1]');
  });
  it('round-trips', () => {
    const v = new Float32Array([0.25, -0.125, 3]);
    expect(Array.from(parseVector(toPgVector(v))!)).toEqual(Array.from(v));
  });
});
