// The read-aloud engine, outside React so it is testable with a fake synthesizer. It owns the
// SpeechSynthesis queue for one edition: play from a story, pause, resume, next, previous, stop,
// change the rate. Utterances are split at sentence boundaries, stale utterance events are ignored
// through a generation counter, and a 10 s resume() tick works around Chrome's 15 s stall.
import { isRate, loadAudioPrefs, saveAudioPrefs, type Rate, type StorageLike } from './prefs';
import { splitForSynthesis, type ReadingChunk } from './queue';
import { hasUrduScript, pickVoice } from './voices';

export type PlayerStatus = 'idle' | 'playing' | 'paused' | 'done' | 'unsupported';

export interface PlayerState {
  status: PlayerStatus;
  /** Position in the queue of the story being read (or last read). */
  index: number;
  currentId: string | null;
  rate: Rate;
  voiceName: string | null;
}

export type UtteranceLike = Pick<SpeechSynthesisUtterance, 'text' | 'lang' | 'rate' | 'voice' | 'onstart' | 'onend' | 'onerror'>;

/** The part of window.speechSynthesis we use (fakeable). */
export interface SynthLike {
  speak(utterance: UtteranceLike): void;
  cancel(): void;
  pause(): void;
  resume(): void;
  getVoices(): SpeechSynthesisVoice[];
  readonly paused: boolean;
  readonly speaking: boolean;
  addEventListener?(type: 'voiceschanged', listener: () => void): void;
  removeEventListener?(type: 'voiceschanged', listener: () => void): void;
}

export interface PlayerDeps {
  synth: SynthLike | null | undefined;
  Utterance: (new (text?: string) => UtteranceLike) | null | undefined;
  storage?: StorageLike | null;
}

export interface PlayerCallbacks {
  /** A story was read to its end (not skipped). */
  onStoryFinished?(id: string): void;
  /** A listening session started from idle or done (log an `audio_play` signal here). */
  onPlay?(): void;
}

export interface ReadAloudPlayer {
  getState(): PlayerState;
  subscribe(listener: () => void): () => void;
  /** Replace the callbacks (React sets the latest props from an effect). */
  setCallbacks(callbacks: PlayerCallbacks): void;
  /** The stories to read, in order; call again whenever the page changes (skips). */
  setQueue(queue: ReadingChunk[]): void;
  getQueue(): ReadingChunk[];
  /** Start reading (from `index`, else where it is; resumes when paused; restarts after done). */
  play(index?: number): void;
  pause(): void;
  resume(): void;
  next(): void;
  prev(): void;
  stop(): void;
  setRate(rate: Rate): void;
  /** Stops speech and removes listeners. The player can still be used afterwards. */
  dispose(): void;
}

export const STALL_TICK_MS = 10_000;
const SERVER_STATE: PlayerState = { status: 'unsupported', index: 0, currentId: null, rate: 1, voiceName: null };

/** The browser has one synthesizer, so the bar and a story button never speak over each other. */
let activePlayer: ReadAloudPlayer | null = null;

/** A stable snapshot for server rendering and hydration: the bar is hidden until the client confirms support. */
export function serverPlayerState(): PlayerState {
  return SERVER_STATE;
}

/** The browser's synthesizer and utterance constructor, or nulls on the server and in browsers without them. */
export function browserSpeech(): Pick<PlayerDeps, 'synth' | 'Utterance'> {
  if (typeof window === 'undefined') return { synth: null, Utterance: null };
  try {
    const g = globalThis as { speechSynthesis?: SynthLike; SpeechSynthesisUtterance?: new (text?: string) => UtteranceLike };
    const synth = g.speechSynthesis ?? null;
    const Utterance = typeof g.SpeechSynthesisUtterance === 'function' ? g.SpeechSynthesisUtterance : null;
    return { synth, Utterance };
  } catch {
    return { synth: null, Utterance: null };
  }
}

