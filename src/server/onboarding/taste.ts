// getTasteCards (ARCHITECTURE §9.2/§9.3): 8 real headlines for the reader's picks, 6 matched and 2
// wildcards from other areas, at [m0, m1, w0, m2, m3, w1, m4, m5]. In core they feed the first-front-
// page preview (the matched ones). Any database trouble falls back to the fixture cards, so the
// preview never breaks.
import { TasteQuerySchema, TopicSlugSchema } from '@/contracts/api';
import { FIXTURE_TASTE_CARDS } from '@/contracts/fixtures';
import type { TasteCard } from '@/contracts/profile';
import { rootOf, type TopicNode, type TopicSlug } from '@/contracts/taxonomy';
import { DEFAULT_PICKS } from '@/components/onboarding/lib/draft';
import { createSupabaseAdminClient } from '@/server/db/admin';
import { requestNow } from '@/server/time';
import { getTaxonomy } from './taxonomy';

export interface TasteCandidate {
  articleId: string;
  headline: string;
  sourceName: string;
  labels: { slug: TopicSlug; conf: number }[];
  imageUrl: string | null;
  clusterId: string | null;
  importance: number;
  publishedAt: string;
}

const TOTAL = 8;
const MATCHED = 6;
const WILD = 2;
const WILD_SLOTS = new Set([2, 5]);
const POOL_HOURS = 72;
const POOL_LIMIT = 300;
const POOL_TIMEOUT_MS = 3000;
const POOL_TTL_MS = 60_000;

const matches = (label: TopicSlug, pick: TopicSlug) => label === pick || label.startsWith(`${pick}.`) || pick.startsWith(`${label}.`);

/** `?picks=` → clean slugs (trimmed, lower-case, valid, de-duplicated, at most 20). Never throws. */
export function parsePicks(raw: string | null): TopicSlug[] {
  return TasteQuerySchema.parse({ picks: raw ?? undefined }).picks;
}

export function pickTasteCards(pool: TasteCandidate[], picks: TopicSlug[], tax: TopicNode[], fallback: TasteCard[]): TasteCard[] {
  const known = new Set(tax.map((n) => n.slug));
  const chosen = [...new Set(picks)].filter((p) => known.has(p));
  const wanted = chosen.length > 0 ? chosen : DEFAULT_PICKS.map((p) => p.slug);
  const wantedRoots = new Set(wanted.map(rootOf));
  const nameOf = (slug: TopicSlug) => tax.find((n) => n.slug === slug)?.name ?? slug;

  const sorted = pool
    .filter((c) => c.labels.length > 0)
    .sort((a, b) => b.importance - a.importance || Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  const usedIds = new Set<string>();
  const usedClusters = new Set<string>();
  const free = (c: TasteCandidate) => !usedIds.has(c.articleId) && !(c.clusterId && usedClusters.has(c.clusterId));
  const take = (c: TasteCandidate) => {
    usedIds.add(c.articleId);
    if (c.clusterId) usedClusters.add(c.clusterId);
    return c;
  };

  // Round-robin over the picks so every pick gets a story; first on the main label, then on any label.
  const matched: TasteCandidate[] = [];
  for (const anyLabel of [false, true]) {
    let added = true;
    while (added && matched.length < MATCHED) {
      added = false;
      for (const pick of wanted) {
        if (matched.length >= MATCHED) break;
        const c = sorted.find((x) => free(x) && (anyLabel ? x.labels.some((l) => matches(l.slug, pick)) : matches(x.labels[0].slug, pick)));
        if (c) {
          matched.push(take(c));
          added = true;
        }
      }
    }
  }

  // Wildcards: the best stories from two other areas.
  const wild: TasteCandidate[] = [];
  const wildRoots = new Set<TopicSlug>();
  for (const c of sorted) {
    if (wild.length >= WILD) break;
    const root = rootOf(c.labels[0].slug);
    if (wantedRoots.has(root) || wildRoots.has(root) || !free(c)) continue;
    wild.push(take(c));
    wildRoots.add(root);
  }

  const toCard = (c: TasteCandidate, wildcard: boolean): TasteCard => ({
    articleId: c.articleId,
    headline: c.headline,
    sourceName: c.sourceName,
    topicSlug: c.labels[0].slug,
    topicName: nameOf(c.labels[0].slug),
    imageUrl: c.imageUrl,
    wildcard,
  });
  const slots: (TasteCard | null)[] = [];
  for (let i = 0, m = 0, w = 0; i < TOTAL; i++) {
    if (WILD_SLOTS.has(i)) slots.push(w < wild.length ? toCard(wild[w++], true) : null);
    else slots.push(m < matched.length ? toCard(matched[m++], false) : null);
  }

  // Top up from the fallback cards: matched slots prefer cards in the reader's areas, wildcard
  // slots cards outside them. The slot decides the flag, so there are always exactly 2 wildcards.
  const spare = fallback.filter((c) => !usedIds.has(c.articleId)).map((card) => ({ card, outside: !wantedRoots.has(rootOf(card.topicSlug)) }));
  for (let i = 0; i < TOTAL && spare.length > 0; i++) {
    if (slots[i]) continue;
    const wildcard = WILD_SLOTS.has(i);
    const k = Math.max(0, spare.findIndex((s) => s.outside === wildcard));
    const [{ card }] = spare.splice(k, 1);
    slots[i] = { ...card, wildcard };
  }
  return slots.filter((c): c is TasteCard => c !== null);
}

interface ArticleRow {
  id: string;
  headline: string | null;
  title: string | null;
  labels: unknown;
  image_url: string | null;
  cluster_id: string | null;
  published_at: string;
  sources: { name: string } | null;
  clusters: { importance: number } | null;
}

function labelsOf(raw: unknown): { slug: TopicSlug; conf: number }[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (l): l is { slug: TopicSlug; conf: number } =>
      !!l && typeof l === 'object' && TopicSlugSchema.safeParse((l as { slug?: unknown }).slug).success && typeof (l as { conf?: unknown }).conf === 'number',
  );
}

