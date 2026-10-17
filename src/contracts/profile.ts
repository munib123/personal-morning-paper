// ARCHITECTURE §9.1 (binding). Lanes import these, never redefine them.
import type { TopicSlug } from './taxonomy';

export type TimeBudget = 5 | 15 | 30;   // Morrow: Quick 5 / Standard 15 / Deep 30 (default 15)
export type Depth = 'new' | 'basics' | 'expert';
export type Lang = 'en' | 'ur';
export interface Presentation { timeBudget: TimeBudget; depth: Depth; lang: Lang; }
export interface Profile { userId: string; displayName: string | null; paperName: string; tz: string; city: string; presentation: Presentation; deliveryHour: number; isDemo: boolean; onboardedAt: string | null; }
export interface InterestPick { slug: TopicSlug; via: 'tile' | 'chip' | 'search' | 'describe'; }
export type TasteVerdict = 'more' | 'less' | 'skip';
export interface OnboardingInput {
  displayName: string | null; paperName: string | null;
  picks: InterestPick[]; blocked: TopicSlug[];
  taste: { articleId: string; verdict: TasteVerdict }[];
  presentation: Presentation; city: string; tz: string;
}
export interface TasteCard { articleId: string; headline: string; sourceName: string; topicSlug: TopicSlug; topicName: string; imageUrl: string | null; wildcard: boolean; }
export interface InterestWeight { slug: TopicSlug; name: string; level: 1 | 2 | 3; theta: number; alpha: number; beta: number; picked: boolean; muted: boolean; pinned: boolean; }
