import { describe, expect, it } from 'vitest';
import { FIXTURE_EDITION } from '@/contracts/fixtures';
import type { Edition, EditionItem } from '@/contracts/edition';
import {
  editionReducer,
  initEditionState,
  progressLabel,
  progressOf,
  toMemory,
  type EditionAction,
  type EditionState,
} from './edition-state';

const run = (s: EditionState, ...actions: EditionAction[]): EditionState => actions.reduce(editionReducer, s);
const ids = (items: EditionItem[]) => items.map((i) => i.article.id);
const skip = (articleId: string): EditionAction => ({ type: 'skip', articleId });
const undo = (articleId: string): EditionAction => ({ type: 'undo', articleId });

const s0 = initEditionState(FIXTURE_EDITION);
const A = s0.items[0].article.id; // the lead
const B = s0.items[5].article.id;
const C = s0.items[2].article.id;

describe('edition state', () => {
  it('init', () => {
    expect(s0.items).toHaveLength(20);
    expect(s0.reserve).toHaveLength(8);
    expect(progressOf(s0)).toEqual({ read: 0, total: 20 });
    expect(progressLabel({ read: 7, total: 20 })).toBe('7 of 20 read');
  });

  it('skip lead promotes into the slot', () => {
    const s = run(s0, skip(A));
    expect(s.items).toHaveLength(20);
    expect(s.reserve).toHaveLength(7);
    expect(ids(s.items)).not.toContain(A);
    const promoted = s.items[0];
    expect(promoted).toMatchObject({ rank: 1, slot: 'lead', tier: 'deep' });
    const original = s0.reserve.find((r) => r.article.id === promoted.article.id);
    expect(original).toBeDefined();
    expect(promoted.sectionSlug).toBe(original?.sectionSlug); // keeps its own section
    expect(s.skippedIds).toEqual([A]);
  });

  it('promotion prefers same root', () => {
    const edition: Edition = {
      ...FIXTURE_EDITION,
      items: FIXTURE_EDITION.items.map((i, n) => (n === 4 ? { ...i, sectionSlug: 'sports.cricket' } : i)),
      reserve: FIXTURE_EDITION.reserve.map((r, n) => ({ ...r, sectionSlug: n === 3 ? 'sports.football' : 'news' })),
    };
    const start = initEditionState(edition);
    const s = run(start, skip(start.items[4].article.id));
    expect(s.items[4].article.id).toBe(edition.reserve[3].article.id);
    expect(s.items[4].sectionSlug).toBe('sports.football');
    expect(s.items[4].rank).toBe(5);
  });

  it('undo restores exactly', () => {
    const s = run(s0, skip(A), undo(A));
    expect(s.items).toEqual(s0.items);
    expect(s.reserve).toEqual(s0.reserve);
    expect(s.skippedIds).toEqual([]);
    expect(s.skipped).toEqual([]);
  });

  it('skip with empty reserve', () => {
    const start = initEditionState({ ...FIXTURE_EDITION, reserve: [] });
    const s = run(start, skip(B));
    expect(s.items).toHaveLength(19);
    expect(progressLabel(progressOf(s))).toBe('0 of 19 read');
    const back = run(s, undo(B));
    expect(ids(back.items)).toEqual(ids(start.items));
  });

  it('overlapping skips', () => {
    const s = run(s0, skip(A), skip(B), undo(A));
    expect(s.items[0].article.id).toBe(A);
    expect(ids(s.items)).not.toContain(B);
    expect(new Set(ids(s.items)).size).toBe(s.items.length);
    expect(s.items).toHaveLength(20);
    expect(s.skippedIds).toEqual([B]);
    const all = [...ids(s.items), ...ids(s.reserve)];
    expect(new Set(all).size).toBe(all.length);
    expect(all.length + 1).toBe(28); // 20 + 8, minus B
  });

  it('undo after commitSkip is a no-op', () => {
    const committed = run(s0, skip(A), { type: 'commitSkip', articleId: A });
    expect(committed.skipped).toEqual([]);
    expect(committed.skippedIds).toEqual([A]);
    expect(run(committed, undo(A))).toEqual(committed);
  });

  it('markRead idempotent; read of a skipped id not counted', () => {
    const s = run(s0, { type: 'markRead', articleId: C }, { type: 'markRead', articleId: C });
    expect(s.read).toEqual([C]);
    expect(progressOf(s)).toEqual({ read: 1, total: 20 });
    expect(progressOf(run(s, skip(C)))).toEqual({ read: 0, total: 20 });
  });

  it('toggleSave toggles', () => {
    const on = run(s0, { type: 'toggleSave', articleId: C });
    expect(on.saved).toEqual([C]);
    expect(run(on, { type: 'toggleSave', articleId: C }).saved).toEqual([]);
  });

  it('feedback sets and clears', () => {
    const more = run(s0, { type: 'feedback', articleId: A, value: 'more' });
    expect(more.feedback[A]).toBe('more');
    const less = run(more, { type: 'feedback', articleId: A, value: 'less' });
    expect(less.feedback[A]).toBe('less');
    const cleared = run(less, { type: 'feedback', articleId: A, value: null });
    expect(A in cleared.feedback).toBe(false);
  });

  it('hydrate replays skips and reads', () => {
    const hydrated = run(s0, { type: 'hydrate', memory: { skipped: [A, B, 'gone'], read: [C, 'unknown'] } });
    const manual = run(
      s0,
      skip(A),
      { type: 'commitSkip', articleId: A },
      skip(B),
      { type: 'commitSkip', articleId: B },
      { type: 'markRead', articleId: C },
    );
    expect(hydrated).toEqual(manual);
    expect(toMemory(hydrated)).toEqual({ read: [C], skipped: [A, B] });
    expect(run(s0, { type: 'hydrate', memory: toMemory(hydrated) })).toEqual(hydrated);
    // Hydrating twice (React StrictMode re-runs effects) changes nothing.
    expect(run(hydrated, { type: 'hydrate', memory: toMemory(hydrated) })).toEqual(hydrated);
  });

  it('skipping the promoted story finalizes the earlier skip', () => {
    const afterA = run(s0, skip(A));
    const promoted = afterA.items[0].article.id;
    const s = run(afterA, skip(promoted));
    expect(s.skipped.map((e) => e.item.article.id)).toEqual([promoted]); // A is no longer undoable
    expect(s.skippedIds).toEqual([A, promoted]);
    const undone = run(s, undo(A));
    expect(undone).toEqual(s);
    expect(undone.items).toHaveLength(20);
    const back = run(s, undo(promoted));
    expect(back.items[0].article.id).toBe(promoted);
    expect(new Set([...ids(back.items), ...ids(back.reserve)]).size).toBe(27);
  });

  it('undo puts stories back in rank order whatever the order of undos', () => {
    const start = initEditionState({ ...FIXTURE_EDITION, reserve: [] });
    const first = start.items[0].article.id;
    const second = start.items[1].article.id;
    const s = run(start, skip(first), skip(second), undo(first), undo(second));
    expect(ids(s.items)).toEqual(ids(start.items));
    const r = run(s0, skip(A), skip(B), undo(A), undo(B));
    expect(r.items).toEqual(s0.items);
    expect(r.reserve).toEqual(s0.reserve);
  });

  it('ignores actions on unknown ids', () => {
    expect(run(s0, skip('nope'), undo('nope'), { type: 'commitSkip', articleId: 'nope' })).toEqual(s0);
  });
});
