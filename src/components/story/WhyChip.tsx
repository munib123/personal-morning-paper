'use client';
// The editor's pen on a story (§9.6): the strongest reason, shown inside a Morrow WhyTag. StoryCard
// already wraps `why` in its WhyTag, so this renders the content only; callers outside a StoryCard
// (the story sheet) wrap it in <WhyTag> themselves.
import type { Reason, ScoreBreakdown } from '@/contracts/edition';
import { topReasons } from './format';

export type WhyAction = 'more' | 'less' | 'hide_source';

export interface WhyChipProps {
  reasons: Reason[];
  breakdown?: ScoreBreakdown;
  onAction?: (a: WhyAction) => void;
}

export function WhyChip({ reasons }: WhyChipProps) {
  const top = topReasons(reasons, 1)[0];
  if (!top) return null;
  return <span>{top.text}</span>;
}

export default WhyChip;
