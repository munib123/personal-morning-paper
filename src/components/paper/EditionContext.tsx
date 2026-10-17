'use client';
// One edition being read: the reducer state, the signal queue and the handlers every story uses.
// EditionReader provides it; PaperStory, the sheet, the end of paper and Bytes read it.
import { createContext, useContext, type Dispatch } from 'react';
import type { Feedback } from '@/components/morrow';
import type { WhyAction } from '@/components/story/WhyChip';
import type { Edition, EditionItem } from '@/contracts/edition';
import type { StreakView } from '@/contracts/streak';
import type { useSignals } from '@/hooks/useSignals';
import type { EditionAction, EditionState } from './edition-state';
import type { ReaderView } from './view-pref';

export interface EditionContextValue {
  state: EditionState;
  dispatch: Dispatch<EditionAction>;
  signals: ReturnType<typeof useSignals>;
  edition: Edition;
  nowIso: string;
  readOnly: boolean;
  view: ReaderView;
  setView(v: ReaderView): void;
  openSheet(id: string): void;
  onFeedback(item: EditionItem, f: Feedback): void;
  onSkip(item: EditionItem): void;
  onSave(item: EditionItem, saved: boolean): void;
  onWhyAction(item: EditionItem, a: WhyAction): void;
  liveStreak: StreakView | null;
}

export const EditionContext = createContext<EditionContextValue | null>(null);

export function useEdition(): EditionContextValue {
  const value = useContext(EditionContext);
  if (!value) throw new Error('useEdition() must be used inside <EditionReader>');
  return value;
}

/** The same value, or null outside an EditionReader (e.g. a StorySheet mounted elsewhere). */
export function useEditionOptional(): EditionContextValue | null {
  return useContext(EditionContext);
}
