// Reading editions back: hydration into the Edition contract, getEdition and listArchive (§9.3).
import type { ArticleCard, RecallQuestion, Tier } from '@/contracts/article';
import type { ArchiveEntry, Edition, EditionItem, EditionReceipt, Reason, ScoreBreakdown, Slot } from '@/contracts/edition';
import type { Presentation } from '@/contracts/profile';
import { FIXTURE_ARCHIVE, FIXTURE_EDITION } from '@/contracts/fixtures';
import { getEditionPdfUrl } from '@/server/pdf';
import { isFixtureUser } from '@/server/profile';
import { activityByDate, archiveRows, fetchArticleRows, fetchClusterSources, readEditionRow, type EditionItemRow, type EditionRow } from './db';
import { sectionNamesFor, toArticleCard } from './hydrate';
import { loadTaxonomy } from './taxonomy';

/**
 * ArticleCards for the given ids (with "Also covered by"), keyed by id. Missing articles are absent.
 * With the cluster ids known up front (the ranker has them) both queries share one round trip.
 */
export async function loadArticleCards(ids: string[], clusterIds?: (string | null)[]): Promise<Map<string, ArticleCard>> {
  const known = clusterIds ? [...new Set(clusterIds.filter((c): c is string => !!c))] : null;
  const [rows, early] = await Promise.all([fetchArticleRows([...new Set(ids)]), known ? fetchClusterSources(known) : Promise.resolve(null)]);
  const siblings = early ?? (await fetchClusterSources([...new Set(rows.map((r) => r.cluster_id).filter((c): c is string => !!c))]));
  return new Map(rows.map((r) => [r.id, toArticleCard(r, r.cluster_id ? (siblings.get(r.cluster_id) ?? []) : [])]));
}

export function toEditionItems(rows: EditionItemRow[], cards: Map<string, ArticleCard>): EditionItem[] {
  const out: EditionItem[] = [];
  for (const r of [...rows].sort((a, b) => a.rank - b.rank)) {
    const article = cards.get(r.article_id);
    if (!article) continue; // an article deleted since the build
    out.push({
      rank: r.rank,
      slot: r.slot as Slot,
      sectionSlug: r.section_slug,
      tier: r.tier as Tier,
      score: r.score,
      breakdown: r.breakdown as ScoreBreakdown,
      reasons: (r.reasons ?? []) as Reason[],
      article,
    });
  }
  return out;
}

/** An Edition from its row, item rows and article cards. */
export async function assembleEdition(row: EditionRow, items: EditionItem[], pdfUrl: string | null): Promise<Edition> {
  const taxonomy = await loadTaxonomy();
  const main = items.filter((i) => i.rank <= 20);
  const reserve = items.filter((i) => i.rank > 20);
  return {
    id: row.id,
    userId: row.user_id,
    date: row.edition_date,
    number: row.number,
    paperName: row.paper_name,
    editorNote: row.editor_note,
    editorNoteSource: row.editor_note_source === 'gemini' ? 'gemini' : 'template',
    sectionOrder: row.section_order ?? [],
    leadArticleId: row.lead_article_id,
    sectionNames: sectionNamesFor(items, taxonomy),
    items: main,
    reserve,
    recall: ((row.recall ?? []) as RecallQuestion[]).slice(0, 3),
    presentation: row.presentation as Presentation,
    receipt: row.receipt as EditionReceipt,
    pdfUrl,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export async function getEdition(userId: string, date: string): Promise<Edition | null> {
  if (isFixtureUser(userId)) return date === FIXTURE_EDITION.date ? FIXTURE_EDITION : null;
  const row = await readEditionRow(userId, date);
  if (!row) return null;
  const itemRows = row.edition_items ?? [];
  const [cards, pdfUrl] = await Promise.all([loadArticleCards(itemRows.map((i) => i.article_id)), row.pdf_path ? getEditionPdfUrl(row.id) : Promise.resolve(null)]);
  return assembleEdition(row, toEditionItems(itemRows, cards), pdfUrl);
}

/** Past papers, newest first, with the lead headline and whether that day counted for the streak. */
export async function listArchive(userId: string, limit = 60): Promise<ArchiveEntry[]> {
  if (isFixtureUser(userId)) return FIXTURE_ARCHIVE.slice(0, limit);
  const rows = await archiveRows(userId, limit);
  const activity = await activityByDate(userId, rows.map((r) => r.edition_date));
  return Promise.all(
    rows.map(async (r): Promise<ArchiveEntry> => {
      const a = activity.get(r.edition_date);
      return {
        date: r.edition_date,
        number: r.number,
        leadHeadline: r.articles?.headline ?? r.articles?.title ?? '',
        storiesRead: a?.storiesRead ?? 0,
        qualified: (a?.qualifyingReads ?? 0) > 0,
        pdfUrl: r.pdf_path ? await getEditionPdfUrl(r.id) : null,
      };
    }),
  );
}
