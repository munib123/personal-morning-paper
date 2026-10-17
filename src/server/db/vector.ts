// pgvector columns arrive from PostgREST as text: "[0.1,-0.2,…]".

export function parseVector(v: string | null): Float32Array | null {
  if (!v) return null;
  const inner = v.trim().replace(/^\[/, '').replace(/\]$/, '').trim();
  if (!inner) return null;
  const parts = inner.split(',');
  const out = new Float32Array(parts.length);
  for (let i = 0; i < parts.length; i++) out[i] = Number(parts[i]);
  return out;
}

export function toPgVector(v: Float32Array): string {
  return `[${Array.from(v).join(',')}]`;
}
