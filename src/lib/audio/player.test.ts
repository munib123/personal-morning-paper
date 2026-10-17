import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { createReadAloudPlayer, STALL_TICK_MS, type ReadAloudPlayer, type UtteranceLike } from './player';
import { AUDIO_PREFS_KEY, type StorageLike } from './prefs';
import type { ReadingChunk } from './queue';

class FakeUtterance implements UtteranceLike {
  text: string;
  lang = '';
  rate = 1;
  voice: SpeechSynthesisVoice | null = null;
  onstart: SpeechSynthesisUtterance['onstart'] = null;
  onend: SpeechSynthesisUtterance['onend'] = null;
  onerror: SpeechSynthesisUtterance['onerror'] = null;
  constructor(text = '') {
    this.text = text;
  }
}

const voice = (name: string, lang: string, extra: Partial<SpeechSynthesisVoice> = {}) =>
  ({ name, lang, default: false, localService: true, voiceURI: name, ...extra }) as SpeechSynthesisVoice;

class FakeSynth {
  pending: FakeUtterance[] = [];
  history: FakeUtterance[] = [];
  calls: string[] = [];
  paused = false;
  voices: SpeechSynthesisVoice[] = [voice('Microsoft Zira', 'en-US', { default: true }), voice('Google UK English Female', 'en-GB'), voice('Asad', 'ur-PK')];
  get speaking() {
    return this.pending.length > 0;
  }
  speak(u: UtteranceLike) {
    this.pending.push(u as FakeUtterance);
    this.history.push(u as FakeUtterance);
  }
  cancel() {
    this.calls.push('cancel');
    const dropped = this.pending.splice(0);
    this.paused = false;
    for (const u of dropped) u.onerror?.call(u as unknown as SpeechSynthesisUtterance, { error: 'interrupted' } as SpeechSynthesisErrorEvent);
  }
  pause() {
    this.calls.push('pause');
    this.paused = true;
  }
  resume() {
    this.calls.push('resume');
    this.paused = false;
  }
  getVoices() {
    return this.voices;
  }
  /** The browser finished the utterance at the head of its queue. */
  endNext() {
    const u = this.pending.shift();
    if (!u) throw new Error('nothing is speaking');
    u.onend?.call(u as unknown as SpeechSynthesisUtterance, {} as SpeechSynthesisEvent);
  }
  /** Ends every utterance queued right now (not what the player queues in response). */
  endStory() {
    const batch = this.pending.slice();
    for (const u of batch) {
      if (this.pending[0] !== u) break;
      this.endNext();
    }
  }
}

const chunk = (id: string, text: string, headline = id): ReadingChunk => ({ id, section: 'World', headline, text, words: text.split(' ').length, announceSection: false });
const LONG = Array.from({ length: 12 }, (_, i) => `Sentence number ${i + 1} of the long story is here.`).join(' ');
const QUEUE = [chunk('a', 'World. First headline. First summary.'), chunk('b', LONG), chunk('c', 'Third headline. Third summary.')];

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
}

let synth: FakeSynth;
let storage: ReturnType<typeof memoryStorage>;
let onStoryFinished: Mock<(id: string) => void>;
let onPlay: Mock<() => void>;
let player: ReadAloudPlayer;

function make(queue = QUEUE) {
  player = createReadAloudPlayer({ synth, Utterance: FakeUtterance, storage }, { onStoryFinished, onPlay });
  player.setQueue(queue);
  return player;
}

beforeEach(() => {
  vi.useFakeTimers();
  synth = new FakeSynth();
  storage = memoryStorage();
  onStoryFinished = vi.fn<(id: string) => void>();
  onPlay = vi.fn<() => void>();
});
afterEach(() => {
  player?.dispose();
  vi.useRealTimers();
});

