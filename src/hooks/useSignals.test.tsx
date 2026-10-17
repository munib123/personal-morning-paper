// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROUTES } from '@/contracts/api';
import { FIXTURE_EVENTS_RESULT } from '@/contracts/fixtures';
import type { SignalEvent } from '@/contracts/signals';
import { publishStreak, useLiveStreak } from '@/components/streak/live';
import { useSignals } from './useSignals';

interface FetchInit {
  method: string;
  keepalive: boolean;
  headers: Record<string, string>;
  body: string;
}
const fetchMock = vi.fn<(url: string, init: FetchInit) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>>(async () => ({
  ok: true,
  status: 200,
  json: async () => FIXTURE_EVENTS_RESULT,
}));
const bodyOf = (call: number) => JSON.parse(fetchMock.mock.calls[call][1].body) as { events: SignalEvent[] };
const tick = (ms = 2000) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

let visibility: DocumentVisibilityState = 'visible';
const setVisibility = (v: DocumentVisibilityState) => {
  visibility = v;
  document.dispatchEvent(new Event('visibilitychange'));
};

// Minimal IntersectionObserver (jsdom has none): tests push entries through emit().
class FakeIntersectionObserver {
  static last: FakeIntersectionObserver | null = null;
  readonly observed = new Set<Element>();
  constructor(
    readonly callback: IntersectionObserverCallback,
    readonly options?: IntersectionObserverInit,
  ) {
    FakeIntersectionObserver.last = this;
  }
  observe(el: Element) {
    this.observed.add(el);
  }
  unobserve(el: Element) {
    this.observed.delete(el);
  }
  disconnect() {
    this.observed.clear();
  }
  takeRecords() {
    return [];
  }
  emit(el: Element, ratio: number) {
    const entry = { target: el, isIntersecting: ratio > 0, intersectionRatio: ratio } as unknown as IntersectionObserverEntry;
    this.callback([entry], this as unknown as IntersectionObserver);
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup(); // unmount first: the hook flushes on teardown while fetch is still stubbed
  vi.useRealTimers();
  vi.unstubAllGlobals();
  fetchMock.mockClear();
  Reflect.deleteProperty(navigator, 'sendBeacon');
});

