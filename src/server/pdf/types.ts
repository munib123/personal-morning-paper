// L6 print types. Contracts (Edition, WeightDelta, …) come from @/contracts and are never redefined here.
import type { Edition, EditionItem } from '@/contracts/edition';
import type { WeightDelta } from '@/contracts/signals';
import type { TopicSlug } from '@/contracts/taxonomy';

/** What the paper needs beyond the edition itself. No streak: the PDF carries no gamification. */
export interface PrintExtras {
  city: string;
  displayName: string | null;
  movers: WeightDelta[];
  appUrl: string;
}

/** Where a story sits in the paper; it decides which summary tier is printed and its word budget. */
export type StoryRole = 'lead' | 'rail' | 'section-lead' | 'secondary' | 'brief';

export interface WordBudgets {
  lead: number;
  rail: number;
  sectionLead: number;
  secondary: number;
  brief: number;
}

export const DEFAULT_BUDGETS: WordBudgets = { lead: 180, rail: 45, sectionLead: 120, secondary: 70, brief: 45 };

/** One section on its own page. items[0] is the section lead; a page with room also carries a strip of briefs. */
export interface InnerPage {
  root: TopicSlug;
  items: EditionItem[];
  briefs?: EditionItem[];
}

/** Page 1 = lead + rail, pages 2… = inner (+ their briefs), last page = beyond + the remaining briefs. */
export interface PrintLayout {
  lead: EditionItem;
  rail: EditionItem[];
  inner: InnerPage[];
  beyond: EditionItem[];
  briefs: EditionItem[];
  budgets: WordBudgets;
}

/** Inlined assets, keyed by article id: a QR <svg> per story with a QR, an image data URI (or null) per pictured story. */
export interface PrintAssets {
  qr: Record<string, string>;
  images: Record<string, string | null>;
}

/** Everything PrintEdition renders. The markup is static: no fetches, no clock. */
export interface PrintModel {
  edition: Edition;
  layout: PrintLayout;
  extras: PrintExtras;
  assets: PrintAssets;
}

// Measured on A4: next to the Morrow TakeawayBox and the Inside index, columns 4-5 hold one rail story.
export const RAIL_MAX = 1;
export const MAX_INNER_PAGES = 3;
export const INNER_PAGE_CAPACITY = 5;
export const TEASER_COUNT = 5;
/** An inner page with at most this many stories has room for a strip of up to INNER_BRIEFS_MAX briefs. */
export const SPARSE_PAGE_MAX = 3;
export const INNER_BRIEFS_MAX = 3;
// Real (extractive) editions can need the whole page-1 ladder plus an inner-page step: up to 5 renders.
export const MAX_OVERFLOW_RETRIES = 4;
