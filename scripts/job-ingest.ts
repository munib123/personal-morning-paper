// npm run job:ingest [-- --limit=N] [-- --sources=id1,id2]
// The worker job (local, or GitHub Actions every 30 min): runIngest → runNlp → runEnrich, recorded as
// ONE job_runs row { job: 'ingest' } with stats { ingest, nlp, enrich } (§9.7; the stages never write
// job_runs). --sources limits ingest to those source ids; --limit caps the articles NLP and enrichment
// process. Exits 1 if a stage fails, 2 on bad arguments. Owner: L0 (the lanes own the stages).
import './lib/env';

import { createSupabaseAdminClient } from '@/server/db/admin';
import { runEnrich, type EnrichStats } from '@/server/enrich';
import { runIngest, type IngestStats } from '@/server/ingest';
import { runNlp, type NlpStats } from '@/server/nlp';

const USAGE = 'usage: npm run job:ingest -- [--limit=N] [--sources=id1,id2]';

interface JobArgs {
  limit?: number;
  sourceIds?: string[];
}

interface JobStats {
  ingest?: IngestStats;
  nlp?: NlpStats;
  enrich?: EnrichStats;
  failedStage?: 'ingest' | 'nlp' | 'enrich';
  error?: string;
}

class UsageError extends Error {}

// Unknown flags are an error: a typo such as --source= must never fall through to a full run,
// because enrichment spends the shared Gemini quota.
function parseArgs(argv: string[]): JobArgs {
  const args: JobArgs = {};
  for (const arg of argv) {
    const m = /^--(limit|sources)=(.*)$/.exec(arg);
    if (!m) throw new UsageError(`unknown argument "${arg}"`);
    const [, flag, value] = m;
    if (flag === 'limit') {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 1) throw new UsageError(`--limit needs a positive integer, got "${value}"`);
      args.limit = n;
    } else {
      const ids = value.split(',').map((s) => s.trim()).filter(Boolean);
      if (ids.length === 0) throw new UsageError('--sources needs at least one source id');
      args.sourceIds = ids;
    }
  }
  return args;
}

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

type Db = ReturnType<typeof createSupabaseAdminClient>;
type Run = { db: Db; id: number };

// job_runs bookkeeping never blocks the stages: without a DB (e.g. before the migration is applied)
// the job still runs and prints its summary, with a warning.
async function startRun(): Promise<Run | null> {
  try {
    const db = createSupabaseAdminClient();
    // Explicit row type: compiles against the placeholder Database type and the generated one.
    const { data, error } = await db.from('job_runs').insert({ job: 'ingest' }).select('id').single<{ id: number }>();
    if (error) throw new Error(error.message);
    return { db, id: data.id };
  } catch (err) {
    console.warn(`ingest: job_runs row not started (${errorMessage(err)}); running without it`);
    return null;
  }
}

async function finishRun(run: Run | null, status: 'ok' | 'error', stats: JobStats): Promise<void> {
  if (!run) return;
  try {
    const { error } = await run.db
      .from('job_runs')
      .update({ finished_at: new Date().toISOString(), status, stats: JSON.parse(JSON.stringify(stats)) })
      .eq('id', run.id);
    if (error) throw new Error(error.message);
  } catch (err) {
    console.warn(`ingest: job_runs row ${run.id} not finished (${errorMessage(err)})`);
  }
}

async function main(): Promise<number> {
  let args: JobArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    if (!(err instanceof UsageError)) throw err;
    console.error(`ingest: ${err.message}\n${USAGE}`);
    return 2;
  }

  const run = await startRun();
  const stats: JobStats = {};
  let stage: NonNullable<JobStats['failedStage']> = 'ingest';
  try {
    stats.ingest = await runIngest(args.sourceIds ? { sourceIds: args.sourceIds } : {});
    stage = 'nlp';
    stats.nlp = await runNlp(args.limit ? { limit: args.limit } : {});
    stage = 'enrich';
    stats.enrich = await runEnrich(args.limit ? { limit: args.limit } : {});
  } catch (err) {
    stats.failedStage = stage;
    stats.error = errorMessage(err);
    console.error(err);
  }

  const status = stats.error === undefined ? 'ok' : 'error';
  await finishRun(run, status, stats);
  console.log(`ingest ${status} ${JSON.stringify(stats)}`);
  return status === 'ok' ? 0 : 1;
}

// Exit explicitly: model runtimes or HTTP agents in the stages must not keep the worker alive.
main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err);
    process.exit(1);
  },
);
