'use client';
// The one client root for an edition (/today, /paper/[date], /today/preview). It owns the edition
// reducer (hydrated from this browser's memory after mount, so the server HTML matches), the signal
// queue, the live streak and the view, and hands them to every story through EditionContext.
import { MotionConfig } from 'motion/react';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { Feedback } from '@/components/morrow';
import { useImageFallback } from '@/components/story/image-fallback';
import type { WhyAction } from '@/components/story/WhyChip';
import { useLiveStreak } from '@/components/streak/live';
import type { Edition, EditionItem } from '@/contracts/edition';
import type { StreakView } from '@/contracts/streak';
import { useSignals } from '@/hooks/useSignals';
import { EditionContext, type EditionContextValue } from './EditionContext';
import { loadEditionMemory, saveEditionMemory } from './edition-memory';
import { editionReducer, initEditionState } from './edition-state';
import { FrontPage } from './FrontPage';
import type { ReaderView } from './view-pref';

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

  const onFeedback = useCallback(
    (item: EditionItem, f: Feedback) => {
      dispatch({ type: 'feedback', articleId: item.article.id, value: f });
      if (f) track({ type: f, articleId: item.article.id });
    },
    [track],
  );

  const onSkip = useCallback((item: EditionItem) => {
    dispatch({ type: 'skip', articleId: item.article.id });
  }, []);

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
        </div>
      </MotionConfig>
    </EditionContext.Provider>
  );
}

export default EditionReader;
