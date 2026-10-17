// STUB (L0) — owner: L2. Replace freely; keep the signature.
/* eslint-disable @typescript-eslint/no-unused-vars -- stub: parameters are kept for the §9.3 signature */

const EMBEDDING_DIM = 384;

// One zero vector per text (the real module returns 384-d, L2-normalized embeddings).
export async function embedTexts(texts: string[]): Promise<Float32Array[]> {
  return texts.map(() => new Float32Array(EMBEDDING_DIM));
}

export interface NlpStats { embedded: number; labelled: number; clustersNew: number; clustersJoined: number; ms: number; }

// Zeroed stats; writes nothing.
export async function runNlp(opts?: { limit?: number }): Promise<NlpStats> {
  return { embedded: 0, labelled: 0, clustersNew: 0, clustersJoined: 0, ms: 0 };
}
