import { describe, expect, it } from 'vitest';
import { AUDIO_PREFS_KEY, DEFAULT_AUDIO_PREFS, loadAudioPrefs, saveAudioPrefs, type StorageLike } from './prefs';

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

describe('audio prefs', () => {
  it('defaults when nothing is stored, the storage is missing, or the value is garbage', () => {
    expect(loadAudioPrefs(null)).toEqual(DEFAULT_AUDIO_PREFS);
    expect(loadAudioPrefs(memoryStorage())).toEqual(DEFAULT_AUDIO_PREFS);
    expect(loadAudioPrefs(memoryStorage({ [AUDIO_PREFS_KEY]: '{nope' }))).toEqual(DEFAULT_AUDIO_PREFS);
    expect(loadAudioPrefs(memoryStorage({ [AUDIO_PREFS_KEY]: JSON.stringify({ rate: 3, voiceName: 7 }) }))).toEqual(DEFAULT_AUDIO_PREFS);
  });

  it('round-trips the rate and the voice name under subah.audio.v1', () => {
    const storage = memoryStorage();
    saveAudioPrefs(storage, { rate: 1.2, voiceName: 'Google UK English Female' });
    expect(AUDIO_PREFS_KEY).toBe('subah.audio.v1');
    expect(JSON.parse(storage.data[AUDIO_PREFS_KEY])).toEqual({ rate: 1.2, voiceName: 'Google UK English Female' });
    expect(loadAudioPrefs(storage)).toEqual({ rate: 1.2, voiceName: 'Google UK English Female' });
  });

  it('never throws when the storage throws (private mode, quota)', () => {
    const broken: StorageLike = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(loadAudioPrefs(broken)).toEqual(DEFAULT_AUDIO_PREFS);
    expect(() => saveAudioPrefs(broken, { rate: 0.9, voiceName: null })).not.toThrow();
  });
});
