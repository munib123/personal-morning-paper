'use client';

import { useState } from 'react';
import { StreakSheet } from '@/components/streak/StreakSheet';
import type { StreakView } from '@/contracts/streak';

/** Preview only: the streak sheet, open on load (a server page cannot pass onOpenChange). */
export function SheetPreview({ streak }: { streak: StreakView }) {
  const [open, setOpen] = useState(true);
  return <StreakSheet open={open} onOpenChange={setOpen} streak={streak} />;
}
