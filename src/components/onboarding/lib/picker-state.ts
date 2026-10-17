// Every decision the topic picker makes, as a pure reducer (ARCHITECTURE §9.6 InterestPicker).
// Layout model: one group per root; the root chip ("All of Technical") picks the whole area as a tile,
// level-2 chips pick as chips, and a level-2 chip with children has a › disclosure that opens its
// level-3 chips in place. One open panel per root.
import type { InterestPick } from '@/contracts/profile';
import { rootOf, type TopicNode, type TopicSlug } from '@/contracts/taxonomy';

export interface InterestPickerValue {
  picks: InterestPick[];
  blocked: TopicSlug[];
}

export interface InterestPickerProps {
  taxonomy: TopicNode[];
  value: InterestPickerValue;
  onChange: (v: InterestPickerValue) => void;
  mode: 'onboarding' | 'edit';
}

export type PickerState = InterestPickerValue & { open: TopicSlug[] };

export type PickerAction =
  | { type: 'toggle' | 'toggleDisclosure' | 'block' | 'unblock'; slug: TopicSlug }
  | { type: 'merge'; picks: TopicSlug[]; blocked: TopicSlug[] }
  | { type: 'set'; value: InterestPickerValue };

export const MIN_PICKS = 3;

const isUnder = (slug: TopicSlug, parent: TopicSlug) => slug.startsWith(`${parent}.`);
const isAtOrUnder = (slug: TopicSlug, parent: TopicSlug) => slug === parent || isUnder(slug, parent);
const unique = <T,>(xs: T[]) => [...new Set(xs)];

export function childrenOf(tax: TopicNode[], parent: TopicSlug | null): TopicNode[] {
  return tax.filter((n) => n.parentSlug === parent);
}

export function pickedDescendantCount(slug: TopicSlug, picks: InterestPick[]): number {
  return picks.filter((p) => isUnder(p.slug, slug)).length;
}

/** "2 picked" on a chip whose sub-topics are picked, so a closed panel still shows what is inside. */
export function chipHint(slug: TopicSlug, picks: InterestPick[]): string | undefined {
  const n = pickedDescendantCount(slug, picks);
  return n > 0 ? `${n} picked` : undefined;
}

export function pickCounterText(n: number): string {
  return n === 1 ? '1 topic picked' : `${n} topics picked`;
}

/** The step's next button: it says what is missing until there are enough picks. */
export function ctaLabel(n: number): string {
  return n < MIN_PICKS ? `Pick ${MIN_PICKS - n} more` : 'Continue';
}

function block(s: PickerState, slug: TopicSlug): PickerState {
  return {
    ...s,
    picks: s.picks.filter((p) => !isAtOrUnder(p.slug, slug)),
    blocked: s.blocked.includes(slug) ? s.blocked : [...s.blocked, slug],
  };
}

export function pickerReducer(s: PickerState, a: PickerAction, tax: TopicNode[]): PickerState {
  if (a.type === 'set') return { ...a.value, open: s.open };

  const known = (slug: TopicSlug) => tax.find((n) => n.slug === slug);

  if (a.type === 'merge') {
    let next = s;
    for (const slug of unique(a.picks)) {
      if (!known(slug)) continue;
      if (next.picks.some((p) => p.slug === slug)) continue;
      if (next.blocked.some((b) => isAtOrUnder(slug, b))) continue;
      next = { ...next, picks: [...next.picks, { slug, via: 'describe' }] };
    }
    for (const slug of unique(a.blocked)) {
      if (known(slug)) next = block(next, slug);
    }
    return next;
  }

  const node = known(a.slug);
  if (!node) return s;

  switch (a.type) {
    case 'toggle': {
      if (s.picks.some((p) => p.slug === a.slug)) {
        return { ...s, picks: s.picks.filter((p) => p.slug !== a.slug) };
      }
      return {
        ...s,
        picks: [...s.picks, { slug: a.slug, via: node.level === 1 ? 'tile' : 'chip' }],
        blocked: s.blocked.includes(a.slug) ? s.blocked.filter((b) => b !== a.slug) : s.blocked,
      };
    }
    case 'toggleDisclosure': {
      if (s.open.includes(a.slug)) return { ...s, open: s.open.filter((o) => o !== a.slug) };
      if (childrenOf(tax, a.slug).length === 0) return s;
      const root = rootOf(a.slug);
      return { ...s, open: [...s.open.filter((o) => rootOf(o) !== root), a.slug] };
    }
    case 'block':
      return block(s, a.slug);
    case 'unblock':
      return s.blocked.includes(a.slug) ? { ...s, blocked: s.blocked.filter((b) => b !== a.slug) } : s;
  }
}
