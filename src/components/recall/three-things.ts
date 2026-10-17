// "Three things you learned" (ARCHITECTURE §10.6): the key facts of up to 3 stories read today, in
// the order the caller passes (most dwell first), and the quiet end-of-paper streak line.
import type { RecallQuestion } from '@/contracts/article';
import type { Edition } from '@/contracts/edition';
import type { StreakView } from '@/contracts/streak';

export interface LearnedThing {
  articleId: string;
  section: string;
  headline: string;
  fact: string;
  recall: RecallQuestion | null;
}

const MAX_THINGS = 3;

export function pickThreeThings(edition: Edition, readIds: string[]): LearnedThing[] {
  // Reserve stories count too: a skip promotes them into the paper, where they can be read.
  const byId = new Map([...edition.items, ...edition.reserve].map((item) => [item.article.id, item]));
  const things: LearnedThing[] = [];
  const seen = new Set<string>();
  for (const id of readIds) {
    const item = byId.get(id);
    if (!item || seen.has(id)) continue;
    seen.add(id);
    const a = item.article;
    things.push({
      articleId: a.id,
      section: edition.sectionNames[item.sectionSlug] ?? item.sectionSlug,
      headline: a.headline,
      fact: a.keyFact ?? a.whyItMatters ?? a.summary.brief,
      recall: a.recall,
    });
    if (things.length === MAX_THINGS) break;
  }
  return things;
}

/** The quiet streak line at the end of the paper. */
export function doneStreakLine(v: StreakView): string {
  switch (v.state) {
    case 'done_today':
      return `Day ${v.current} of your streak. See you tomorrow at 7.`;
    case 'frozen':
      return `Day ${v.current} of your streak. A freeze covered yesterday.`;
    case 'pending':
    case 'at_risk':
      return `Read one story to keep your ${v.current}-day streak.`;
    case 'repairable':
      return `Catch up on yesterday's paper to keep your ${v.current}-day streak.`;
    case 'broken':
      return `${v.totalDays === 1 ? '1 reading day' : `${v.totalDays} reading days`} so far.`;
    case 'new':
      return 'Read one story to start your streak.';
    default: {
      const never: never = v.state;
      return never;
    }
  }
}
