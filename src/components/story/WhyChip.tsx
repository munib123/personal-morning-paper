'use client';
// The editor's pen on a story (§9.6): the strongest reason, shown inside a Morrow WhyTag. With a
// score breakdown it is a button that opens "Why this story?" (WhyPopover). StoryCard already wraps
// `why` in its WhyTag, so this renders the content only; callers outside a StoryCard (the story
// sheet) wrap it in <WhyTag> themselves.
import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { Reason, ScoreBreakdown } from '@/contracts/edition';
import { topReasons } from './format';
import { WhyPopover } from './WhyPopover';

export type WhyAction = 'more' | 'less' | 'hide_source';

export interface WhyChipProps {
  reasons: Reason[];
  breakdown?: ScoreBreakdown;
  onAction?: (a: WhyAction) => void;
}

export function WhyChip({ reasons, breakdown, onAction }: WhyChipProps) {
  const [open, setOpen] = useState(false);
  const top = topReasons(reasons, 1)[0];
  if (!top) return null;
  if (!breakdown) return <span>{top.text}</span>;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Why this story: ${top.text}`}
          className="ui-meta cursor-pointer text-left underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-pen"
        >
          {top.text}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 max-w-[calc(100vw-2rem)] rounded-card border border-rule bg-paper-raised p-4 text-ink shadow-floating ring-0 data-open:animate-none data-closed:animate-none"
      >
        <WhyPopover
          reasons={reasons}
          breakdown={breakdown}
          onAction={(a) => {
            onAction?.(a);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

export default WhyChip;
