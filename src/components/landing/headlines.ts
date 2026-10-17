// Landing "On today's front page" (server): the morning's biggest real stories. Live from the articles
// table (last 30 hours, one bounded query, run when the static page regenerates), else the stories in
// the committed demo snapshot, else nothing. It never throws, so the landing page always renders.
// (getLandingHeadlines in src/server/onboarding is still the L0 fixture stub, so it is not used here.)
import { createSupabaseAdminClient } from '@/server/db/admin';
import { loadSnapshot } from '@/server/demo';
import { pickFrontPage, sectionOf, toStory, type FrontPageCandidate, type FrontPageStory } from './front-page';

export interface FrontPage {
  stories: FrontPageStory[];
  /** live: today's articles table; demo: the committed demo paper; none: both failed. */
  origin: 'live' | 'demo' | 'none';
}

const LIVE_HOURS = 30;
const LIVE_ROWS = 400;
const LIVE_TIMEOUT_MS = 6_000;
const MIN_STORIES = 4;

interface LiveRow {
  id: string;
  headline: string | null;
  title: string;
  url: string;
  labels: unknown;
  published_at: string;
  cluster_id: string | null;
  sources: { name: string } | null;
  clusters: { source_count: number | null } | null;
}

async function liveCandidates(now: Date): Promise<FrontPageCandidate[]> {
  const since = new Date(now.getTime() - LIVE_HOURS * 3_600_000).toISOString();
  const { data, error } = await createSupabaseAdminClient()
    .from('articles')
    .select('id, headline, title, url, labels, published_at, cluster_id, sources(name), clusters(source_count)')
    .in('status', ['enriched', 'fallback'])
    .gte('published_at', since)
    .order('published_at', { ascending: false })
    .limit(LIVE_ROWS);
  if (error) throw new Error(`landing front page: ${error.message}`);
  const out: FrontPageCandidate[] = [];
  for (const r of (data ?? []) as unknown as LiveRow[]) {
    if (!r.sources?.name) continue;
    out.push({
      id: r.id,
      headline: r.headline ?? r.title,
      sourceName: r.sources.name,
      sectionSlug: sectionOf(r.labels),
      url: r.url,
      publishedAt: r.published_at,
      clusterId: r.cluster_id,
      importance: Math.max(1, r.clusters?.source_count ?? 1),
    });
  }
  return out;
}

/** The newest edition in public/demo/snapshot.json: real stories, ingested on the demo day. */
function demoCandidates(): FrontPageCandidate[] {
  const editions = [...loadSnapshot().editions].sort((a, b) => a.date.localeCompare(b.date));
  const latest = editions.at(-1);
  if (!latest) return [];
  return [...latest.items, ...latest.reserve].map(({ article: a }) => ({
    id: a.id,
    headline: a.headline || a.title,
    sourceName: a.sourceName,
    sectionSlug: sectionOf(a.labels),
    url: a.url,
    publishedAt: a.publishedAt,
    clusterId: a.clusterId,
    importance: 1 + a.alsoCoveredBy.length,
  }));
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('landing front page: timed out')), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

export async function loadFrontPage(now: Date, limit = 6): Promise<FrontPage> {
  try {
    const picked = pickFrontPage(await withTimeout(liveCandidates(now), LIVE_TIMEOUT_MS), limit);
    if (picked.length >= MIN_STORIES) return { stories: picked.map((c) => toStory(c, now)), origin: 'live' };
  } catch {
    // No database at build time (CI) or a slow one: fall through to the demo paper.
  }
  try {
    const picked = pickFrontPage(demoCandidates(), limit);
    if (picked.length > 0) return { stories: picked.map((c) => toStory(c, now)), origin: 'demo' };
  } catch {
    // A missing or invalid snapshot: the page renders without the preview.
  }
  return { stories: [], origin: 'none' };
}
