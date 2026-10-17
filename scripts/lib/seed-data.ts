// Seed data for `npm run seed` (scripts/seed.ts). Owner: L0.
// - topics  <- seed/taxonomy.json + seed/topic-extras.json (ARCHITECTURE §8)
// - sources <- seed/feeds.json: verified tier=core feeds plus the verified arXiv API entry (§9.7)
// Everything except readSeedTopics() is pure.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { TopicNode } from '@/contracts/taxonomy';

/** One entry of seed/feeds.json (a byte copy of docs/research/feeds.json). */
export interface FeedEntry {
  url: string;
  name: string;
  kind: string; // 'rss' | 'api'
  taxonomy: string[]; // prior topic slugs
  region: string; // 'pakistan' | 'global'
  verified: boolean;
  httpStatus?: number;
  hasImages?: boolean;
  notes?: string; // contains 'tier=core' | 'tier=extra' | 'tier=skip'
}

export type SourceKind = 'rss' | 'hn' | 'devto' | 'arxiv';
export type SourceRegion = 'pk' | 'global';

/** A `topics` row as the seed upserts it. `embedding` is never sent: L2's embed-topics owns it. */
export interface TopicRow {
  slug: string;
  parent_slug: string | null;
  level: 1 | 2 | 3;
  name: string;
  description: string;
  emoji: string | null;
  synonyms: string[];
}

/** A `sources` row as the seed upserts it. quality, active and the health columns keep their DB defaults. */
export interface SourceRow {
  id: string;
  name: string;
  url: string;
  kind: SourceKind;
  homepage: string | null;
  region: SourceRegion;
  topics: string[];
}

/** seed/taxonomy.json */
export interface TaxonomyFileNode {
  slug: string;
  name: string;
  description: string;
  children?: TaxonomyFileNode[];
}
export interface TaxonomyFile {
  roots: TaxonomyFileNode[];
}

/** seed/topic-extras.json: { [slug]: { emoji, synonyms[2..4] } } for the level-1 and level-2 nodes. */
export type TopicExtras = Record<string, { emoji?: string | null; synonyms?: string[] }>;

export const SEED_DIR = 'seed';

// ── Topics ──────────────────────────────────────────────────────────────

/** Flattens the taxonomy tree (parents before their children) into TopicNodes. */
export function taxonomyNodes(taxonomy: TaxonomyFile, extras: TopicExtras = {}): TopicNode[] {
  const nodes: TopicNode[] = [];
  const walk = (n: TaxonomyFileNode, parentSlug: string | null, level: number) => {
    if (level > 3) throw new Error(`taxonomy: ${n.slug} is level ${level}; topics.level allows 1-3`);
    const extra = extras[n.slug];
    nodes.push({
      slug: n.slug,
      parentSlug,
      level: level as 1 | 2 | 3,
      name: n.name,
      description: n.description,
      emoji: extra?.emoji ?? null,
      synonyms: extra?.synonyms ?? [],
    });
    for (const child of n.children ?? []) walk(child, n.slug, level + 1);
  };
  for (const root of taxonomy.roots) walk(root, null, 1);
  return nodes;
}

/** Reads seed/taxonomy.json + seed/topic-extras.json (relative to the repo root, the npm script cwd). */
export function readSeedTopics(dir: string = SEED_DIR): TopicNode[] {
  const taxonomy = JSON.parse(readFileSync(join(dir, 'taxonomy.json'), 'utf8')) as TaxonomyFile;
  const extras = JSON.parse(readFileSync(join(dir, 'topic-extras.json'), 'utf8')) as TopicExtras;
  return taxonomyNodes(taxonomy, extras);
}

/**
 * `topics` rows in snake_case, parents before children (level order), so each level can be
 * upserted after its parents exist. With no argument it reads the seed files directly.
 */
export function topicRows(nodes: TopicNode[] = readSeedTopics()): TopicRow[] {
  const slugs = new Set<string>();
  for (const n of nodes) {
    if (slugs.has(n.slug)) throw new Error(`duplicate topic slug ${n.slug}`);
    slugs.add(n.slug);
  }
  for (const n of nodes) {
    if (n.parentSlug !== null && !slugs.has(n.parentSlug)) {
      throw new Error(`topic ${n.slug}: parent ${n.parentSlug} is missing`);
    }
  }
  return [...nodes]
    .sort((a, b) => a.level - b.level) // stable: keeps the file order within a level
    .map((n) => ({
      slug: n.slug,
      parent_slug: n.parentSlug,
      level: n.level,
      name: n.name,
      description: n.description,
      emoji: n.emoji,
      synonyms: [...n.synonyms],
    }));
}

