// STUB (L0) — owner: L3. Replace freely; keep the signature.
/* eslint-disable @typescript-eslint/no-unused-vars -- stub: parameters are kept for the §9.3 signature */
import type { Candidate, RankParams, RankingResult, UserModel } from '@/contracts/engine';
import type { SignalType } from '@/contracts/signals';
import type { TopicNode } from '@/contracts/taxonomy';

export const RANK_VERSION = 'rank-v1';

// §10.4 rewards table. dwell holds its max (+0.70 · min(1, ms/expected) in rank-v1); every other type is 0.
const REWARDS: Record<SignalType, number> = {
  impression: -0.05,
  open: 0.3,
  dwell: 0.7,
  read_original: 0.6,
  skip: -0.5,
  more: 1.5,
  less: -1.5,
  save: 1,
  share: 1,
  pdf_download: 0.05,
  qr_scan: 0.6,
  recall_answer: 0.4,
  audio_play: 0,
  taste_more: 1.5,
  taste_less: -1.5,
  taste_skip: 0,
  hide_source: 0,
  weight_edit: 0,
};

// Values from the §9.1 RankParams comments and §10.4.
export const DEFAULT_PARAMS: RankParams = {
  version: RANK_VERSION,
  weights: { topic: 0.4, similarity: 0.25, negative: 0.15, importance: 0.15, freshness: 0.15, source: 0.05, pinnedBonus: 0.1 },
  freshnessHalfLifeHours: 24,
  editionSize: 20, reserveSize: 8, shortlist: 200,
  mmrLambda: 0.7, maxPerRoot: 5, maxPerSource: 3,
  exploreSlots: 2, serendipitySlots: 1, bigStorySlots: 1,
  bigStoryMinImportance: 0.5, serendipityCos: [0.25, 0.45], serendipityMinImportance: 0.4,
  priors: { pickedL1: [2, 1], pickedL2: [3, 1], pickedL3: [4, 1], unpicked: [1, 3] },
  propagation: { parentToChild: 0.5, toParent: 0.3, toGrandparent: 0.1 },
  blend: [0.6, 0.3, 0.1],
  rewards: REWARDS,
  emaEta: 0.1, emaEtaNeg: 0.15, decayHalfLifeDays: 14, engagedRamp: 10,
  tiers: { deep: 0.7, std: 0.4 },
  wpm: 230, minExpectedDwellMs: 8000, bounceMs: 3000, similarChipMinCos: 0.55,
};

// PURE (no I/O). Neutral empty ranking until L3 lands.
export function buildRanking(user: UserModel, pool: Candidate[], params: RankParams, seed: string, now: Date, taxonomy: TopicNode[]): RankingResult {
  return { items: [], reserve: [], sectionOrder: [], leadId: '' };
}
