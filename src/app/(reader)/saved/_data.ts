// Server-side data for /saved: Save sends a 'save' event (EditionReader → /api/events), so the
// reader's saved stories are those events, newest first, with today's article cards. Read-only.
import type { ArticleCard } from '@/contracts/article';
import { FIXTURE_EDITION } from '@/contracts/fixtures';
import { createSupabaseAdminClient } from '@/server/db/admin';
import { isDemoFallback } from '@/server/demo';
import { loadArticleCards } from '@/server/edition/read';
import { loadTaxonomy } from '@/server/edition/taxonomy';
import { isFixtureUser } from '@/server/profile';
import { latestSaves, type SaveRow } from './saved';

export interface SavedStory {
  article: ArticleCard;
  editionId: string | null;
  /** The paper it was saved from ('YYYY-MM-DD'), when that edition still exists. */
  editionDate: string | null;
  savedAt: string;
  /** Section name from the article's strongest label. */
  section: string;
}

const SAVED_LIMIT = 60;
const ROW_LIMIT = 500;

/** `?fixtures=1`: three stories from the fixture edition, so the page can be seen without data. */
export function fixtureSaved(): SavedStory[] {
  return FIXTURE_EDITION.items.slice(0, 3).map((item) => ({
    article: item.article,
    editionId: FIXTURE_EDITION.id,
    editionDate: FIXTURE_EDITION.date,
    savedAt: FIXTURE_EDITION.createdAt,
    section: FIXTURE_EDITION.sectionNames[item.sectionSlug] ?? '',
  }));
}

export async function listSavedStories(userId: string): Promise<SavedStory[]> {
  // The offline snapshot and the fixture reader have no event log to read.
  if (isDemoFallback() || isFixtureUser(userId)) return [];
  const db = createSupabaseAdminClient();
  const { data, error } = await db
    .from('events')
    .select('article_id, edition_id, occurred_at')
    .eq('user_id', userId)
    .eq('type', 'save')
    .not('article_id', 'is', null)
    .order('occurred_at', { ascending: false })
    .limit(ROW_LIMIT);
  if (error) throw new Error(`listSavedStories: ${error.message}`);
  const refs = latestSaves((data ?? []) as SaveRow[], SAVED_LIMIT);
  if (refs.length === 0) return [];

  const editionIds = [...new Set(refs.map((r) => r.editionId).filter((id): id is string => !!id))];
  const [cards, editions, taxonomy] = await Promise.all([
    loadArticleCards(refs.map((r) => r.articleId)),
    editionIds.length
      ? db.from('editions').select('id, edition_date').eq('user_id', userId).in('id', editionIds)
      : Promise.resolve({ data: [] as { id: string; edition_date: string }[], error: null }),
    loadTaxonomy().catch(() => []),
  ]);
  const dates = new Map((editions.data ?? []).map((e) => [e.id, e.edition_date]));
  const names = new Map(taxonomy.map((t) => [t.slug, t.name]));

  const out: SavedStory[] = [];
  for (const r of refs) {
    const article = cards.get(r.articleId);
    if (!article) continue; // the article was deleted since
    const top = [...article.labels].sort((a, b) => b.conf - a.conf)[0];
    out.push({
      article,
      editionId: r.editionId,
      editionDate: r.editionId ? (dates.get(r.editionId) ?? null) : null,
      savedAt: r.savedAt,
      section: top ? (names.get(top.slug) ?? '') : '',
    });
  }
  return out;
}
