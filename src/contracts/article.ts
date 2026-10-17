// ARCHITECTURE §9.1 (binding). Lanes import these, never redefine them.
import type { TopicSlug } from './taxonomy';

export type Tier = 'brief' | 'std' | 'deep';
export interface RecallQuestion { articleId: string; question: string; options: [string, string, string]; answerIndex: 0 | 1 | 2; explanation: string; }
export interface ArticleCard {
  id: string; url: string; sourceId: string; sourceName: string; sourceDomain: string;
  title: string; headline: string;                       // headline falls back to title
  summary: Record<Tier, string>;                         // falls back to extractive text
  whyItMatters: string | null; keyFact: string | null;
  imageUrl: string | null; publishedAt: string; readingMinutes: number;
  labels: { slug: TopicSlug; conf: number }[];
  clusterId: string | null; alsoCoveredBy: string[];    // other source names in the cluster
  aiProvider: 'gemini' | 'extractive';
  recall: RecallQuestion | null;                          // the article's MCQ ("Quiz me now", Morning Recall)
  ur: { headline: string; summaryStd: string } | null;   // wave 2
}
