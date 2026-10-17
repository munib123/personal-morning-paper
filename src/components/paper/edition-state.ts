// The reader's copy of one edition (pure). Skip removes a story and promotes a reserve story into
// the same slot; undo puts it back exactly; hydrate replays what this browser remembered. Read,
// saved and feedback are per session; read and skipped are persisted (edition-memory.ts).
import type { Edition, EditionItem } from '@/contracts/edition';
import { rootOf } from '@/contracts/taxonomy';
import type { EditionMemory } from './edition-memory';

export interface EditionState {
  items: EditionItem[];
  reserve: EditionItem[];
  /** Skips that can still be undone. `promoted` is the reserve story (as it was in the reserve) that took the slot. */
  skipped: { item: EditionItem; index: number; promoted: EditionItem | null; reserveIndex: number }[];
  /** Every skip not undone, in skip order (persisted). */
  skippedIds: string[];
  read: string[];
  saved: string[];
  feedback: Record<string, 'more' | 'less'>;
}

export type EditionAction =
  | { type: 'skip' | 'undo' | 'commitSkip' | 'markRead' | 'toggleSave'; articleId: string }
  | { type: 'feedback'; articleId: string; value: 'more' | 'less' | null }
  | { type: 'hydrate'; memory: EditionMemory };

type SkipEntry = EditionState['skipped'][number];

export function initEditionState(e: Edition): EditionState {
  return { items: e.items, reserve: e.reserve, skipped: [], skippedIds: [], read: [], saved: [], feedback: {} };
}

const idOf = (i: EditionItem): string => i.article.id;

/** Insert keeping rank order, so any order of undos restores the original order. */
function insertByRank(list: EditionItem[], item: EditionItem): EditionItem[] {
  const at = list.findIndex((i) => i.rank > item.rank);
  const next = [...list];
  next.splice(at < 0 ? next.length : at, 0, item);
  return next;
}

function skip(s: EditionState, id: string): EditionState {
  const index = s.items.findIndex((i) => idOf(i) === id);
  if (index < 0) return s;
  const item = s.items[index];
  // Promotion rule (the spec leaves it open): the first reserve story from the same root, else the first one.
  const root = rootOf(item.sectionSlug);
  const sameRoot = s.reserve.findIndex((r) => rootOf(r.sectionSlug) === root);
  const reserveIndex = sameRoot >= 0 ? sameRoot : s.reserve.length > 0 ? 0 : -1;
  const promoted = reserveIndex >= 0 ? s.reserve[reserveIndex] : null;

  const items = [...s.items];
  if (promoted) {
    // The promoted copy takes over the slot (rank, slot, tier; a lead is always deep) and keeps its own section.
    items[index] = { ...promoted, rank: item.rank, slot: item.slot, tier: item.slot === 'lead' ? 'deep' : item.tier };
  } else {
    items.splice(index, 1); // reserve exhausted: the card goes and the total drops
  }
  return {
    ...s,
    items,
    reserve: promoted ? s.reserve.filter((_, i) => i !== reserveIndex) : s.reserve,
    // Skipping a story that was itself promoted hands its slot on, so the earlier skip can no longer be undone.
    skipped: [...s.skipped.filter((e) => !e.promoted || idOf(e.promoted) !== id), { item, index, promoted, reserveIndex }],
    skippedIds: [...s.skippedIds, id],
  };
}

function undo(s: EditionState, id: string): EditionState {
  const entry = s.skipped.find((e) => idOf(e.item) === id);
  if (!entry) return s;
  let items: EditionItem[];
  let reserve = s.reserve;
  const at = entry.promoted ? s.items.findIndex((i) => idOf(i) === idOf(entry.promoted as EditionItem)) : -1;
  if (entry.promoted && at >= 0) {
    items = [...s.items];
    items[at] = entry.item;
    reserve = insertByRank(s.reserve, entry.promoted);
  } else {
    items = insertByRank(s.items, entry.item);
  }
  return {
    ...s,
    items,
    reserve,
    skipped: s.skipped.filter((e: SkipEntry) => e !== entry),
    skippedIds: s.skippedIds.filter((x) => x !== id),
  };
}

function commitSkip(s: EditionState, id: string): EditionState {
  if (!s.skipped.some((e) => idOf(e.item) === id)) return s;
  return { ...s, skipped: s.skipped.filter((e) => idOf(e.item) !== id) };
}

function markRead(s: EditionState, id: string): EditionState {
  return s.read.includes(id) ? s : { ...s, read: [...s.read, id] };
}

function hydrate(s: EditionState, memory: EditionMemory): EditionState {
  const known = new Set([...s.items, ...s.reserve].map(idOf));
  let next = s;
  for (const id of memory.skipped) {
    if (next.items.some((i) => idOf(i) === id)) next = commitSkip(skip(next, id), id); // same promotions as before the reload
  }
  for (const id of memory.read) {
    if (known.has(id)) next = markRead(next, id);
  }
  return next;
}

export function editionReducer(s: EditionState, a: EditionAction): EditionState {
  switch (a.type) {
    case 'skip':
      return skip(s, a.articleId);
    case 'undo':
      return undo(s, a.articleId);
    case 'commitSkip':
      return commitSkip(s, a.articleId);
    case 'markRead':
      return markRead(s, a.articleId);
    case 'toggleSave':
      return { ...s, saved: s.saved.includes(a.articleId) ? s.saved.filter((x) => x !== a.articleId) : [...s.saved, a.articleId] };
    case 'feedback': {
      const feedback = { ...s.feedback };
      if (a.value === null) delete feedback[a.articleId];
      else feedback[a.articleId] = a.value;
      return { ...s, feedback };
    }
    case 'hydrate':
      return hydrate(s, a.memory);
    default:
      return s;
  }
}

/** Read stories still on the page, out of the stories on the page. */
export function progressOf(s: EditionState): { read: number; total: number } {
  const onPage = new Set(s.items.map(idOf));
  return { read: s.read.filter((id) => onPage.has(id)).length, total: s.items.length };
}

export function progressLabel(p: { read: number; total: number }): string {
  return `${p.read} of ${p.total} read`;
}

export function toMemory(s: EditionState): EditionMemory {
  return { read: s.read, skipped: s.skippedIds };
}
