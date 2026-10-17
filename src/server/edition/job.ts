// The daily editions job (§12): every onboarded reader's paper, built and printed ahead of the morning.
// One failing reader never stops the job; a PDF failure is counted, the paper still stands.
import type { Json } from '@/contracts/database.types';
import { createSupabaseAdminClient } from '@/server/db/admin';
import { renderAndStoreEditionPdf } from '@/server/pdf';
import { buildEdition } from './build';

export interface EditionsJobStats {
  users: number;
  built: number;
  pdfs: number;
  failed: string[];
  ms: number;
}

/** `job` is the job_runs name: 'editions' (script) or 'editions-cron' (Vercel cron), §9.7. */
export async function runEditionsJob(now: Date, opts: { job: string }): Promise<EditionsJobStats> {
  const t0 = performance.now();
  const db = createSupabaseAdminClient();
  const run = await db.from('job_runs').insert({ job: opts.job }).select('id').single();
  const runId = (run.data as { id: number } | null)?.id ?? null;

  const stats: EditionsJobStats = { users: 0, built: 0, pdfs: 0, failed: [], ms: 0 };
  let status = 'ok';
  try {
    const { data, error } = await db.from('profiles').select('user_id').not('onboarded_at', 'is', null);
    if (error) throw new Error(`profiles: ${error.message}`);
    const users = ((data ?? []) as { user_id: string }[]).map((r) => r.user_id);
    stats.users = users.length;
    for (const userId of users) {
      let edition;
      try {
        edition = await buildEdition(userId, now, { force: false, awaitNote: true });
        stats.built += 1;
      } catch (e) {
        stats.failed.push(userId);
        console.error(`[job:${opts.job}] build failed for ${userId}`, e);
        continue;
      }
      try {
        if (!edition.pdfUrl) await renderAndStoreEditionPdf(edition);
        stats.pdfs += 1;
      } catch (e) {
        console.error(`[job:${opts.job}] pdf failed for ${userId}`, e);
      }
    }
    if (stats.failed.length > 0) status = 'partial';
  } catch (e) {
    status = 'failed';
    console.error(`[job:${opts.job}] failed`, e);
    throw e;
  } finally {
    stats.ms = Math.round(performance.now() - t0);
    if (runId !== null) {
      await db
        .from('job_runs')
        .update({ status, finished_at: new Date().toISOString(), stats: stats as unknown as Json })
        .eq('id', runId);
    }
  }
  return stats;
}
