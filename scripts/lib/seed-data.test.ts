import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { TopicNode } from '@/contracts/taxonomy';

import {
  mapKind,
  mapRegion,
  selectSources,
  slugify,
  taxonomyNodes,
  topicRows,
  type FeedEntry,
  type TaxonomyFile,
  type TopicRow,
} from './seed-data';

// Tests run from the repo root (vitest's cwd), like `npm run seed`.
const feeds = JSON.parse(readFileSync('seed/feeds.json', 'utf8')) as FeedEntry[];

// seed/taxonomy.json and seed/topic-extras.json are written by the contracts helper (plan Task 2).
const missingTopicFiles = ['seed/taxonomy.json', 'seed/topic-extras.json'].filter((f) => !existsSync(f));
const TOPIC_FILES_MISSING =
  missingTopicFiles.length > 0
    ? `skipped: ${missingTopicFiles.join(' and ')} not written yet (plan Task 2 creates them)`
    : undefined;

function countBy<T>(xs: T[], key: keyof T): Record<string, number> {
  return xs.reduce<Record<string, number>>((m, x) => {
    const k = String(x[key]);
    m[k] = (m[k] ?? 0) + 1;
    return m;
  }, {});
}

function feed(p: Partial<FeedEntry> & Pick<FeedEntry, 'name' | 'url'>): FeedEntry {
  return { kind: 'rss', taxonomy: ['news'], region: 'global', verified: true, notes: 'tier=core', ...p };
}

const HN_API = 'https://hacker-news.firebaseio.com/v0/topstories.json';
const DEV_API = 'https://dev.to/api/articles?top=1&per_page=30&tag=javascript';
const ARXIV_API =
  'https://export.arxiv.org/api/query?search_query=cat:cs.LG&sortBy=submittedDate&sortOrder=descending&max_results=50';

describe('slugify', () => {
  it('makes kebab-case ids from feed names', () => {
    expect(slugify('BBC News - Science & Environment')).toBe('bbc-news-science-environment');
    expect(slugify('Dawn Images (showbiz & lifestyle)')).toBe('dawn-images-showbiz-lifestyle');
    expect(slugify('DEV Community - #javascript')).toBe('dev-community-javascript');
    expect(slugify('Space.com')).toBe('space-com');
    expect(slugify('  Café Société  ')).toBe('cafe-societe');
  });
});

describe('mapRegion', () => {
  it("maps 'pakistan' to 'pk' and anything else to 'global'", () => {
    expect(mapRegion('pakistan')).toBe('pk');
    expect(mapRegion('global')).toBe('global');
    expect(mapRegion('india')).toBe('global');
    expect(mapRegion('')).toBe('global');
  });
});

describe('mapKind', () => {
  it('maps the three API endpoints by URL and everything else to rss', () => {
    expect(mapKind(feed({ name: 'HN', url: HN_API, kind: 'api' }))).toBe('hn');
    expect(mapKind(feed({ name: 'DEV', url: DEV_API, kind: 'api' }))).toBe('devto');
    expect(mapKind(feed({ name: 'arXiv', url: ARXIV_API, kind: 'api' }))).toBe('arxiv');
    expect(mapKind(feed({ name: 'Dawn', url: 'https://www.dawn.com/feeds/home' }))).toBe('rss');
    expect(mapKind(feed({ name: 'DEV RSS', url: 'https://dev.to/feed/tag/python' }))).toBe('rss');
  });

  it('refuses an API entry that has no ingest adapter', () => {
    expect(() => mapKind(feed({ name: 'Lobsters JSON', url: 'https://lobste.rs/hottest.json', kind: 'api' }))).toThrow(
      /no ingest adapter/,
    );
  });
});

