import { describe, expect, it } from 'vitest';
import { SimulationResultSchema } from '@/contracts/api';
import { DEFAULT_PARAMS } from '@/server/rank/params';
import { NOW, makePool, makeTaxonomy, unitVec } from '@/server/rank/__fixtures__/factory';
import { AYESHA } from './persona';
import { runLearningArm, runSimulation } from './run';

const TAX = makeTaxonomy();
const topicEmb = Object.fromEntries(TAX.map((t, i) => [t.slug, unitVec(9000 + i)]));
const input = () => ({ pool: makePool(400, { now: NOW }), taxonomy: TAX, topicEmb, persona: AYESHA, days: 7, now: NOW, params: DEFAULT_PARAMS });
const in01 = (x: number) => x >= 0 && x <= 1;

describe('runSimulation (7 days, 3 arms)', { timeout: 60_000 }, () => {
  const r = runSimulation(input());

  it('run shape: 7 days per arm, metrics in [0,1], 7 snapshots, schema-valid', () => {
    expect(SimulationResultSchema.safeParse(r).success).toBe(true);
    expect(r.persona).toBe('Ayesha');
    for (const arm of [r.learning, r.onboardingOnly, r.popularity]) {
      expect(arm.map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 6, 7]);
      for (const d of arm) {
        expect(in01(d.precisionAt20) && in01(d.ndcgAt10) && in01(d.diversity)).toBe(true);
        expect(d.exploreHits).toBeGreaterThanOrEqual(0);
      }
    }
    expect(r.snapshots).toHaveLength(7);
    expect(Object.keys(r.snapshots[0].weights).every((s) => s.split('.').length <= 2)).toBe(true);
  });

  it('deterministic across two runs', () => {
    expect(runSimulation(input())).toEqual(r);
  });

  it('the learning arm moves the weights toward what she reads', () => {
    expect(r.snapshots[6].weights['sports.cricket']).toBeGreaterThan(r.snapshots[0].weights['sports.cricket']);
  });
});

describe('runLearningArm', { timeout: 60_000 }, () => {
  it('learning trace: 7 days, each with 28 ranked items and at least one open, deterministic', () => {
    const t = runLearningArm(input());
    expect(t).toHaveLength(7);
    for (const d of t) {
      expect(d.ranking.items.length + d.ranking.reserve.length).toBe(28);
      expect(d.events.some((e) => e.type === 'open')).toBe(true);
      expect(d.events.filter((e) => e.type === 'impression')).toHaveLength(20);
    }
    expect(runLearningArm(input())).toEqual(t);
  });

  it('never shows an article twice across the week', () => {
    const t = runLearningArm(input());
    const shown = t.flatMap((d) => d.ranking.items.map((i) => i.candidateId));
    expect(new Set(shown).size).toBe(shown.length);
  });
});