export function createReadAloudPlayer(deps: PlayerDeps, callbacks: PlayerCallbacks = {}): ReadAloudPlayer {
  let cb = callbacks;
  const synth = deps.synth ?? null;
  const Utterance = deps.Utterance ?? null;
  const storage = deps.storage ?? null;
  const supported = synth !== null && Utterance !== null;
  const prefs = loadAudioPrefs(storage);

  let state: PlayerState = { status: supported ? 'idle' : 'unsupported', index: 0, currentId: null, rate: prefs.rate, voiceName: prefs.voiceName };
  let queue: ReadingChunk[] = [];
  let generation = 0;
  let tick: ReturnType<typeof setInterval> | null = null;
  const listeners = new Set<() => void>();

  const set = (patch: Partial<PlayerState>) => {
    const next = { ...state, ...patch };
    const same = (Object.keys(next) as (keyof PlayerState)[]).every((k) => next[k] === state[k]);
    if (same) return;
    state = next;
    for (const l of [...listeners]) l();
  };

  const persist = () => saveAudioPrefs(storage, { rate: state.rate, voiceName: state.voiceName });

  const stopTick = () => {
    if (tick !== null) clearInterval(tick);
    tick = null;
  };
  // Chrome (desktop) goes silent about 15 s into a long speech unless it is nudged; resume() while
  // speaking is harmless everywhere else. Only while we think we are playing.
  const startTick = () => {
    stopTick();
    tick = setInterval(() => {
      if (state.status === 'playing' && synth && !synth.paused) synth.resume();
    }, STALL_TICK_MS);
  };

  const cancelSpeech = () => {
    generation++; // events from the utterances being cancelled are now stale
    stopTick();
    synth?.cancel();
  };

  const finish = () => {
    cancelSpeech();
    set({ status: 'done', currentId: null });
  };

  const currentIndex = (): number => {
    const byId = state.currentId ? queue.findIndex((c) => c.id === state.currentId) : -1;
    if (byId >= 0) return byId;
    return Math.min(state.index, Math.max(0, queue.length - 1));
  };

  const speakAt = (index: number) => {
    if (!synth || !Utterance) return;
    const chunk = queue[index];
    if (!chunk) {
      finish();
      return;
    }
    if (activePlayer && activePlayer !== self) activePlayer.stop();
    activePlayer = self;
    cancelSpeech();
    const mine = generation;
    const urdu = hasUrduScript(chunk.text);
    const voice = pickVoice(synth.getVoices(), { lang: urdu ? 'ur' : 'en', preferredName: state.voiceName });
    const lang = urdu ? 'ur-PK' : voice?.lang || 'en-US';
    const patch: Partial<PlayerState> = { status: 'playing', index, currentId: chunk.id };
    if (voice && !urdu && voice.name !== state.voiceName) patch.voiceName = voice.name;
    set(patch);
    if (patch.voiceName) persist();

    const pieces = splitForSynthesis(chunk.text);
    pieces.forEach((piece, i) => {
      const u = new Utterance(piece);
      u.rate = state.rate;
      u.lang = lang;
      if (voice) u.voice = voice;
      const last = i === pieces.length - 1;
      u.onend = () => {
        if (mine !== generation || !last) return;
        cb.onStoryFinished?.(chunk.id);
        advanceFrom(index);
      };
      u.onerror = (e) => {
        if (mine !== generation) return;
        if (e.error === 'interrupted' || e.error === 'canceled') return;
        if (last) advanceFrom(index); // a voice that failed on this story: carry on with the next
      };
      synth.speak(u);
    });
    startTick();
  };

  const advanceFrom = (index: number) => {
    const next = index + 1;
    if (next >= queue.length) finish();
    else speakAt(next);
  };

  const play = (index?: number) => {
    if (!supported || queue.length === 0) return;
    if (index === undefined && state.status === 'paused') {
      resume();
      return;
    }
    if (state.status === 'idle' || state.status === 'done') cb.onPlay?.();
    const at = index ?? (state.status === 'done' ? 0 : currentIndex());
    speakAt(Math.min(Math.max(0, at), queue.length - 1));
  };

  const pause = () => {
    if (!synth || state.status !== 'playing') return;
    stopTick();
    synth.pause();
    set({ status: 'paused' });
  };

  const resume = () => {
    if (!synth || state.status !== 'paused') return;
    synth.resume();
    startTick();
    set({ status: 'playing' });
  };

  const next = () => {
    if (!supported || queue.length === 0) return;
    if (state.status === 'idle' || state.status === 'done') {
      play();
      return;
    }
    advanceFrom(currentIndex());
  };

  const prev = () => {
    if (!supported || queue.length === 0) return;
    if (state.status === 'idle' || state.status === 'done') {
      play();
      return;
    }
    speakAt(Math.max(0, currentIndex() - 1));
  };

  const stop = () => {
    if (activePlayer === self) activePlayer = null;
    cancelSpeech();
    set({ status: supported ? 'idle' : 'unsupported', index: 0, currentId: null });
  };

  const setRate = (rate: Rate) => {
    if (!supported || !isRate(rate) || rate === state.rate) return;
    set({ rate });
    persist();
    if (state.status === 'playing') speakAt(currentIndex()); // Chrome applies the rate only to new utterances
  };

  const setQueue = (nextQueue: ReadingChunk[]) => {
    queue = nextQueue;
    if (state.status !== 'playing' && state.status !== 'paused') {
      if (state.index >= queue.length) set({ index: Math.max(0, queue.length - 1) });
      return;
    }
    if (queue.length === 0) {
      stop();
      return;
    }
    const at = queue.findIndex((c) => c.id === state.currentId);
    if (at >= 0) {
      set({ index: at });
      return;
    }
    // The story being read was skipped: read what now sits in its place (the end, if nothing does).
    const wasPaused = state.status === 'paused';
    if (state.index >= queue.length) finish();
    else {
      speakAt(state.index);
      if (wasPaused) pause();
    }
  };

  const onVoicesChanged = () => {
    for (const l of [...listeners]) l();
  };
  let attached = false;
  const attach = () => {
    if (attached || !synth?.addEventListener) return;
    attached = true;
    synth.addEventListener('voiceschanged', onVoicesChanged);
  };

  const self: ReadAloudPlayer = {
    getState: () => state,
    getQueue: () => queue,
    subscribe(listener) {
      attach();
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setCallbacks(next) {
      cb = next;
    },
    setQueue,
    play,
    pause,
    resume,
    next,
    prev,
    stop,
    setRate,
    dispose() {
      stop();
      if (attached && synth?.removeEventListener) synth.removeEventListener('voiceschanged', onVoicesChanged);
      attached = false;
    },
  };
  return self;
}
