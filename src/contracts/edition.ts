// ARCHITECTURE §9.1 (binding). Lanes import these, never redefine them.
import type { TopicSlug } from './taxonomy';
import type { Presentation } from './profile';
import type { ArticleCard, RecallQuestion, Tier } from './article';

export type Slot = 'lead' | 'top' | 'core' | 'bigstory' | 'explore' | 'serendipity' | 'reserve';
export type ReasonCode = 'topic' | 'similar' | 'bigstory' | 'explore' | 'serendipity' | 'fresh' | 'pinned';
export interface Reason { code: ReasonCode; text: string; weight: number; }   // text = chip copy
export interface ScoreBreakdown { topic: number; similarity: number; negative: number; importance: number; freshness: number; source: number; total: number; }
export interface EditionItem { rank: number; slot: Slot; sectionSlug: TopicSlug; tier: Tier; score: number; breakdown: ScoreBreakdown; reasons: Reason[]; article: ArticleCard; }
export interface EditionReceipt { buildMs: number; articlesConsidered: number; clustersConsidered: number; llmCallsThisEdition: number; aiShare: { gemini: number; extractive: number }; algoVersion: string; }
export interface Edition {
  id: string; userId: string; date: string; number: number;   // date = 'YYYY-MM-DD' reader-local
  paperName: string; editorNote: string; editorNoteSource: 'gemini' | 'template';
  sectionOrder: TopicSlug[]; leadArticleId: string;
  sectionNames: Record<TopicSlug, string>;   // display names for every sectionSlug and label used in this edition
  items: EditionItem[];        // ranks 1..20
  reserve: EditionItem[];      // ranks 21..28 (promoted client-side on skip)
  recall: RecallQuestion[];    // Morning Recall (0..3), about yesterday's reads
  presentation: Presentation; receipt: EditionReceipt;
  pdfUrl: string | null;       // signed URL or null
  createdAt: string;
}
export interface ArchiveEntry { date: string; number: number; leadHeadline: string; storiesRead: number; qualified: boolean; pdfUrl: string | null; }
