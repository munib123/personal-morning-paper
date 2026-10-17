// Pure copy and pairing helpers for the "Other angles" panel (Morrow voice: calm, short, concrete).
import type { PerspectiveSource, Perspectives, StoredPerspectives } from '@/server/perspectives/build';

export const sourcesLabel = (n: number): string => `${n} ${n === 1 ? 'source' : 'sources'}`;

export function differenceLabel(n: number): string {
  if (n === 0) return 'no points of difference';
  return `${n} ${n === 1 ? 'point' : 'points'} of difference`;
}

/** The footer: how the panel was written. */
export const providerLabel = (p: StoredPerspectives['provider']): string => (p === 'gemini' ? 'with Gemini' : "from the sources' own words");

export interface AngleRow {
  name: string;
  headline: string;
  angle: string;
  url: string;
  articleId: string | null;
}

const norm = (s: string): string => s.trim().toLowerCase();

/**
 * One row per source, in source order, each with its outlet's angle when the model named it (by name,
 * else by position when the counts match). Sources the model skipped still get a row, so every original
 * stays one click away; angles for outlets that are not among the sources are dropped.
 */
export function angleRows(angles: Perspectives['angles'], sources: PerspectiveSource[]): AngleRow[] {
  const byName = new Map(angles.map((a) => [norm(a.source), a] as const));
  const anyMatch = sources.some((s) => byName.has(norm(s.name)));
  return sources.map((s, i) => {
    const a = anyMatch ? byName.get(norm(s.name)) : angles.length === sources.length ? angles[i] : undefined;
    return { name: s.name, headline: s.headline || a?.headline || '', angle: a?.angle ?? '', url: s.url, articleId: s.articleId || null };
  });
}