describe('selectSources (rules)', () => {
  it('keeps verified core feeds plus the verified arXiv API entry', () => {
    const rows = selectSources([
      feed({ name: 'Core RSS', url: 'https://a.example/rss' }),
      feed({ name: 'Unverified', url: 'https://b.example/rss', verified: false }),
      feed({ name: 'Extra RSS', url: 'https://c.example/rss', notes: 'tier=extra' }),
      feed({ name: 'Skip RSS', url: 'https://d.example/rss', notes: 'tier=skip' }),
      feed({ name: 'Hacker News Firebase API', url: HN_API, kind: 'api' }),
      feed({ name: 'arXiv API', url: ARXIV_API, kind: 'api', notes: 'tier=extra' }),
      feed({ name: 'Unverified arXiv', url: `${ARXIV_API}&x=1`, kind: 'api', notes: 'tier=extra', verified: false }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(['core-rss', 'hacker-news', 'arxiv']);
  });

  it('builds rows with only the columns the seed owns', () => {
    const [row] = selectSources([
      feed({ name: 'Dawn - Pakistan', url: 'https://www.dawn.com/feeds/pakistan', region: 'pakistan', taxonomy: ['news.pakistan'] }),
    ]);
    // quality, active and the health columns keep their DB defaults, so a re-seed never resets them.
    expect(row).toEqual({
      id: 'dawn-pakistan',
      name: 'Dawn - Pakistan',
      url: 'https://www.dawn.com/feeds/pakistan',
      kind: 'rss',
      homepage: 'https://www.dawn.com',
      region: 'pk',
      topics: ['news.pakistan'],
    });
  });

  it('throws on a duplicate id or url instead of letting the upsert fail', () => {
    expect(() =>
      selectSources([feed({ name: 'Foo News', url: 'https://a.example/1' }), feed({ name: 'Foo  News!', url: 'https://a.example/2' })]),
    ).toThrow(/duplicate source id/);
    expect(() =>
      selectSources([feed({ name: 'Foo', url: 'https://a.example/1' }), feed({ name: 'Bar', url: 'https://a.example/1' })]),
    ).toThrow(/duplicate source url/);
  });
});

describe('selectSources (seed/feeds.json, §9.7)', () => {
  const src = selectSources(feeds);
  // The §9.7 rule restated as the expected set. feeds.json repeats some URLs in tier=skip
  // "(dup check)" entries, so look feeds up only among the eligible ones.
  const eligible = feeds.filter(
    (f) => f.verified && (/tier=core\b/.test(f.notes ?? '') || f.url.startsWith('https://export.arxiv.org/api/')),
  );
  const byUrl = new Map(eligible.map((f) => [f.url, f]));

  it('selects 117 sources: 114 core RSS + hacker-news + dev-to + arxiv', () => {
    expect(src).toHaveLength(117);
    expect(new Set(src.map((s) => s.id)).size).toBe(117);
    expect(new Set(src.map((s) => s.url)).size).toBe(117);
    expect(countBy(src, 'kind')).toEqual({ rss: 114, hn: 1, devto: 1, arxiv: 1 });
    expect(src.filter((s) => s.kind !== 'rss').map((s) => s.id).sort()).toEqual(['arxiv', 'dev-to', 'hacker-news']);
    expect(src.filter((s) => s.region === 'pk')).toHaveLength(29);
    expect(src.map((s) => s.url).sort()).toEqual([...byUrl.keys()].sort());
  });

  it('never picks the tier=skip duplicate of a core feed', () => {
    expect(feeds.some((f) => f.name.endsWith('(dup check)'))).toBe(true);
    expect(src.map((s) => s.id)).toContain('espncricinfo-global-news');
    expect(src.some((s) => s.id.endsWith('-dup-check'))).toBe(false);
  });

  it('uses slugify(name) for RSS ids and the feeds.json URLs for the API rows', () => {
    for (const s of src.filter((x) => x.kind === 'rss')) expect(s.id).toBe(slugify(byUrl.get(s.url)!.name));
    const api = Object.fromEntries(src.filter((s) => s.kind !== 'rss').map((s) => [s.id, s]));
    expect(api['hacker-news']).toMatchObject({ kind: 'hn', url: HN_API, name: 'Hacker News', homepage: 'https://news.ycombinator.com' });
    expect(api['dev-to']).toMatchObject({ kind: 'devto', url: DEV_API, name: 'DEV Community', homepage: 'https://dev.to' });
    expect(api['arxiv']).toMatchObject({ kind: 'arxiv', url: ARXIV_API, name: 'arXiv', homepage: 'https://arxiv.org' });
  });

  it('carries the feeds.json taxonomy as prior topics', () => {
    for (const s of src) {
      expect(s.topics.length).toBeGreaterThan(0);
      expect(s.topics).toEqual(byUrl.get(s.url)!.taxonomy);
    }
  });

  it('points homepages at the publisher site, never at a feed or API host', () => {
    const byId = new Map(src.map((s) => [s.id, s]));
    expect(byId.get('bbc-news-world')!.homepage).toBe('https://www.bbc.com');
    expect(byId.get('the-hacker-news-security')!.homepage).toBe('https://thehackernews.com');
    expect(byId.get('ign-all')!.homepage).toBe('https://www.ign.com');
    for (const s of src) {
      const home = new URL(s.homepage!);
      expect(home.href, s.id).toBe(`${home.origin}/`);
      expect(home.hostname, s.id).not.toMatch(/^(feeds?|rss|api|export)\.|feedburner|firebaseio|hnrss|dowjones/);
    }
  });
});

describe('taxonomyNodes + topicRows (pure)', () => {
  const tree: TaxonomyFile = {
    roots: [
      {
        slug: 'technical',
        name: 'Technical',
        description: 'Tech.',
        children: [
          {
            slug: 'technical.cs',
            name: 'Computer Science',
            description: 'CS.',
            children: [{ slug: 'technical.cs.web-dev', name: 'Web Development', description: 'Web.', children: [] }],
          },
        ],
      },
      { slug: 'arts', name: 'Arts', description: 'Arts.' },
    ],
  };
  const extras = {
    technical: { emoji: 'T', synonyms: ['tech', 'technology'] },
    'technical.cs': { emoji: 'C', synonyms: ['computing', 'software'] },
    arts: { emoji: 'A', synonyms: ['culture', 'art'] },
  };

  it('flattens the tree with parent slugs, levels and extras', () => {
    const nodes = taxonomyNodes(tree, extras);
    expect(nodes.map((n) => [n.slug, n.parentSlug, n.level])).toEqual([
      ['technical', null, 1],
      ['technical.cs', 'technical', 2],
      ['technical.cs.web-dev', 'technical.cs', 3],
      ['arts', null, 1],
    ]);
    expect(nodes[1]).toMatchObject({ name: 'Computer Science', description: 'CS.', emoji: 'C', synonyms: ['computing', 'software'] });
    expect(nodes[2]).toMatchObject({ emoji: null, synonyms: [] });
  });

  it('refuses a fourth level (topics.level is 1..3)', () => {
    const deep: TaxonomyFile = {
      roots: [{ slug: 'a', name: 'A', description: 'A', children: [{ slug: 'a.b', name: 'B', description: 'B', children: [
        { slug: 'a.b.c', name: 'C', description: 'C', children: [{ slug: 'a.b.c.d', name: 'D', description: 'D' }] },
      ] }] }],
    };
    expect(() => taxonomyNodes(deep, {})).toThrow(/level 4/);
  });

  it('orders rows parents first, in snake_case, without an embedding column', () => {
    const shuffled = [...taxonomyNodes(tree, extras)].reverse();
    const rows = topicRows(shuffled);
    expect(rows.map((r) => r.level)).toEqual([1, 1, 2, 3]);
    expect(rows.find((r) => r.slug === 'technical.cs.web-dev')).toEqual({
      slug: 'technical.cs.web-dev',
      parent_slug: 'technical.cs',
      level: 3,
      name: 'Web Development',
      description: 'Web.',
      emoji: null,
      synonyms: [],
    });
    for (const r of rows) expect(r).not.toHaveProperty('embedding');
  });

  it('throws on a missing parent or a duplicate slug', () => {
    const nodes = taxonomyNodes(tree, extras);
    expect(() => topicRows(nodes.filter((n) => n.slug !== 'technical.cs'))).toThrow(/parent technical\.cs/);
    expect(() => topicRows([...nodes, nodes[0]])).toThrow(/duplicate topic slug technical/);
  });
});

function expectSeedTopicShape(rows: TopicRow[]) {
  expect(rows).toHaveLength(67);
  expect(rows.filter((r) => r.level === 1)).toHaveLength(9);
  expect(rows.filter((r) => r.level === 2)).toHaveLength(44);
  expect(rows.filter((r) => r.level === 3)).toHaveLength(14);
  expect(rows.find((r) => r.slug === 'technical.cs.web-dev')!.parent_slug).toBe('technical.cs');
  rows
    .filter((r) => r.level < 3)
    .forEach((r) => {
      expect(r.emoji, r.slug).toBeTruthy();
      expect(r.synonyms.length, r.slug).toBeGreaterThanOrEqual(2);
      expect(r.synonyms.length, r.slug).toBeLessThanOrEqual(4);
    });
}

describe('topicRows() from seed/taxonomy.json + seed/topic-extras.json', () => {
  it('seeds 67 topics: 9 roots, 44 level-2, 14 level-3, with emoji and synonyms on levels 1-2', (ctx) => {
    if (TOPIC_FILES_MISSING) return ctx.skip(TOPIC_FILES_MISSING);
    expectSeedTopicShape(topicRows());
  });

  it('covers every prior topic slug the sources carry', (ctx) => {
    if (TOPIC_FILES_MISSING) return ctx.skip(TOPIC_FILES_MISSING);
    const slugs = new Set(topicRows().map((r) => r.slug));
    const unknown = selectSources(feeds).flatMap((s) => s.topics.filter((t) => !slugs.has(t)).map((t) => `${s.id}: ${t}`));
    expect(unknown).toEqual([]);
  });

  it('is the same tree as FIXTURE_TAXONOMY (topicRows(FIXTURE_TAXONOMY), plan Task 6)', async (ctx) => {
    if (TOPIC_FILES_MISSING) return ctx.skip(TOPIC_FILES_MISSING);
    const fixturesPath = resolve('src/contracts/fixtures.ts');
    if (!existsSync(fixturesPath)) return ctx.skip('skipped: src/contracts/fixtures.ts not written yet (plan Task 2)');
    // A runtime specifier keeps Vite from resolving the module before it exists.
    const { FIXTURE_TAXONOMY } = (await import(/* @vite-ignore */ pathToFileURL(fixturesPath).href)) as {
      FIXTURE_TAXONOMY: TopicNode[];
    };
    const fromFixture = topicRows(FIXTURE_TAXONOMY);
    expectSeedTopicShape(fromFixture);
    const key = (r: TopicRow) => [r.slug, r.parent_slug, r.level, r.name, r.description].join('|');
    expect(fromFixture.map(key).sort()).toEqual(topicRows().map(key).sort());
  });
});
