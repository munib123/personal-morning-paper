// src/server/onboarding (L5, ARCHITECTURE §9.3): the onboarding and landing queries.
import type { TasteCard } from '@/contracts/profile';
import type { TopicSlug } from '@/contracts/taxonomy';
import { FIXTURE_ARTICLES, FIXTURE_TASTE_CARDS } from '@/contracts/fixtures';

export { getTaxonomy } from './taxonomy';

// 6 matched + 2 wildcards; fixture fallback. Still the L0 stub until Task 6 lands.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- §9.3 signature
export async function getTasteCards(picks: TopicSlug[]): Promise<TasteCard[]> {
  return FIXTURE_TASTE_CARDS;
}

// L0 stub (stretch Task 13): the first `limit` fixture articles, sectionSlug = labels[0].slug.
export async function getLandingHeadlines(limit: number): Promise<{ headline: string; sourceName: string; sectionSlug: TopicSlug }[]> {
  return FIXTURE_ARTICLES.slice(0, Math.max(0, limit)).map((a) => ({
    headline: a.headline,
    sourceName: a.sourceName,
    sectionSlug: a.labels[0]?.slug ?? 'news',
  }));
}
