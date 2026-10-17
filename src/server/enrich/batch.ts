// Batched Gemini enrichment (ARCHITECTURE §10.3): 10 articles per request, a per-article llm_cache, strict
// guardrails per item, one re-batch for every failure, then the extractive fallback. One bad article never
// sinks its batch. Transport retries live in callLLM.
import pLimit from 'p-limit';
import { cacheKeyFor, callLLM, getCached, putCached, resolveModel } from '@/server/ai';
import { extractiveEnrichment, type ExtractiveFields } from './extractive';
import { checkEnrichment } from './guardrails';
import { articleText, buildBatchPrompt, ENRICH_INSTRUCTIONS } from './prompt';
import { batchSchema, enrichmentItemSchema, type EnrichmentItem } from './schema';
import type { EnrichCandidate } from './select';

export type EnrichOutcome = {
  id: string;
  kind: 'enriched' | 'unusable' | 'fallback' | 'retry'; // 'retry' never leaves enrichAll
  fields: EnrichmentItem | ExtractiveFields;
  provider: string;
  attempted: boolean;
};

const BATCH_TIMEOUT_MS = 120_000;
export const BATCH_SIZE = 10;
const CONCURRENCY = 2;

export function toStoredRecall(r: EnrichmentItem['recall']): { question: string; options: [string, string, string]; answerIndex: 0 | 1 | 2; explanation: string } {
  return {
    question: r.question,
    options: [r.options[0], r.options[1], r.options[2]],
    answerIndex: r.answer_index as 0 | 1 | 2,
    explanation: r.explanation,
  };
}

const source = (c: EnrichCandidate) => ({ title: c.title, text: articleText(c) });
const fallbackOutcome = (c: EnrichCandidate, attempted: boolean): EnrichOutcome => ({
  id: c.id,
  kind: 'fallback',
  fields: extractiveEnrichment(c),
  provider: 'extractive',
  attempted,
});
const retryOutcome = (c: EnrichCandidate): EnrichOutcome => ({ ...fallbackOutcome(c, true), kind: 'retry' });

/** A cached item that still passes today's guardrails, from any model of the FAST ladder. */
async function fromCache(c: EnrichCandidate, validSlugs: ReadonlySet<string>): Promise<EnrichOutcome | null> {
  for (const tier of ['fast', 'fallback'] as const) {
    const model = resolveModel(tier);
    if (!model) continue;
    const hit = enrichmentItemSchema.safeParse(await getCached(cacheKeyFor('enrich', model.id, c.urlHash)));
    if (!hit.success) continue;
    const check = checkEnrichment(hit.data, source(c), validSlugs);
    if (!check.ok) continue;
    return { id: c.id, kind: check.cleaned.usable ? 'enriched' : 'unusable', fields: { ...check.cleaned, id: c.id }, provider: `gemini:${model.id}`, attempted: true };
  }
  return null;
}

export async function enrichBatch(batch: EnrichCandidate[], slugs: string[], opts: { final?: boolean } = {}): Promise<EnrichOutcome[]> {
  const validSlugs = new Set(slugs);
  const outcomes = new Map<string, EnrichOutcome>();

  const pending: EnrichCandidate[] = [];
  for (const c of batch) {
    const cached = await fromCache(c, validSlugs);
    if (cached) outcomes.set(c.id, cached);
    else pending.push(c);
  }

  if (pending.length > 0) {
    const { prompt, idMap } = buildBatchPrompt(pending);
    const result = await callLLM('enrich', { instructions: ENRICH_INSTRUCTIONS(slugs), prompt }, batchSchema, {
      model: 'fast',
      timeoutMs: BATCH_TIMEOUT_MS,
      cacheKey: `batch:${pending.map((c) => c.urlHash).sort().join(',')}`,
      fallback: () => ({ items: [] }),
    });

    if (result.provider === 'fallback' || !result.model) {
      // Gemini is unavailable (no key, quota, outage): extractive now, eligible for a later run.
      for (const c of pending) outcomes.set(c.id, fallbackOutcome(c, false));
    } else {
      const provider = `gemini:${result.model}`;
      const failed: Record<string, number> = {};
      const byArticle = new Map<string, EnrichmentItem>();
      for (const item of result.output.items) {
        const articleId = idMap[item.id];
        if (articleId && !byArticle.has(articleId)) byArticle.set(articleId, item); // a duplicate never overwrites
      }
      for (const c of pending) {
        const item = byArticle.get(c.id);
        if (!item) {
          failed.missing = (failed.missing ?? 0) + 1;
          outcomes.set(c.id, opts.final ? fallbackOutcome(c, true) : retryOutcome(c));
          continue;
        }
        const check = checkEnrichment(item, source(c), validSlugs);
        for (const f of check.failures) failed[f] = (failed[f] ?? 0) + 1;
        let fields: EnrichmentItem | null = check.ok ? { ...check.cleaned, id: c.id } : null;
        // Morrow fallback: on the final pass, a headline whose only fault is its voice becomes the source title.
        if (!fields && opts.final && check.failures.length === 1 && check.failures[0] === 'headline_voice') {
          fields = { ...check.cleaned, id: c.id, headline: c.title };
        }
        if (!fields) {
          outcomes.set(c.id, opts.final ? fallbackOutcome(c, true) : retryOutcome(c));
          continue;
        }
        if (fields.usable) await putCached(cacheKeyFor('enrich', result.model, c.urlHash), 'enrich', provider, fields);
        outcomes.set(c.id, { id: c.id, kind: fields.usable ? 'enriched' : 'unusable', fields, provider, attempted: true });
      }
      if (Object.keys(failed).length > 0) console.log(`[enrich] ${opts.final ? 're-batch' : 'batch'} guardrail failures ${JSON.stringify(failed)}`);
    }
  }

  return batch.map((c) => outcomes.get(c.id)!);
}

function chunks<T>(xs: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

/** First pass in batches, then ONE re-batch of every retry (final), whose failures go extractive. */
export async function enrichAll(cands: EnrichCandidate[], slugs: string[], opts: { batchSize?: number; concurrency?: number } = {}): Promise<EnrichOutcome[]> {
  const size = opts.batchSize ?? BATCH_SIZE;
  const limit = pLimit(opts.concurrency ?? CONCURRENCY);
  const run = (batches: EnrichCandidate[][], final: boolean) => Promise.all(batches.map((b) => limit(() => enrichBatch(b, slugs, { final }))));

  const first = (await run(chunks(cands, size), false)).flat();
  const byId = new Map(cands.map((c) => [c.id, c]));
  const retries = first.filter((o) => o.kind === 'retry').map((o) => byId.get(o.id)!);
  const second = new Map((await run(chunks(retries, size), true)).flat().map((o) => [o.id, o]));
  return first.map((o) => (o.kind === 'retry' ? second.get(o.id)! : o));
}
