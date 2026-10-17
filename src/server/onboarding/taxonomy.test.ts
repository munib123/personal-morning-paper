import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import raw from '../../../seed/taxonomy.json';
import extras from '../../../seed/topic-extras.json';
import { FIXTURE_TAXONOMY } from '@/contracts/fixtures';
import { flattenTaxonomy } from './taxonomy';

const adminMock = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('@/server/db/admin', () => ({ createSupabaseAdminClient: adminMock.create }));

// The admin client's `from('topics').select(...).order('slug')` chain, answering `result`.
function topicsClient(result: Promise<{ data: unknown; error: unknown }>) {
  const order = vi.fn(() => result);
  const select = vi.fn(() => ({ order }));
  const from = vi.fn(() => ({ select }));
  return { client: { from }, from, select, order };
}

async function freshGetTaxonomy() {
  vi.resetModules();
  return (await import('./taxonomy')).getTaxonomy;
}

describe('flattenTaxonomy', () => {
  test('flattens the 67 seed topics, parents first', () => {
    const flat = flattenTaxonomy(raw);
    expect(flat).toHaveLength(67);
    expect(flat.filter((n) => n.level === 1)).toHaveLength(9);
    expect(new Set(flat.map((n) => n.slug))).toEqual(new Set(FIXTURE_TAXONOMY.map((n) => n.slug)));
    const ai = flat.find((n) => n.slug === 'technical.cs.ai-ml')!;
    expect(ai.parentSlug).toBe('technical.cs');
    expect(ai.level).toBe(3);
    expect(ai.synonyms).toEqual([]);
    expect(ai.emoji).toBeNull();
    const seen = new Set<string>();
    for (const n of flat) {
      if (n.parentSlug) expect(seen.has(n.parentSlug)).toBe(true);
      seen.add(n.slug);
    }
  });

  test('with the topic extras it matches the contract fixture exactly', () => {
    expect(flattenTaxonomy(raw, extras)).toEqual(FIXTURE_TAXONOMY);
  });
});

describe('getTaxonomy', () => {
  beforeEach(() => { adminMock.create.mockReset(); });
  afterEach(() => { vi.useRealTimers(); });

  test('falls back to the seed JSON when the admin client throws', async () => {
    adminMock.create.mockImplementation(() => { throw new Error('SUPABASE_SECRET_KEY missing'); });
    const getTaxonomy = await freshGetTaxonomy();
    const tax = await getTaxonomy();
    expect(tax).toHaveLength(67);
    expect(tax).toEqual(flattenTaxonomy(raw, extras));
  });

  test('falls back when the topics table is empty or errors', async () => {
    adminMock.create.mockReturnValue(topicsClient(Promise.resolve({ data: [], error: null })).client);
    expect(await (await freshGetTaxonomy())()).toHaveLength(67);
    adminMock.create.mockReturnValue(topicsClient(Promise.resolve({ data: null, error: { message: 'boom' } })).client);
    expect(await (await freshGetTaxonomy())()).toHaveLength(67);
  });

  test('falls back when the database does not answer in time', async () => {
    vi.useFakeTimers();
    adminMock.create.mockReturnValue(topicsClient(new Promise(() => {})).client);
    const pending = (await freshGetTaxonomy())();
    await vi.advanceTimersByTimeAsync(5000);
    expect(await pending).toHaveLength(67);
  });

  test('maps database rows and keeps the seed order', async () => {
    const rows = [
      { slug: 'arts', parent_slug: null, level: 1, name: 'Arts & Culture', description: 'd', emoji: null, synonyms: ['the arts'] },
      { slug: 'news', parent_slug: null, level: 1, name: 'World & Pakistan', description: 'd', emoji: null, synonyms: null },
      { slug: 'news.pakistan', parent_slug: 'news', level: 2, name: 'Pakistan', description: 'd', emoji: null, synonyms: [] },
      { slug: 'zz-new', parent_slug: null, level: 1, name: 'Brand new', description: 'd', emoji: null, synonyms: [] },
    ];
    const db = topicsClient(Promise.resolve({ data: rows, error: null }));
    adminMock.create.mockReturnValue(db.client);
    const tax = await (await freshGetTaxonomy())();
    expect(db.from).toHaveBeenCalledWith('topics');
    expect(db.order).toHaveBeenCalledWith('slug');
    expect(tax.map((n) => n.slug)).toEqual(['news', 'news.pakistan', 'arts', 'zz-new']);
    expect(tax[0]).toEqual({ slug: 'news', parentSlug: null, level: 1, name: 'World & Pakistan', description: 'd', emoji: null, synonyms: [] });
    expect(tax[2].synonyms).toEqual(['the arts']);
  });

  test('caches a database answer per process', async () => {
    const db = topicsClient(Promise.resolve({ data: [{ slug: 'news', parent_slug: null, level: 1, name: 'N', description: 'd', emoji: null, synonyms: [] }], error: null }));
    adminMock.create.mockReturnValue(db.client);
    const getTaxonomy = await freshGetTaxonomy();
    await getTaxonomy();
    await getTaxonomy();
    expect(db.from).toHaveBeenCalledTimes(1);
  });
});
