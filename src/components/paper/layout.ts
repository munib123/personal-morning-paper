// The front page, placed (design README "Layout: the web paper", ARCHITECTURE §10.4): lead, the
// second-rank story beside "Three things to know", sections in affinity order, "Beyond your usual",
// then "In brief" and one "Long read". Pure: every item lands exactly once.
import type { EditionItem } from '@/contracts/edition';
import { ancestorsOf, rootOf, type TopicSlug } from '@/contracts/taxonomy';

export interface FrontPageLayout {
  lead: EditionItem | null;
  second: EditionItem | null;
  /** Ranks 1–3, for the TakeawayBox (references, not extra placements). */
  topThree: EditionItem[];
  sections: { slug: TopicSlug; items: EditionItem[] }[];
  beyond: EditionItem[];
  briefs: EditionItem[];
  longRead: EditionItem | null;
}

const BEYOND = new Set<EditionItem['slot']>(['bigstory', 'explore', 'serendipity']);
const LONG_READ_MIN_MINUTES = 6;
const BRIEFS_MAX = 6;

export function layoutFrontPage(items: EditionItem[], sectionOrder: TopicSlug[], leadArticleId: string): FrontPageLayout {
  const ranked = [...items].sort((a, b) => a.rank - b.rank);
  const lead = ranked.find((i) => i.slot === 'lead') ?? ranked.find((i) => i.article.id === leadArticleId) ?? ranked[0] ?? null;
  const second = ranked.find((i) => i.slot === 'top' && i !== lead) ?? null;
  const rest = ranked.filter((i) => i !== lead && i !== second);

  const beyond = rest.filter((i) => BEYOND.has(i.slot));
  const regular = rest.filter((i) => !BEYOND.has(i.slot));
  // "In brief" is a short column: the lowest-ranked brief-tier stories. When most of a paper is
  // brief-tier (a reader with few strong interests yet), the others stay in their sections.
  const briefTier = regular.filter((i) => i.tier === 'brief');
  const briefs = briefTier.slice(Math.max(0, briefTier.length - BRIEFS_MAX));
  const full = regular.filter((i) => !briefs.includes(i));

  let longRead: EditionItem | null = null;
  for (const item of full) {
    const minutes = item.article.readingMinutes;
    if (minutes >= LONG_READ_MIN_MINUTES && (!longRead || minutes > longRead.article.readingMinutes)) longRead = item;
  }

  // Group key: the first sectionOrder entry that is the slug or one of its ancestors, else its root.
  const keyOf = (slug: TopicSlug): TopicSlug => sectionOrder.find((s) => s === slug || ancestorsOf(slug).includes(s)) ?? rootOf(slug);
  const groups = new Map<TopicSlug, EditionItem[]>();
  for (const item of full) {
    if (item === longRead) continue;
    const key = keyOf(item.sectionSlug);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  const order = [...new Set([...sectionOrder.filter((s) => groups.has(s)), ...groups.keys()])];

  return {
    lead,
    second,
    topThree: ranked.slice(0, 3),
    sections: order.map((slug) => ({ slug, items: groups.get(slug) ?? [] })),
    beyond,
    briefs,
    longRead,
  };
}
