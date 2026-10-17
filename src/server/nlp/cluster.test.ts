import { describe, expect, it } from 'vitest';
import { assignCluster, importance, joinCluster, type ClusterState } from './cluster';

const at = new Date('2026-10-17T06:00:00Z');
const hours = (h: number) => new Date(at.getTime() - h * 3_600_000);
const angle = (cos: number) => Float32Array.from([cos, Math.sqrt(1 - cos * cos)]);

function cluster(over: Partial<ClusterState> = {}): ClusterState {
  return {
    id: 'c1',
    centroid: Float32Array.from([1, 0]),
    firstSeen: hours(2),
    lastSeen: hours(1),
    articleCount: 1,
    sourceIds: new Set(['dawn']),
    headline: 'First story',
    isNew: false,
    touched: false,
    ...over,
  };
}

describe('assignCluster', () => {
  it('joins at exactly 0.82', () => {
    expect(assignCluster(angle(0.82), [cluster()], at)).toBe(0);
  });

  it('does not join at 0.81', () => {
    expect(assignCluster(angle(0.81), [cluster()], at)).toBe(-1);
  });

  it('ignores clusters last seen more than 36h before at', () => {
    expect(assignCluster(angle(0.99), [cluster({ lastSeen: hours(37) })], at)).toBe(-1);
    expect(assignCluster(angle(0.99), [cluster({ lastSeen: hours(35) })], at)).toBe(0);
  });

  it('ignores clusters at size cap 12', () => {
    expect(assignCluster(angle(0.99), [cluster({ articleCount: 12 })], at)).toBe(-1);
    expect(assignCluster(angle(0.99), [cluster({ articleCount: 11 })], at)).toBe(0);
  });

  it('picks the most similar of two eligible clusters', () => {
    const a = cluster({ id: 'a', centroid: angle(0.85) });
    const b = cluster({ id: 'b', centroid: angle(0.97) });
    expect(assignCluster(Float32Array.from([1, 0]), [a, b], at)).toBe(1);
  });

  it('respects a custom threshold', () => {
    expect(assignCluster(angle(0.75), [cluster()], at, { threshold: 0.7 })).toBe(0);
  });

  it('returns -1 with no clusters', () => {
    expect(assignCluster(angle(0.9), [], at)).toBe(-1);
  });
});

describe('joinCluster', () => {
  it('running mean re-normalizes', () => {
    const c = cluster();
    joinCluster(c, Float32Array.from([0, 1]), 'geo', at);
    expect(c.centroid[0]).toBeCloseTo(0.7071, 4);
    expect(c.centroid[1]).toBeCloseTo(0.7071, 4);
    expect(c.articleCount).toBe(2);
    expect([...c.sourceIds].sort()).toEqual(['dawn', 'geo']);
    expect(c.lastSeen).toEqual(at);
    expect(c.touched).toBe(true);
  });

  it('weights the mean by the article count', () => {
    const c = cluster({ articleCount: 3 });
    joinCluster(c, Float32Array.from([0, 1]), 'dawn', at);
    // (3·[1,0] + [0,1]) / 4 = [0.75, 0.25] → normalized
    const n = Math.hypot(0.75, 0.25);
    expect(c.centroid[0]).toBeCloseTo(0.75 / n, 5);
    expect(c.centroid[1]).toBeCloseTo(0.25 / n, 5);
    expect(c.sourceIds.size).toBe(1);
  });

  it('keeps the later lastSeen when an older article joins', () => {
    const c = cluster({ lastSeen: at });
    joinCluster(c, Float32Array.from([1, 0]), 'geo', hours(5));
    expect(c.lastSeen).toEqual(at);
  });
});

describe('importance', () => {
  it('is log(1+d)/log(1+max)', () => {
    expect(importance(3, 7)).toBeCloseTo(Math.log(4) / Math.log(8), 6);
    expect(importance(3, 7)).toBeCloseTo(0.6667, 4);
    expect(importance(7, 7)).toBe(1);
  });

  it('is 0 when max ≤ 1 and for no sources', () => {
    expect(importance(1, 1)).toBe(0);
    expect(importance(0, 5)).toBe(0);
    expect(importance(1, 0)).toBe(0);
  });

  it('is clamped to [0, 1]', () => {
    expect(importance(9, 4)).toBe(1);
  });
});