function toCandidate(r: ArticleRow): TasteCandidate | null {
  const labels = labelsOf(r.labels);
  const headline = (r.headline ?? r.title ?? '').trim();
  if (labels.length === 0 || !headline) return null;
  return {
    articleId: r.id,
    headline,
    sourceName: r.sources?.name ?? '',
    labels,
    imageUrl: r.image_url,
    clusterId: r.cluster_id,
    importance: r.clusters?.importance ?? 0,
    publishedAt: r.published_at,
  };
}

function withTimeout<T>(p: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`article pool timed out after ${ms} ms`)), ms);
    Promise.resolve(p).then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e: unknown) => { clearTimeout(timer); reject(e); },
    );
  });
}

let poolCache: { at: number; pool: TasteCandidate[] } | null = null;

// Enriched (and extractive-fallback) articles from the last 72 h. The window is measured from
// min(demo clock, real clock), like the edition pool (§9.7), so "Next morning →" never empties it.
async function loadPool(): Promise<TasteCandidate[]> {
  const real = Date.now();
  if (poolCache && real - poolCache.at < POOL_TTL_MS) return poolCache.pool;
  try {
    const now = Math.min((await requestNow()).getTime(), real);
    const since = new Date(now - POOL_HOURS * 3_600_000).toISOString();
    const query = createSupabaseAdminClient()
      .from('articles')
      .select('id, headline, title, labels, image_url, cluster_id, published_at, sources(name), clusters(importance)')
      .in('status', ['enriched', 'fallback'])
      .gte('published_at', since)
      .order('published_at', { ascending: false })
      .limit(POOL_LIMIT);
    const { data, error } = await withTimeout(query, POOL_TIMEOUT_MS);
    if (error || !data) return [];
    const pool = (data as unknown as ArticleRow[]).map(toCandidate).filter((c): c is TasteCandidate => c !== null);
    if (pool.length > 0) poolCache = { at: real, pool };
    return pool;
  } catch {
    return [];
  }
}

export async function getTasteCards(picks: TopicSlug[]): Promise<TasteCard[]> {
  const [taxonomy, pool] = await Promise.all([getTaxonomy(), loadPool()]);
  return pickTasteCards(pool, picks, taxonomy, FIXTURE_TASTE_CARDS);
}
