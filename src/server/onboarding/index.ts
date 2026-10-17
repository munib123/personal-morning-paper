// src/server/onboarding (L5, ARCHITECTURE §9.3): the onboarding and landing queries.
import type { TopicSlug } from '@/contracts/taxonomy';
import { FIXTURE_ARTICLES } from '@/contracts/fixtures';

export { getTaxonomy } from './taxonomy';
export { getTasteCards } from './taste';

// L0 stub (stretch Task 13): the first `limit` fixture articles, sectionSlug = labels[0].slug.
export async function getLandingHeadlines(limit: number): Promise<{ headline: string; sourceName: string; sectionSlug: TopicSlug }[]> {
  return FIXTURE_ARTICLES.slice(0, Math.max(0, limit)).map((a) => ({
    headline: a.headline,
    sourceName: a.sourceName,
    sectionSlug: a.labels[0]?.slug ?? 'news',
  }));
}