// ── Sources ─────────────────────────────────────────────────────────────

export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // drop diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** The keyless APIs L1 has adapters for. They get fixed ids, kinds and display names (§9.7). */
const API_SOURCES: {
  id: string;
  kind: Exclude<SourceKind, 'rss'>;
  name: string;
  homepage: string;
  matches: (u: URL) => boolean;
}[] = [
  {
    id: 'hacker-news',
    kind: 'hn',
    name: 'Hacker News',
    homepage: 'https://news.ycombinator.com',
    matches: (u) => u.hostname === 'hacker-news.firebaseio.com',
  },
  {
    id: 'dev-to',
    kind: 'devto',
    name: 'DEV Community',
    homepage: 'https://dev.to',
    matches: (u) => u.hostname === 'dev.to' && u.pathname.startsWith('/api/'),
  },
  {
    id: 'arxiv',
    kind: 'arxiv',
    name: 'arXiv',
    homepage: 'https://arxiv.org',
    matches: (u) => u.hostname === 'export.arxiv.org' && u.pathname.startsWith('/api/'),
  },
];

function apiSourceFor(e: FeedEntry) {
  const url = new URL(e.url.trim());
  return API_SOURCES.find((a) => a.matches(url));
}

export function mapKind(e: FeedEntry): SourceKind {
  const api = apiSourceFor(e);
  if (api) return api.kind;
  if (e.kind === 'rss') return 'rss';
  throw new Error(`no ingest adapter for ${e.kind} entry "${e.name}" (${e.url})`);
}

export function mapRegion(r: string): SourceRegion {
  return r.trim().toLowerCase() === 'pakistan' ? 'pk' : 'global';
}

// L3 shows the homepage host on every card (ArticleCard.sourceDomain), so feeds served from a
// feed/CDN host point at the publisher's site instead of the plain URL origin.
// Keys are a hostname or hostname + path prefix (lowercase).
const PUBLISHER_HOMEPAGES: Record<string, string> = {
  'feeds.bbci.co.uk': 'https://www.bbc.com',
  'feeds.npr.org': 'https://www.npr.org',
  'feeds.arstechnica.com': 'https://arstechnica.com',
  'feeds.content.dowjones.io': 'https://www.marketwatch.com',
  'feed.infoq.com': 'https://www.infoq.com',
  'rss.dw.com': 'https://www.dw.com',
  'api.quantamagazine.org': 'https://www.quantamagazine.org',
  'hnrss.org': 'https://news.ycombinator.com',
  'feeds.feedburner.com/thehackersnews': 'https://thehackernews.com',
  'feeds.feedburner.com/ign': 'https://www.ign.com',
};

function homepageFor(url: URL): string {
  const key = `${url.hostname}${url.pathname}`.toLowerCase();
  for (const [prefix, home] of Object.entries(PUBLISHER_HOMEPAGES)) {
    if (key === prefix || key.startsWith(`${prefix}/`)) return home;
  }
  return url.origin;
}

const isCoreTier = (e: FeedEntry) => /tier=core\b/.test(e.notes ?? '');

/**
 * §9.7: the verified tier=core RSS feeds plus the three API rows `hacker-news`, `dev-to` (both
 * tier=core in feeds.json) and `arxiv` (tier=extra, added explicitly). RSS ids are slugify(name).
 */
export function selectSources(feeds: FeedEntry[]): SourceRow[] {
  const rows: SourceRow[] = [];
  for (const e of feeds) {
    if (!e.verified) continue;
    const api = apiSourceFor(e);
    if (!isCoreTier(e) && api?.kind !== 'arxiv') continue;
    const url = e.url.trim();
    rows.push({
      id: api?.id ?? slugify(e.name),
      name: api?.name ?? e.name.trim(),
      url,
      kind: mapKind(e),
      homepage: api?.homepage ?? homepageFor(new URL(url)),
      region: mapRegion(e.region),
      topics: [...(e.taxonomy ?? [])],
    });
  }

  // sources.id is the primary key and sources.url is unique: fail here with a readable message.
  const seen = new Map<string, string>();
  for (const r of rows) {
    for (const [what, value] of [
      ['id', r.id],
      ['url', r.url],
    ] as const) {
      const key = `${what}:${value}`;
      const other = seen.get(key);
      if (other !== undefined) throw new Error(`duplicate source ${what} "${value}" ("${other}" and "${r.name}")`);
      seen.set(key, r.name);
    }
  }
  return rows;
}
