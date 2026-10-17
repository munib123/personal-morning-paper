// L2 AI (ARCHITECTURE §9.3, §10.3 item 6, §11): the one wrapper that owns Gemini.
// Ladder SMART → FAST → FALLBACK → opts.fallback(). Per model: llm_cache first, then the breaker and the
// llm_usage daily budget, per-model RPM pacing, and the transport rules:
//   429 per minute → wait the body's retryDelay once, then step down (and open the breaker for 60 s);
//   429 per day    → skip the model until the next 00:00 Pacific;
//   5xx / timeout  → retry once after 2 s, then step down;
//   schema / auth  → step down at once.
// One deadline (timeoutMs) covers the whole ladder. callLLM never throws; if opts.fallback() throws,
// that is a caller bug and it propagates.
import { generateText, Output } from 'ai';
import type { z } from 'zod';
import { cacheKeyFor, getCached, putCached, sha256 } from './cache';
import { classifyError } from './errors';
import { isLimited, markLimited, nextQuotaReset, pace, sleep } from './limiter';
import { ladderFor, resolveModel, rpdFor, rpmFor, thinkingFor } from './models';
import { getUsage, recordUsage } from './usage';

export type LlmStep = 'enrich' | 'editor_note' | 'describe' | 'translate_ur' | 'perspectives' | 'tell_editor';
export interface LlmResult<T> { output: T; provider: 'gemini' | 'fallback'; model: string | null; cached: boolean; }

// The enrich/edition lanes import these through @/server/ai only (one mock point for tests).
export { cacheKeyFor, getCached, putCached } from './cache';
export { resolveModel } from './models';

const DEFAULT_TIMEOUT_MS = 60_000;
const RETRY_AFTER_SERVER_ERROR_MS = 2_000;
const MAX_RETRY_DELAY_MS = 60_000;
const BREAKER_MS = 60_000;

let llmCalls = 0;

/** Network requests to Gemini made by this process (for EnrichStats.llmCalls and the edition receipt). */
export function getLlmCallCount(): number {
  return llmCalls;
}

const log = (step: LlmStep, model: string, outcome: string, ms: number) => console.log(`[llm] ${step} ${model} ${outcome} ${ms}ms`);

export async function callLLM<T>(step: LlmStep, input: { instructions: string; prompt: string }, schema: z.ZodType<T>,
  opts: { fallback: () => T; model?: 'fast' | 'smart'; timeoutMs?: number; cacheKey?: string }): Promise<LlmResult<T>> {
  const deadline = Date.now() + (opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const key = opts.cacheKey ?? sha256(`${input.instructions}\n${input.prompt}`);
  const ladder = ladderFor(opts.model).flatMap((tier) => {
    const resolved = resolveModel(tier);
    return resolved ? [{ tier, ...resolved }] : [];
  });

  // 1. A cached answer from any model of the ladder.
  for (const { id } of ladder) {
    const hit = await getCached(cacheKeyFor(step, id, key));
    if (hit === undefined) continue;
    const parsed = schema.safeParse(hit);
    if (parsed.success) return { output: parsed.data, provider: 'gemini', model: id, cached: true };
  }

  // 2. The ladder.
  ladder: for (const { tier, id, model } of ladder) {
    if (isLimited(id)) {
      log(step, id, 'skip:limited', 0);
      continue;
    }
    if ((await getUsage(id)) >= rpdFor(tier)) {
      log(step, id, 'skip:budget', 0);
      continue;
    }
    for (let attempt = 1; attempt <= 2; attempt++) {
      if (!(await pace(id, rpmFor(tier), deadline))) {
        log(step, id, 'skip:paced', 0); // its next slot is after the deadline; the next model may be free
        continue ladder;
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) break ladder;
      llmCalls++;
      const started = Date.now();
      try {
        const thinking = thinkingFor(tier);
        const result = await generateText({
          model,
          instructions: input.instructions,
          prompt: input.prompt,
          output: Output.object({ schema }),
          maxRetries: 0,
          abortSignal: AbortSignal.timeout(remaining),
          ...(thinking ? { providerOptions: { google: { thinkingConfig: thinking } } } : {}),
        });
        await recordUsage(id, { requests: 1, rateLimited: 0, tokensIn: result.usage.inputTokens ?? 0, tokensOut: result.usage.outputTokens ?? 0 });
        const output = schema.parse(result.output);
        await putCached(cacheKeyFor(step, id, key), step, `gemini:${id}`, output);
        log(step, id, 'ok', Date.now() - started);
        return { output, provider: 'gemini', model: id, cached: false };
      } catch (err) {
        const { kind, retryDelayMs } = classifyError(err);
        const rateLimited = kind === 'rate_limit' || kind === 'quota_day' ? 1 : 0;
        await recordUsage(id, { requests: 1, rateLimited, tokensIn: 0, tokensOut: 0 });
        log(step, id, kind, Date.now() - started);
        if (kind === 'rate_limit') {
          const wait = Math.min(retryDelayMs ?? RETRY_AFTER_SERVER_ERROR_MS, MAX_RETRY_DELAY_MS);
          if (attempt === 1 && Date.now() + wait < deadline) {
            await sleep(wait);
            continue;
          }
          markLimited(id, Date.now() + BREAKER_MS);
          continue ladder;
        }
        if (kind === 'quota_day') {
          markLimited(id, nextQuotaReset(Date.now()));
          continue ladder;
        }
        if ((kind === 'server' || kind === 'timeout') && attempt === 1 && Date.now() + RETRY_AFTER_SERVER_ERROR_MS < deadline) {
          await sleep(RETRY_AFTER_SERVER_ERROR_MS);
          continue;
        }
        continue ladder; // schema, auth, other, or no time left for a retry
      }
    }
  }

  return { output: opts.fallback(), provider: 'fallback', model: null, cached: false };
}

/** 'missing' = no key; 'limited' = FAST rate-limited in this process or at GEMINI_RPD_FAST today. No Gemini call. */
export async function geminiStatus(): Promise<'ok' | 'limited' | 'missing'> {
  const fast = resolveModel('fast');
  if (!fast) return 'missing';
  if (isLimited(fast.id)) return 'limited';
  if ((await getUsage(fast.id)) >= rpdFor('fast')) return 'limited';
  return 'ok';
}
