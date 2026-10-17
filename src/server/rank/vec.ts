// Float32Array vector math for 384-d embeddings. A null vector (extractive article, cold user) reads as 0.

export function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/** Cosine similarity; 0 when either side is null, empty, zero or of a different dimension. */
export function cos(a: Float32Array | null, b: Float32Array | null): number {
  if (!a || !b || a.length === 0 || a.length !== b.length) return 0;
  let ab = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < a.length; i++) {
    ab += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  if (aa === 0 || bb === 0) return 0;
  return ab / Math.sqrt(aa * bb);
}

/** Unit-length copy of v (a zero vector stays zero). */
export function normalize(v: Float32Array): Float32Array {
  const n = Math.sqrt(dot(v, v));
  const out = new Float32Array(v.length);
  if (n === 0) return out;
  for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
  return out;
}
