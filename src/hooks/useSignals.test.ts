// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FIXTURE_EVENTS_RESULT } from '@/contracts/fixtures';
import type { SignalEvent } from '@/contracts/signals';

const live = vi.hoisted(() => ({ publishStreak: vi.fn() }));
vi.mock('@/components/streak/live', () => ({ publishStreak: live.publishStreak, useLiveStreak: (s: unknown) => s ?? null }));

import { createSignalQueue, useSignals } from './useSignals';

type Init = { method: string; keepalive?: boolean; headers: Record<string, string>; body: string };
type FakeResponse = { ok: boolean; status: number; json: () => Promise<unknown> };
const fetchMock = vi.fn<(url: string, init: Init) => Promise<FakeResponse>>();
const ok = (body: unknown = FIXTURE_EVENTS_RESULT): FakeResponse => ({ ok: true, status: 200, json: async () => body });
const sent = (i: number) => (JSON.parse(fetchMock.mock.calls[i][1].body) as { events: SignalEvent[] }).events;
const allSent = () => fetchMock.mock.calls.flatMap((_, i) => sent(i));
const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

let visibility: DocumentVisibilityState = 'visible';
const setVisibility = (v: DocumentVisibilityState) => {
  visibility = v;
  document.dispatchEvent(new Event('visibilitychange'));
};

beforeEach(() => {
  vi.useFakeTimers();
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => ok());
  vi.stubGlobal('fetch', fetchMock);
  live.publishStreak.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'sendBeacon');
});

describe('createSignalQueue', () => {
  it('flushes every 2 s, stamping the edition id', async () => {
    const q = createSignalQueue({ editionId: 'ed-1' });
    q.push({ type: 'open', articleId: 'a', meta: { mode: 'sheet' } });
    q.push({ type: 'save', articleId: 'b' });
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/events');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/json' } });
    expect(sent(0)).toHaveLength(2);
    expect(sent(0).every((e) => e.editionId === 'ed-1')).toBe(true);
    q.dispose();
  });

  it('chunks at 50', async () => {
    const q = createSignalQueue({ editionId: null });
    for (let i = 0; i < 120; i++) q.push({ type: 'impression', articleId: `a${i}` });
    await q.flush();
    expect(fetchMock.mock.calls.map((_, i) => sent(i).length)).toEqual([50, 50, 20]);
    q.dispose();
  });

  it('caps the queue at 200, dropping the oldest', async () => {
    const q = createSignalQueue({ editionId: null });
    for (let i = 0; i < 250; i++) q.push({ type: 'impression', articleId: `a${i}` });
    await q.flush();
    expect(allSent()).toHaveLength(200);
    expect(allSent()[0].articleId).toBe('a50');
    q.dispose();
  });

  it('failed fetch requeues the same events', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    const q = createSignalQueue({ editionId: null });
    q.push({ type: 'save', articleId: 'a' });
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sent(1)).toEqual([{ type: 'save', articleId: 'a' }]);
    q.dispose();
  });

  it('keepalive and beacon modes', async () => {
    const q = createSignalQueue({ editionId: null });
    q.push({ type: 'save', articleId: 'a' });
    await q.flush('keepalive');
    expect(fetchMock.mock.calls[0][1].keepalive).toBe(true);
    const sendBeacon = vi.fn<(url: string, data?: BodyInit | null) => boolean>(() => true);
    Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: sendBeacon });
    q.push({ type: 'save', articleId: 'b' });
    await q.flush('beacon');
    expect(sendBeacon).toHaveBeenCalledWith('/api/events', expect.any(Blob));
    expect(JSON.parse(await (sendBeacon.mock.calls[0][1] as Blob).text())).toEqual({ events: [{ type: 'save', articleId: 'b' }] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    q.dispose();
  });

  it('hands on a schema-checked result and ignores an invalid body', async () => {
    const onResult = vi.fn();
    const q = createSignalQueue({ editionId: null, onResult });
    q.push({ type: 'save', articleId: 'a' });
    await q.flush();
    expect(onResult).toHaveBeenCalledWith(FIXTURE_EVENTS_RESULT);
    fetchMock.mockImplementationOnce(async () => ok({ accepted: 'many' }));
    q.push({ type: 'save', articleId: 'b' });
    await q.flush();
    fetchMock.mockImplementationOnce(async () => ({ ok: false, status: 401, json: async () => ({ error: 'unauthorized' }) }));
    q.push({ type: 'save', articleId: 'c' });
    await q.flush();
    expect(onResult).toHaveBeenCalledTimes(1);
    q.dispose();
  });

  it('does nothing when there is nothing to send', async () => {
    const q = createSignalQueue({ editionId: null });
    await q.flush();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock).not.toHaveBeenCalled();
    q.dispose();
  });
});

describe('useSignals', () => {
  it('hidden flushes with keepalive', async () => {
    const { result, unmount } = renderHook(() => useSignals('ed-1'));
    act(() => result.current.track({ type: 'save', articleId: 'a' }));
    await act(async () => setVisibility('hidden'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].keepalive).toBe(true);
    unmount();
  });

  it('lastResult and live streak, once per flush with a valid result', async () => {
    const { result, unmount } = renderHook(() => useSignals('ed-1'));
    act(() => result.current.track({ type: 'save', articleId: 'a' }));
    await advance(2000);
    expect(result.current.lastResult).toEqual(FIXTURE_EVENTS_RESULT);
    expect(live.publishStreak).toHaveBeenCalledTimes(1);
    expect(live.publishStreak).toHaveBeenCalledWith(FIXTURE_EVENTS_RESULT.streak);
    fetchMock.mockImplementationOnce(async () => ok({ nope: true }));
    act(() => result.current.track({ type: 'save', articleId: 'b' }));
    await advance(2000);
    expect(live.publishStreak).toHaveBeenCalledTimes(1);
    expect(result.current.lastResult).toEqual(FIXTURE_EVENTS_RESULT);
    unmount();
  });

  it('dwell pauses while hidden', async () => {
    const { result, unmount } = renderHook(() => useSignals(null));
    let stop = () => {};
    act(() => {
      stop = result.current.startDwell('a1', 'bytes');
    });
    await advance(3000);
    act(() => setVisibility('hidden'));
    await advance(5000);
    act(() => setVisibility('visible'));
    await advance(1000);
    act(() => {
      stop();
      stop();
    });
    await advance(2000);
    expect(allSent()).toEqual([{ type: 'dwell', articleId: 'a1', value: 4000, meta: { mode: 'bytes' } }]);
    unmount();
  });
});
