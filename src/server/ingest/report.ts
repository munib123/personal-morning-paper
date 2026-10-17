// run-cli --report: coverage numbers over the whole `articles` table (pure; store.ts pages the rows).

export interface ArticleStatRow {
  source_id: string;
  image_url: string | null;
  fetched_at: string;
}

export interface IngestReport {
  total: number;
  distinctSources: number;
  imageShare: number;
  last48h: number;
  apiSources: { 'hacker-news': number; 'dev-to': number; arxiv: number };
}

const HOUR_MS = 3_600_000;

export function summarizeArticles(rows: ArticleStatRow[], now: Date): IngestReport {
  const cutoff = now.getTime() - 48 * HOUR_MS;
  const apiSources = { 'hacker-news': 0, 'dev-to': 0, arxiv: 0 };
  const sources = new Set<string>();
  let withImage = 0;
  let last48h = 0;
  for (const r of rows) {
    sources.add(r.source_id);
    if (r.image_url) withImage += 1;
    if (Date.parse(r.fetched_at) >= cutoff) last48h += 1;
    if (r.source_id in apiSources) apiSources[r.source_id as keyof typeof apiSources] += 1;
  }
  return {
    total: rows.length,
    distinctSources: sources.size,
    imageShare: rows.length ? Number((withImage / rows.length).toFixed(3)) : 0,
    last48h,
    apiSources,
  };
}
