// L2 dev CLI (worker only, never on Vercel):
//   npx tsx --env-file=.env.local src/server/enrich/cli.ts <command>
//   nlp [--limit n] | recluster | extractive | enrich [--limit n] | reset-sample <n> | stats | ping
import '../../../scripts/lib/env';

import { createSupabaseAdminClient } from '@/server/db/admin';
import { selectPaged } from '@/server/nlp/paged';
import { pacificDay } from '@/server/ai/usage';
import { extractiveBackfill } from './backfill';
import { CANDIDATE_COLUMNS, enrichRows, type CandidateRow } from './run';

const USAGE = 'usage: cli.ts nlp [--limit n] | recluster | extractive | enrich [--limit n] | reset-sample <n> | stats | ping';
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

/**
 * Puts n Gemini-enriched articles (one per cluster) back to `embedded` and enriches exactly those again:
 * with llm_cache warm this costs no Gemini request (acceptance check 5: llmCalls 0).
 */
async function resetSample(n: number): Promise<void> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from('articles').select('id, cluster_id').eq('status', 'enriched').order('enriched_at', { ascending: false }).limit(n * 4);
  if (error) throw new Error(error.message);
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const r of data ?? []) {
    const key = r.cluster_id ?? r.id;
    if (seen.has(key)) continue;
    seen.add(key);
    ids.push(r.id);
    if (ids.length === n) break;
  }
  if (ids.length === 0) throw new UsageError('no enriched articles to reset yet: run cli.ts enrich first');
  const { error: resetError } = await db.from('articles').update({ status: 'embedded' }).in('id', ids);
  if (resetError) throw new Error(resetError.message);
  const { data: rows, error: rowsError } = await db.from('articles').select(CANDIDATE_COLUMNS).in('id', ids).overrideTypes<CandidateRow[], { merge: false }>();
  if (rowsError) throw new Error(rowsError.message);
  console.log(JSON.stringify({ reset: ids.length, ...(await enrichRows(rows ?? [], { cap: ids.length })) }));
}

function pacificDayNow(): string {
  return pacificDay(new Date());
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
      case 'ping': {
        // One FAST request (live): proves the key, the model id and the llm_usage RPC.
        const { z } = await import('zod');
        const { callLLM, geminiStatus } = await import('@/server/ai');
        const result = await callLLM('describe', { instructions: 'Reply with JSON.', prompt: 'Say ok' }, z.object({ ok: z.string() }), {
          model: 'fast',
          fallback: () => ({ ok: 'fallback' }),
          cacheKey: `ping-${Date.now()}`,
        });
        const { data: usage } = await createSupabaseAdminClient().from('llm_usage').select('*').eq('usage_day', pacificDayNow());
        console.log(JSON.stringify({ result, status: await geminiStatus(), llmUsageToday: usage ?? [] }, null, 2));
        return result.provider === 'gemini' ? 0 : 1;
      }
      case 'recluster': {
        const { reclusterAll } = await import('@/server/nlp/recluster');
        console.log(JSON.stringify(await reclusterAll()));
        return 0;
      }
      case 'enrich': {
        const { runEnrich } = await import('./index');
        const limit = limitArg(args);
        console.log(JSON.stringify(await runEnrich(limit ? { limit } : {})));
        return 0;
      }
      case 'reset-sample': {
        const n = Number(args[0]);
        if (!Number.isInteger(n) || n < 1) throw new UsageError(`reset-sample needs a positive integer, got "${args[0] ?? ''}"`);
        await resetSample(n);
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
