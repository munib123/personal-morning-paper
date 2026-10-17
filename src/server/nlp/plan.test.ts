import { describe, expect, it } from 'vitest';
import type { ClusterState } from './cluster';
import type { TopicVec } from './labels';
import { nlpPlan } from './plan';

const now = new Date('2026-10-17T06:00:00Z');
const ago = (h: number) => new Date(now.getTime() - h * 3_600_000);
const f = (...xs: number[]) => Float32Array.from(xs);

const topics: TopicVec[] = [
  { slug: 'business.markets', level: 2, embedding: f(1, 0, 0) },
  { slug: 'sports.cricket', level: 2, embedding: f(0, 0, 1) },
];

function ids() {
  let n = 0;
  return () => `new-${++n}`;
}

// A and B: different sources, cos 0.95. C: orthogonal to both.
const A = { id: 'A', sourceId: 'dawn', title: 'PSX closes at a record', publishedAt: ago(3) };
const B = { id: 'B', sourceId: 'geo', title: 'Stocks hit a new high', publishedAt: ago(2) };
const C = { id: 'C', sourceId: 'cricinfo', title: 'Pakistan win the series', publishedAt: ago(1) };
const eA = f(1, 0, 0);
const eB = f(0.95, Math.sqrt(1 - 0.95 * 0.95), 0);
const eC = f(0, 0, 1);

describe('nlpPlan', () => {
  it('clusters, labels and scores importance for a fresh batch', () => {
    const plan = nlpPlan({ rows: [A, B, C], embeddings: [eA, eB, eC], topics, priorsBySource: {}, clusters: [], now, newId: ids() });

    expect(plan.clusters).toHaveLength(2);
    const byId = new Map(plan.articles.map((a) => [a.id, a]));
    expect(byId.get('A')!.clusterId).toBe(byId.get('B')!.clusterId);
    expect(byId.get('C')!.clusterId).not.toBe(byId.get('A')!.clusterId);

    const ab = plan.clusters.find((c) => c.id === byId.get('A')!.clusterId)!;
    const c = plan.clusters.find((x) => x.id === byId.get('C')!.clusterId)!;
    expect(ab.sourceIds.size).toBe(2);
    expect(ab.importance).toBe(1);
    expect(c.importance).toBeCloseTo(Math.log(2) / Math.log(3), 6);
    expect(c.importance).toBeCloseTo(0.631, 3);
    expect(ab.isNew).toBe(true);
    expect(ab.articleCount).toBe(2);

    expect(plan.stats).toEqual({ embedded: 3, labelled: 3, clustersNew: 2, clustersJoined: 1 });
    expect(byId.get('A')!.labels[0].slug).toBe('business.markets');
    expect(byId.get('C')!.labels[0].slug).toBe('sports.cricket');
    expect(byId.get('A')!.embedding).toBe(eA);
  });

  it('processes rows in publishedAt ascending order', () => {
    // B is listed first but A is older, so A founds the cluster and gives it its title.
    const plan = nlpPlan({ rows: [B, A], embeddings: [eB, eA], topics, priorsBySource: {}, clusters: [], now, newId: ids() });
    expect(plan.clusters).toHaveLength(1);
    expect(plan.clusters[0].headline).toBe(A.title);
    expect(plan.clusters[0].firstSeen).toEqual(A.publishedAt);
    expect(plan.clusters[0].lastSeen).toEqual(B.publishedAt);
    expect(plan.articles.map((a) => a.id)).toEqual(['A', 'B']);
  });

  it('gives every cluster importance 0 when there are only singletons', () => {
    const plan = nlpPlan({ rows: [A, C], embeddings: [eA, eC], topics, priorsBySource: {}, clusters: [], now, newId: ids() });
    expect(plan.clusters.every((c) => c.sourceIds.size === 1)).toBe(true);
    expect(plan.clusters.map((c) => c.importance)).toEqual([0, 0]);
  });

  it('joins an existing cluster and recomputes its importance', () => {
    const existing: ClusterState = {
      id: 'old-1',
      centroid: f(1, 0, 0),
      firstSeen: ago(10),
      lastSeen: ago(9),
      articleCount: 2,
      sourceIds: new Set(['dawn', 'tribune']),
      headline: 'Earlier markets story',
      isNew: false,
      touched: false,
    };
    const plan = nlpPlan({ rows: [B, C], embeddings: [eB, eC], topics, priorsBySource: {}, clusters: [existing], now, newId: ids() });
    const old = plan.clusters.find((c) => c.id === 'old-1')!;
    expect(plan.articles.find((a) => a.id === 'B')!.clusterId).toBe('old-1');
    expect(old.touched).toBe(true);
    expect(old.isNew).toBe(false);
    expect(old.sourceIds.size).toBe(3);
    expect(old.headline).toBe('Earlier markets story');
    expect(old.importance).toBe(1);
    expect(plan.stats).toEqual({ embedded: 2, labelled: 2, clustersNew: 1, clustersJoined: 1 });
  });

  it('uses the source priors for labels', () => {
    // Closer to markets (cos 0.75) than to cricket (0.66), but the source's prior is sports.
    const e = f(0.75, 0, 0.66);
    const free = nlpPlan({ rows: [A], embeddings: [e], topics, priorsBySource: {}, clusters: [], now, newId: ids() });
    expect(free.articles[0].labels[0].slug).toBe('business.markets');
    const plan = nlpPlan({ rows: [A], embeddings: [e], topics, priorsBySource: { dawn: ['sports'] }, clusters: [], now, newId: ids() });
    expect(plan.articles[0].labels.map((l) => l.slug)).toEqual(['sports.cricket']);
  });
});
