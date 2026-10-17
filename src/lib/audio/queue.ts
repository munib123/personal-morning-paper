// The reading order of an edition for the browser's SpeechSynthesis (pure, no DOM, no clock).
// For each story on the page: the section kicker once when it changes, then the headline, then the
// summary of the tier the card shows. Skipped stories are not read. Chrome stalls on utterances
// longer than a few hundred characters, so splitForSynthesis breaks text at sentence boundaries.
import type { Tier } from '@/contracts/article';
import type { Edition, EditionItem } from '@/contracts/edition';
import type { Lang } from '@/contracts/profile';

export interface ReadingChunk {
  /** The article id (so the reader can mark it read). */
  id: string;
  /** The section's display name. */
  section: string;
  /** The headline shown in the bar while this chunk plays. */
  headline: string;
  /** Everything spoken for this story, in order. */
  text: string;
  words: number;
  /** True when this story's text starts with its section name (the kicker changed). */
  announceSection: boolean;
}

export interface ReadingQueueOptions {
  skippedIds?: Iterable<string>;
  /** Force one tier for every story; by default each story reads the tier its card shows. */
  tier?: Tier;
  sectionNames?: Edition['sectionNames'];
  /** 'ur' reads the Urdu headline and summary where a story has them (ArticleCard.ur). */
  lang?: Lang;
}

export const DEFAULT_WPM = 160;
export const MAX_UTTERANCE_CHARS = 200;

const TERMINAL = /[.!?؟۔।]["'”’)\]]*$/;
const SENTENCE_BREAK = /(?<=[.!?؟۔।]["'”’)\]]*)\s+/u;
const CLAUSE_BREAK = /(?<=[,;:،؛])\s+/u;

function humanize(slug: string): string {
  const last = slug.split('.').at(-1) ?? slug;
  const words = last.replace(/[-_]+/g, ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : slug;
}

/** The exact section name, else the nearest ancestor's (slugs are dotted paths), else a humanized slug. */
export function sectionNameOf(slug: string, names?: Edition['sectionNames']): string {
  if (names) {
    let s = slug;
    for (;;) {
      const n = (names as Partial<Record<string, string>>)[s];
      if (n) return n;
      const dot = s.lastIndexOf('.');
      if (dot < 0) break;
      s = s.slice(0, dot);
    }
  }
  return humanize(slug);
}

function sentence(text: string): string {
  const t = text.trim();
  if (!t) return '';
  return TERMINAL.test(t) ? t : `${t}.`;
}

function summaryOf(item: EditionItem, tier: Tier | undefined, lang: Lang): string {
  const a = item.article;
  if (lang === 'ur' && a.ur?.summaryStd) return a.ur.summaryStd;
  const s = a.summary;
  const t = tier ?? item.tier;
  return s[t] || s.std || s.brief || s.deep || '';
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function buildReadingQueue(items: EditionItem[], opts: ReadingQueueOptions = {}): ReadingChunk[] {
  const skipped = new Set(opts.skippedIds ?? []);
  const lang: Lang = opts.lang ?? 'en';
  const queue: ReadingChunk[] = [];
  let lastSection: string | null = null;
  for (const item of items) {
    const a = item.article;
    if (skipped.has(a.id)) continue;
    const section = sectionNameOf(item.sectionSlug, opts.sectionNames);
    const headline = (lang === 'ur' && a.ur?.headline) || a.headline || a.title;
    const announceSection = section !== lastSection;
    lastSection = section;
    const parts = [announceSection ? sentence(section) : '', sentence(headline), sentence(summaryOf(item, opts.tier, lang))].filter(Boolean);
    const text = parts.join(' ');
    queue.push({ id: a.id, section, headline, text, words: countWords(text), announceSection });
  }
  return queue;
}

/** Whole minutes, rounded up; 0 for nothing to read. */
export function estimateMinutes(queue: ReadingChunk[], wpm = DEFAULT_WPM): number {
  const words = queue.reduce((sum, c) => sum + c.words, 0);
  if (words <= 0) return 0;
  return Math.max(1, Math.ceil(words / Math.max(1, wpm)));
}

/** Pack units into pieces of at most maxChars, joining with single spaces; a unit that is too long goes through `split`. */
function pack(units: string[], maxChars: number, split: (unit: string) => string[]): string[] {
  const pieces: string[] = [];
  let current = '';
  const flush = () => {
    if (current) pieces.push(current);
    current = '';
  };
  for (const unit of units) {
    if (unit.length > maxChars) {
      flush();
      pieces.push(...split(unit));
      continue;
    }
    const joined = current ? `${current} ${unit}` : unit;
    if (joined.length <= maxChars) current = joined;
    else {
      flush();
      current = unit;
    }
  }
  flush();
  return pieces;
}

/** Hard split at the last space before the limit (a single word longer than the limit stays whole). */
function splitAtSpaces(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  return pack(words, maxChars, (w) => [w]);
}

/**
 * Pieces of at most maxChars for SpeechSynthesis: sentences first, then clauses (commas), then spaces.
 * Text is trimmed and inner runs of whitespace are kept as typed inside a piece.
 */
export function splitForSynthesis(text: string, maxChars = MAX_UTTERANCE_CHARS): string[] {
  const t = text.trim().replace(/\s*\n+\s*/g, ' ');
  if (!t) return [];
  if (t.length <= maxChars) return [t];
  const sentences = t.split(SENTENCE_BREAK).filter(Boolean);
  return pack(sentences, maxChars, (s) => pack(s.split(CLAUSE_BREAK).filter(Boolean), maxChars, (c) => splitAtSpaces(c, maxChars)));
}
