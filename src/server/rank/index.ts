// src/server/rank (L3, PURE: no I/O, no clock). §9.3 exports: RANK_VERSION, DEFAULT_PARAMS, buildRanking.
/* eslint-disable @typescript-eslint/no-unused-vars -- buildRanking is still the L0 stub until Task 4 */
import type { Candidate, RankParams, RankingResult, UserModel } from '@/contracts/engine';
import type { TopicNode } from '@/contracts/taxonomy';

export { RANK_VERSION, DEFAULT_PARAMS, RANK_V1_FIXED } from './params';

// PURE (no I/O). Neutral empty ranking until Task 4 lands.
export function buildRanking(user: UserModel, pool: Candidate[], params: RankParams, seed: string, now: Date, taxonomy: TopicNode[]): RankingResult {
  return { items: [], reserve: [], sectionOrder: [], leadId: '' };
}
