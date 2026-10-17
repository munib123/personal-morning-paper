import { describe, expect, it } from 'vitest';
import { SimulationResultSchema } from '@/contracts/api';
import { DEFAULT_PARAMS } from '@/server/rank/params';
import { NOW, makeCandidate, makePool, makeTaxonomy, unitVec } from '@/server/rank/__fixtures__/factory';
import { AYESHA, trueAffinityOf } from './persona';
import { SIM_SEEDS, meanResult, reactTo, runLearningArm, runSimulation, runSimulationRuns } from './run';

const TAX = makeTaxonomy();
const topicEmb = Object.fromEntries(TAX.map((t, i) => [t.slug, unitVec(9000 + i)]));
const input = () => ({ pool: makePool(400, { now: NOW }), taxonomy: TAX, topicEmb, persona: AYESHA, days: 7, now: NOW, params: DEFAULT_PARAMS });
const in01 = (x: number) => x >= 0 && x <= 1;

describe('runSimulation (7 days, 3 arms, mean over seeds)', { timeout: 120_000 }, () => {
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

  it(`is the mean of ${SIM_SEEDS.length} seeded weeks (at least 5), and the seeds really differ`, () => {
    expect(SIM_SEEDS.length).toBeGreaterThanOrEqual(5);
    const runs = runSimulationRuns(input());
    expect(runs).toHaveLength(SIM_SEEDS.length);
    expect(meanResult(runs)).toEqual(r);
    expect(new Set(runs.map((x) => JSON.stringify(x.learning))).size).toBeGreaterThan(1);
    const day7 = runs.reduce((s, x) => s + x.learning[6].precisionAt20, 0) / runs.length;
    expect(r.learning[6].precisionAt20).toBeCloseTo(day7, 9);
  });

  it('the learning arm moves the weights toward what she reads: cricket pulls ahead of the rest of sport', () => {
    const gap = (k: number) => r.snapshots[k].weights['sports.cricket'] - r.snapshots[k].weights['sports.football'];
    expect(gap(0)).toBeCloseTo(0, 9); // onboarding cannot tell them apart (both children of her Sports pick)
    expect(gap(6)).toBeGreaterThan(0.05);
  });
});

describe('reactTo (the simulated reader)', () => {
  const story = (slug: string, id: string) => makeCandidate({ id, labels: [{ slug, conf: 1 }], wordCount: 460 });
  const many = (slug: string) => Array.from({ length: 400 }, (_, k) => story(slug, `${slug}-${k}`));
  const stats = (slug: string) => {
    let opens = 0;
    let skips = 0;
    let share = 0;
    for (const c of many(slug)) {
      const evs = reactTo(AYESHA, c, DEFAULT_PARAMS, 1, 'core');
      const dwell = evs.find((e) => e.type === 'dwell');
      if (dwell) {
        opens++;
        share += (dwell.value ?? 0) / 120_000;
      }
      if (evs.some((e) => e.type === 'skip')) skips++;
    }
    return { open: opens / 400, skip: skips / 400, share: opens ? share / opens : 0 };
  };

  it('common random numbers: the same story on the same seed gets the same reaction, whatever came before', () => {
    const c = story('sports.cricket', 'x1');
    expect(reactTo(AYESHA, c, DEFAULT_PARAMS, 3, 'core')).toEqual(reactTo(AYESHA, c, DEFAULT_PARAMS, 3, 'core'));
    const differs = many('news.pakistan').some((s) => JSON.stringify(reactTo(AYESHA, s, DEFAULT_PARAMS, 1, 'core')) !== JSON.stringify(reactTo(AYESHA, s, DEFAULT_PARAMS, 2, 'core')));
    expect(differs).toBe(true);
  });

  it('every story gets one impression; she opens, reads longer and skips less the more she likes it', () => {
    for (const ev of reactTo(AYESHA, story('arts', 'a'), DEFAULT_PARAMS, 1, 'core').slice(0, 1)) expect(ev.type).toBe('impression');
    const loved = stats('sports.cricket'); // 0.95
    const meh = stats('news.pakistan'); // 0.30
    const rare = stats('sports.football'); // 0.15
    expect(loved.open).toBeGreaterThan(0.75);
    expect(meh.open).toBeGreaterThan(0.2);
    expect(meh.open).toBeLessThan(0.45);
    expect(rare.open).toBeLessThan(meh.open);
    expect(loved.share).toBeGreaterThan(meh.share + 0.4);
    expect(rare.skip).toBeGreaterThan(loved.skip);
  });

  it('she taps "less" only on stories she dislikes (true < 0.2), and not on all of them', () => {
    const lessShare = (slug: string) => many(slug).filter((c) => reactTo(AYESHA, c, DEFAULT_PARAMS, 1, 'core').some((e) => e.type === 'less')).length / 400;
    expect(trueAffinityOf(AYESHA, story('entertainment.pakistani-showbiz', 'z'))).toBeLessThan(0.2);
    expect(lessShare('entertainment.pakistani-showbiz')).toBeGreaterThan(0.1);
    expect(lessShare('entertainment.pakistani-showbiz')).toBeLessThan(0.6);
    expect(lessShare('news.pakistan')).toBe(0);
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
