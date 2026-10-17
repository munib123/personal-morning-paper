// STUB (L0) — owner: L2. Replace freely; keep the signature.
import type { z } from 'zod';

export type LlmStep = 'enrich' | 'editor_note' | 'describe' | 'translate_ur' | 'perspectives' | 'tell_editor';
export interface LlmResult<T> { output: T; provider: 'gemini' | 'fallback'; model: string | null; cached: boolean; }

// Never touches the network (the Gemini free-tier quota is shared by every lane): always serves the caller's fallback.
export async function callLLM<T>(step: LlmStep, input: { instructions: string; prompt: string }, schema: z.ZodType<T>,
  opts: { fallback: () => T; model?: 'fast' | 'smart'; timeoutMs?: number; cacheKey?: string }): Promise<LlmResult<T>> {
  return { output: opts.fallback(), provider: 'fallback', model: null, cached: false };
}

export async function geminiStatus(): Promise<'ok' | 'limited' | 'missing'> {
  return process.env.GEMINI_API_KEY ? 'ok' : 'missing';
}
