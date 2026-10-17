'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';
import type { StreakView } from '@/contracts/streak';
import { takeAtRiskNote } from './prefs';

/** A gentle one-line sonner note when the streak is at risk, at most once per edition day. */
export function AtRiskNote({ streak }: { streak: StreakView | null }) {
  useEffect(() => {
    if (!streak) return;
    const line = takeAtRiskNote(streak);
    if (line) toast(line);
  }, [streak]);
  return null;
}

export default AtRiskNote;
