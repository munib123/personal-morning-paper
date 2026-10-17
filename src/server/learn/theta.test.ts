import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS } from '@/server/rank/params';
import { makeUser, state } from '@/server/rank/__fixtures__/factory';
import { meanOf, thetaOf } from './theta';

describe('meanOf', () => {
  it('is alpha / (alpha + beta)', () => {
    expect(meanOf(state(2, 1))).toBeCloseTo(0.6667, 3);
    expect(meanOf(state(1, 3))).toBeCloseTo(0.25, 6);
  });
});

describe('thetaOf (blended affinity)', () => {
  it('theta: L1 picked', () => {
    const u = makeUser({ interests: { sports: state(2, 1, { picked: true }) } });
    expect(thetaOf(u, 'sports', DEFAULT_PARAMS)).toBeCloseTo(0.6667, 3);
  });

  it('theta: L2 under picked L1 renormalizes 0.6/0.3 over 0.9', () => {
    const u = makeUser({ interests: { 'sports.cricket': state(1.5, 3), sports: state(2, 1, { picked: true }) } });
    // (0.6·0.3333 + 0.3·0.6667) / 0.9 = 0.4444
    expect(thetaOf(u, 'sports.cricket', DEFAULT_PARAMS)).toBeCloseTo(0.4444, 3);
  });

  it('theta: L3 blends leaf, parent and grandparent', () => {
    const u = makeUser({
      interests: { 'technical.cs.ai-ml': state(2, 3), 'technical.cs': state(3, 1), technical: state(1, 3) },
    });
    // 0.6·0.4 + 0.3·0.75 + 0.1·0.25 = 0.49
    expect(thetaOf(u, 'technical.cs.ai-ml', DEFAULT_PARAMS)).toBeCloseTo(0.49, 6);
  });

  it('a node missing from the model reads as the unpicked prior (1,3)', () => {
    expect(thetaOf(makeUser(), 'science.space', DEFAULT_PARAMS)).toBeCloseTo(0.25, 6);
    const u = makeUser({ interests: { science: state(2, 1, { picked: true }) } });
    // leaf and parent: leaf missing → 0.25; (0.6·0.25 + 0.3·0.6667)/0.9 = 0.3889
    expect(thetaOf(u, 'science.space', DEFAULT_PARAMS)).toBeCloseTo(0.3889, 3);
  });
});
