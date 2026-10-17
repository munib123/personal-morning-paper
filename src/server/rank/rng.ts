// Seeded randomness for the ranker. The seed is `${userId}|${date}`, so a reader's paper for a day is
// reproducible (rebuilds and tests give the same explore draws), while tomorrow's paper explores anew.

/** FNV-1a 32-bit hash of a string. */
export function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32: a small, fast, seeded PRNG returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A standard normal draw (Box–Muller) from a [0,1) generator. */
function normal(rng: () => number): number {
  let u = rng();
  while (u <= Number.EPSILON) u = rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Gamma(shape, 1) by Marsaglia–Tsang; shape < 1 uses the boost Gamma(shape+1)·u^(1/shape). */
export function sampleGamma(rng: () => number, shape: number): number {
  if (shape < 1) {
    let u = rng();
    while (u <= Number.EPSILON) u = rng();
    return sampleGamma(rng, shape + 1) * Math.pow(u, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = normal(rng);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/** Beta(a, b) = X / (X + Y) with X ~ Gamma(a), Y ~ Gamma(b). Kept strictly inside (0, 1). */
export function sampleBeta(rng: () => number, a: number, b: number): number {
  const x = sampleGamma(rng, a);
  const y = sampleGamma(rng, b);
  const s = x + y;
  if (!(s > 0)) return a / (a + b);
  const r = x / s;
  return Math.min(1 - 1e-12, Math.max(1e-12, r));
}
