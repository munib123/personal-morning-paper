// Who gets Gemini (ARCHITECTURE §10.3): one representative per cluster (highest source quality, then the
// longest text), prioritized by importance + freshness, at least 3 per level-2 topic so every section has
// stock, capped at 400 per run. Everyone else gets the extractive fallback. Pure, no I/O.
import { ancestorsOf, type TopicNode } from '@/contracts/taxonomy';

export interface EnrichCandidate {
  id: string;
  urlHash: string;
  clusterId: string | null;
  sourceName: string;
  sourceQuality: number;
  wordCount: number;
  publishedAt: Date;
  importance: number;
  labels: { slug: string; conf: number }[];
  title: string;
  lede: string | null;
  contentText: string | null;
}

export const ENRICH_CAP = 400;
export const PER_LEVEL2 = 3;

const priority = (c: EnrichCandidate, now: Date) => c.importance + Math.exp(-Math.max(0, now.getTime() - c.publishedAt.getTime()) / 3_600_000 / 24);

/** The level-2 topics an article counts for: its level-2 labels, and the level-2 ancestor of a level-3 one. */
function level2Of(c: EnrichCandidate, levels: Map<string, number>): Set<string> {
  const out = new Set<string>();
  for (const { slug } of c.labels) {
    const level = levels.get(slug);
    if (level === 2) out.add(slug);
    else if (level === 3) out.add(ancestorsOf(slug)[1]);
  }
  return out;
}

export function selectForEnrichment(
  rows: EnrichCandidate[],
  topics: TopicNode[],
  now: Date,
  opts: { cap?: number; perLevel2?: number } = {},
): { llm: EnrichCandidate[]; extractive: EnrichCandidate[] } {
  const cap = opts.cap ?? ENRICH_CAP;
  const perLevel2 = opts.perLevel2 ?? PER_LEVEL2;
  const levels = new Map(topics.map((t) => [t.slug, t.level]));

  // 1. One representative per cluster.
  const groups = new Map<string, EnrichCandidate[]>();
  for (const r of rows) {
    const key = r.clusterId ?? `article:${r.id}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const reps: EnrichCandidate[] = [];
  const extractive: EnrichCandidate[] = [];
  for (const members of groups.values()) {
    const [rep, ...rest] = [...members].sort((a, b) => b.sourceQuality - a.sourceQuality || b.wordCount - a.wordCount || a.id.localeCompare(b.id));
    reps.push(rep);
    extractive.push(...rest);
  }

  // 2. Highest priority first.
  const score = new Map(reps.map((r) => [r.id, priority(r, now)]));
  reps.sort((a, b) => score.get(b.id)! - score.get(a.id)! || a.id.localeCompare(b.id));

  // 3. Guarantee stock for every level-2 topic, then fill the cap by priority.
  const chosen = new Set<string>();
  const perTopic = new Map<string, number>();
  for (const r of reps) {
    if (chosen.size >= cap) break;
    const needs = [...level2Of(r, levels)].filter((t) => (perTopic.get(t) ?? 0) < perLevel2);
    if (needs.length === 0) continue;
    chosen.add(r.id);
    for (const t of level2Of(r, levels)) perTopic.set(t, (perTopic.get(t) ?? 0) + 1);
  }
  for (const r of reps) {
    if (chosen.size >= cap) break;
    chosen.add(r.id);
  }

  const llm = reps.filter((r) => chosen.has(r.id));
  extractive.push(...reps.filter((r) => !chosen.has(r.id)));
  return { llm, extractive };
}
