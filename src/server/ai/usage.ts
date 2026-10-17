// The llm_usage daily budget (ARCHITECTURE §7, §11): every request is counted per Pacific day and model
// through the atomic increment_llm_usage RPC (never read-modify-write). A model at its GEMINI_RPD_* cap
// is skipped before Google can return a 429. The table is read once per model and day per process; after
// that the totals returned by each increment are tracked. Errors are swallowed and logged.
import { createSupabaseAdminClient } from '@/server/db/admin';

export interface UsageDelta { requests: number; rateLimited: number; tokensIn: number; tokensOut: number }

export interface UsageStore {
  get(day: string, model: string): Promise<number>;
  /** Returns the new `requests` total for (day, model). */
  add(day: string, model: string, d: UsageDelta): Promise<number>;
}

/** 'YYYY-MM-DD' in America/Los_Angeles: Gemini's RPD resets at 00:00 Pacific (12:00 PKT). */
export function pacificDay(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

const supabaseStore: UsageStore = {
  async get(day, model) {
    const { data, error } = await createSupabaseAdminClient()
      .from('llm_usage')
      .select('requests')
      .eq('usage_day', day)
      .eq('model', model)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data?.requests ?? 0;
  },
  async add(day, model, d) {
    const { data, error } = await createSupabaseAdminClient().rpc('increment_llm_usage', {
      p_day: day,
      p_model: model,
      p_requests: d.requests,
      p_limited: d.rateLimited,
      p_in: d.tokensIn,
      p_out: d.tokensOut,
    });
    if (error) throw new Error(error.message);
    return data;
  },
};

let store: UsageStore = supabaseStore;
const totals = new Map<string, number>(); // `${day}|${model}` → requests so far
let warned = false;

function warnOnce(what: string, err: unknown): void {
  if (warned) return;
  warned = true;
  console.warn(`[llm] llm_usage ${what} failed (counting in memory): ${err instanceof Error ? err.message : String(err)}`);
}

// Quota days follow Google's real clock, not the demo clock.
export async function getUsage(modelId: string, at: Date = new Date()): Promise<number> {
  const k = `${pacificDay(at)}|${modelId}`;
  const known = totals.get(k);
  if (known !== undefined) return known;
  let n = 0;
  try {
    n = await store.get(pacificDay(at), modelId);
  } catch (err) {
    warnOnce('read', err);
  }
  totals.set(k, Math.max(n, totals.get(k) ?? 0));
  return totals.get(k)!;
}

export async function recordUsage(modelId: string, d: UsageDelta, at: Date = new Date()): Promise<void> {
  const day = pacificDay(at);
  const k = `${day}|${modelId}`;
  try {
    totals.set(k, await store.add(day, modelId, d));
  } catch (err) {
    warnOnce('increment', err);
    totals.set(k, (totals.get(k) ?? 0) + d.requests);
  }
}

/** Tests only: swap the store (null restores Supabase) and forget the tracked totals. */
export function __setUsageStore(s: UsageStore | null): void {
  store = s ?? supabaseStore;
  totals.clear();
}
