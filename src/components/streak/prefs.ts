// Reader preferences for the streak, kept per browser (localStorage, try/catch, in-memory twin):
// hiding the streak line, and the once-a-day at-risk note.
import { useSyncExternalStore } from 'react';
import type { StreakView } from '@/contracts/streak';
import { keptLine } from './copy';

const HIDE_KEY = 'subah:hide-streak';
const AT_RISK_KEY = 'subah:at-risk-noted';
const KEPT_KEY = 'subah:kept-noted';

const memory = new Map<string, string>();
const listeners = new Set<() => void>();

function read(key: string): string | null {
  try {
    const v = window.localStorage.getItem(key);
    if (v !== null) return v;
  } catch {
    // blocked storage
  }
  return memory.get(key) ?? null;
}

function write(key: string, value: string | null): void {
  if (value === null) memory.delete(key);
  else memory.set(key, value);
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // blocked or full: the in-memory copy holds for this page
  }
  for (const notify of [...listeners]) notify();
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
}

/** Whether the reader hid the streak line (false on the server and during hydration). */
export function useHideStreak(): [boolean, (hide: boolean) => void] {
  const hidden = useSyncExternalStore(
    subscribe,
    () => read(HIDE_KEY) === '1',
    () => false,
  );
  return [hidden, (hide: boolean) => write(HIDE_KEY, hide ? '1' : null)];
}

/** The edition day the streak was computed for (its last7 ends on today). */
const streakDay = (v: StreakView): string | null => v.last7.at(-1)?.date ?? null;

/** True when an at-risk streak has not been noted yet on this edition day. */
export function shouldNoteAtRisk(v: StreakView, lastNoted: string | null): boolean {
  if (v.state !== 'at_risk') return false;
  const day = streakDay(v);
  return day !== null && day !== lastNoted;
}

export function atRiskLine(v: StreakView): string {
  return `Your paper's still warm: 1 story keeps your ${v.current}-day streak.`;
}

/** Note an at-risk streak at most once per day; returns the line to show, or null. */
export function takeAtRiskNote(v: StreakView): string | null {
  if (!shouldNoteAtRisk(v, read(AT_RISK_KEY))) return null;
  write(AT_RISK_KEY, streakDay(v));
  return atRiskLine(v);
}

/**
 * True when a read on this page just kept today's streak (today went from not qualified to qualified),
 * not yet noted on this edition day, and not a milestone day (MilestoneToast speaks for those).
 */
export function shouldNoteKept(prev: StreakView | null, next: StreakView, lastNoted: string | null): boolean {
  if (!prev || prev.todayQualified || !next.todayQualified || next.milestone !== null) return false;
  const day = streakDay(next);
  return day !== null && day !== lastNoted;
}

/** Note a kept streak at most once per day; returns the line to show, or null. */
export function takeKeptNote(prev: StreakView | null, next: StreakView): string | null {
  if (!shouldNoteKept(prev, next, read(KEPT_KEY))) return null;
  write(KEPT_KEY, streakDay(next));
  return keptLine(next);
}
