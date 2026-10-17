// llm_cache (ARCHITECTURE §7, §10.3): sha256(step|model|key) → output. Re-runs cost nothing.
// Cache errors are swallowed: they only ever cost a cache miss.
import { createHash } from 'node:crypto';
import { createSupabaseAdminClient } from '@/server/db/admin';
import type { Json } from '@/contracts/database.types';
import type { LlmStep } from './index';

export interface CacheStore {
  get(key: string): Promise<unknown | undefined>;
  put(key: string, step: LlmStep, provider: string, output: unknown): Promise<void>;
}

export const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');

export function cacheKeyFor(step: LlmStep, modelId: string, key: string): string {
  return sha256(`${step}|${modelId}|${key}`);
}

// A slow database must never stall a call: a cache read or write gives up after a few seconds.
const DB_TIMEOUT_MS = 2_500;

const supabaseStore: CacheStore = {
  async get(key) {
    const { data, error } = await createSupabaseAdminClient()
      .from('llm_cache')
      .select('output')
      .eq('key', key)
      .abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS))
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? (data.output as unknown) : undefined;
  },
  async put(key, step, provider, output) {
    const { error } = await createSupabaseAdminClient()
      .from('llm_cache')
      .upsert({ key, step, provider, output: output as Json })
      .abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS));
    if (error) throw new Error(error.message);
  },
};

let store: CacheStore = supabaseStore;
let warned = false;

function warnOnce(what: string, err: unknown): void {
  if (warned) return;
  warned = true;
  console.warn(`[llm] cache ${what} failed (treated as a miss from now on): ${err instanceof Error ? err.message : String(err)}`);
}

export async function getCached(key: string): Promise<unknown | undefined> {
  try {
    return await store.get(key);
  } catch (err) {
    warnOnce('read', err);
    return undefined;
  }
}

export async function putCached(key: string, step: LlmStep, provider: string, output: unknown): Promise<void> {
  try {
    await store.put(key, step, provider, output);
  } catch (err) {
    warnOnce('write', err);
  }
}

/** Tests only: swap the store (null restores Supabase). */
export function __setCacheStore(s: CacheStore | null): void {
  store = s ?? supabaseStore;
}
