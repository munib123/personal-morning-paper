// src/server/learn (L3). §9.3 exports: priorsFromOnboarding, applySignal, thetaOf, loadUserModel,
// saveUserModel, getLearningView, processSignals. Pure parts live in theta/priors/signal/refold/copy.
/* eslint-disable @typescript-eslint/no-unused-vars -- getLearningView and processSignals stay L0 stubs until Task 12 */
import type { LearningView } from '@/contracts/learning';
import type { EventsResult, SignalEvent } from '@/contracts/signals';
import { FIXTURE_EVENTS_RESULT, FIXTURE_LEARNING } from '@/contracts/fixtures';

export { meanOf, thetaOf } from './theta';
export { coldStartPos, priorsFromOnboarding } from './priors';
export { addReward, applySignal, mergeDeltas, rewardOf, withNames } from './signal';
export { depthPrefFrom, refold, topicReadCounts, type LoggedEvent } from './refold';
export { toastFor } from './copy';
export { loadRecentEvents, loadUserModel, saveUserModel } from './store';

// Used by /api/me/learning and the PDF back page. Stub until Task 12.
export async function getLearningView(userId: string, sinceDays: number, now: Date): Promise<LearningView> {
  return FIXTURE_LEARNING;
}

// The ONE signal pipeline (/api/events, /r/[articleId], /api/me/interests). Stub until Task 12.
export async function processSignals(userId: string, events: SignalEvent[], now: Date): Promise<EventsResult> {
  return { ...FIXTURE_EVENTS_RESULT, accepted: events.length };
}
