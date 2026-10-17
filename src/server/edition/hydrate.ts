// Article rows → ArticleCard (§9.1), and the section names an edition needs. PURE.
import type { ArticleCard, RecallQuestion } from '@/contracts/article';
import type { EditionItem } from '@/contracts/edition';
import type { TopicNode, TopicSlug } from '@/contracts/taxonomy';
import { parseLabels } from './pool';

export const ARTICLE_COLUMNS =
  'id, url, source_id, title, headline, lede, summary_brief, summary_std, summary_deep, why_it_matters, key_fact, image_url, published_at, word_count, labels, cluster_id, enrich_provider, recall, ur, sources(name, homepage, url)';

export interface ArticleRow {
  id: string;
  url: string;
  source_id: string;
  title: string;
  headline: string | null;
  lede: string | null;
  summary_brief: string | null;
  summary_std: string | null;
  summary_deep: string | null;
  why_it_matters: string | null;
  key_fact: string | null;
  image_url: string | null;
  published_at: string;
  word_count: number | null;
  labels: unknown;
  cluster_id: string | null;
  enrich_provider: string | null;
  recall: unknown;
  ur: unknown;
  sources: { name: string; homepage: string | null; url: string } | null;
}

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);

function hostOf(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** The stored MCQ (camelCase; Gemini's answer_index accepted) as a RecallQuestion, or null if malformed. */
export function toRecall(articleId: string, raw: unknown): RecallQuestion | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { question?: unknown; options?: unknown; answerIndex?: unknown; answer_index?: unknown; explanation?: unknown };
  const question = text(r.question);
  const options = Array.isArray(r.options) && r.options.length === 3 && r.options.every((o) => typeof o === 'string') ? (r.options as [string, string, string]) : null;
  const idx = Number(r.answerIndex ?? r.answer_index);
  if (!question || !options || !(idx === 0 || idx === 1 || idx === 2)) return null;
  return { articleId, question, options: [...options] as [string, string, string], answerIndex: idx, explanation: typeof r.explanation === 'string' ? r.explanation : '' };
}

function toUr(raw: unknown): ArticleCard['ur'] {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { headline?: unknown; summary_std?: unknown; summaryStd?: unknown };
  const headline = text(r.headline);
  const summaryStd = text(r.summary_std) ?? text(r.summaryStd);
  return headline && summaryStd ? { headline, summaryStd } : null;
}

/** `siblings` = source names of the other articles in the same cluster. */
export function toArticleCard(row: ArticleRow, siblings: string[]): ArticleCard {
  const sourceName = row.sources?.name ?? row.source_id;
  const fallback = text(row.summary_std) ?? text(row.lede) ?? row.title;
  const also: string[] = [];
  for (const s of siblings) if (s !== sourceName && !also.includes(s) && also.length < 5) also.push(s);
  return {
    id: row.id,
    url: row.url,
    sourceId: row.source_id,
    sourceName,
    sourceDomain: hostOf(row.sources?.homepage) ?? hostOf(row.url) ?? row.source_id,
    title: row.title,
    headline: text(row.headline) ?? row.title,
    summary: { brief: text(row.summary_brief) ?? fallback, std: fallback, deep: text(row.summary_deep) ?? fallback },
    whyItMatters: text(row.why_it_matters),
    keyFact: text(row.key_fact),
    imageUrl: text(row.image_url),
    publishedAt: new Date(row.published_at).toISOString(),
    readingMinutes: Math.max(1, Math.round((row.word_count ?? 0) / 230)),
    labels: parseLabels(row.labels),
    clusterId: row.cluster_id,
    alsoCoveredBy: also,
    aiProvider: row.enrich_provider?.startsWith('gemini') ? 'gemini' : 'extractive',
    recall: toRecall(row.id, row.recall),
    ur: toUr(row.ur),
  };
}

/** Display names for every sectionSlug and every label slug used by the items (and reserve). */
export function sectionNamesFor(items: EditionItem[], taxonomy: TopicNode[]): Record<TopicSlug, string> {
  const names = new Map(taxonomy.map((t) => [t.slug, t.name]));
  const out: Record<TopicSlug, string> = {};
  const add = (slug: TopicSlug) => {
    if (!(slug in out)) out[slug] = names.get(slug) ?? slug;
  };
  for (const it of items) {
    add(it.sectionSlug);
    for (const l of it.article.labels) add(l.slug);
  }
  return out;
}
