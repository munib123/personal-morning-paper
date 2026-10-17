// STUB (L0) — owner: L3. Replace freely; keep the signature.
/* eslint-disable @typescript-eslint/no-unused-vars -- stub: parameters are kept for the §9.3 signature */
import type { ArchiveEntry, Edition } from '@/contracts/edition';
import type { Candidate } from '@/contracts/engine';
import { FIXTURE_ARCHIVE, FIXTURE_EDITION } from '@/contracts/fixtures';

// awaitNote=false (request paths) → editor note via after(); awaitNote=true (scripts/jobs) → awaited inline.
// Stub: always the fixture edition (2026-10-17, No. 14); builds and stores nothing.
export async function buildEdition(userId: string, now: Date, opts?: { force?: boolean; awaitNote?: boolean }): Promise<Edition> {
  return FIXTURE_EDITION;
}

// Stub: the fixture edition for its own date ('2026-10-17'), else null.
export async function getEdition(userId: string, date: string): Promise<Edition | null> {
  return date === FIXTURE_EDITION.date ? FIXTURE_EDITION : null;
}

export async function listArchive(userId: string, limit?: number): Promise<ArchiveEntry[]> {
  return FIXTURE_ARCHIVE;
}

// enriched|fallback in the last 36 h (widens to 7 d if < 60); cached 10 min per process. Stub: empty pool.
export async function loadCandidatePool(now: Date): Promise<Candidate[]> {
  return [];
}
