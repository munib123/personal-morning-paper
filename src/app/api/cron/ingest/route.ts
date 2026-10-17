// GET (Vercel cron) and POST /api/cron/ingest (§9.2), behind `Authorization: Bearer ${CRON_SECRET}`.
// Runs runIngest only: NLP and enrichment run in the worker (scripts/job-ingest.ts), never on Vercel.
// Records one job_runs row, job='ingest-cron' (§9.7). Owner: L1.
import { timingSafeEqual } from 'node:crypto';
import { runIngest } from '@/server/ingest';
import { finishJobRun, startJobRun } from '@/server/ingest/store';

export const runtime = 'nodejs';
export const maxDuration = 300;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // an unset secret never opens the route
  const given = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

async function handle(request: Request): Promise<Response> {
  if (!authorized(request)) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const runId = await startJobRun('ingest-cron');
  try {
    const stats = await runIngest({});
    await finishJobRun(runId, 'ok', { ...stats });
    return Response.json(stats);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await finishJobRun(runId, 'error', { error });
    return Response.json({ error }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
