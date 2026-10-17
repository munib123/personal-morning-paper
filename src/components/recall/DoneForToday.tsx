// STUB (L0) — owner: L7. Replace freely; keep the props.
import type { Edition } from '@/contracts/edition';
import type { StreakView } from '@/contracts/streak';
import { TakeawayBox, type Takeaway } from '@/components/morrow';

export interface DoneForTodayProps {
  edition: Edition;
  readIds: string[];
  streak: StreakView | null;
}

const COUNT = ['', 'One thing', 'Two things', 'Three things'] as const;

// End of paper. "3 things you learned" = the keyFacts of read items (ARCHITECTURE §9.6). Stub: in
// readIds order (callers pass most-dwell first); L7 adds the dwell ordering and the streak strip.
export function DoneForToday({ edition, readIds, streak }: DoneForTodayProps) {
  const byId = new Map([...edition.items, ...edition.reserve].map((item) => [item.article.id, item]));
  const learned: Takeaway[] = [];
  for (const id of readIds) {
    const item = byId.get(id);
    if (!item?.article.keyFact) continue;
    learned.push({ text: item.article.keyFact, kicker: edition.sectionNames[item.sectionSlug] });
    if (learned.length === 3) break;
  }
  return (
    <section aria-label="End of paper" className="flex flex-col gap-6">
      <h2 className="headline-lg text-ink">{"That's your paper for today."}</h2>
      {learned.length > 0 ? (
        <TakeawayBox title={`${COUNT[learned.length]} you learned`} items={learned} />
      ) : (
        <p className="ui-text text-ink-soft">Open a story and what you learned from it is listed here.</p>
      )}
      {streak && streak.current > 0 ? <p className="dateline text-ink-muted">{streak.current}-day reading streak</p> : null}
    </section>
  );
}

export default DoneForToday;
