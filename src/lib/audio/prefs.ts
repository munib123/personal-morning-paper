// The reader's listening preferences in localStorage (rate and voice), under "subah.audio.v1".
// Every read and write is wrapped: storage can be missing, blocked or full, and the paper must still read.

export type Rate = 0.9 | 1 | 1.2;
export const RATES: readonly Rate[] = [0.9, 1, 1.2];

export interface AudioPrefs {
  rate: Rate;
  voiceName: string | null;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const AUDIO_PREFS_KEY = 'subah.audio.v1';
export const DEFAULT_AUDIO_PREFS: AudioPrefs = { rate: 1, voiceName: null };

export function isRate(value: unknown): value is Rate {
  return typeof value === 'number' && (RATES as readonly number[]).includes(value);
}

export function loadAudioPrefs(storage: StorageLike | null | undefined): AudioPrefs {
  if (!storage) return DEFAULT_AUDIO_PREFS;
  try {
    const raw = storage.getItem(AUDIO_PREFS_KEY);
    if (!raw) return DEFAULT_AUDIO_PREFS;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return DEFAULT_AUDIO_PREFS;
    const { rate, voiceName } = parsed as Record<string, unknown>;
    return {
      rate: isRate(rate) ? rate : DEFAULT_AUDIO_PREFS.rate,
      voiceName: typeof voiceName === 'string' && voiceName ? voiceName : null,
    };
  } catch {
    return DEFAULT_AUDIO_PREFS;
  }
}

export function saveAudioPrefs(storage: StorageLike | null | undefined, prefs: AudioPrefs): void {
  if (!storage) return;
  try {
    storage.setItem(AUDIO_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Private mode or quota: the paper still reads, the preference just does not stick.
  }
}

/** window.localStorage when it is usable, else null (SSR, blocked storage). */
export function safeLocalStorage(): StorageLike | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}
