// L2 dev CLI (worker only, never on Vercel):
//   npx tsx --env-file=.env.local src/server/enrich/cli.ts <command>
//   nlp [--limit n] | extractive | stats
import '../../../scripts/lib/env';

import { createSupabaseAdminClient } from '@/server/db/admin';
import { selectPaged } from '@/server/nlp/paged';
import { extractiveBackfill } from './backfill';

const USAGE = 'usage: cli.ts nlp [--limit n] | extractive | stats';
const STATUSES = ['raw', 'embedded', 'enriched', 'fallback', 'unusable'] as const;

class UsageError extends Error {}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  if (i >= 0) return args[i + 1];
  return args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

function limitArg(args: string[]): number | undefined {
  const raw = flag(args, 'limit');
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw new UsageError(`--limit needs a positive integer, got "${raw}"`);
  return n;
}

function pacificDayNow(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

async function stats(): Promise<void> {
  const db = createSupabaseAdminClient();
  const articles = () => db.from('articles').select('id', { count: 'exact', head: true });
  const counted = async (q: PromiseLike<{ count: number | null; error: { message: string } | null }>) => {
    const { count, error } = await q;
    if (error) throw new Error(error.message);
    return count ?? 0;
  };

  const byStatus: Record<string, number> = {};
  for (const s of STATUSES) byStatus[s] = await counted(articles().eq('status', s));

  const byProvider = {
    'gemini:*': await counted(articles().like('enrich_provider', 'gemini:%')),
    extractive: await counted(articles().eq('enrich_provider', 'extractive')),
    none: await counted(articles().is('enrich_provider', null)),
  };

  const models = await selectPaged((from, to) =>
    db.from('articles').select('embed_model').not('embed_model', 'is', null).order('id').range(from, to),
  );
  const byEmbedModel: Record<string, number> = {};
  for (const m of models) byEmbedModel[m.embed_model!] = (byEmbedModel[m.embed_model!] ?? 0) + 1;

  const topicsWithEmbedding = await counted(db.from('topics').select('slug', { count: 'exact', head: true }).not('embedding', 'is', null));
  const llmCacheRows = await counted(db.from('llm_cache').select('key', { count: 'exact', head: true }));
  const day = pacificDayNow();
  const { data: usage, error: usageError } = await db.from('llm_usage').select('*').eq('usage_day', day);
  if (usageError) throw new Error(usageError.message);

  console.log(JSON.stringify({ byStatus, byProvider, byEmbedModel, topicsWithEmbedding, llmCacheRows, llmUsageToday: { day, rows: usage ?? [] } }, null, 2));
  if (Object.keys(byEmbedModel).length > 1) console.warn('MIXED VECTOR SPACES: articles.embed_model has more than one value; re-embed the corpus with one model');
}

async function main(argv: string[]): Promise<number> {
  const [cmd, ...args] = argv;
  try {
    switch (cmd) {
      case 'nlp': {
        const { runNlp } = await import('@/server/nlp');
        const limit = limitArg(args);
        console.log(JSON.stringify(await runNlp(limit ? { limit } : {})));
        return 0;
      }
      case 'extractive':
        console.log(JSON.stringify({ fallback: await extractiveBackfill() }));
        return 0;
      case 'stats':
        await stats();
        return 0;
      default:
        throw new UsageError(cmd ? `unknown command "${cmd}"` : 'missing command');
    }
  } catch (err) {
    if (err instanceof UsageError) {
      console.error(`cli: ${err.message}\n${USAGE}`);
      return 2;
    }
    throw err;
  }
}

// Exit explicitly: the model runtime and HTTP agents must not keep the process alive.
main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err);
    process.exit(1);
  },
);
