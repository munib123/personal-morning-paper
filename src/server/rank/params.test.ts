import { describe, expect, it } from 'vitest';
import { SIGNAL_TYPES } from '@/contracts/signals';
import { DEFAULT_PARAMS, RANK_V1_FIXED } from './params';

describe('DEFAULT_PARAMS (rank-v1)', () => {
  it('DEFAULT_PARAMS pins spec values', () => {
    expect(DEFAULT_PARAMS).toMatchObject({
      version: 'rank-v1',
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
      emaEta: 0.1,
      emaEtaNeg: 0.15,
      decayHalfLifeDays: 14,
      engagedRamp: 10,
      tiers: { deep: 0.7, std: 0.4 },
      wpm: 230,
      minExpectedDwellMs: 8000,
      bounceMs: 3000,
      similarChipMinCos: 0.55,
    });
  });

  it('rewards has exactly one key per SignalType, with the §10.4 values', () => {
    expect(Object.keys(DEFAULT_PARAMS.rewards).sort()).toEqual([...SIGNAL_TYPES].sort());
    expect(DEFAULT_PARAMS.rewards).toEqual({
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
    });
  });

  it('RANK_V1_FIXED holds the rank-v1 constants RankParams has no field for', () => {
    expect(RANK_V1_FIXED).toEqual({
      bounceReward: -0.1,
      recallWrongReward: 0.1,
      skipZeroReasons: ['already_seen', 'not_today'],
      exploreMaxLevel: 2,
      exploreExcludeTop: 5,
      leadMinImportance: 0.5,
      seenEditions: 7,
      engagedDays: 14,
      engagedMax: 50,
      centerMinPool: 20,
    });
  });
});
