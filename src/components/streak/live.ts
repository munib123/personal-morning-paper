// Live streak channel (ARCHITECTURE §9.6, owner L7). useSignals (L4) publishes the streak from every
// /api/events response, and the L7 demo controls publish after moving the clock, so every mounted
// StreakChip / StreakPanel re-renders on the spot. A module-level store read with
// useSyncExternalStore: no provider needed.
import { useSyncExternalStore } from 'react';
import type { StreakView } from '@/contracts/streak';

let latest: StreakView | null = null;
const listeners = new Set<() => void>();

export function publishStreak(s: StreakView): void {
  latest = s;
  for (const notify of [...listeners]) notify();
}

/** The most recently published streak, or null before the first publish. */
export function getLiveStreak(): StreakView | null {
  return latest;
}

export function subscribeLiveStreak(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

// Nothing is published for a server render (module state there would be shared across requests).
const getServerSnapshot = (): StreakView | null => null;

/**
 * The most recently published streak, else `initial` (e.g. the server-rendered value), else null.
 * The store snapshot is the published value only; the `initial` fallback is applied outside it, so a
 * parent that passes a fresh object on every render cannot make the snapshot unstable.
 */
export function useLiveStreak(initial?: StreakView | null): StreakView | null {
  const live = useSyncExternalStore(subscribeLiveStreak, getLiveStreak, getServerSnapshot);
  return live ?? initial ?? null;
}
