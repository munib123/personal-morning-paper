// The onboarding draft: what the reader has told us so far, kept in localStorage so a reload
// never loses their picks. Every storage read and write is wrapped, because localStorage can be
// missing (Safari private mode), full, or hold a draft from an older shape.
import { z } from 'zod';
import { InterestPickSchema, PresentationSchema, TopicSlugSchema } from '@/contracts/api';
import type { InterestPick, OnboardingInput, Presentation } from '@/contracts/profile';
import type { TopicSlug } from '@/contracts/taxonomy';
import { BRAND } from '@/lib/brand';

export type DraftStep = 1 | 2 | 3 | 4 | 5; // 5 = the first-front-page preview
export type DeliveryHour = 6 | 7 | 8;

export interface OnboardingDraft {
  step: DraftStep;
  name: string;
  picks: InterestPick[];
  blocked: TopicSlug[];
  words: string;
  avoidSources: string; // draft only: OnboardingInput has no field for it (contract gap)
  presentation: Presentation;
  deliveryHour: DeliveryHour; // draft only: OnboardingInput has no field for it (contract gap)
  city: string;
  skipped: { picks: boolean; words: boolean };
}

// v2: the shape changed from v1 (Morrow routine), so v1 drafts are simply never read.
export const DRAFT_KEY = 'subah:onboarding-draft:v2';
export const DEFAULT_CITY = 'Islamabad';
const FALLBACK_TZ = 'Asia/Karachi';
const NAME_MAX = 24;
const CITY_MAX = 80; // OnboardingInputSchema.city

// What "Skip for now" on Topics gives you: the four broad areas most readers start with.
export const DEFAULT_PICKS: InterestPick[] = [
  { slug: 'news', via: 'tile' },
  { slug: 'technical', via: 'tile' },
  { slug: 'sports', via: 'tile' },
  { slug: 'business', via: 'tile' },
];

export const DEFAULT_DRAFT: OnboardingDraft = {
  step: 1,
  name: '',
  picks: [],
  blocked: [],
  words: '',
  avoidSources: '',
  presentation: { timeBudget: 15, depth: 'basics', lang: 'en' },
  deliveryHour: 7,
  city: DEFAULT_CITY,
  skipped: { picks: false, words: false },
};

// Text the reader typed is cut to fit rather than rejected: one long paste must not cost them the
// whole draft (their picks included) on the next reload.
const text = (max: number) => z.string().transform((s) => s.slice(0, max));

const DraftSchema = z.object({
  step: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  name: text(200),
  picks: z.array(InterestPickSchema).max(100),
  blocked: z.array(TopicSlugSchema).max(100),
  words: text(5000),
  avoidSources: text(1000),
  presentation: PresentationSchema,
  deliveryHour: z.union([z.literal(6), z.literal(7), z.literal(8)]),
  city: text(200),
  skipped: z.object({ picks: z.boolean(), words: z.boolean() }),
});

function browserStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

const resolveStorage = (storage: Storage | null | undefined) => (storage === undefined ? browserStorage() : storage);

/** The saved draft, or DEFAULT_DRAFT when there is none, it is unreadable, or it has an older shape. */
export function loadDraft(storage?: Storage | null): OnboardingDraft {
  const s = resolveStorage(storage);
  if (!s) return DEFAULT_DRAFT;
  try {
    const raw = s.getItem(DRAFT_KEY);
    if (!raw) return DEFAULT_DRAFT;
    const parsed = DraftSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_DRAFT;
  } catch {
    return DEFAULT_DRAFT;
  }
}

/** true when the draft was written; false when storage is missing, full or denied. Never throws. */
export function saveDraft(d: OnboardingDraft, storage?: Storage | null): boolean {
  const s = resolveStorage(storage);
  if (!s) return false;
  try {
    s.setItem(DRAFT_KEY, JSON.stringify(d));
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(storage?: Storage | null): void {
  const s = resolveStorage(storage);
  if (!s) return;
  try {
    s.removeItem(DRAFT_KEY);
  } catch {
    // Nothing to do: a stale draft only pre-fills the next visit.
  }
}

/** "  ayesha  " → "Ayesha". Whitespace collapsed, capped at 24 characters (code points), null when empty. */
export function cleanName(raw: string): string | null {
  const collapsed = raw.replace(/\s+/g, ' ').trim();
  if (!collapsed) return null;
  const capped = Array.from(collapsed).slice(0, NAME_MAX).join('').trim();
  return capped.charAt(0).toUpperCase() + capped.slice(1);
}

function browserTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || FALLBACK_TZ;
  } catch {
    return FALLBACK_TZ;
  }
}

const under = (slug: TopicSlug, blocked: TopicSlug[]) => blocked.some((b) => slug === b || slug.startsWith(`${b}.`));

/** The §9.1 OnboardingInput for POST /api/onboarding. The taste test is out of core, so taste is always []. */
export function buildOnboardingInput(d: OnboardingDraft, tz?: string): OnboardingInput {
  const displayName = cleanName(d.name);
  const picks = d.picks.length > 0 ? d.picks : DEFAULT_PICKS.filter((p) => !under(p.slug, d.blocked));
  return {
    displayName,
    paperName: BRAND.defaultPaperName(displayName),
    picks,
    blocked: d.blocked,
    taste: [],
    presentation: d.presentation,
    city: d.city.trim().slice(0, CITY_MAX).trim() || DEFAULT_CITY,
    tz: tz ?? browserTz(),
  };
}
