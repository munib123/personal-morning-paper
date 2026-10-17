// npm run simulate → fast-forward 7 days on the real candidate pool (§10.5): the learning arm against the
// onboarding-only and popularity baselines, as mean ± sd over the seeded weeks (SIM_SEEDS), next to the
// base rate a randomly picked paper would score, then the mean SimulationResult JSON. No Gemini.
import './lib/env';

import { DEFAULT_PARAMS } from '@/server/rank';
import { loadCandidatePool, loadTaxonomy, loadTopicEmbeddings } from '@/server/edition';
import { baseRate, randomNdcgAt10 } from '@/server/learn/sim/metrics';
import { AYESHA, trueAffinityOf } from '@/server/learn/sim/persona';
import { SIM_SEEDS, dayPools, meanResult, runSimulationRuns } from '@/server/learn/sim/run';
import type { SimulationDay, SimulationResult } from '@/contracts/learning';

const f3 = (x: number) => x.toFixed(3);
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const sd = (xs: number[]) => Math.sqrt(mean(xs.map((x) => (x - mean(xs)) ** 2)));
const cell = (runs: SimulationResult[], arm: (r: SimulationResult) => SimulationDay[], d: number, k: 'precisionAt20' | 'ndcgAt10') => {
  const xs = runs.map((r) => arm(r)[d][k]);
  return `${f3(mean(xs))} ± ${f3(sd(xs))}`;
};

async function main() {
  const now = new Date();
  const [pool, taxonomy, topicEmb] = await Promise.all([loadCandidatePool(now), loadTaxonomy(), loadTopicEmbeddings()]);
  if (pool.length === 0) {
    console.error('simulate: the candidate pool is empty (no enriched/fallback articles in the last 7 days)');
    process.exit(1);
  }
  const input = { pool, taxonomy, topicEmb, persona: AYESHA, days: 7, now, params: DEFAULT_PARAMS };
  const runs = runSimulationRuns(input);
  const days = dayPools(pool, 7).map((p) => p.map((c) => trueAffinityOf(AYESHA, c)));
  const liked = pool.filter((c) => trueAffinityOf(AYESHA, c) >= 0.6).length;
  console.log(`persona ${AYESHA.name} · pool ${pool.length} (${liked} she truly likes, base rate ${f3(liked / pool.length)}) · ${pool.length >= 280 ? '7 contiguous slices' : 'sliding window (pool < 280)'} · mean ± sd over seeds ${SIM_SEEDS.join(',')}`);
  console.log('| day | base p@20 | learning p@20 | onboarding-only p@20 | popularity p@20 | random nDCG@10 | learning nDCG@10 | onboarding-only nDCG@10 | popularity nDCG@10 |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (let d = 0; d < 7; d++) {
    console.log(
      `| ${d + 1} | ${f3(baseRate(days[d]))} | ${cell(runs, (r) => r.learning, d, 'precisionAt20')} | ${cell(runs, (r) => r.onboardingOnly, d, 'precisionAt20')} | ${cell(runs, (r) => r.popularity, d, 'precisionAt20')} | ${f3(randomNdcgAt10(days[d]))} | ${cell(runs, (r) => r.learning, d, 'ndcgAt10')} | ${cell(runs, (r) => r.onboardingOnly, d, 'ndcgAt10')} | ${cell(runs, (r) => r.popularity, d, 'ndcgAt10')} |`,
    );
  }
  const m = meanResult(runs);
  const lift = (arm: SimulationDay[], d: number) => `p@20 ×${(arm[d].precisionAt20 / Math.max(1e-9, baseRate(days[d]))).toFixed(2)}, nDCG@10 ×${(arm[d].ndcgAt10 / Math.max(1e-9, randomNdcgAt10(days[d]))).toFixed(2)}`;
  const avg47 = (arm: SimulationDay[], k: 'precisionAt20' | 'ndcgAt10') => f3(mean(arm.slice(3).map((x) => x[k])));
  console.log(`day-7 lift over the base rate · learning ${lift(m.learning, 6)} · onboarding-only ${lift(m.onboardingOnly, 6)} · popularity ${lift(m.popularity, 6)}`);
  console.log(`days 4–7 mean · learning p@20 ${avg47(m.learning, 'precisionAt20')} nDCG@10 ${avg47(m.learning, 'ndcgAt10')} · onboarding-only ${avg47(m.onboardingOnly, 'precisionAt20')} / ${avg47(m.onboardingOnly, 'ndcgAt10')} · popularity ${avg47(m.popularity, 'precisionAt20')} / ${avg47(m.popularity, 'ndcgAt10')} · base ${f3(mean(days.slice(3).map(baseRate)))} / ${f3(mean(days.slice(3).map(randomNdcgAt10)))}`);
  console.log(`explore hits per day (mean) · ${m.learning.map((x) => x.exploreHits.toFixed(1)).join(' ')}`);
  console.log(JSON.stringify(m));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
