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
import { StorySheet } from '@/components/story/StorySheet';
import { whyActionEvent } from '@/components/story/WhyPopover';
import type { WhyAction } from '@/components/story/WhyChip';
import { useLiveStreak } from '@/components/streak/live';
import type { Edition, EditionItem } from '@/contracts/edition';
import type { StreakView } from '@/contracts/streak';
import { useSignals } from '@/hooks/useSignals';
import { EditionContext, type EditionContextValue } from './EditionContext';
import { loadEditionMemory, saveEditionMemory } from './edition-memory';
import { editionReducer, initEditionState } from './edition-state';
import { keyToAction } from './bytes-keys';
import { BytesDeck } from './BytesDeck';
import { FrontPage } from './FrontPage';
import { useLiveAnnouncer } from './LiveAnnouncer';
import { persistView, type ReaderView } from './view-pref';

const NOTE_MS = 3000;
const SKIP_UNDO_MS = 5000;
/** The same server toast again within this window is not shown twice. */
const SERVER_REPEAT_MS = 30_000;
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
  const [sheetId, setSheetId] = useState<string | null>(null);
  const signals = useSignals(edition.id);
  const { track } = signals;
  const liveStreak = useLiveStreak(streak);
  const rootRef = useRef<HTMLDivElement>(null);
  useImageFallback(rootRef);

  // Replay this browser's reads and skips after mount (the server never sees localStorage).
  useEffect(() => {
    dispatch({ type: 'hydrate', memory: loadEditionMemory(edition.id) });
    rootRef.current?.setAttribute('data-reader-ready', ''); // keys and handlers are live from here on
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

  // More / Less: the signal, then one calm line ("Got it. More Cricket tomorrow."). Toggling off is silent.
  const onFeedback = useCallback(
    (item: EditionItem, f: Feedback) => {
      dispatch({ type: 'feedback', articleId: item.article.id, value: f });
      if (!f) return;
      track({ type: f, articleId: item.article.id });
      const note = feedbackNote(f, sectionLabel(item.sectionSlug, edition.sectionNames));
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

  // Toasts from the server (EventsResult.toast). "Got it…" acknowledges More / Less, which the note
  // above already did the moment the reader pressed it, so only other lines (milestones…) show, and
  // the same line is not repeated by the next flush.
  const serverToast = useRef<{ text: string; at: number } | null>(null);
  useEffect(() => {
    const text = signals.lastResult?.toast;
    if (!text || /^got it/i.test(text)) return;
    const now = performance.now();
    if (serverToast.current?.text === text && now - serverToast.current.at < SERVER_REPEAT_MS) return;
    serverToast.current = { text, at: now };
    toast(text, { duration: NOTE_MS });
  }, [signals.lastResult]);

  const onSave = useCallback(
    (item: EditionItem, saved: boolean) => {
      dispatch({ type: 'toggleSave', articleId: item.article.id });
      if (saved) track({ type: 'save', articleId: item.article.id });
    },
    [track],
  );

  // From the "Why this story?" popover: More / Less take the FeedbackBar's path (same note);
  // Hide this source is its own signal (L3 mutes the source from the next paper on).
  const onWhyAction = useCallback(
    (item: EditionItem, a: WhyAction) => {
      if (a !== 'hide_source') {
        onFeedback(item, a);
        return;
      }
      track(whyActionEvent(a, item));
      const note = `Got it. No more stories from ${item.article.sourceName}.`;
      toast(note, { duration: NOTE_MS });
      announce(note);
    },
    [track, onFeedback, announce],
  );

  // b switches between the Front page and Bytes in both views (not while typing or in a dialog).
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = keyToAction({
        key: e.key,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey,
        target: e.target as { tagName?: string; isContentEditable?: boolean } | null,
      });
      if (action !== 'toggle' || document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      const next: ReaderView = viewRef.current === 'bytes' ? 'front' : 'bytes';
      viewRef.current = next;
      setView(next);
      persistView(next);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const openSheet = useCallback((id: string) => setSheetId(id), []);
  const sheetItem = sheetId ? (state.items.find((i) => i.article.id === sheetId) ?? null) : null;

  const value = useMemo<EditionContextValue>(
    () => ({ state, dispatch, signals, edition, nowIso, readOnly, view, setView, openSheet, onFeedback, onSkip, onSave, onWhyAction, liveStreak }),
    [state, signals, edition, nowIso, readOnly, view, openSheet, onFeedback, onSkip, onSave, onWhyAction, liveStreak],
  );

  return (
    <EditionContext.Provider value={value}>
      <MotionConfig reducedMotion="user">
        <div ref={rootRef}>
          {view === 'bytes' ? <BytesDeck readerName={readerName} city={city} /> : <FrontPage readerName={readerName} city={city} />}
          <StorySheet
            item={sheetItem}
            editionId={edition.id}
            open={sheetItem !== null}
            onOpenChange={(open) => {
              if (!open) setSheetId(null);
            }}
          />
          {region}
        </div>
      </MotionConfig>
    </EditionContext.Provider>
  );
}

export default EditionReader;
