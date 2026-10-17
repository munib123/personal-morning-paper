// Embeddings (ARCHITECTURE §10.2): local transformers.js `Supabase/gte-small` (384-d, mean pooling,
// normalized; zero Gemini quota), `Xenova/all-MiniLM-L6-v2` when gte-small fails to load, and
// `EMBEDDINGS_PROVIDER=gemini` (gemini-embedding-2 at 384 dims) when local inference fails entirely.
// Spaces never mix: switching models means re-running scripts/embed-topics.ts and re-embedding the corpus.
//
// Jobs-only module: the Next.js app never imports it (the app reaches @/server/enrich and
// @/server/nlp/topics, which stay free of transformers.js).
import { createGoogle } from '@ai-sdk/google';
import type { FeatureExtractionPipeline } from '@huggingface/transformers';
import { embedMany } from 'ai';
import { createSupabaseAdminClient } from '@/server/db/admin';
import { toPgVector } from '@/server/db/vector';
import { loadTopics } from './topics';
import { normalize } from './vector';

export const EMBED_DIM = 384;
const LOCAL_BATCH = 32;
const GEMINI_CHUNK = 100;
const LOCAL_MODELS = ['Supabase/gte-small', 'Xenova/all-MiniLM-L6-v2'] as const;

let localPipeline: Promise<{ modelId: string; extract: FeatureExtractionPipeline }> | null = null;
let lastModelId: string | null = null;

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

async function loadLocalPipeline(): Promise<{ modelId: string; extract: FeatureExtractionPipeline }> {
  // Dynamic import: onnxruntime only loads when a job actually embeds locally.
  const { env, pipeline } = await import('@huggingface/transformers');
  if (process.env.MODEL_CACHE_DIR) env.cacheDir = process.env.MODEL_CACHE_DIR;
  let lastError: unknown;
  for (const modelId of LOCAL_MODELS) {
    try {
      const extract = await pipeline('feature-extraction', modelId, { dtype: 'q8' });
      if (modelId !== LOCAL_MODELS[0]) console.warn(`[nlp] embedding with ${modelId} (fallback)`);
      return { modelId, extract };
    } catch (err) {
      lastError = err;
      console.warn(`[nlp] ${modelId} failed to load: ${errorMessage(err)}`);
    }
  }
  throw new Error(`no local embedding model could be loaded: ${errorMessage(lastError)}`);
}

/** Local embeddings in batches of 32; one pipeline per process. */
export async function embedLocal(texts: string[]): Promise<Float32Array[]> {
  if (texts.length === 0) return [];
  if (!localPipeline) {
    localPipeline = loadLocalPipeline();
    localPipeline.catch(() => {
      localPipeline = null; // a later call may retry
    });
  }
  const { modelId, extract } = await localPipeline;
  const out: Float32Array[] = [];
  for (let i = 0; i < texts.length; i += LOCAL_BATCH) {
    const batch = texts.slice(i, i + LOCAL_BATCH);
    const tensor = await extract(batch, { pooling: 'mean', normalize: true });
    const dim = tensor.dims[tensor.dims.length - 1];
    if (dim !== EMBED_DIM) throw new Error(`${modelId} returned ${dim}-d vectors, expected ${EMBED_DIM}`);
    const data = tensor.data as Float32Array;
    for (let j = 0; j < batch.length; j++) out.push(data.slice(j * dim, (j + 1) * dim));
  }
  lastModelId = `local:${modelId}`;
  return out;
}

function geminiEmbedModelId(): string {
  return process.env.GEMINI_EMBED_MODEL || 'gemini-embedding-2';
}

/** Gemini embeddings at 384 dims (outputDimensionality), in chunks of 100, re-normalized. */
export async function embedGemini(texts: string[]): Promise<Float32Array[]> {
  if (texts.length === 0) return [];
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY missing (EMBEDDINGS_PROVIDER=gemini)');
  const modelId = geminiEmbedModelId();
  const model = createGoogle({ apiKey }).embedding(modelId);
  const out: Float32Array[] = [];
  for (let i = 0; i < texts.length; i += GEMINI_CHUNK) {
    const { embeddings } = await embedMany({ model, values: texts.slice(i, i + GEMINI_CHUNK), dimensions: EMBED_DIM, maxRetries: 0 });
    for (const e of embeddings) {
      if (e.length !== EMBED_DIM) throw new Error(`${modelId} returned ${e.length}-d vectors, expected ${EMBED_DIM}`);
      out.push(normalize(Float32Array.from(e)));
    }
  }
  lastModelId = `gemini:${modelId}`;
  return out;
}

const providerIsGemini = () => process.env.EMBEDDINGS_PROVIDER === 'gemini';

/** §9.3: 384-d, L2-normalized. EMBEDDINGS_PROVIDER=local (default) | gemini. */
export async function embedTexts(texts: string[]): Promise<Float32Array[]> {
  return providerIsGemini() ? embedGemini(texts) : embedLocal(texts);
}

/** The model that actually produced the last embeddings (recorded in articles.embed_model). */
export function embeddingModelId(): string {
  if (lastModelId) return lastModelId;
  return providerIsGemini() ? `gemini:${geminiEmbedModelId()}` : `local:${LOCAL_MODELS[0]}`;
}

/** Embeds "{name}: {description}" for every topic and writes topics.embedding. Returns the count. */
export async function embedTopics(): Promise<number> {
  const topics = await loadTopics({ fresh: true });
  if (topics.length === 0) return 0;
  const vectors = await embedTexts(topics.map((t) => `${t.name}: ${t.description}`));
  const db = createSupabaseAdminClient();
  for (let i = 0; i < topics.length; i++) {
    const { error } = await db.from('topics').update({ embedding: toPgVector(vectors[i]) }).eq('slug', topics[i].slug);
    if (error) throw new Error(`topics.embedding for ${topics[i].slug}: ${error.message}`);
  }
  await loadTopics({ fresh: true });
  return topics.length;
}
