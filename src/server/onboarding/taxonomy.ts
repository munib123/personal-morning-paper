// getTaxonomy (ARCHITECTURE §9.3): the `topics` table, else seed/taxonomy.json. The seed is the
// same tree the DB is loaded from (scripts/seed.ts), so both paths give the same 67 topics in the
// same editorial order (news first), and onboarding works with the database down or empty.
import taxonomyJson from '../../../seed/taxonomy.json';
import extrasJson from '../../../seed/topic-extras.json';
import type { TopicNode, TopicSlug } from '@/contracts/taxonomy';
import { createSupabaseAdminClient } from '@/server/db/admin';

export interface RawNode { slug: string; name: string; description: string; children: RawNode[] }
export interface TopicExtra { emoji: string | null; synonyms: string[] }

const DB_TIMEOUT_MS = 2500;

/** Depth-first, parents before children. Extras (emoji, synonyms) come from seed/topic-extras.json. */
export function flattenTaxonomy(json: { roots: RawNode[] }, extras: Record<string, TopicExtra> = {}): TopicNode[] {
  const out: TopicNode[] = [];
  const walk = (nodes: RawNode[], parentSlug: TopicSlug | null, level: 1 | 2 | 3) => {
    for (const n of nodes) {
      const extra = extras[n.slug];
      out.push({
        slug: n.slug,
        parentSlug,
        level,
        name: n.name,
        description: n.description,
        emoji: extra?.emoji ?? null,
        synonyms: extra ? [...extra.synonyms] : [],
      });
      if (level < 3 && n.children.length > 0) walk(n.children, n.slug, level === 1 ? 2 : 3);
    }
  };
  walk(json.roots, null, 1);
  return out;
}

let seedTree: TopicNode[] | null = null;
const seedTaxonomy = (): TopicNode[] => (seedTree ??= flattenTaxonomy(taxonomyJson, extrasJson));

let dbTree: TopicNode[] | null = null;

interface TopicRow { slug: string; parent_slug: string | null; level: number; name: string; description: string; emoji: string | null; synonyms: string[] | null }

function toNode(r: TopicRow): TopicNode | null {
  if (r.level !== 1 && r.level !== 2 && r.level !== 3) return null;
  return { slug: r.slug, parentSlug: r.parent_slug, level: r.level, name: r.name, description: r.description, emoji: r.emoji, synonyms: r.synonyms ?? [] };
}

// Seed order first (so the picker reads the same either way), topics the seed lacks after, by slug.
function inSeedOrder(nodes: TopicNode[]): TopicNode[] {
  const rank = new Map(seedTaxonomy().map((n, i) => [n.slug, i]));
  const at = (n: TopicNode) => rank.get(n.slug) ?? Number.MAX_SAFE_INTEGER;
  return [...nodes].sort((a, b) => at(a) - at(b) || a.slug.localeCompare(b.slug));
}

function withTimeout<T>(p: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`topics query timed out after ${ms} ms`)), ms);
    Promise.resolve(p).then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e: unknown) => { clearTimeout(timer); reject(e); },
    );
  });
}

async function loadFromDb(): Promise<TopicNode[] | null> {
  const db = createSupabaseAdminClient();
  const query = db.from('topics').select('slug, parent_slug, level, name, description, emoji, synonyms').order('slug');
  const { data, error } = await withTimeout(query, DB_TIMEOUT_MS);
  if (error || !data) return null;
  const nodes = (data as TopicRow[]).map(toNode).filter((n): n is TopicNode => n !== null);
  return nodes.length > 0 ? inSeedOrder(nodes) : null;
}

/** The topic tree for onboarding and /me. A database answer is cached per process; the seed is the fallback. */
export async function getTaxonomy(): Promise<TopicNode[]> {
  if (dbTree) return dbTree;
  try {
    const fromDb = await loadFromDb();
    if (fromDb) {
      dbTree = fromDb;
      return fromDb;
    }
  } catch {
    // Missing env, network or timeout: the seed tree below.
  }
  return seedTaxonomy();
}
