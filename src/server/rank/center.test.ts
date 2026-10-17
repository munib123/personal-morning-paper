import { describe, expect, it } from 'vitest';
import type { Candidate, UserModel } from '@/contracts/engine';
import { NOW, makeCandidate, makeTaxonomy, makeUser } from './__fixtures__/factory';
import { centerSpace, poolMean } from './center';
import { buildRanking } from './index';
import { DEFAULT_PARAMS, RANK_V1_FIXED } from './params';
import { cos, normalize } from './vec';

// Real gte-small vectors share one big common direction (mean pairwise cos ≈ 0.75 on the live pool):
// each test vector is that common direction plus a small group-specific one.
const D = 8;
const axis = (k: number) => Float32Array.from({ length: D }, (_, i) => (i === k ? 1 : 0));
const mix = (common: number, k: number, w: number) => normalize(Float32Array.from({ length: D }, (_, i) => common * axis(0)[i] + w * axis(k)[i]));
const groupVec = (g: 'A' | 'B', j: number) => mix(1, g === 'A' ? 1 : 2, 0.35 + 0.01 * (j % 3));

function anisotropicPool(n: number): Candidate[] {
  return Array.from({ length: n }, (_, j) => {
    const g = j % 2 === 0 ? 'A' : 'B';
    return makeCandidate({ id: `${g}${j}`, embedding: groupVec(g, j), clusterId: `c${j}`, sourceId: `s${j}`, labels: [{ slug: 'news.pakistan', conf: 1 }], importance: 0.5, publishedAt: NOW.toISOString() });
  });
}

describe('poolMean / centerSpace (rank-v1 mean-centred embedding space)', () => {
  it('poolMean is the mean of the embedded candidates; null below the minimum pool', () => {
    const pool = anisotropicPool(RANK_V1_FIXED.centerMinPool);
    const mu = poolMean(pool)!;
    expect(mu).not.toBeNull();
    expect(mu[0]).toBeGreaterThan(0.9); // the shared direction dominates the mean
    expect(poolMean(pool.slice(0, RANK_V1_FIXED.centerMinPool - 1))).toBeNull();
    expect(poolMean([...pool, makeCandidate({ id: 'none', embedding: null })])!.length).toBe(D);
  });

  it('centring removes the shared direction: two groups that look alike (cos ≈ 0.9) point apart', () => {
    const pool = anisotropicPool(40);
    const a = pool[0].embedding!;
    const b = pool[1].embedding!;
    expect(cos(a, b)).toBeGreaterThan(0.85);
    const { pool: centred } = centerSpace(makeUser(), pool);
    expect(cos(centred[0].embedding, centred[1].embedding)).toBeLessThan(-0.5);
    expect(centred[0].embedding).not.toBe(pool[0].embedding); // inputs untouched
    expect(pool[0].embedding![0]).toBeCloseTo(a[0], 9);
  });

  it("the reader's pos, neg and engaged vectors move into the same centred space", () => {
    const pool = anisotropicPool(40);
    const u: UserModel = { ...makeUser(), pos: groupVec('A', 0), neg: groupVec('B', 1), engaged: [{ articleId: 'x', embedding: groupVec('A', 2), headline: 'x', at: NOW.toISOString() }] };
    const { user, pool: centred } = centerSpace(u, pool);
    expect(cos(user.pos, centred[0].embedding)).toBeGreaterThan(0.9); // A
    expect(cos(user.pos, centred[1].embedding)).toBeLessThan(-0.5); // B
    expect(cos(user.neg, centred[1].embedding)).toBeGreaterThan(0.9);
    expect(cos(user.engaged[0].embedding, centred[0].embedding)).toBeGreaterThan(0.9);
    expect(u.pos![0]).toBeCloseTo(groupVec('A', 0)[0], 9); // input untouched
  });

  it('a pool below the minimum is returned as is', () => {
    const pool = anisotropicPool(RANK_V1_FIXED.centerMinPool - 1);
    const u = makeUser();
    const out = centerSpace(u, pool);
    expect(out.pool).toBe(pool);
    expect(out.user).toBe(u);
  });

  it('buildRanking: the similarity term separates a reader’s group from the other one (raw cosines could not)', () => {
    const pool = anisotropicPool(40);
    const u: UserModel = { ...makeUser(), pos: groupVec('A', 0), nEngaged: DEFAULT_PARAMS.engagedRamp };
    const r = buildRanking(u, pool, DEFAULT_PARAMS, 'seed', NOW, makeTaxonomy());
    const all = [...r.items, ...r.reserve];
    const simOf = (g: string) => all.filter((x) => x.candidateId.startsWith(g)).map((x) => x.breakdown.similarity);
    const [a, b] = [simOf('A'), simOf('B')];
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
    // raw: 0.25·(cos(A,A) − cos(A,B)) ≈ 0.25·(1 − 0.89) ≈ 0.03; centred: ≈ 0.25·(1 − (−1)) ≈ 0.5
    expect(Math.min(...a) - Math.max(...b)).toBeGreaterThan(0.3);
    expect(r.items.slice(0, 10).every((x) => x.candidateId.startsWith('A'))).toBe(true);
  });
});
