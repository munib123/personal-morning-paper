// Morning Recall state: the recall_answer signal (§9.7), the score, and the per-edition answers kept in
// localStorage (`subah:recall:{editionId}`). Storage is wrapped in try/catch with an in-memory twin,
// so the card works when storage is blocked. Answers are kept per question (articleId) and a Skip
// records the skipped questions, so "Quiz me now" on the same edition is never hidden by it.
import { useSyncExternalStore } from 'react';
import type { RecallQuestion } from '@/contracts/article';
import type { SignalEvent } from '@/contracts/signals';

export type Choice = 0 | 1 | 2;
export interface RecallStore {
  answers: Record<string, Choice>;
  dismissed: string[];
}

const EMPTY: RecallStore = { answers: {}, dismissed: [] };

export function answerEvent(q: RecallQuestion, chosen: Choice, editionId: string): SignalEvent {
  return { type: 'recall_answer', articleId: q.articleId, editionId, value: chosen === q.answerIndex ? 1 : 0, meta: { chosen } };
}

export function recallScore(answers: Record<string, number>, qs: RecallQuestion[]): { correct: number; total: number } {
  return { correct: qs.filter((q) => answers[q.articleId] === q.answerIndex).length, total: qs.length };
}

export function firstUnanswered(qs: RecallQuestion[], answers: Record<string, number>): RecallQuestion | null {
  return qs.find((q) => answers[q.articleId] === undefined) ?? null;
}

const isChoice = (v: unknown): v is Choice => v === 0 || v === 1 || v === 2;

export function parseRecallStore(raw: string | null): RecallStore {
  if (!raw) return EMPTY;
  try {
    const data = JSON.parse(raw) as { answers?: unknown; dismissed?: unknown };
    const answers: Record<string, Choice> = {};
    if (data.answers && typeof data.answers === 'object') {
      for (const [id, v] of Object.entries(data.answers as Record<string, unknown>)) if (isChoice(v)) answers[id] = v;
    }
    const dismissed = Array.isArray(data.dismissed) ? data.dismissed.filter((d): d is string => typeof d === 'string') : [];
    return { answers, dismissed };
  } catch {
    return EMPTY;
  }
}

/** On a fresh visit the card stays hidden once its questions were skipped, or all answered before. */
export function isHiddenOnLoad(qs: RecallQuestion[], store: RecallStore): boolean {
  if (qs.length === 0) return true;
  if (qs.every((q) => store.dismissed.includes(q.articleId))) return true;
  return qs.every((q) => store.answers[q.articleId] !== undefined);
}

// ── Storage (localStorage, with an in-memory twin) ───────────────────────────────────────────────
const memory = new Map<string, string>();
const listeners = new Set<() => void>();
const keyOf = (editionId: string) => `subah:recall:${editionId}`;

function readRaw(editionId: string): string | null {
  const key = keyOf(editionId);
  try {
    const v = window.localStorage.getItem(key);
    if (v !== null) return v;
  } catch {
    // blocked storage: fall through to memory
  }
  return memory.get(key) ?? null;
}

function writeStore(editionId: string, store: RecallStore): void {
  const key = keyOf(editionId);
  const raw = JSON.stringify(store);
  memory.set(key, raw);
  try {
    window.localStorage.setItem(key, raw);
  } catch {
    // blocked or full: the in-memory copy still holds for this page
  }
  for (const notify of [...listeners]) notify();
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
}

/** The stored answers for an edition (empty on the server and during hydration). */
export function useRecallStore(editionId: string): RecallStore {
  const raw = useSyncExternalStore(
    subscribe,
    () => readRaw(editionId),
    () => null,
  );
  return parseRecallStore(raw);
}

export function saveAnswer(editionId: string, articleId: string, chosen: Choice): void {
  const store = parseRecallStore(readRaw(editionId));
  if (store.answers[articleId] !== undefined) return; // the first answer stands
  writeStore(editionId, { ...store, answers: { ...store.answers, [articleId]: chosen } });
}

export function dismissQuestions(editionId: string, articleIds: string[]): void {
  const store = parseRecallStore(readRaw(editionId));
  writeStore(editionId, { ...store, dismissed: [...new Set([...store.dismissed, ...articleIds])] });
}