describe('useSignals', () => {
  it('batches tracked events into one POST to ROUTES.events every 2 s, then publishes the streak', async () => {
    function StreakProbe() {
      const s = useLiveStreak(null);
      return <output data-testid="streak">{s ? JSON.stringify(s) : 'none'}</output>;
    }
    render(<StreakProbe />);
    const stale = { ...FIXTURE_EVENTS_RESULT.streak, current: 999 };
    act(() => publishStreak(stale)); // a known, different starting value
    expect(screen.getByTestId('streak').textContent).toBe(JSON.stringify(stale));

    const { result } = renderHook(() => useSignals(null));
    act(() => {
      result.current.track({ type: 'open', articleId: 'a' });
      result.current.track({ type: 'open', articleId: 'a' });
    });
    await tick(1999);
    expect(fetchMock).not.toHaveBeenCalled();
    await tick(1);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(ROUTES.events);
    // A timed flush is a plain fetch; keepalive is kept for hidden-tab and teardown flushes.
    expect(init).toMatchObject({ method: 'POST', keepalive: false, headers: { 'Content-Type': 'application/json' } });
    expect(bodyOf(0)).toEqual({ events: [{ type: 'open', articleId: 'a' }, { type: 'open', articleId: 'a' }] });
    expect(result.current.lastResult).toEqual(FIXTURE_EVENTS_RESULT);
    expect(screen.getByTestId('streak').textContent).toBe(JSON.stringify(FIXTURE_EVENTS_RESULT.streak));
  });

  it('does not POST when nothing was tracked', async () => {
    renderHook(() => useSignals(null));
    await tick(6000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stamps the editionId and splits more than 50 events into batches of at most 50', async () => {
    const { result } = renderHook(() => useSignals('ed-1'));
    act(() => {
      for (let i = 0; i < 51; i++) result.current.track({ type: 'impression', articleId: `a${i}` });
    });
    await tick();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bodyOf(0).events).toHaveLength(50);
    expect(bodyOf(0).events.every((e) => e.editionId === 'ed-1')).toBe(true);
    expect(bodyOf(1).events).toEqual([{ type: 'impression', articleId: 'a50', editionId: 'ed-1' }]);
  });

  it('flushes at once on visibilitychange', async () => {
    const { result } = renderHook(() => useSignals(null));
    act(() => result.current.track({ type: 'save', articleId: 'a' }));
    await act(async () => setVisibility('hidden'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(bodyOf(0)).toEqual({ events: [{ type: 'save', articleId: 'a' }] });
  });

  it('hands the queue to sendBeacon on pagehide, closing open dwells first', async () => {
    const sendBeacon = vi.fn<(url: string, data?: BodyInit | null) => boolean>(() => true);
    Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: sendBeacon });
    const { result } = renderHook(() => useSignals('ed-1'));
    act(() => {
      result.current.track({ type: 'pdf_download' });
      result.current.startDwell('a');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500); // before the 2 s flush
      window.dispatchEvent(new Event('pagehide'));
    });

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    const [url, blob] = sendBeacon.mock.calls[0];
    expect(url).toBe(ROUTES.events);
    expect(JSON.parse(await (blob as Blob).text())).toEqual({
      events: [
        { type: 'pdf_download', editionId: 'ed-1' },
        { type: 'dwell', articleId: 'a', value: 1500, meta: { mode: 'sheet' }, editionId: 'ed-1' },
      ],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('startDwell emits one dwell with the visible time only', async () => {
    const { result } = renderHook(() => useSignals(null));
    let stopSheet = () => {};
    let stopBytes = () => {};
    act(() => {
      stopSheet = result.current.startDwell('a');
    });
    await tick(3000); // visible
    act(() => setVisibility('hidden'));
    await tick(5000); // hidden: not counted
    act(() => setVisibility('visible'));
    await tick(2000); // visible
    act(() => {
      stopSheet();
      stopSheet(); // idempotent
      stopBytes = result.current.startDwell('b', 'bytes');
    });
    await tick(500);
    act(() => stopBytes());
    await tick(2000);

    const sent = fetchMock.mock.calls.flatMap((_, i) => bodyOf(i).events);
    expect(sent).toEqual([
      { type: 'dwell', articleId: 'a', value: 5000, meta: { mode: 'sheet' } },
      { type: 'dwell', articleId: 'b', value: 500, meta: { mode: 'bytes' } },
    ]);
  });

  it('observeImpression emits one impression per article after 1 s at 50% in view, with meta.slot', async () => {
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
    const { result } = renderHook(() => useSignals(null));
    const lead = document.createElement('article');
    lead.dataset.slot = 'lead';
    const brief = document.createElement('article');
    act(() => {
      result.current.observeImpression(lead, 'a');
      result.current.observeImpression(brief, 'b');
    });
    const io = FakeIntersectionObserver.last!;
    expect(io.options?.threshold).toBe(0.5);

    act(() => io.emit(brief, 0.6));
    await tick(500);
    act(() => io.emit(brief, 0.2)); // dropped under 50% before the second was up: no impression
    act(() => io.emit(lead, 0.6)); // t=500: lead's timer is due at t=1500
    await act(async () => {
      // An inline ref callback on re-render: null, then the same element. The timer must survive.
      result.current.observeImpression(null, 'a');
      result.current.observeImpression(lead, 'a');
    });
    expect(io.observed.has(lead)).toBe(true);
    await tick(1000); // t=1500: the impression is queued, which arms the 2 s flush timer
    expect(fetchMock).not.toHaveBeenCalled();
    await tick(2000); // t=3500: the flush sends it

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(bodyOf(0)).toEqual({ events: [{ type: 'impression', articleId: 'a', meta: { slot: 'lead' } }] });
    expect(io.observed.has(lead)).toBe(false);

    await act(async () => result.current.observeImpression(null, 'b')); // a real detach (unmount)
    expect(io.observed.has(brief)).toBe(false);

    act(() => {
      result.current.observeImpression(lead, 'a'); // already seen: ignored
      io.emit(lead, 1);
    });
    await tick(4000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
