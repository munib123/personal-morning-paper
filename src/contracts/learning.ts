// ARCHITECTURE §9.1 (binding). Lanes import these, never redefine them.
import type { TopicSlug } from './taxonomy';
import type { InterestWeight } from './profile';
import type { SignalType, WeightDelta } from './signals';

export interface LearningView { weights: InterestWeight[]; movers: WeightDelta[]; changeSummary: string; sinceDate: string;
  timeline: { at: string; type: SignalType; headline: string | null; effect: string }[]; }
export interface SimulationDay { day: number; precisionAt20: number; ndcgAt10: number; diversity: number; exploreHits: number; }
export interface SimulationResult { persona: string; learning: SimulationDay[]; onboardingOnly: SimulationDay[]; popularity: SimulationDay[]; snapshots: { day: number; weights: Record<TopicSlug, number> }[]; }
