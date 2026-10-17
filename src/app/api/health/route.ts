// L0 → W2. Real but defensive: it never throws and never hangs, whatever env or services are missing.
import type { z } from 'zod';
import type { HealthSchema } from '@/contracts/api';

type Health = z.infer<typeof HealthSchema>;

const DB_BUDGET_MS = 3000;

// GET → { db, gemini: 'ok'|'limited'|'missing', lastIngest, fallback }.
export async function GET(): Promise<Response> {
  const [db, gemini] = await Promise.all([checkDb(), checkGemini()]);
  const body: Health = { db: db.ok, gemini, lastIngest: db.lastIngest, fallback: process.env.DEMO_FALLBACK === '1' };
  return Response.json(body);
}

// db = the topics table answers a head count; lastIngest = the newest finished ingest job_runs row.
async function checkDb(): Promise<{ ok: boolean; lastIngest: string | null }> {
  try {
    // Imported lazily, so a missing env or a broken client can only fail this check, never the route.
    const { createSupabaseAdminClient } = await import('@/server/db/admin');
    const supabase = createSupabaseAdminClient();
    const signal = AbortSignal.timeout(DB_BUDGET_MS);
    const topics = await supabase.from('topics').select('slug', { count: 'exact', head: true }).abortSignal(signal);
    if (topics.error) return { ok: false, lastIngest: null };
    const runs = await supabase
      .from('job_runs')
      .select('finished_at')
      .in('job', ['ingest', 'ingest-cron'])
      .not('finished_at', 'is', null)
      .order('finished_at', { ascending: false })
      .limit(1)
      .abortSignal(signal);
    const rows = (runs.data ?? []) as { finished_at: string | null }[];
    return { ok: true, lastIngest: rows[0]?.finished_at ?? null };
  } catch {
    return { ok: false, lastIngest: null };
  }
}

async function checkGemini(): Promise<Health['gemini']> {
  try {
    const { geminiStatus } = await import('@/server/ai');
    return await geminiStatus();
  } catch {
    return process.env.GEMINI_API_KEY ? 'limited' : 'missing';
  }
}