describe('createReadAloudPlayer', () => {
  it('is unsupported without speechSynthesis, and then every control is a no-op', () => {
    const p = createReadAloudPlayer({ synth: null, Utterance: null, storage }, {});
    p.setQueue(QUEUE);
    expect(p.getState().status).toBe('unsupported');
    p.play();
    p.next();
    p.setRate(1.2);
    expect(p.getState()).toMatchObject({ status: 'unsupported', currentId: null });
    expect(onPlay).not.toHaveBeenCalled();
  });

  it('starts idle with the stored rate and voice', () => {
    storage = memoryStorage({ [AUDIO_PREFS_KEY]: JSON.stringify({ rate: 1.2, voiceName: 'Google UK English Female' }) });
    expect(make().getState()).toEqual({ status: 'idle', index: 0, currentId: null, rate: 1.2, voiceName: 'Google UK English Female' });
  });

  it('play speaks the first story in pieces, with the rate, an English voice and its lang, and reports onPlay once per session', () => {
    make().play();
    expect(player.getState()).toMatchObject({ status: 'playing', index: 0, currentId: 'a' });
    expect(synth.history.map((u) => u.text)).toEqual(['World. First headline. First summary.']);
    expect(synth.history[0].rate).toBe(1);
    expect(synth.history[0].voice?.name).toBe('Google UK English Female');
    expect(synth.history[0].lang).toBe('en-GB');
    expect(onPlay).toHaveBeenCalledTimes(1);
    // the auto-picked voice is remembered for next time
    expect(JSON.parse(storage.data[AUDIO_PREFS_KEY])).toEqual({ rate: 1, voiceName: 'Google UK English Female' });
  });

  it('moves to the next story when the last piece ends, calls onStoryFinished, and ends on done', () => {
    make().play();
    synth.endStory(); // story a
    expect(onStoryFinished).toHaveBeenCalledWith('a');
    expect(player.getState()).toMatchObject({ status: 'playing', index: 1, currentId: 'b' });
    const pieces = synth.pending.map((u) => u.text);
    expect(pieces.length).toBeGreaterThan(1); // the long story was split
    expect(pieces.join(' ')).toBe(LONG);
    synth.endNext(); // a middle piece finishing is not the end of the story
    expect(onStoryFinished).toHaveBeenCalledTimes(1);
    synth.endStory();
    expect(onStoryFinished).toHaveBeenCalledWith('b');
    synth.endStory();
    expect(onStoryFinished).toHaveBeenCalledWith('c');
    expect(player.getState()).toMatchObject({ status: 'done', currentId: null });
    // play again restarts from the top, as a new session
    player.play();
    expect(player.getState()).toMatchObject({ status: 'playing', index: 0, currentId: 'a' });
    expect(onPlay).toHaveBeenCalledTimes(2);
  });

  it('pause and resume map onto the synthesizer and do not fire onPlay again', () => {
    make().play();
    player.pause();
    expect(player.getState().status).toBe('paused');
    expect(synth.calls).toContain('pause');
    player.resume();
    expect(player.getState().status).toBe('playing');
    expect(synth.calls.at(-1)).toBe('resume');
    player.pause();
    player.play(); // play while paused resumes
    expect(player.getState().status).toBe('playing');
    expect(onPlay).toHaveBeenCalledTimes(1);
  });

  it('next and prev restart speech at the neighbouring story and ignore the cancelled utterance events', () => {
    make().play();
    player.next();
    expect(player.getState()).toMatchObject({ index: 1, currentId: 'b' });
    expect(onStoryFinished).not.toHaveBeenCalled(); // skipping is not finishing
    expect(synth.pending[0].text.startsWith('Sentence number 1')).toBe(true);
    player.prev();
    expect(player.getState()).toMatchObject({ index: 0, currentId: 'a' });
    player.prev(); // at the top: starts the first story again
    expect(player.getState()).toMatchObject({ index: 0, currentId: 'a', status: 'playing' });
    player.next();
    player.next();
    player.next(); // past the end
    expect(player.getState()).toMatchObject({ status: 'done', currentId: null });
  });

  it('stop cancels speech and returns to idle', () => {
    make().play();
    player.stop();
    expect(synth.calls).toContain('cancel');
    expect(synth.pending).toHaveLength(0);
    expect(player.getState()).toMatchObject({ status: 'idle', index: 0, currentId: null });
  });

  it('setRate persists and re-speaks the current story at the new rate; other values are ignored', () => {
    make().play();
    player.setRate(1.2);
    expect(player.getState().rate).toBe(1.2);
    expect(JSON.parse(storage.data[AUDIO_PREFS_KEY]).rate).toBe(1.2);
    expect(synth.pending[0].rate).toBe(1.2);
    expect(player.getState().currentId).toBe('a');
    player.setRate(2 as 1);
    expect(player.getState().rate).toBe(1.2);
  });

  it('nudges Chrome every 10 s while playing (the 15 s stall), not while paused or idle', () => {
    make().play();
    const before = synth.calls.filter((c) => c === 'resume').length;
    vi.advanceTimersByTime(STALL_TICK_MS);
    expect(synth.calls.filter((c) => c === 'resume').length).toBe(before + 1);
    player.pause();
    vi.advanceTimersByTime(STALL_TICK_MS * 3);
    expect(synth.calls.filter((c) => c === 'resume').length).toBe(before + 1);
    player.resume();
    player.stop();
    vi.advanceTimersByTime(STALL_TICK_MS * 3);
    expect(synth.calls.filter((c) => c === 'resume').length).toBe(before + 2); // just the resume() itself
  });

  it('reads Urdu text with an Urdu voice and lang', () => {
    make([chunk('u', 'دنیا۔ سرخی یہاں ہے۔ خلاصہ یہاں ہے۔')]).play();
    expect(synth.history[0].voice?.name).toBe('Asad');
    expect(synth.history[0].lang).toBe('ur-PK');
  });

  it('follows a changed queue: a skipped current story hands over to the story now in its place, an empty queue stops', () => {
    make().play();
    synth.endStory();
    expect(player.getState().currentId).toBe('b');
    player.setQueue([QUEUE[0], QUEUE[2]]); // b was skipped
    expect(player.getState()).toMatchObject({ status: 'playing', index: 1, currentId: 'c' });
    player.setQueue([QUEUE[2]]); // a was skipped too: same story, new position
    expect(player.getState()).toMatchObject({ status: 'playing', index: 0, currentId: 'c' });
    player.setQueue([]);
    expect(player.getState()).toMatchObject({ status: 'idle', currentId: null });
  });

  it('only one player speaks at a time: starting another stops the first', () => {
    make().play();
    const other = createReadAloudPlayer({ synth, Utterance: FakeUtterance, storage }, {});
    other.setQueue([chunk('z', 'Another story.')]);
    other.play();
    expect(other.getState()).toMatchObject({ status: 'playing', currentId: 'z' });
    expect(player.getState()).toMatchObject({ status: 'idle', currentId: null });
    expect(synth.pending.map((u) => u.text)).toEqual(['Another story.']);
    other.dispose();
  });

  it('notifies subscribers on every change and stops after unsubscribe', () => {
    const listener = vi.fn();
    const off = make().subscribe(listener);
    player.play();
    expect(listener).toHaveBeenCalled();
    const n = listener.mock.calls.length;
    off();
    player.pause();
    expect(listener).toHaveBeenCalledTimes(n);
  });
});
