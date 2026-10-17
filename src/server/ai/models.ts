// Gemini model tiers (ARCHITECTURE §5, §11). Model ids, daily caps and per-minute rates come from env;
// the defaults below are the only place they are written down.
import { createGoogle } from '@ai-sdk/google';
import type { EmbeddingModel, LanguageModel } from 'ai';

export type ModelTier = 'smart' | 'fast' | 'fallback';
export interface ResolvedModel { id: string; model: LanguageModel }

const MODEL: Record<ModelTier, { env: string; id: string; rpdEnv: string; rpd: number; rpmEnv: string; rpm: number }> = {
  fast: { env: 'GEMINI_MODEL_FAST', id: 'gemini-3.5-flash-lite', rpdEnv: 'GEMINI_RPD_FAST', rpd: 450, rpmEnv: 'GEMINI_RPM_FAST', rpm: 12 },
  fallback: { env: 'GEMINI_MODEL_FALLBACK', id: 'gemini-3.1-flash-lite', rpdEnv: 'GEMINI_RPD_FALLBACK', rpd: 450, rpmEnv: 'GEMINI_RPM_FALLBACK', rpm: 12 },
  smart: { env: 'GEMINI_MODEL_SMART', id: 'gemini-3.8-flash', rpdEnv: 'GEMINI_RPD_SMART', rpd: 18, rpmEnv: 'GEMINI_RPM_SMART', rpm: 4 },
};
const EMBED_MODEL = 'gemini-embedding-2';

let resolverOverride: ((tier: ModelTier) => ResolvedModel | null) | null = null;
let provider: { apiKey: string; google: ReturnType<typeof createGoogle> } | null = null;

function google(apiKey: string): ReturnType<typeof createGoogle> {
  if (!provider || provider.apiKey !== apiKey) provider = { apiKey, google: createGoogle({ apiKey }) };
  return provider.google;
}

const positive = (raw: string | undefined, fallback: number) => {
  const n = Number(raw);
  return raw && Number.isFinite(n) && n > 0 ? n : fallback;
};

export function modelIdFor(tier: ModelTier): string {
  return process.env[MODEL[tier].env] || MODEL[tier].id;
}

/** The tier's model, or null when GEMINI_API_KEY is missing (callers then use their fallback). */
export function resolveModel(tier: ModelTier): ResolvedModel | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (resolverOverride) return resolverOverride(tier);
  const id = modelIdFor(tier);
  return { id, model: google(apiKey)(id) };
}

/** SMART → FAST → FALLBACK for demo personas' notes; everything else FAST → FALLBACK. */
export function ladderFor(model?: 'fast' | 'smart'): ModelTier[] {
  return model === 'smart' ? ['smart', 'fast', 'fallback'] : ['fast', 'fallback'];
}

export const rpdFor = (tier: ModelTier): number => positive(process.env[MODEL[tier].rpdEnv], MODEL[tier].rpd);
export const rpmFor = (tier: ModelTier): number => positive(process.env[MODEL[tier].rpmEnv], MODEL[tier].rpm);

/** SMART thinks at 'low' (never 'minimal': it errors on that model); FAST and FALLBACK use the model default. */
export function thinkingFor(tier: ModelTier): { thinkingLevel: 'low' } | undefined {
  return tier === 'smart' ? { thinkingLevel: 'low' } : undefined;
}

export function embeddingModelIdForGemini(): string {
  return process.env.GEMINI_EMBED_MODEL || EMBED_MODEL;
}

export function embeddingModel(): EmbeddingModel {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY missing');
  return google(apiKey).embedding(embeddingModelIdForGemini());
}

/** Tests only: swap the model factory (null restores the Gemini provider). */
export function __setModelResolver(fn: ((tier: ModelTier) => ResolvedModel | null) | null): void {
  resolverOverride = fn;
}
