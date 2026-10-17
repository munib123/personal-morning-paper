// Float32Array vector math for 384-d embeddings. A null vector (extractive article, cold user) reads as 0.

export function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/** Euclidean length; 0 for null. */
export function norm(v: Float32Array | null): number {
  return v ? Math.sqrt(dot(v, v)) : 0;
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

/** Cosine with both lengths already known (the hot path of MMR and the similar chip). */
export function cosN(a: Float32Array | null, na: number, b: Float32Array | null, nb: number): number {
  if (!a || !b || na === 0 || nb === 0 || a.length !== b.length) return 0;
  return dot(a, b) / (na * nb);
}

/**
 * One pass over e for the scoring hot path: |e|, cos(pos, e) and cos(neg, e) (lengths of pos/neg given).
 * Missing or mismatched vectors give 0, like cos().
 */
export function scoreCosines(e: Float32Array | null, pos: Float32Array | null, posN: number, neg: Float32Array | null, negN: number): { eN: number; cosPos: number; cosNeg: number } {
  if (!e || e.length === 0) return { eN: 0, cosPos: 0, cosNeg: 0 };
  const p = pos && pos.length === e.length && posN > 0 ? pos : null;
  const q = neg && neg.length === e.length && negN > 0 ? neg : null;
  let ee = 0;
  let dp = 0;
  let dn = 0;
  if (p && q) {
    for (let i = 0; i < e.length; i++) {
      const x = e[i];
      ee += x * x;
      dp += x * p[i];
      dn += x * q[i];
    }
  } else if (p) {
    for (let i = 0; i < e.length; i++) {
      const x = e[i];
      ee += x * x;
      dp += x * p[i];
    }
  } else {
    for (let i = 0; i < e.length; i++) ee += e[i] * e[i];
    if (q) dn = dot(e, q);
  }
  const eN = Math.sqrt(ee);
  if (eN === 0) return { eN: 0, cosPos: 0, cosNeg: 0 };
  return { eN, cosPos: p ? dp / (eN * posN) : 0, cosNeg: q ? dn / (eN * negN) : 0 };
}

/** Unit-length copy of v (a zero vector stays zero). */
export function normalize(v: Float32Array): Float32Array {
  const n = Math.sqrt(dot(v, v));
  const out = new Float32Array(v.length);
  if (n === 0) return out;
  for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
  return out;
}
