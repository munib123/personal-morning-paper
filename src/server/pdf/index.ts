// STUB (L0) — owner: L6. Replace freely; keep the signature.
/* eslint-disable @typescript-eslint/no-unused-vars -- stub: parameters are kept for the §9.3 signature */
import type { Edition } from '@/contracts/edition';

// signed URL if stored. Stub: nothing is stored yet.
export async function getEditionPdfUrl(editionId: string): Promise<string | null> {
  return null;
}

// returns the storage path. Stub: always rejects, so callers take the /paper/[date]/print fallback.
export async function renderAndStoreEditionPdf(edition: Edition): Promise<string> {
  throw new Error('not implemented (L6)');
}
