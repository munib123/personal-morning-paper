'use client';
// Read the paper aloud with the browser's SpeechSynthesis (no server, no Gemini). The engine lives
// in src/lib/audio/player.ts; this hook binds one instance to React with useSyncExternalStore, so the
// server renders the "unsupported" snapshot (bar hidden) and the client takes over after hydration.
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { browserSpeech, createReadAloudPlayer, serverPlayerState, type PlayerState, type ReadAloudPlayer } from '@/lib/audio/player';
import { safeLocalStorage, type Rate } from '@/lib/audio/prefs';
import { estimateMinutes, type ReadingChunk } from '@/lib/audio/queue';

export interface UseReadAloudOptions {
  /** A story was read to its end (not skipped): mark it read and log the signal from your own hook. */
  onStoryFinished?(id: string): void;
  /** A listening session started: log `audio_play`. */
  onPlay?(): void;
}

export interface ReadAloud extends PlayerState {
  supported: boolean;
  queue: ReadingChunk[];
  current: ReadingChunk | null;
  /** Whole minutes for the queue at 160 words a minute. */
  minutes: number;
  play(index?: number): void;
  pause(): void;
  resume(): void;
  /** Pause when playing, else play (resumes when paused, restarts after done). */
  toggle(): void;
  next(): void;
  prev(): void;
  stop(): void;
  setRate(rate: Rate): void;
}

export function useReadAloud(queue: ReadingChunk[], opts: UseReadAloudOptions = {}): ReadAloud {
  const [player] = useState<ReadAloudPlayer>(() => createReadAloudPlayer({ ...browserSpeech(), storage: safeLocalStorage() }));
  const state = useSyncExternalStore(player.subscribe, player.getState, serverPlayerState);

  // The latest callbacks, without re-creating the player (they fire from speech events, never during render).
  useEffect(() => {
    player.setCallbacks(opts);
  });

  useEffect(() => {
    player.setQueue(queue);
  }, [player, queue]);

  useEffect(() => () => player.dispose(), [player]);

  const minutes = useMemo(() => estimateMinutes(queue), [queue]);

  return useMemo<ReadAloud>(() => {
    const current = state.currentId ? (queue.find((c) => c.id === state.currentId) ?? null) : null;
    return {
      ...state,
      supported: state.status !== 'unsupported',
      queue,
      current,
      minutes,
      play: player.play,
      pause: player.pause,
      resume: player.resume,
      toggle: () => (state.status === 'playing' ? player.pause() : player.play()),
      next: player.next,
      prev: player.prev,
      stop: player.stop,
      setRate: player.setRate,
    };
  }, [state, queue, minutes, player]);
}
