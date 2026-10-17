// rank-v1 parameters (ARCHITECTURE §10.4). Every number the ranker and the learner use lives here:
// DEFAULT_PARAMS is stored on each edition (`editions.params`), so a paper can always be explained.
import type { RankParams } from '@/contracts/engine';
import type { SignalType } from '@/contracts/signals';

export const RANK_VERSION = 'rank-v1';

// §10.4 rewards table. `dwell` holds its max (+0.70 · min(1, ms/expected)); `recall_answer` the
// correct-answer reward (a wrong answer is RANK_V1_FIXED.recallWrongReward). Unknown types → 0.
const REWARDS: Record<SignalType, number> = {
  impression: -0.05,
  open: 0.3,
  dwell: 0.7,
  read_original: 0.6,
  qr_scan: 0.6,
  save: 1,
  share: 1,
  more: 1.5,
  less: -1.5,
  skip: -0.5,
  recall_answer: 0.4,
  pdf_download: 0.05,
  taste_more: 1.5,
  taste_less: -1.5,
  audio_play: 0,
  taste_skip: 0,
  hide_source: 0,
  weight_edit: 0,
};

export const DEFAULT_PARAMS = {
  version: RANK_VERSION,
  weights: { topic: 0.4, similarity: 0.25, negative: 0.15, importance: 0.15, freshness: 0.15, source: 0.05, pinnedBonus: 0.1 },
  freshnessHalfLifeHours: 24,
  editionSize: 20,
  reserveSize: 8,
  shortlist: 200,
  mmrLambda: 0.7,
  maxPerRoot: 5,
  maxPerSource: 3,
  exploreSlots: 2,
  serendipitySlots: 1,
  bigStorySlots: 1,
  bigStoryMinImportance: 0.5,
  serendipityCos: [0.25, 0.45],
  serendipityMinImportance: 0.4,
  priors: { pickedL1: [2, 1], pickedL2: [3, 1], pickedL3: [4, 1], unpicked: [1, 3] },
  propagation: { parentToChild: 0.5, toParent: 0.3, toGrandparent: 0.1 },
  blend: [0.6, 0.3, 0.1],
  rewards: REWARDS,
  emaEta: 0.1,
  emaEtaNeg: 0.15,
  decayHalfLifeDays: 14,
  engagedRamp: 10,
  tiers: { deep: 0.7, std: 0.4 },
  wpm: 230,
  minExpectedDwellMs: 8000,
  bounceMs: 3000,
  similarChipMinCos: 0.55,
} satisfies RankParams;

// rank-v1 constants that RankParams has no field for (versioned by RANK_VERSION).
export const RANK_V1_FIXED = {
  bounceReward: -0.1, // dwell shorter than bounceMs
  recallWrongReward: 0.1, // a wrong Morning Recall answer still means the reader engaged
  skipZeroReasons: ['already_seen', 'not_today'], // skips that say nothing about the topic
  exploreMaxLevel: 2,
  exploreExcludeTop: 5, // explore never samples the reader's top-5 nodes
  leadMinImportance: 0.5,
  seenEditions: 7, // items of the last 7 editions are never shown again
  engagedDays: 14, // the 'similar' chip looks back 14 days…
  engagedMax: 50, // …at up to 50 engaged articles
  centerMinPool: 20, // cosines are taken around the pool's mean vector once it has this many embedded stories (Ruling W3)
} as const;
