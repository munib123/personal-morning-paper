// Pure copy and number helpers for story cards (Morrow "Voice and copy"): no React, no clock.
// `now` always arrives as an ISO string from the page (requestNow()), never from new Date().
import type { Takeaway } from '@/components/morrow';
import { ROUTES } from '@/contracts/api';
import type { ArticleCard } from '@/contracts/article';
import type { Edition, EditionItem, Reason, ScoreBreakdown } from '@/contracts/edition';
import { ancestorsOf, type TopicSlug } from '@/contracts/taxonomy';

/** Morrow `StoryCardProps['variant']`. */
export type CardVariant = 'lead' | 'standard' | 'brief' | 'compact';

const has = (names: Edition['sectionNames'], slug: TopicSlug): boolean => Object.hasOwn(names, slug) && Boolean(names[slug]);

function humanize(segment: string): string {
  const words = segment.replace(/-/g, ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : segment;
}

/** The section's display name: the exact name, else the nearest ancestor's, else the humanized last slug segment. */
export function sectionLabel(slug: TopicSlug, names: Edition['sectionNames']): string {
  if (has(names, slug)) return names[slug];
  const ancestors = ancestorsOf(slug); // root first
  for (let i = ancestors.length - 1; i >= 0; i--) {
    if (has(names, ancestors[i])) return names[ancestors[i]];
  }
  return humanize(slug.split('.').at(-1) ?? slug);
}

/** 'just now', '45m ago', '3h ago', 'yesterday', '3 days ago'; '' when a timestamp is unusable. */
export function timeAgo(publishedAt: string, nowIso: string): string {
  const at = Date.parse(publishedAt);
  const now = Date.parse(nowIso);
  if (Number.isNaN(at) || Number.isNaN(now)) return '';
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  if (hours < 48) return 'yesterday';
  return `${Math.floor(hours / 24)} days ago`;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const LONG_DATE = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** 'YYYY-MM-DD' → 'Saturday, 17 October 2026' (dates are written in full on the paper). */
export function formatEditionDate(date: string): string {
  const m = DATE_RE.exec(date);
  if (!m) return date;
  const at = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(at.getTime())) return date;
  const parts = LONG_DATE.formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('weekday')}, ${part('day')} ${part('month')} ${part('year')}`;
}

export function readingTimeLabel(minutes: number): string {
  return `${Math.max(1, Math.round(Number.isFinite(minutes) ? minutes : 1))} min read`;
}

/** The summary tier a card shows: lead → deep, standard → the item's tier, brief → brief, compact → none. */
export function summaryFor(item: EditionItem, variant: CardVariant): string | undefined {
  const s = item.article.summary;
  switch (variant) {
    case 'lead':
      return s.deep || s.std || s.brief || undefined;
    case 'standard':
      return s[item.tier] || s.std || s.brief || undefined;
    case 'brief':
      return s.brief || s.std || undefined;
    default:
      return undefined;
  }
}

/** The strongest reasons first (stable for ties). */
export function topReasons(reasons: Reason[], n = 2): Reason[] {
  return [...reasons].sort((a, b) => b.weight - a.weight).slice(0, n);
}

export function alsoCoveredLabel(names: string[]): string | null {
  const n = names.length;
  if (n === 0) return null;
  return `Also covered by ${n} ${n === 1 ? 'outlet' : 'outlets'}`;
}

/** Every link to an original goes through /r, which logs read_original and 302s to the source. */
export function outboundHref(articleId: string, editionId: string | null): string {
  return ROUTES.outbound(articleId, 'web', editionId);
}

type BreakdownKey = Exclude<keyof ScoreBreakdown, 'total'>;
const BREAKDOWN_ROWS: { key: BreakdownKey; label: string; negative: boolean }[] = [
  { key: 'topic', label: 'Matches your interests', negative: false },
  { key: 'similarity', label: 'Like stories you read', negative: false },
  { key: 'importance', label: "How widely it's covered", negative: false },
  { key: 'freshness', label: 'How recent it is', negative: false },
  { key: 'source', label: 'Source quality', negative: false },
  { key: 'negative', label: 'Like stories you skipped', negative: true },
];

const finite = (x: number): number => (Number.isFinite(x) ? x : 0);

/** One row per score part, each with its share (0–100) of the summed weight; the negative row subtracts. */
export function breakdownRows(b: ScoreBreakdown): { key: keyof ScoreBreakdown; label: string; value: number; pct: number; negative: boolean }[] {
  const sizes = BREAKDOWN_ROWS.map((r) => Math.abs(finite(b[r.key])));
  const sum = sizes.reduce((acc, v) => acc + v, 0);
  return BREAKDOWN_ROWS.map((r, i) => ({
    key: r.key,
    label: r.label,
    value: finite(b[r.key]),
    pct: sum > 0 ? Math.round((sizes[i] / sum) * 100) : 0,
    negative: r.negative,
  }));
}

/** "% match": the rank-v1 total (positive weights sum to 1.00), clamped to 0–100. */
export function matchPct(b: ScoreBreakdown): number {
  return Math.round(Math.min(1, Math.max(0, finite(b.total))) * 100);
}

/** The source-faithfulness line under a story (ARCHITECTURE §10.3 guardrails). */
export function faithfulnessBadge(p: ArticleCard['aiProvider']): { label: string; tooltip: string; icon: 'check' | 'external' } {
  if (p === 'gemini') {
    return {
      label: 'AI summary · facts checked against source',
      tooltip:
        "Written by AI from this article alone. Every number in it appears in the source text, names are checked against the source, and a summary that fails a check is replaced by the publisher's own sentences.",
      icon: 'check',
    };
  }
  return {
    label: "Publisher's excerpt",
    tooltip: "The publisher's own opening sentences, unedited and cut on a sentence boundary. No AI rewrote this summary.",
    icon: 'external',
  };
}

/** The masthead ear's "Prepared for {first name}": the first word of the display name, or null. */
export function firstName(displayName: string | null): string | null {
  return displayName?.trim().split(/\s+/)[0] || null;
}

/** The one-line note after More / Less: "Got it. More Climate tech tomorrow." */
export function feedbackNote(kind: 'more' | 'less', topic: string): string {
  return `Got it. ${kind === 'more' ? 'More' : 'Less'} ${topic} tomorrow.`;
}

/** "Three things to know": the key fact of each top story (its headline when there is none), linking out through /r. */
export function takeawaysOf(items: EditionItem[], editionId: string | null, names: Edition['sectionNames']): Takeaway[] {
  return items.map((item) => ({
    text: item.article.keyFact || item.article.headline,
    kicker: sectionLabel(item.sectionSlug, names),
    href: outboundHref(item.article.id, editionId),
  }));
}
