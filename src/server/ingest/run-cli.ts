// Local ingest runner (L1). Not part of the app bundle.
//   npx tsx src/server/ingest/run-cli.ts [--only=id1,id2] [--max=N] [--since=H]   one runIngest, prints IngestStats JSON
//   npx tsx src/server/ingest/run-cli.ts --sources                               source counts by kind, then exits
//   npx tsx src/server/ingest/run-cli.ts --backfill-images                       og:image for recent imageless rows
//   npx tsx src/server/ingest/run-cli.ts --report                                coverage over all articles + latest job_runs rows
// It reads .env.local itself (variables already in the environment win), so --env-file is optional.
import pLimit from 'p-limit';
import { runIngest } from './index';
import { fetchArticlePage, PAGE_CONCURRENCY } from './page';
import { summarizeArticles } from './report';
import { latestJobRun, listArticleStats, listImageless, sourceKindCounts, updateArticleImages } from './store';

try {
  process.loadEnvFile('.env.local');
} catch {
  // CI / Actions pass the env directly.
}

const USAGE = 'usage: run-cli.ts [--only=id1,id2] [--max=N] [--since=H] | --sources | --backfill-images | --report';

interface CliArgs {
  mode: 'run' | 'sources' | 'backfill' | 'report';
  sourceIds?: string[];
  maxPerSource?: number;
  sinceHours?: number;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { mode: 'run' };
  for (const arg of argv) {
    if (arg === '--sources') {
      args.mode = 'sources';
      continue;
    }
    if (arg === '--backfill-images') {
      args.mode = 'backfill';
      continue;
    }
    if (arg === '--report') {
      args.mode = 'report';
      continue;
    }
    const m = /^--(only|max|since)=(.+)$/.exec(arg);
    if (!m) throw new Error(`unknown argument "${arg}"\n${USAGE}`);
    const [, flag, value] = m;
    if (flag === 'only') {
      args.sourceIds = value.split(',').map((s) => s.trim()).filter(Boolean);
    } else {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 1) throw new Error(`--${flag} needs a positive integer, got "${value}"`);
      if (flag === 'max') args.maxPerSource = n;
      else args.sinceHours = n;
    }
  }
  return args;
}

/** og:image / twitter:image for the newest imageless rows of the last 48 h (at most 300). */
async function backfillImages(): Promise<{ checked: number; found: number; updated: number }> {
  const rows = await listImageless(48, 300);
  const limit = pLimit(PAGE_CONCURRENCY);
  const found = (
    await Promise.all(
      rows.map((r) =>
        limit(async () => {
          const page = await fetchArticlePage(r.url, false);
          const imageUrl = page?.ogImage ?? page?.twitterImage ?? null;
          return imageUrl ? { urlHash: r.urlHash, imageUrl } : null;
        }),
      ),
    )
  ).filter((x): x is { urlHash: string; imageUrl: string } => x !== null);
  const updated = await updateArticleImages(found);
  return { checked: rows.length, found: found.length, updated };
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.mode === 'sources') {
    console.log(JSON.stringify(await sourceKindCounts()));
    return 0;
  }
  if (args.mode === 'backfill') {
    console.log(JSON.stringify(await backfillImages()));
    return 0;
  }
  if (args.mode === 'report') {
    console.log(JSON.stringify(summarizeArticles(await listArticleStats(), new Date())));
    for (const job of ['ingest', 'ingest-cron']) console.log(`job_runs ${job}: ${JSON.stringify(await latestJobRun(job))}`);
    return 0;
  }
  const stats = await runIngest({ sourceIds: args.sourceIds, maxPerSource: args.maxPerSource, sinceHours: args.sinceHours });
  console.log(JSON.stringify(stats));
  return 0;
}

// Set exitCode instead of calling process.exit(): on Windows, exiting while undici sockets are still
// closing trips a libuv assertion (UV_HANDLE_CLOSING) and turns a clean run into a crash exit code.
main().then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  },
);
