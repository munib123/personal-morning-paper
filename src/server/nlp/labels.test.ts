import { describe, expect, it } from 'vitest';
import { assignLabels, type TopicVec } from './labels';
import { normalize } from './vector';

const vec = (...xs: number[]) => normalize(Float32Array.from(xs));

// 4-d fixtures (plan Task 1). BM is a distractor outside the 'technical' subtree that sits close to AI,
// so the prior restriction is what keeps it out.
const T: TopicVec = { slug: 'technical', level: 1, embedding: vec(1, 0, 0, 0) };
const CS: TopicVec = { slug: 'technical.cs', level: 2, embedding: vec(0.9, 0.436, 0, 0) };
const AI: TopicVec = { slug: 'technical.cs.ai-ml', level: 3, embedding: vec(0.8, 0.6, 0, 0) };
const SP: TopicVec = { slug: 'sports', level: 1, embedding: vec(0, 0, 1, 0) };
const BM: TopicVec = { slug: 'business.markets', level: 2, embedding: vec(0.75, 0.6, 0.2, 0) };
const all = [T, CS, AI, SP, BM];

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

describe('assignLabels', () => {
  it('restricts to prior subtrees', () => {
    const labels = assignLabels(AI.embedding, all, ['technical']);
    // T (cos 0.8) is kept by top-3 but its softmax conf (~0.011) is under 0.05, so it is dropped.
    expect(labels.map((l) => l.slug)).toEqual(['technical.cs.ai-ml', 'technical.cs']);
    expect(labels.some((l) => l.slug === 'business.markets')).toBe(false);
    expect(sum(labels.map((l) => l.conf))).toBeCloseTo(1, 6);
    const ai = labels.find((l) => l.slug === 'technical.cs.ai-ml')!;
    expect(Math.max(...labels.map((l) => l.conf))).toBe(ai.conf);
  });

  it('sorts most specific first, then by conf', () => {
    const labels = assignLabels(AI.embedding, all, []);
    expect(labels.map((l) => l.slug)).toEqual(['technical.cs.ai-ml', 'technical.cs', 'business.markets']);
  });

  it('falls back to global search under 0.30', () => {
    const labels = assignLabels(AI.embedding, all, ['sports']);
    expect(labels[0].slug).toBe('technical.cs.ai-ml');
    expect(labels.some((l) => l.slug === 'sports')).toBe(false);
  });

  it('conf is softmax(cos/0.05)', () => {
    const e = vec(1, 0, 0, 0);
    const a: TopicVec = { slug: 'science.space', level: 2, embedding: vec(0.9, Math.sqrt(1 - 0.81), 0, 0) };
    const b: TopicVec = { slug: 'health.medicine', level: 2, embedding: vec(0.8, 0, 0.6, 0) };
    const labels = assignLabels(e, [a, b], []);
    expect(labels.map((l) => l.slug)).toEqual(['science.space', 'health.medicine']);
    expect(labels[0].conf).toBeCloseTo(0.881, 3);
    expect(labels[1].conf).toBeCloseTo(0.119, 3);
  });

  it('drops labels under 0.05 conf but keeps at least one', () => {
    const e = vec(1, 0, 0, 0);
    const near: TopicVec = { slug: 'science.space', level: 2, embedding: vec(0.9, Math.sqrt(1 - 0.81), 0, 0) };
    const far: TopicVec = { slug: 'health.medicine', level: 2, embedding: vec(0.5, 0, Math.sqrt(0.75), 0) };
    const labels = assignLabels(e, [near, far], []);
    expect(labels).toEqual([{ slug: 'science.space', conf: 1 }]);

    // 30 identical topics: every conf is 1/30 < 0.05, and the best one is still kept.
    const same = Array.from({ length: 30 }, (_, i): TopicVec => ({ slug: `news.t${i}`, level: 2, embedding: vec(1, 0, 0, 0) }));
    const one = assignLabels(e, same, [], { k: 30 });
    expect(one).toHaveLength(1);
    expect(one[0].conf).toBeCloseTo(1, 6);
  });

  it('keeps at most k labels', () => {
    const e = vec(1, 1, 1, 1);
    const topics = Array.from({ length: 6 }, (_, i): TopicVec => ({ slug: `news.t${i}`, level: 2, embedding: vec(1, 1, 1, 1 + i * 0.001) }));
    expect(assignLabels(e, topics, [])).toHaveLength(3);
  });

  it('empty priors search globally', () => {
    const labels = assignLabels(vec(0.1, 0, 1, 0), all, []);
    expect(labels[0].slug).toBe('sports');
  });

  it('returns no labels when there are no topics', () => {
    expect(assignLabels(vec(1, 0, 0, 0), [], ['technical'])).toEqual([]);
  });
});
