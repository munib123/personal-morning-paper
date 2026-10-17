'use client';
// Source-faithfulness line (PLAN §5a): "AI summary · facts checked against source" or "Publisher's
// excerpt", in muted ink (it is a fact about the summary, not personalization, so never pen). The
// line is a button that opens the guardrail explanation; a popover works on touch, a tooltip would not.
import { Icon } from '@/components/morrow';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { ArticleCard } from '@/contracts/article';
import { faithfulnessBadge } from './format';

export function FaithfulnessBadge({ provider }: { provider: ArticleCard['aiProvider'] }) {
  const badge = faithfulnessBadge(provider);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="ui-meta inline-flex min-h-6 items-center gap-1 self-start text-left text-ink-muted underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen"
        >
          <Icon name={badge.icon} size={14} />
          <span>{badge.label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 max-w-[calc(100vw-2rem)] rounded-card border border-rule bg-paper-raised p-3 text-ink shadow-floating ring-0 data-open:animate-none data-closed:animate-none"
      >
        <p className="ui-meta text-ink-soft">{badge.tooltip}</p>
      </PopoverContent>
    </Popover>
  );
}

export default FaithfulnessBadge;
