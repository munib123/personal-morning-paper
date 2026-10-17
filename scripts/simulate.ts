// npm run simulate → fast-forward 7 days on the real candidate pool (§10.5): the learning arm against the
// onboarding-only and popularity baselines, as a per-day table and the SimulationResult JSON. No Gemini.
import './lib/env';

import { DEFAULT_PARAMS } from '@/server/rank';
import { loadCandidatePool, loadTaxonomy, loadTopicEmbeddings } from '@/server/edition';
import { AYESHA } from '@/server/learn/sim/persona';
import { runSimulation } from '@/server/learn/sim/run';

const pct = (x: number) => x.toFixed(3);

async function main() {
  const now = new Date();
  const [pool, taxonomy, topicEmb] = await Promise.all([loadCandidatePool(now), loadTaxonomy(), loadTopicEmbeddings()]);
  if (pool.length === 0) {
    console.error('simulate: the candidate pool is empty (no enriched/fallback articles in the last 7 days)');
    process.exit(1);
  }
  const r = runSimulation({ pool, taxonomy, topicEmb, persona: AYESHA, days: 7, now, params: DEFAULT_PARAMS });
  console.log(`persona ${r.persona} · pool ${pool.length} · ${pool.length >= 280 ? '7 contiguous slices' : 'sliding window (pool < 280)'}`);
  console.log('day | learning p@20 nDCG@10 div hits | onboarding-only p@20 nDCG@10 | popularity p@20 nDCG@10');
  for (let d = 0; d < r.learning.length; d++) {
    const l = r.learning[d];
    const o = r.onboardingOnly[d];
    const p = r.popularity[d];
    console.log(
      `${l.day}   | ${pct(l.precisionAt20)} ${pct(l.ndcgAt10)} ${pct(l.diversity)} ${l.exploreHits} | ${pct(o.precisionAt20)} ${pct(o.ndcgAt10)} | ${pct(p.precisionAt20)} ${pct(p.ndcgAt10)}`,
    );
  }
  console.log(JSON.stringify(r));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
