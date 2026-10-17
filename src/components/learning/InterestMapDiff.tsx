'use client';

import type { SimulationResult } from '@/contracts/learning';
import type { InterestWeight } from '@/contracts/profile';
import type { TopicSlug } from '@/contracts/taxonomy';
import { InterestBars } from './InterestBars';
import { barRows } from './learning-view';
import { diffSentence, editionDiff } from './sim-geometry';

export interface InterestMapDiffProps {
  weights: InterestWeight[];
  result: SimulationResult;
  /** Index into result.snapshots for the right-hand side (playback); defaults to the last one. */
  frame?: number;
}

const titleCase = (slug: TopicSlug) =>
  (slug.split('.').at(-1) ?? slug).replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/** Only the topics the simulator tracked, named from the reader's weights where possible. */
function trackedWeights(weights: InterestWeight[], slugs: TopicSlug[]): InterestWeight[] {
  const bySlug = new Map(weights.map((w) => [w.slug, w]));
  return slugs.map(
    (slug) =>
      bySlug.get(slug) ?? {
        slug,
        name: titleCase(slug),
        level: Math.min(3, slug.split('.').length) as 1 | 2 | 3,
        theta: 0,
        alpha: 1,
        beta: 1,
        picked: false,
        muted: false,
        pinned: false,
      },
  );
}

/** Day 1 next to day N (stacked under 640 px), plus one measured sentence on the top-5 topic mix. */
export function InterestMapDiff({ weights, result, frame }: InterestMapDiffProps) {
  const first = result.snapshots[0];
  const at = result.snapshots[Math.min(frame ?? result.snapshots.length - 1, result.snapshots.length - 1)];
  if (!first || !at) return null;
  const tracked = trackedWeights(weights, Object.keys(first.weights));
  const names = Object.fromEntries(tracked.map((w) => [w.slug, w.name]));
  const opts = { includeMuted: true };
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <InterestBars rows={barRows(tracked, [], first.weights, opts)} dayLabel={`Day ${first.day}`} />
        <InterestBars rows={barRows(tracked, [], at.weights, opts)} dayLabel={`Day ${at.day}`} />
      </div>
      <p className="deck m-0 max-w-(--measure) text-ink-soft">{diffSentence(editionDiff(result), names)}</p>
    </div>
  );
}

export default InterestMapDiff;
