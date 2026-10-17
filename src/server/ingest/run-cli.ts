// Local ingest runner (L1). Not part of the app bundle.
//   npx tsx src/server/ingest/run-cli.ts [--only=id1,id2] [--max=N] [--since=H]   one runIngest, prints IngestStats JSON
//   npx tsx src/server/ingest/run-cli.ts --sources                               source counts by kind, then exits
// It reads .env.local itself (variables already in the environment win), so --env-file is optional.
import { runIngest } from './index';
import { sourceKindCounts } from './store';

try {
  process.loadEnvFile('.env.local');
} catch {
  // CI / Actions pass the env directly.
}

const USAGE = 'usage: run-cli.ts [--only=id1,id2] [--max=N] [--since=H] | --sources';

interface CliArgs {
  mode: 'run' | 'sources';
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

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.mode === 'sources') {
    console.log(JSON.stringify(await sourceKindCounts()));
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
