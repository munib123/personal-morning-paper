// STUB (L0) — owner: L3. Replace freely; keep the signature.
/* eslint-disable @typescript-eslint/no-unused-vars -- stub: parameters are kept for the §9.3 signature */
import type { Candidate, InterestState, RankParams, UserModel } from '@/contracts/engine';
import type { LearningView } from '@/contracts/learning';
import type { OnboardingInput } from '@/contracts/profile';
import type { EventsResult, SignalEvent, WeightDelta } from '@/contracts/signals';
import type { TopicNode, TopicSlug } from '@/contracts/taxonomy';
import { FIXTURE_EVENTS_RESULT, FIXTURE_LEARNING, FIXTURE_PROFILE } from '@/contracts/fixtures';

export function priorsFromOnboarding(input: OnboardingInput, taxonomy: TopicNode[], params: RankParams): Record<TopicSlug, InterestState> {
  return {};
}

// pure
export function applySignal(model: UserModel, ev: SignalEvent, item: Candidate | null, params: RankParams): { model: UserModel; deltas: WeightDelta[] } {
  return { model, deltas: [] };
}

// blended mean
export function thetaOf(model: UserModel, slug: TopicSlug, params: RankParams): number {
  return 0.5;
}

// seenArticleIds relative to targetDate. Stub: an empty model (no DB).
export async function loadUserModel(userId: string, opts?: { targetDate?: string }): Promise<UserModel> {
  return {
    userId,
    interests: {},
    pos: null,
    neg: null,
    nEngaged: 0,
    depthPref: 0,
    presentation: { ...FIXTURE_PROFILE.presentation },
    seenArticleIds: [],
    dismissedClusterIds: [],
    mutedSourceIds: [],
    engaged: [],
  };
}

export async function saveUserModel(model: UserModel): Promise<void> {
  // stub: no-op (no DB)
}

// Used by /api/me/learning and the PDF back page.
export async function getLearningView(userId: string, sinceDays: number, now: Date): Promise<LearningView> {
  return FIXTURE_LEARNING;
}

// The ONE signal pipeline (/api/events, /r/[articleId], /api/me/interests). Stub: stores nothing.
export async function processSignals(userId: string, events: SignalEvent[], now: Date): Promise<EventsResult> {
  return { ...FIXTURE_EVENTS_RESULT, accepted: events.length };
}
