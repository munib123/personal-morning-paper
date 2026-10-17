'use client';
// The one client root for an edition (/today, /paper/[date], /today/preview). It owns the edition
// reducer (hydrated from this browser's memory after mount, so the server HTML matches), the signal
// queue, the live streak and the view, and hands them to every story through EditionContext.
import { MotionConfig } from 'motion/react';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { Feedback } from '@/components/morrow';
import { feedbackNote, sectionLabel } from '@/components/story/format';
import { useImageFallback } from '@/components/story/image-fallback';
import { SkipToast, type SkipReason } from '@/components/story/SkipToast';
import type { WhyAction } from '@/components/story/WhyChip';
import { useLiveStreak } from '@/components/streak/live';
import type { Edition, EditionItem } from '@/contracts/edition';
import type { StreakView } from '@/contracts/streak';
import { useSignals } from '@/hooks/useSignals';
import { EditionContext, type EditionContextValue } from './EditionContext';
import { loadEditionMemory, saveEditionMemory } from './edition-memory';
import { editionReducer, initEditionState } from './edition-state';
import { FrontPage } from './FrontPage';
import { useLiveAnnouncer } from './LiveAnnouncer';
import type { ReaderView } from './view-pref';

const NOTE_MS = 3000;
const SKIP_UNDO_MS = 5000;
/** A server "Got it…" toast this soon after our own note is the same message: show it once. */
const SERVER_ECHO_MS = 6000;
const skipToastId = (articleId: string) => `skip-${articleId}`;

export interface EditionReaderProps {
  edition: Edition;
  nowIso: string;
  initialView: ReaderView;
  streak: StreakView | null;
  readOnly: boolean;
  readerName: string | null;
  city: string | null;
}

export function EditionReader({ edition, nowIso, initialView, streak, readOnly, readerName, city }: EditionReaderProps) {
  const [state, dispatch] = useReducer(editionReducer, edition, initEditionState);
  const [view, setView] = useState<ReaderView>(initialView);
  const [, setSheetId] = useState<string | null>(null);
  const signals = useSignals(edition.id);
  const { track } = signals;
  const liveStreak = useLiveStreak(streak);
  const rootRef = useRef<HTMLDivElement>(null);
  useImageFallback(rootRef);

  // Replay this browser's reads and skips after mount (the server never sees localStorage).
  useEffect(() => {
    dispatch({ type: 'hydrate', memory: loadEditionMemory(edition.id) });
  }, [edition.id]);

  // Persist reads and skips once they differ from the server-rendered state.
  const initial = useRef(state);
  useEffect(() => {
    if (state.read === initial.current.read && state.skippedIds === initial.current.skippedIds) return;
    saveEditionMemory(edition.id, { read: state.read, skipped: state.skippedIds });
  }, [edition.id, state.read, state.skippedIds]);

  const { announce, region } = useLiveAnnouncer();
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  const noteAt = useRef(Number.NEGATIVE_INFINITY);

  // More / Less: the signal, then one calm line ("Got it. More Cricket tomorrow."). Toggling off is silent.
  const onFeedback = useCallback(
    (item: EditionItem, f: Feedback) => {
      dispatch({ type: 'feedback', articleId: item.article.id, value: f });
      if (!f) return;
      track({ type: f, articleId: item.article.id });
      const note = feedbackNote(f, sectionLabel(item.sectionSlug, edition.sectionNames));
      noteAt.current = performance.now();
      toast(note, { duration: NOTE_MS });
      announce(note);
    },
    [track, edition.sectionNames, announce],
  );

  // Skip: the card goes at once and a reserve story fades into its slot; the toast offers Undo and a
  // reason for 5 s. Exactly one outcome per skip: undo (no signal), a reason, or 'none' on close.
  const onSkip = useCallback(
    (item: EditionItem) => {
      const id = item.article.id;
      const before = stateRef.current;
      const index = before.items.findIndex((i) => i.article.id === id);
      if (index < 0) return;
      const after = editionReducer(before, { type: 'skip', articleId: id });
      dispatch({ type: 'skip', articleId: id });
      stateRef.current = after;
      // A skip of a story that had itself been promoted ends the earlier skip's undo: close its toast.
      for (const e of before.skipped) if (e.promoted?.article.id === id) toast.dismiss(skipToastId(e.item.article.id));
      const successor = after.items[index];
      announce(successor && successor.article.id !== id ? `Story skipped. ${successor.article.headline} is in its place.` : 'Story skipped.');

      let settled = false;
      const settle = (outcome: SkipReason | 'none' | 'undo') => {
        if (settled) return;
        settled = true;
        if (outcome === 'undo') {
          dispatch({ type: 'undo', articleId: id });
          announce('Skip undone.');
        } else {
          track({ type: 'skip', articleId: id, meta: { reason: outcome } });
          dispatch({ type: 'commitSkip', articleId: id });
        }
        toast.dismiss(skipToastId(id));
      };
      toast.custom(
        () => (
          <SkipToast
            item={item}
            sectionName={sectionLabel(item.sectionSlug, edition.sectionNames)}
            onUndo={() => settle('undo')}
            onReason={(r) => settle(r)}
          />
        ),
        { id: skipToastId(id), duration: SKIP_UNDO_MS, onAutoClose: () => settle('none'), onDismiss: () => settle('none') },
      );
    },
    [track, edition.sectionNames, announce],
  );

  // Toasts from the server (EventsResult.toast), unless it only repeats the note just shown.
  useEffect(() => {
    const text = signals.lastResult?.toast;
    if (!text) return;
    if (/^got it/i.test(text) && performance.now() - noteAt.current < SERVER_ECHO_MS) return;
    toast(text, { duration: NOTE_MS });
  }, [signals.lastResult]);

  const onSave = useCallback(
    (item: EditionItem, saved: boolean) => {
      dispatch({ type: 'toggleSave', articleId: item.article.id });
      if (saved) track({ type: 'save', articleId: item.article.id });
    },
    [track],
  );

  const onWhyAction = useCallback(
    (item: EditionItem, a: WhyAction) => {
      if (a === 'hide_source') track({ type: 'hide_source', articleId: item.article.id, meta: { sourceId: item.article.sourceId } });
      else onFeedback(item, a);
    },
    [track, onFeedback],
  );

  const openSheet = useCallback((id: string) => setSheetId(id), []);

  const value = useMemo<EditionContextValue>(
    () => ({ state, dispatch, signals, edition, nowIso, readOnly, view, setView, openSheet, onFeedback, onSkip, onSave, onWhyAction, liveStreak }),
    [state, signals, edition, nowIso, readOnly, view, openSheet, onFeedback, onSkip, onSave, onWhyAction, liveStreak],
  );

  return (
    <EditionContext.Provider value={value}>
      <MotionConfig reducedMotion="user">
        <div ref={rootRef}>
          <FrontPage readerName={readerName} city={city} />
          {region}
        </div>
      </MotionConfig>
    </EditionContext.Provider>
  );
}

export default EditionReader;
