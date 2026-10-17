// src/server/learn (L3). §9.3 exports: priorsFromOnboarding, applySignal, thetaOf, loadUserModel,
// saveUserModel, getLearningView, processSignals. Pure parts live in theta/priors/signal/refold/copy.
export { meanOf, thetaOf } from './theta';
export { coldStartPos, priorsFromOnboarding } from './priors';
export { addReward, applySignal, mergeDeltas, rewardOf, withNames } from './signal';
export { depthPrefFrom, refold, topicReadCounts, type LoggedEvent } from './refold';
export { toastFor } from './copy';
export { loadRecentEvents, loadUserModel, saveUserModel } from './store';
export { processSignals } from './signals';
export { changeSummary, editInterest, getLearningView, toInterestWeights, type InterestEdit } from './view';
