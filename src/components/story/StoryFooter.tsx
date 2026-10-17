'use client';
// Under every story: how the summary was made, who else covered it, "Read here" (the story sheet)
// and the Morrow FeedbackBar (More / Less / Save / Skip).
import { Button, FeedbackBar, type Feedback } from '@/components/morrow';
import type { EditionItem } from '@/contracts/edition';
import { FaithfulnessBadge } from './FaithfulnessBadge';
import { alsoCoveredLabel } from './format';

export interface StoryFooterProps {
  item: EditionItem;
  showBadge: boolean;
  feedback: Feedback;
  saved: boolean;
  onFeedback(f: Feedback): void;
  onSave(saved: boolean): void;
  onSkip?: () => void;
  onRead?: () => void;
}

export function StoryFooter({ item, showBadge, feedback, saved, onFeedback, onSave, onSkip, onRead }: StoryFooterProps) {
  const also = alsoCoveredLabel(item.article.alsoCoveredBy);
  return (
    <div className="flex flex-col items-start gap-2">
      {showBadge || also ? (
        <div className="flex flex-col items-start gap-1">
          {showBadge ? <FaithfulnessBadge provider={item.article.aiProvider} /> : null}
          {also ? <p className="ui-meta text-ink-muted">{also}</p> : null}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-1 gap-y-2">
        {onRead ? (
          <Button variant="ghost" size="sm" onClick={onRead}>
            Read here
          </Button>
        ) : null}
        <FeedbackBar value={feedback} saved={saved} onChange={onFeedback} onSave={onSave} onSkip={onSkip} />
      </div>
    </div>
  );
}

export default StoryFooter;
