'use client';
// The 5-second toast after a skip: Undo, plus an optional reason that teaches the paper more than a
// bare skip ("Not interested in {topic}" counts against the topic; the other two do not).
import { Button } from '@/components/morrow';
import type { EditionItem } from '@/contracts/edition';

export type SkipReason = 'not_interested' | 'already_seen' | 'not_today';

export interface SkipToastProps {
  item: EditionItem;
  sectionName: string;
  onUndo(): void;
  onReason(r: SkipReason): void;
}

export function SkipToast({ item, sectionName, onUndo, onReason }: SkipToastProps) {
  return (
    <div
      role="group"
      aria-label={`Skipped: ${item.article.headline}`}
      className="flex w-[min(92vw,356px)] flex-col gap-2 rounded-card border border-rule-strong bg-paper-raised p-3 text-ink shadow-floating"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="ui-text text-ink">Story skipped.</p>
        <Button variant="secondary" size="sm" onClick={onUndo}>
          Undo
        </Button>
      </div>
      <div className="flex flex-wrap gap-1">
        <Button variant="ghost" size="sm" onClick={() => onReason('not_interested')}>
          Not interested in {sectionName}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onReason('already_seen')}>
          Already seen
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onReason('not_today')}>
          Not today
        </Button>
      </div>
    </div>
  );
}

export default SkipToast;
