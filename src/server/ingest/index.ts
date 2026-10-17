// STUB (L0) — owner: L1. Replace freely; keep the signature.
/* eslint-disable @typescript-eslint/no-unused-vars -- stub: parameters are kept for the §9.3 signature */

export interface IngestStats { sources: number; fetched: number; inserted: number; skippedOld: number; failedSources: string[]; ms: number; }

// Zeroed stats; touches no network and writes no job_runs row (§9.7: only scripts/job-ingest.ts writes it).
export async function runIngest(opts?: { sourceIds?: string[]; maxPerSource?: number; sinceHours?: number }): Promise<IngestStats> {
  return { sources: 0, fetched: 0, inserted: 0, skippedOld: 0, failedSources: [], ms: 0 };
}
