// Landing "On today's front page" (pure): pick a handful of the morning's biggest stories, one per
// cluster and spread across sections, the way a front page does. No I/O, no clock: `now` is passed in.
import { FIXTURE_TAXONOMY } from '@/contracts/fixtures';
import { ancestorsOf, rootOf, type TopicSlug } from '@/contracts/taxonomy';

/** One article that could go on the landing front page. importance = outlets carrying the story. */
export interface FrontPageCandidate {
  id: string;
  headline: string;
  sourceName: string;
  sectionSlug: TopicSlug;
  url: string | null;
  publishedAt: string;
  clusterId: string | null;
  importance: number;
}

/** What the landing page renders for one story. */
export interface FrontPageStory {
  id: string;
  headline: string;
  sourceName: string;
  section: string;
  url: string | null;
  ago: string;
  outlets: number;
}

const byWeight = (a: FrontPageCandidate, b: FrontPageCandidate) =>
  b.importance - a.importance || b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id);

/** Biggest first (most outlets, then newest), one story per cluster, one per section root before any repeats.
 *  The order is the page order: the first story is the lead. */
export function pickFrontPage(candidates: FrontPageCandidate[], limit: number): FrontPageCandidate[] {
  const pool = candidates.filter((c) => c.headline.trim() && c.sourceName.trim()).sort(byWeight);
  const clusters = new Set<string>();
  const unique = pool.filter((c) => {
    const key = c.clusterId ?? `article:${c.id}`;
    if (clusters.has(key)) return false;
    clusters.add(key);
    return true;
  });
  const picked: FrontPageCandidate[] = [];
  const roots = new Set<string>();
  for (const c of unique) {
    if (picked.length >= limit) break;
    if (roots.has(rootOf(c.sectionSlug))) continue;
    roots.add(rootOf(c.sectionSlug));
    picked.push(c);
  }
  for (const c of unique) {
    if (picked.length >= limit) break;
    if (!picked.includes(c)) picked.push(c);
  }
  return picked;
}

const NAMES = new Map(FIXTURE_TAXONOMY.map((t) => [t.slug, t.name]));

/** The section a story sits in: its second-level topic ("Cricket"), or its root when that is all it has. */
export function sectionName(slug: TopicSlug): string {
  const section = slug.split('.').length > 2 ? ancestorsOf(slug)[1] : slug;
  return NAMES.get(section) ?? NAMES.get(rootOf(slug)) ?? 'News';
}

/** "Just now", "40 min ago", "5h ago", "2d ago"; empty for a bad or future date. */
export function agoLabel(iso: string, now: Date): string {
  const ms = now.getTime() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return '';
  const min = Math.floor(ms / 60_000);
  if (min < 5) return 'Just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const safeUrl = (u: string | null): string | null => (u && /^https?:\/\//i.test(u) ? u : null);

export function toStory(c: FrontPageCandidate, now: Date): FrontPageStory {
  return {
    id: c.id,
    headline: c.headline.trim(),
    sourceName: c.sourceName.trim(),
    section: sectionName(c.sectionSlug),
    url: safeUrl(c.url),
    ago: agoLabel(c.publishedAt, now),
    outlets: c.importance,
  };
}
