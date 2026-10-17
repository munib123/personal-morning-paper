// Pure print layout: which story goes on which page, with how many words. No I/O, no clock.
import type { Edition, EditionItem, Slot } from '@/contracts/edition';
import { rootOf, type TopicSlug } from '@/contracts/taxonomy';
import {
  DEFAULT_BUDGETS,
  INNER_BRIEFS_MAX,
  INNER_PAGE_CAPACITY,
  MAX_INNER_PAGES,
  RAIL_MAX,
  SPARSE_PAGE_MAX,
  TEASER_COUNT,
  type InnerPage,
  type PrintLayout,
  type StoryRole,
  type WordBudgets,
} from './types';

const BEYOND_SLOTS = new Set<Slot>(['bigstory', 'explore', 'serendipity']);
const byRank = (a: EditionItem, b: EditionItem) => a.rank - b.rank;

/** Front page (lead + rail), one inner page per strong section (at most 3), then the last page. */
export function buildPrintLayout(edition: Edition, budgets: WordBudgets = DEFAULT_BUDGETS): PrintLayout {
  const items = [...edition.items].sort(byRank);
  const lead = items.find((i) => i.article.id === edition.leadArticleId) ?? items.find((i) => i.slot === 'lead') ?? items[0];
  if (!lead) throw new Error('[pdf] the edition has no stories');

  const rest = items.filter((i) => i !== lead);
  const rail = rest.filter((i) => i.slot === 'top').slice(0, RAIL_MAX);
  const beyond = rest.filter((i) => BEYOND_SLOTS.has(i.slot));
  const flowing = rest.filter((i) => !rail.includes(i) && !BEYOND_SLOTS.has(i.slot));

  const groups = new Map<TopicSlug, EditionItem[]>();
  for (const item of flowing) {
    const root = rootOf(item.sectionSlug);
    const group = groups.get(root);
    if (group) group.push(item);
    else groups.set(root, [item]);
  }
  // Roots in the reader's section order first; roots the order does not know follow in rank order.
  const order = [...new Set([...edition.sectionOrder.map(rootOf), ...flowing.map((i) => rootOf(i.sectionSlug))])];

  const inner: InnerPage[] = [];
  const briefs: EditionItem[] = [];
  for (const root of order) {
    const group = groups.get(root);
    if (!group) continue;
    if (inner.length < MAX_INNER_PAGES && group.length >= 2) {
      inner.push({ root, items: group.slice(0, INNER_PAGE_CAPACITY) });
      briefs.push(...group.slice(INNER_PAGE_CAPACITY));
    } else {
      briefs.push(...group);
    }
  }
  briefs.sort(byRank);
  // Pages with few stories carry a strip of briefs, so the paper fills its sheets and the last page stays light.
  for (const page of inner) {
    if (page.items.length <= SPARSE_PAGE_MAX && briefs.length > 0) page.briefs = briefs.splice(0, INNER_BRIEFS_MAX);
  }

  return { lead, rail, inner, beyond, briefs, budgets: { ...budgets } };
}

const innerBriefs = (page: InnerPage) => page.briefs ?? [];

export function pageCount(layout: PrintLayout): number {
  return 2 + layout.inner.length;
}

/** The page a story is printed on, or 0 when it is not in this paper. */
export function pageOf(layout: PrintLayout, articleId: string): number {
  const is = (i: EditionItem) => i.article.id === articleId;
  if (is(layout.lead) || layout.rail.some(is)) return 1;
  const k = layout.inner.findIndex((p) => p.items.some(is) || innerBriefs(p).some(is));
  if (k >= 0) return k + 2;
  if (layout.beyond.some(is) || layout.briefs.some(is)) return pageCount(layout);
  return 0;
}

/** Pointers for the front-page teaser row: section leads first, then other inner stories, then briefs (by page). */
export function teasers(layout: PrintLayout): { item: EditionItem; page: number }[] {
  const out: { item: EditionItem; page: number }[] = [];
  layout.inner.forEach((p, k) => out.push({ item: p.items[0], page: k + 2 }));
  layout.inner.forEach((p, k) => p.items.slice(1).forEach((item) => out.push({ item, page: k + 2 })));
  layout.inner.forEach((p, k) => innerBriefs(p).forEach((item) => out.push({ item, page: k + 2 })));
  const last = pageCount(layout);
  layout.briefs.forEach((item) => out.push({ item, page: last }));
  return out.slice(0, TEASER_COUNT);
}

/** The "Inside" index: one row per inner page, then the last page (Beyond your usual, else In brief). */
export function insideIndex(edition: Edition, layout: PrintLayout): { label: string; page: number }[] {
  return [
    ...layout.inner.map((p, k) => ({ label: sectionName(edition, p.root), page: k + 2 })),
    { label: layout.beyond.length > 0 ? 'Beyond your usual' : 'In brief', page: pageCount(layout) },
  ];
}

