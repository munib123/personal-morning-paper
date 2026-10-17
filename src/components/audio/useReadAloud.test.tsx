// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FIXTURE_EDITION } from '@/contracts/fixtures';
import { AUDIO_PREFS_KEY } from '@/lib/audio/prefs';
import { buildReadingQueue } from '@/lib/audio/queue';
import { FakeSynth, FakeUtterance } from './fake-speech';
import { useReadAloud } from './useReadAloud';

const queue = buildReadingQueue(FIXTURE_EDITION.items.slice(0, 3), { sectionNames: FIXTURE_EDITION.sectionNames });
let synth: FakeSynth;

beforeEach(() => {
  synth = new FakeSynth();
  vi.stubGlobal('speechSynthesis', synth);
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useReadAloud', () => {
  it('is unsupported (and inert) without speechSynthesis', () => {
    vi.unstubAllGlobals();
    const { result } = renderHook(() => useReadAloud(queue));
    expect(result.current.supported).toBe(false);
    expect(result.current.status).toBe('unsupported');
    act(() => result.current.play());
    expect(result.current.status).toBe('unsupported');
  });

  it('plays, reports the current story, calls onStoryFinished at the end of a story and persists the rate', () => {
    const onStoryFinished = vi.fn();
    const onPlay = vi.fn();
    const { result } = renderHook(() => useReadAloud(queue, { onStoryFinished, onPlay }));
    expect(result.current.supported).toBe(true);
    expect(result.current.minutes).toBeGreaterThan(0);
    act(() => result.current.play());
    expect(result.current.status).toBe('playing');
    expect(result.current.current?.id).toBe(queue[0].id);
    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(synth.history.length).toBeGreaterThan(0);

    act(() => synth.endStory());
    expect(onStoryFinished).toHaveBeenCalledWith(queue[0].id);
    expect(result.current.current?.id).toBe(queue[1].id);

    act(() => result.current.toggle());
    expect(result.current.status).toBe('paused');
    act(() => result.current.toggle());
    expect(result.current.status).toBe('playing');

    act(() => result.current.setRate(1.2));
    expect(result.current.rate).toBe(1.2);
    expect(JSON.parse(window.localStorage.getItem(AUDIO_PREFS_KEY) ?? '{}')).toMatchObject({ rate: 1.2, voiceName: 'Google UK English Female' });

    act(() => result.current.stop());
    expect(result.current.status).toBe('idle');
  });

  it('stops speaking when the component unmounts', () => {
    const { result, unmount } = renderHook(() => useReadAloud(queue));
    act(() => result.current.play());
    expect(synth.pending.length).toBeGreaterThan(0);
    unmount();
    expect(synth.pending).toHaveLength(0);
  });
});
