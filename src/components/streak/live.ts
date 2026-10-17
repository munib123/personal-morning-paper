// STUB (L0) — owner: L7. Replace freely; keep the signature.
// Live streak channel (ARCHITECTURE §9.6): useSignals publishes the streak from every /api/events
// response, and every mounted StreakChip re-renders on the spot. A module-level store read with
// useSyncExternalStore, so no provider is needed.
import { useSyncExternalStore } from 'react';
import type { StreakView } from '@/contracts/streak';

let latest: StreakView | null = null;
const listeners = new Set<() => void>();

export function publishStreak(s: StreakView): void {
  latest = s;
  listeners.forEach((notify) => notify());
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
}

const getSnapshot = (): StreakView | null => latest;
// Nothing is published on the server (and module state there would be shared across requests).
const getServerSnapshot = (): StreakView | null => null;

/** The most recently published streak, else `initial` (e.g. the server-rendered value), else null. */
export function useLiveStreak(initial?: StreakView | null): StreakView | null {
  const live = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return live ?? initial ?? null;
}
