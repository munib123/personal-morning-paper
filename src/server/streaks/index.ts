// STUB (L0) — owner: L7. Replace freely; keep the signature.
/* eslint-disable @typescript-eslint/no-unused-vars -- stub: parameters are kept for the §9.3 signature */
import type { SignalEvent } from '@/contracts/signals';
import type { HeatmapDay, StreakView } from '@/contracts/streak';
import { FIXTURE_HEATMAP, FIXTURE_STREAK } from '@/contracts/fixtures';

// called by /api/events. Stub: records nothing.
export async function recordActivity(userId: string, events: SignalEvent[], now: Date, tz: string): Promise<StreakView> {
  return FIXTURE_STREAK;
}

export async function getStreak(userId: string, now: Date, tz: string): Promise<StreakView> {
  return FIXTURE_STREAK;
}

export async function getHeatmap(userId: string, days: number, now: Date, tz: string): Promise<HeatmapDay[]> {
  return FIXTURE_HEATMAP;
}
