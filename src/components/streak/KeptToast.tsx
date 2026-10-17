'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import type { StreakView } from '@/contracts/streak';
import { takeKeptNote } from './prefs';

/**
 * One quiet sonner line ("Streak kept: 8 days.") when a read on this page keeps today's streak: the
 * live channel moves today from not read to read. At most once per edition day; milestone days are
 * left to MilestoneToast, so a reader never gets two notes for one read.
 */
export function KeptToast({ streak }: { streak: StreakView | null }) {
  const prev = useRef<StreakView | null>(null);
  useEffect(() => {
    const before = prev.current;
    prev.current = streak;
    if (!streak) return;
    const line = takeKeptNote(before, streak);
    if (line) toast(line);
  }, [streak]);
  return null;
}

export default KeptToast;
