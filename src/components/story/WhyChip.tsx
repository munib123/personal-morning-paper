// STUB (L0) — owner: L4. Replace freely; keep the props.
import type { Reason, ScoreBreakdown } from '@/contracts/edition';
import { WhyTag } from '@/components/morrow';

export interface WhyChipProps {
  reasons: Reason[];
  breakdown?: ScoreBreakdown;
  onAction?: (a: 'more' | 'less' | 'hide_source') => void;
}

// The editor's pen on a story: the first reason as a Morrow WhyTag. L4 adds the score popover
// (breakdown) and the More / Less / Hide source actions (onAction).
export function WhyChip({ reasons }: WhyChipProps) {
  const top = reasons[0];
  if (!top) return null;
  return <WhyTag>{top.text}</WhyTag>;
}

export default WhyChip;
