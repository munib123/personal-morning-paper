// STUB (L0) — owner: L5. Replace freely; keep the signature.
/* eslint-disable @typescript-eslint/no-unused-vars -- stub: parameters are kept for the §9.3 signature */
import type { TasteCard } from '@/contracts/profile';
import type { TopicNode, TopicSlug } from '@/contracts/taxonomy';
import { FIXTURE_ARTICLES, FIXTURE_TASTE_CARDS, FIXTURE_TAXONOMY } from '@/contracts/fixtures';

// topics table, fallback seed/taxonomy.json. Stub: the fixture tree (built from the same seed files).
export async function getTaxonomy(): Promise<TopicNode[]> {
  return FIXTURE_TAXONOMY;
}

// 6 matched + 2 wildcards; fixture fallback. Stub: always the fixture cards.
export async function getTasteCards(picks: TopicSlug[]): Promise<TasteCard[]> {
  return FIXTURE_TASTE_CARDS;
}

// Stub: the first `limit` fixture articles, sectionSlug = labels[0].slug.
export async function getLandingHeadlines(limit: number): Promise<{ headline: string; sourceName: string; sectionSlug: TopicSlug }[]> {
  return FIXTURE_ARTICLES.slice(0, Math.max(0, limit)).map((a) => ({
    headline: a.headline,
    sourceName: a.sourceName,
    sectionSlug: a.labels[0]?.slug ?? 'news',
  }));
}
