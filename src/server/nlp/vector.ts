// Dense-vector helpers for the 384-d embedding space (ARCHITECTURE §10.2). Pure, no I/O.

/** Cosine similarity; 0 when either vector has zero norm. */
export function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / Math.sqrt(na * nb);
}

/** A new L2-normalized copy (a zero vector stays zero). */
export function normalize(v: Float32Array): Float32Array {
  let sq = 0;
  for (let i = 0; i < v.length; i++) sq += v[i] * v[i];
  const out = new Float32Array(v.length);
  if (sq === 0) return out;
  const inv = 1 / Math.sqrt(sq);
  for (let i = 0; i < v.length; i++) out[i] = v[i] * inv;
  return out;
}
