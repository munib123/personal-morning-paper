// STUB (L0) — owner: L7. Replace freely; keep the props.
'use client';

import type { StreakView } from '@/contracts/streak';
import { FIXTURE_STREAK } from '@/contracts/fixtures';
import { useLiveStreak } from './live';

export interface StreakChipProps {
  streak?: StreakView;
}

// Quiet, typographic streak line for the TopBar ("6-DAY STREAK": .dateline sets the caps).
// No flame, no emoji, no badge (design README "Learning"). L7 adds the /api/me/streak fetch
// for when `streak` is absent; until then the fixture stands in.
export function StreakChip({ streak }: StreakChipProps) {
  const s = useLiveStreak(streak ?? null) ?? FIXTURE_STREAK;
  return (
    <span className="dateline whitespace-nowrap text-ink-muted">
      {s.current > 0 ? `${s.current}-day streak` : 'No streak yet'}
    </span>
  );
}

export default StreakChip;
