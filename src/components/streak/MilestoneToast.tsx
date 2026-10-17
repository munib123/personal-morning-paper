'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';
import type { StreakView } from '@/contracts/streak';
import { milestoneLine } from './copy';

// One calm line per milestone, once per reader (localStorage) and once per page (module guard, for
// when storage is blocked or two chips are mounted). No title, no icon, no full-screen moment.
const shownThisPage = new Set<number>();

export function MilestoneToast({ streak }: { streak: StreakView | null }) {
  const n = streak?.milestone ?? null;
  useEffect(() => {
    if (n === null || shownThisPage.has(n)) return;
    const line = milestoneLine(n);
    if (!line) return;
    shownThisPage.add(n);
    const key = `subah:milestone:${n}`;
    try {
      if (window.localStorage.getItem(key)) return;
      window.localStorage.setItem(key, '1');
    } catch {
      // Storage blocked: the module guard still keeps it to one note per page.
    }
    toast(line);
  }, [n]);
  return null;
}

export default MilestoneToast;
