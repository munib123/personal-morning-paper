// npm run demo:perspectives [-- --limit=20 --max-calls=20 --force]
// Precomputes "Other angles" for the demo persona's editions: every cluster with 2+ sources among her
// edition items (rank ≤ 20), most important first, capped at --limit. A stored Gemini answer is kept
// unless --force; once --max-calls live requests are spent, the remaining clusters get the
// deterministic fallback without a request. Gemini FAST only (callLLM never uses SMART here).
import './lib/env';

import { getLlmCallCount } from '@/server/ai';
import { createSupabaseAdminClient } from '@/server/db/admin';
import { computePerspectives } from '@/server/perspectives';

const NONE = '00000000-0000-0000-0000-000000000000';

function numberArg(name: string, fallback: number): number {
  const raw = process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
  const n = Number(raw);
  return raw !== undefined && Number.isFinite(n) && n > 0 ? n : fallback;
}

interface Candidate { id: string; headline: string | null; sourceCount: number; importance: number; stored: string }

async function demoClusters(limit: number): Promise<{ persona: string; candidates: Candidate[] }> {
  const db = createSupabaseAdminClient();
  const { data: demos, error } = await db.from('profiles').select('user_id, display_name').eq('is_demo', true);
  if (error) throw new Error(`profiles read failed: ${error.message}`);
  const userIds = (demos ?? []).map((d) => d.user_id);
  const { data: editions, error: e2 } = await db.from('editions').select('id').in('user_id', userIds.length ? userIds : [NONE]);
  if (e2) throw new Error(`editions read failed: ${e2.message}`);
  const editionIds = (editions ?? []).map((e) => e.id);
  const { data: items, error: e3 } = await db
    .from('edition_items')
    .select('rank, articles(cluster_id, clusters(id, headline, source_count, importance, perspectives))')
    .in('edition_id', editionIds.length ? editionIds : [NONE])
    .lte('rank', 20);
  if (e3) throw new Error(`edition_items read failed: ${e3.message}`);

  const byId = new Map<string, Candidate>();
  for (const item of items ?? []) {
    const c = item.articles?.clusters;
    if (!c || c.source_count < 2 || byId.has(c.id)) continue;
    const stored = c.perspectives as { provider?: unknown } | null;
    byId.set(c.id, { id: c.id, headline: c.headline, sourceCount: c.source_count, importance: c.importance, stored: typeof stored?.provider === 'string' ? stored.provider : '-' });
  }
  const candidates = [...byId.values()].sort((a, b) => b.importance - a.importance).slice(0, limit);
  return { persona: (demos ?? []).map((d) => d.display_name ?? d.user_id).join(', ') || '(no demo persona)', candidates };
}

async function main() {
  const limit = numberArg('limit', 20);
  const maxCalls = numberArg('max-calls', 20);
  const force = process.argv.includes('--force');
  const now = new Date();

  const { persona, candidates } = await demoClusters(limit);
  console.log(`perspectives: ${candidates.length} multi-source clusters for ${persona} (limit ${limit}, max ${maxCalls} live requests${force ? ', force' : ''})`);

  const rows: Array<{ cluster: string; sources: number; importance: string; provider: string; model: string; cached: string; headline: string }> = [];
  const split = { gemini: 0, fallback: 0, skipped: 0 };
  for (const c of candidates) {
    const offline = getLlmCallCount() >= maxCalls;
    const started = Date.now();
    try {
      const r = await computePerspectives(c.id, { now, force, offline });
      if (!r) continue;
      if (r.skipped) split.skipped++;
      else split[r.provider]++;
      rows.push({
        cluster: c.id.slice(0, 8),
        sources: c.sourceCount,
        importance: c.importance.toFixed(2),
        provider: r.skipped ? `${r.provider} (kept)` : offline ? 'fallback (budget)' : r.provider,
        model: r.model ?? '-',
        cached: r.cached ? 'yes' : 'no',
        headline: (c.headline ?? '').slice(0, 56),
      });
      console.log(`[perspectives] ${c.id.slice(0, 8)} ${r.skipped ? 'kept' : r.provider} ${Date.now() - started}ms`);
    } catch (err) {
      split.fallback++;
      rows.push({ cluster: c.id.slice(0, 8), sources: c.sourceCount, importance: c.importance.toFixed(2), provider: 'error', model: '-', cached: '-', headline: String(err instanceof Error ? err.message : err).slice(0, 56) });
    }
  }
  console.table(rows);
  console.log(`split: gemini ${split.gemini} · fallback ${split.fallback} · kept ${split.skipped} · live Gemini requests this run: ${getLlmCallCount()}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
