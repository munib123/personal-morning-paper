// The edition receipt as numbers a reader can follow (PLAN §5a): how many articles were considered,
// how many distinct stories they made, the shortlist ranked for this reader, and the 20 + 8 picked.
import type { Edition, EditionReceipt } from '@/contracts/edition';

/** rank-v1 `RankParams.shortlist`. EditionReceipt has no shortlist field, so a receipt value is used only if present. */
export const SHORTLIST_DEFAULT = 200;

export type FunnelKey = 'considered' | 'stories' | 'shortlist' | 'picked';

const nonNegative = (n: number): number => (Number.isFinite(n) && n > 0 ? Math.round(n) : 0);

export function editionFunnel(e: Edition): { key: FunnelKey; label: string; value: number }[] {
  const r = e.receipt as EditionReceipt & { shortlist?: number };
  const stories = nonNegative(r.clustersConsidered);
  const shortlist = Math.min(typeof r.shortlist === 'number' ? nonNegative(r.shortlist) : SHORTLIST_DEFAULT, stories);
  return [
    { key: 'considered', label: 'Articles considered overnight', value: nonNegative(r.articlesConsidered) },
    { key: 'stories', label: 'Distinct stories', value: stories },
    { key: 'shortlist', label: 'Shortlist ranked for you', value: shortlist },
    { key: 'picked', label: `${e.items.length} picked + ${e.reserve.length} reserve`, value: e.items.length },
  ];
}

export function aiShareOf(r: EditionReceipt): { aiPct: number; extractivePct: number; total: number } {
  const ai = nonNegative(r.aiShare.gemini);
  const extractive = nonNegative(r.aiShare.extractive);
  const total = ai + extractive;
  if (total === 0) return { aiPct: 0, extractivePct: 0, total: 0 };
  const aiPct = Math.round((ai / total) * 100);
  return { aiPct, extractivePct: 100 - aiPct, total };
}
