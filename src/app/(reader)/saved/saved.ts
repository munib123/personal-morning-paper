// Saved stories (pure): the reader's 'save' events → one entry per story, newest save first.

export interface SaveRow {
  article_id: string | null;
  edition_id: string | null;
  occurred_at: string;
}

export interface SavedRef {
  articleId: string;
  editionId: string | null;
  savedAt: string;
}

const time = (iso: string): number => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? -Infinity : t;
};

export function latestSaves(rows: SaveRow[], limit: number): SavedRef[] {
  const sorted = [...rows].sort((a, b) => time(b.occurred_at) - time(a.occurred_at) || 0); // NaN (both unparseable) → tie
  const seen = new Set<string>();
  const out: SavedRef[] = [];
  for (const r of sorted) {
    if (!r.article_id || seen.has(r.article_id)) continue;
    seen.add(r.article_id);
    out.push({ articleId: r.article_id, editionId: r.edition_id, savedAt: r.occurred_at });
    if (out.length >= limit) break;
  }
  return out;
}
