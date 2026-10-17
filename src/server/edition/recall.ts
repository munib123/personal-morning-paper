// Morning Recall selection (ARCHITECTURE §10.6). PURE.
import type { RecallQuestion } from '@/contracts/article';

const MAX_RECALL = 3;
const FILL_FROM_TOP = 5;

/**
 * Up to 3 questions about yesterday's paper: the stories the reader read (most recent first), then the
 * top 5 of that paper. Stories without a question are skipped. Day 1 (no previous paper) → [].
 * `reads` are yesterday's qualifying reads: open with dwell ≥ 20 s, or read_original.
 */
export function selectRecall(
  prev: { articleId: string; rank: number; recall: RecallQuestion | null }[],
  reads: { articleId: string; at: string }[],
): RecallQuestion[] {
  const byId = new Map(prev.map((p) => [p.articleId, p]));
  const out: RecallQuestion[] = [];
  const take = (id: string) => {
    const p = byId.get(id);
    if (!p?.recall || out.length >= MAX_RECALL || out.some((q) => q.articleId === id)) return;
    out.push(p.recall);
  };
  for (const r of [...reads].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))) take(r.articleId);
  for (const p of [...prev].sort((a, b) => a.rank - b.rank)) if (p.rank <= FILL_FROM_TOP) take(p.articleId);
  return out;
}
