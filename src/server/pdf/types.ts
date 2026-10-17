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

export const DEFAULT_BUDGETS: WordBudgets = { lead: 180, rail: 70, sectionLead: 120, secondary: 70, brief: 45 };

/** One section on its own page. items[0] is the section lead. */
export interface InnerPage {
  root: TopicSlug;
  items: EditionItem[];
}

/** Page 1 = lead + rail, pages 2… = inner, last page = beyond + briefs. */
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

export const RAIL_MAX = 2;
export const MAX_INNER_PAGES = 3;
export const INNER_PAGE_CAPACITY = 5;
export const TEASER_COUNT = 5;
export const MAX_OVERFLOW_RETRIES = 2;
