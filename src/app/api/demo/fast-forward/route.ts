// POST /api/demo/fast-forward (L3, §9.2, DEMO_MODE only) { days?: 7 } → SimulationResult: Ayesha's simulated
// week on the real candidate pool, learning vs onboarding-only vs popularity. Measured, never invented
// (§10.5); cached per process for 10 minutes because the pool barely moves in that time.
import type { SimulationResult } from '@/contracts/learning';
import { FastForwardRequestSchema, SimulationResultSchema } from '@/contracts/api';
import { requireUser } from '@/server/auth/session';
import { loadCandidatePool, loadTaxonomy, loadTopicEmbeddings } from '@/server/edition';
import { readJson, route } from '@/server/edition/http';
import { AYESHA } from '@/server/learn/sim/persona';
import { runSimulation } from '@/server/learn/sim/run';
import { DEFAULT_PARAMS } from '@/server/rank';
import { requestNow } from '@/server/time';

export const maxDuration = 60;

const CACHE_MS = 10 * 60_000;
const cache = new Map<number, { at: number; result: SimulationResult }>();

export const POST = route(async (request: Request) => {
  if (process.env.DEMO_MODE !== '1') return Response.json({ error: 'demo mode is off' }, { status: 403 });
  await requireUser();
  const { days = 7 } = FastForwardRequestSchema.parse(await readJson(request));
  const now = await requestNow();
  const realNow = new Date();
  const poolNow = now.getTime() <= realNow.getTime() ? now : realNow;
  const hit = cache.get(days);
  if (hit && Math.abs(poolNow.getTime() - hit.at) <= CACHE_MS) return Response.json(hit.result);
  const [pool, taxonomy, topicEmb] = await Promise.all([loadCandidatePool(poolNow), loadTaxonomy(), loadTopicEmbeddings().catch(() => ({}))]);
  if (pool.length === 0) return Response.json({ error: 'no_candidates' }, { status: 503 });
  const result = SimulationResultSchema.parse(runSimulation({ pool, taxonomy, topicEmb, persona: AYESHA, days, now: poolNow, params: DEFAULT_PARAMS }));
  cache.set(days, { at: poolNow.getTime(), result });
  return Response.json(result);
});
