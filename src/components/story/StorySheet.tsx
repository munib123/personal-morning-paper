// STUB (L0) — owner: L4. Replace freely; keep the props.
'use client';

import { useEffect, useId, useRef } from 'react';
import type { EditionItem } from '@/contracts/edition';
import { ROUTES } from '@/contracts/api';
import { Button, Icon } from '@/components/morrow';

export interface StorySheetProps {
  item: EditionItem | null;
  editionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Stub reader view: a plain floating panel (Escape, the backdrop or Close dismisses it; focus moves
// in and back out). No focus trap: L4 swaps in the Radix sheet and the open/dwell signals.
export function StorySheet({ item, editionId, open, onOpenChange }: StorySheetProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onOpenChangeRef = useRef(onOpenChange);
  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  });

  const visible = open && item !== null;
  useEffect(() => {
    if (!visible) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChangeRef.current(false);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus();
    };
  }, [visible]);

  if (!visible) return null;
  const a = item.article;
  const summary = a.summary[item.tier] || a.summary.std;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-paper/80 md:items-center md:p-6" onClick={() => onOpenChange(false)}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="flex max-h-[85vh] w-full max-w-(--measure) flex-col gap-4 overflow-y-auto rounded-t-card border border-rule bg-paper-raised p-6 shadow-floating outline-none md:rounded-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <p className="ui-meta pt-3 text-ink-muted">
            {a.sourceName} · {a.readingMinutes} min read
          </p>
          <Button variant="ghost" icon="x" aria-label="Close" onClick={() => onOpenChange(false)} />
        </div>
        <h2 id={titleId} className="headline-lg text-ink">
          {a.headline}
        </h2>
        {summary ? <p className="body-text text-ink-soft">{summary}</p> : null}
        {a.whyItMatters ? <p className="ui-text text-ink-soft">{a.whyItMatters}</p> : null}
        <div>
          {/* Button's markup (secondary, md, iconRight) as a plain <a>: ButtonProps has no target/rel. */}
          <a className="mw-btn ui-button mw-btn--secondary mw-btn--md" href={ROUTES.outbound(a.id, 'web', editionId)} target="_blank" rel="noopener noreferrer">
            <span>Read at {a.sourceName}</span>
            <Icon name="external" size={18} />
          </a>
        </div>
      </div>
    </div>
  );
}

export default StorySheet;
