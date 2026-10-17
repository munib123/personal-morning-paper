import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS } from './params';
import { cos, isEligible, normalize, scoreCandidate } from './score';
import { NOW, hoursAgo, makeCandidate, makeUser, state, unitVec, vecWithCos } from './__fixtures__/factory';

const aiInterests = {
  'technical.cs.ai-ml': state(2, 3),
  'technical.cs': state(3, 1),
  technical: state(1, 3),
};
const aiItem = (p = {}) =>
  makeCandidate({ labels: [{ slug: 'technical.cs.ai-ml', conf: 1 }], importance: 0.5, sourceQuality: 0.5, publishedAt: NOW.toISOString(), ...p });

describe('vector helpers', () => {
  it('cos is 0 when either side is null', () => {
    expect(cos(null, unitVec(1))).toBe(0);
    expect(cos(unitVec(1), null)).toBe(0);
  });

  it('cos of a vector with itself is 1, normalize gives unit length', () => {
    const v = new Float32Array([3, 4]);
    expect(Array.from(normalize(v))).toEqual([expect.closeTo(0.6, 6), expect.closeTo(0.8, 6)]);
    expect(cos(v, v)).toBeCloseTo(1, 6);
  });
});

describe('scoreCandidate (rank-v1 weighted contributions)', () => {
  it('score: cold user', () => {
    const b = scoreCandidate(makeUser({ interests: aiInterests }), aiItem(), DEFAULT_PARAMS, NOW);
    expect(b.topic).toBeCloseTo(0.196, 6);
    expect(b.similarity).toBe(0);
    expect(b.negative).toBeCloseTo(0, 9);
    expect(b.importance).toBeCloseTo(0.075, 6);
    expect(b.freshness).toBeCloseTo(0.15, 6);
    expect(b.source).toBeCloseTo(0.025, 6);
    expect(b.total).toBeCloseTo(0.446, 6);
  });

  it('score: 24h old', () => {
    const b = scoreCandidate(makeUser({ interests: aiInterests }), aiItem({ publishedAt: hoursAgo(24) }), DEFAULT_PARAMS, NOW);
    expect(b.freshness).toBeCloseTo(0.15 * Math.exp(-1), 4);
    expect(b.freshness).toBeCloseTo(0.0552, 4);
  });

  it('score: pinned adds exactly the pinned bonus', () => {
    const plain = scoreCandidate(makeUser({ interests: aiInterests }), aiItem(), DEFAULT_PARAMS, NOW);
    const pinnedUser = makeUser({ interests: { ...aiInterests, 'technical.cs': state(3, 1, { pinned: true }) } });
    const pinned = scoreCandidate(pinnedUser, aiItem(), DEFAULT_PARAMS, NOW);
    expect(pinned.total - plain.total).toBeCloseTo(0.1, 9);
  });

  it('score: c_u ramps with nEngaged', () => {
    const pos = unitVec(7);
    const u = makeUser({ interests: aiInterests, pos, nEngaged: 5 });
    const b = scoreCandidate(u, aiItem({ embedding: pos }), DEFAULT_PARAMS, NOW);
    // c_u = 5/10, cos 1 → 0.5·0.25 = 0.125
    expect(b.similarity).toBeCloseTo(0.125, 5);
  });

  it('score: negative', () => {
    const neg = unitVec(9);
    const u = makeUser({ interests: aiInterests, neg });
    const b = scoreCandidate(u, aiItem({ embedding: vecWithCos(neg, 0.5, 3) }), DEFAULT_PARAMS, NOW);
    expect(b.negative).toBeCloseTo(-0.075, 5);
  });

  it('null embeddings → finite total', () => {
    const u = makeUser({ interests: aiInterests, pos: null, neg: null, nEngaged: 20 });
    const b = scoreCandidate(u, aiItem({ embedding: null }), DEFAULT_PARAMS, NOW);
    expect(Number.isFinite(b.total)).toBe(true);
    expect(b.similarity).toBe(0);
  });
});

describe('isEligible', () => {
  const base = aiItem({ id: 'a1', sourceId: 'dawn', clusterId: 'k1' });

  it('accepts a plain candidate', () => {
    expect(isEligible(makeUser({ interests: aiInterests }), base)).toBe(true);
  });

  it('false for a muted label, or a muted ancestor of a label', () => {
    expect(isEligible(makeUser({ interests: { 'technical.cs.ai-ml': state(1, 3, { muted: true }) } }), base)).toBe(false);
    expect(isEligible(makeUser({ interests: { technical: state(1, 3, { muted: true }) } }), base)).toBe(false);
  });

  it('false for a muted source, a seen id and a dismissed cluster', () => {
    expect(isEligible(makeUser({ mutedSourceIds: ['dawn'] }), base)).toBe(false);
    expect(isEligible(makeUser({ seenArticleIds: ['a1'] }), base)).toBe(false);
    expect(isEligible(makeUser({ dismissedClusterIds: ['k1'] }), base)).toBe(false);
  });
});
