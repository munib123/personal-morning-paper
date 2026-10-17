'use client';

import { useEffect, useId, useRef } from 'react';
import { Button } from '@/components/morrow';
import type { StreakView } from '@/contracts/streak';
import { sheetHeadline } from './copy';
import { StreakPanel } from './StreakPanel';

export interface StreakSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  streak: StreakView;
}

// A native modal <dialog>: Esc closes it, focus is trapped while open and returns to the opener on
// close. A bottom panel under 640 px, a right-hand panel above. It fades in over 150 ms (none with
// reduced motion); nothing slides.
export function StreakSheet({ open, onOpenChange, streak }: StreakSheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      try {
        dialog.showModal();
      } catch {
        dialog.setAttribute('open', ''); // no modal support (old browsers, jsdom): show it inline
      }
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={() => onOpenChange(false)}
      onCancel={() => onOpenChange(false)}
      onClick={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false); // a click on the backdrop
      }}
      className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[85vh] w-full max-w-none overflow-y-auto rounded-card rounded-b-none border border-rule bg-paper-raised p-0 text-ink shadow-floating backdrop:bg-ink/30 open:animate-in open:fade-in-0 open:duration-150 motion-reduce:open:animate-none sm:inset-y-0 sm:left-auto sm:right-0 sm:h-full sm:max-h-none sm:w-[420px] sm:rounded-none sm:border-y-0 sm:border-r-0"
    >
      <div className="flex flex-col gap-5 px-5 pt-5 pb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <p className="dateline text-ink-muted">Your reading streak</p>
            <h2 id={titleId} className="headline-sm text-ink">
              {sheetHeadline(streak)}
            </h2>
          </div>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
        <StreakPanel streak={streak} />
      </div>
    </dialog>
  );
}

export default StreakSheet;