/** The summary tier a role prints (the reader's tier already shaped section stories), clamped to its budget. */
export function pickSummary(item: EditionItem, role: StoryRole, budgets: WordBudgets): string {
  const s = item.article.summary;
  const pick = (...tiers: string[]) => tiers.find((t) => t && t.trim()) ?? '';
  switch (role) {
    case 'lead':
      return clampWords(pick(s.deep, s.std, s.brief), budgets.lead);
    case 'rail':
      return clampWords(pick(s.brief, s.std), budgets.rail);
    case 'section-lead':
      return clampWords(item.tier === 'deep' ? pick(s.deep, s.std, s.brief) : pick(s.std, s.brief), budgets.sectionLead);
    case 'secondary':
      return clampWords(item.tier === 'brief' ? pick(s.brief, s.std) : pick(s.std, s.brief), budgets.secondary);
    case 'brief':
      return clampWords(pick(s.brief, s.std), budgets.brief);
  }
}

/** At most `max` words; when it cuts, trailing punctuation goes and an ellipsis marks the cut. */
export function clampWords(text: string, max: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= max) return text.trim();
  return words.slice(0, max).join(' ').replace(/[\s,;:.\-–—]+$/u, '') + '…';
}

/** Up to the first sentence end (. ! ?) that is followed by a space, or the whole text. */
export function firstSentence(text: string): string {
  const t = text.trim();
  const m = /^[\s\S]*?[.!?](?=\s|$)/.exec(t);
  return m ? m[0] : t;
}

/**
 * One step of the overflow guard. Pages are 1-indexed; null means nothing could move.
 * An inner page keeps at least its section lead, so a page never prints empty.
 */
export function shrinkLayout(layout: PrintLayout, overflowingPages: number[]): PrintLayout | null {
  const next: PrintLayout = {
    ...layout,
    rail: [...layout.rail],
    inner: layout.inner.map((p) => ({ ...p, items: [...p.items], briefs: [...innerBriefs(p)] })),
    beyond: [...layout.beyond],
    briefs: [...layout.briefs],
    budgets: { ...layout.budgets },
  };
  const last = pageCount(layout);
  let changed = false;
  for (const p of [...new Set(overflowingPages)].sort((a, b) => a - b)) {
    if (p === 1) {
      if (next.budgets.lead > 120) {
        next.budgets.lead = 120;
        changed = true;
      } else if (next.rail.length > 0) {
        next.briefs.unshift(next.rail.pop()!);
        changed = true;
      }
    } else if (p === last) {
      if (next.budgets.brief > 30) {
        next.budgets.brief = 30;
        changed = true;
      } else if (next.briefs.length > 0) {
        next.briefs.pop();
        changed = true;
      }
    } else if (p >= 2 && p < last) {
      const page = next.inner[p - 2];
      if (page?.briefs?.length) {
        next.briefs.unshift(page.briefs.pop()!);
        changed = true;
      } else if (page && page.items.length > 1) {
        next.briefs.unshift(page.items.pop()!);
        changed = true;
      }
    }
  }
  return changed ? next : null;
}

/** 'YYYY-MM-DD' → 'Saturday, 17 October 2026' (dates are written in full on the paper). */
export function formatPaperDate(date: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).formatToParts(new Date(`${date}T12:00:00Z`));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('weekday')}, ${part('day')} ${part('month')} ${part('year')}`;
}

/** The printed link of a story: through /r, so a click or a QR scan is a learning signal. */
export function storyHref(appUrl: string, articleId: string, editionId: string): string {
  return `${appUrl.replace(/\/+$/, '')}/r/${encodeURIComponent(articleId)}?src=print&e=${encodeURIComponent(editionId)}`;
}

export function shortLink(href: string): string {
  return href.replace(/^https?:\/\//, '');
}

/** Distinct outlets across every printed story (the footer's "from N sources"). */
export function countSources(layout: PrintLayout): number {
  const all = [layout.lead, ...layout.rail, ...layout.inner.flatMap((p) => [...p.items, ...innerBriefs(p)]), ...layout.beyond, ...layout.briefs];
  return new Set(all.map((i) => i.article.sourceName)).size;
}

/** Display name from the edition, else the sentence-cased last segment of the slug. */
export function sectionName(edition: Edition, slug: TopicSlug): string {
  const name = edition.sectionNames[slug];
  if (name) return name;
  const last = (slug.split('.').pop() ?? slug).replace(/[-_]+/g, ' ').trim();
  return last.charAt(0).toUpperCase() + last.slice(1);
}
