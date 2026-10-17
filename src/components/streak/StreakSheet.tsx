'use client';

import { useEffect, useId, useRef } from 'react';
import { Button } from '@/components/morrow';
import { ROUTES } from '@/contracts/api';
import type { HeatmapDay, StreakView } from '@/contracts/streak';
import { continueReading } from './continue';
import { StreakPanel } from './StreakPanel';

export interface StreakSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  streak: StreakView;
  heatmap?: HeatmapDay[] | null;
}

const SETTINGS_HREF = `${ROUTES.me}?tab=streak`;

// A native modal <dialog>: Esc and a backdrop click close it, focus is trapped while open and returns
// to the chip on close. A bottom sheet under 640 px, a centred panel (28rem) above, on paper with a
// rule border and the floating shadow over a dimmed page. It fades in over 150 ms (none with reduced
// motion); nothing slides.
const DIALOG =
  'fixed inset-x-0 bottom-0 top-auto m-0 max-h-[88dvh] w-full max-w-none overflow-y-auto overscroll-contain rounded-t-card border border-b-0 border-rule bg-paper p-0 text-ink shadow-floating backdrop:bg-ink/40 dark:backdrop:bg-paper-sunk/80 open:animate-in open:fade-in-0 open:duration-150 motion-reduce:open:animate-none sm:inset-0 sm:m-auto sm:h-fit sm:max-h-[min(88dvh,52rem)] sm:w-[calc(100%-2rem)] sm:max-w-md sm:rounded-card sm:border-b';

export function StreakSheet({ open, onOpenChange, streak, heatmap }: StreakSheetProps) {
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
      closeDialog(dialog);
    }
  }, [open]);

  // Close now (so the browser hands focus back to the chip first), then tell the parent.
  const close = () => {
    if (ref.current) closeDialog(ref.current);
    onOpenChange(false);
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={() => onOpenChange(false)}
      onCancel={() => onOpenChange(false)}
      onClick={(e) => {
        if (e.target === e.currentTarget) close(); // a click on the backdrop
      }}
      className={DIALOG}
    >
      <div className="flex flex-col gap-6 px-5 pt-4 pb-6 sm:px-6 sm:pt-5">
        <div className="flex items-center justify-between gap-4 border-b border-rule pb-3">
          <h2 id={titleId} className="dateline m-0 text-ink-muted">
            Your reading streak
          </h2>
          <Button variant="ghost" icon="x" aria-label="Close" onClick={close} />
        </div>
        <StreakPanel streak={streak} heatmap={heatmap} />
        {/* Pinned to the panel's bottom edge, so the way on stays in reach while the panel scrolls. */}
        <div className="sticky bottom-0 -mx-5 -mb-6 flex flex-col gap-2 border-t border-rule bg-paper px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:-mx-6 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:pb-4">
          <Button
            variant="primary"
            iconRight="arrow-right"
            onClick={() => {
              close();
              continueReading(document, (href) => window.location.assign(href));
            }}
          >
            Continue reading
          </Button>
          <Button variant="ghost" href={SETTINGS_HREF}>
            Streak &amp; settings
          </Button>
        </div>
      </div>
    </dialog>
  );
}

function closeDialog(dialog: HTMLDialogElement): void {
  if (typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
}

export default StreakSheet;
