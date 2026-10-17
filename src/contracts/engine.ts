// ARCHITECTURE §9.1 (binding). Lanes import these, never redefine them.
// engine.ts  (shared by rank/learn/edition/simulate; pure data)
import type { TopicSlug } from './taxonomy';
import type { Presentation } from './profile';
import type { Tier } from './article';
import type { Reason, ScoreBreakdown, Slot } from './edition';
import type { SignalType } from './signals';

export interface Candidate { id: string; embedding: Float32Array | null; labels: { slug: TopicSlug; conf: number }[]; clusterId: string | null;
  importance: number; sourceCount: number; publishedAt: string; sourceId: string; sourceQuality: number; wordCount: number; hasImage: boolean; headline: string; }
export interface InterestState { alpha: number; beta: number; priorAlpha: number; priorBeta: number; picked: boolean; muted: boolean; pinned: boolean; }
export interface EngagedItem { articleId: string; embedding: Float32Array | null; headline: string; at: string; }   // last 14 d, max 50 (for the 'similar' chip)
export interface UserModel { userId: string; interests: Record<TopicSlug, InterestState>; pos: Float32Array | null; neg: Float32Array | null; nEngaged: number; depthPref: -1 | 0 | 1;
  presentation: Presentation; seenArticleIds: string[]; dismissedClusterIds: string[]; mutedSourceIds: string[]; engaged: EngagedItem[]; }
// seenArticleIds = items of editions with edition_date < target date (last 7); dismissed/muted are derived from skip and hide_source events in loadUserModel
export interface RankedItem { candidateId: string; rank: number; slot: Slot; sectionSlug: TopicSlug; tier: Tier; score: number; breakdown: ScoreBreakdown; reasons: Reason[]; }
export interface RankingResult { items: RankedItem[]; reserve: RankedItem[]; sectionOrder: TopicSlug[]; leadId: string; }
export interface RankParams {
  version: string;                                                   // 'rank-v1'
  weights: { topic: number; similarity: number; negative: number; importance: number; freshness: number; source: number; pinnedBonus: number }; // .40 .25 .15 .15 .15 .05 .10
  freshnessHalfLifeHours: number;                                    // 24 (fresh = exp(-ageHours/24))
  editionSize: number; reserveSize: number; shortlist: number;      // 20, 8, 200
  mmrLambda: number; maxPerRoot: number; maxPerSource: number;      // 0.7, 5, 3
  exploreSlots: number; serendipitySlots: number; bigStorySlots: number;           // 2, 1, 1
  bigStoryMinImportance: number; serendipityCos: [number, number]; serendipityMinImportance: number; // 0.5, [0.25, 0.45], 0.4
  priors: { pickedL1: [number, number]; pickedL2: [number, number]; pickedL3: [number, number]; unpicked: [number, number] }; // (2,1) (3,1) (4,1) (1,3)
  propagation: { parentToChild: number; toParent: number; toGrandparent: number };   // 0.5, 0.3, 0.1
  blend: [number, number, number];                                   // 0.6, 0.3, 0.1
  rewards: Record<SignalType, number>;                               // §10.4 table (dwell = its max, 0.70); unknown types → 0
  emaEta: number; emaEtaNeg: number; decayHalfLifeDays: number; engagedRamp: number; // 0.10, 0.15, 14, 10
  tiers: { deep: number; std: number };                              // 0.70, 0.40
  wpm: number; minExpectedDwellMs: number; bounceMs: number; similarChipMinCos: number; // 230, 8000, 3000, 0.55
}
