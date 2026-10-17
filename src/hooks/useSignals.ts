// STUB (L0) — owner: L4. Replace freely; keep the signature.
// Reading signals (ARCHITECTURE §9.4, §9.7). Events are queued and POSTed to /api/events in batches
// of at most 50: every 2 s, on visibilitychange, and with sendBeacon on pagehide. Each successful
// flush sets lastResult and publishes the streak to the live channel, so StreakChip updates at once.
import { useEffect, useMemo, useState } from 'react';
import { ROUTES } from '@/contracts/api';
import type { EventsResult, SignalEvent } from '@/contracts/signals';
import { publishStreak } from '@/components/streak/live';

type DwellMode = 'sheet' | 'bytes';

const FLUSH_MS = 2000;
const MAX_BATCH = 50; // SignalBatchSchema accepts at most 50 events per request
const MAX_QUEUE = 500; // offline guard: past this the oldest events are dropped
const IMPRESSION_MS = 1000; // at least 1 s in view…
const IMPRESSION_RATIO = 0.5; // …with at least half of the card visible
const JSON_HEADERS = { 'Content-Type': 'application/json' };

interface SignalsEngine {
  track: (e: SignalEvent) => void;
  observeImpression: (el: Element | null, articleId: string) => void;
  startDwell: (articleId: string, mode?: DwellMode) => () => void;
  setEditionId: (id: string | null) => void;
  /** Starts the flush timer and page listeners; returns the teardown (which flushes what is left). */
  start: () => () => void;
}

// All mutable state lives here, outside React, so the hook's functions are stable across renders.
// Nothing touches window or document until a method is called, so creating it during SSR is safe.
function createSignalsEngine(onResult: (r: EventsResult) => void, initialEditionId: string | null): SignalsEngine {
  let editionId = initialEditionId;
  let queue: SignalEvent[] = [];
  const dwells = new Set<() => void>(); // stop() of every running dwell
  const seen = new Set<string>(); // article ids that already have an impression
  const watched = new Map<string, Element>(); // article id → observed element
  const ids = new Map<Element, string>(); // observed element → article id
  const timers = new Map<Element, ReturnType<typeof setTimeout>>();
  let io: IntersectionObserver | null = null;

  const isHidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';
  const now = () => performance.now();

  const track = (e: SignalEvent) => {
    queue.push(e.editionId || !editionId ? e : { ...e, editionId });
    if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
  };

  const takeBatches = (): SignalEvent[][] => {
    const batches: SignalEvent[][] = [];
    for (let i = 0; i < queue.length; i += MAX_BATCH) batches.push(queue.slice(i, i + MAX_BATCH));
    queue = [];
    return batches;
  };

  const send = async (events: SignalEvent[]) => {
    let res: Response;
    try {
      res = await fetch(ROUTES.events, { method: 'POST', keepalive: true, headers: JSON_HEADERS, body: JSON.stringify({ events }) });
    } catch {
      queue = [...events, ...queue].slice(-MAX_QUEUE); // network error: retry on the next tick
      return;
    }
    if (!res.ok) return; // the server rejected the batch: drop it rather than retry forever
    let result: EventsResult;
    try {
      result = (await res.json()) as EventsResult;
    } catch {
      return;
    }
    if (!result || typeof result !== 'object') return;
    onResult(result);
    if (result.streak) publishStreak(result.streak);
  };

  const flush = () => {
    for (const batch of takeBatches()) void send(batch);
  };

  const stopAllDwells = () => {
    for (const stop of [...dwells]) stop();
  };

  // pagehide: close open dwells, then hand the queue to sendBeacon (keepalive fetch if it refuses).
  const beacon = () => {
    stopAllDwells();
    for (const events of takeBatches()) {
      const body = JSON.stringify({ events });
      const queued = typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(ROUTES.events, new Blob([body], { type: 'application/json' }));
      if (!queued) void fetch(ROUTES.events, { method: 'POST', keepalive: true, headers: JSON_HEADERS, body }).catch(() => undefined);
    }
  };

  const clearTimer = (el: Element) => {
    const t = timers.get(el);
    if (t === undefined) return;
    clearTimeout(t);
    timers.delete(el);
  };

  const unwatch = (el: Element) => {
    clearTimer(el);
    io?.unobserve(el);
    const id = ids.get(el);
    ids.delete(el);
    if (id !== undefined && watched.get(id) === el) watched.delete(id);
  };

  const fire = (el: Element) => {
    timers.delete(el);
    const articleId = ids.get(el);
    if (articleId === undefined || seen.has(articleId)) return;
    if (isHidden()) {
      timers.set(el, setTimeout(() => fire(el), IMPRESSION_MS)); // in view but the tab is hidden: wait
      return;
    }
    seen.add(articleId);
    const slot = (el as HTMLElement).dataset?.slot;
    track(slot ? { type: 'impression', articleId, meta: { slot } } : { type: 'impression', articleId });
    unwatch(el);
  };

  const onEntries = (entries: IntersectionObserverEntry[]) => {
    for (const entry of entries) {
      const el = entry.target;
      if (!ids.has(el)) continue;
      if (entry.isIntersecting && entry.intersectionRatio >= IMPRESSION_RATIO) {
        if (!timers.has(el)) timers.set(el, setTimeout(() => fire(el), IMPRESSION_MS));
      } else {
        clearTimer(el); // left the viewport (or fell under 50%) before the second was up
      }
    }
  };

  // Use as a ref callback: ref={(el) => observeImpression(el, id)}. An inline callback is called with
  // null and then the same element on every re-render, so a null only detaches after the commit
  // (a microtask later) unless the same element comes straight back; its 1 s timer keeps running.
  const detaching = new Map<string, Element>();
  const observeImpression = (el: Element | null, articleId: string) => {
    const prev = watched.get(articleId);
    if (el === null) {
      if (!prev) return;
      detaching.set(articleId, prev);
      queueMicrotask(() => {
        const leaving = detaching.get(articleId);
        if (!leaving) return;
        detaching.delete(articleId);
        unwatch(leaving);
      });
      return;
    }
    detaching.delete(articleId);
    if (prev && prev !== el) unwatch(prev);
    if (prev === el || seen.has(articleId) || typeof IntersectionObserver === 'undefined') return;
    io ??= new IntersectionObserver(onEntries, { threshold: IMPRESSION_RATIO });
    watched.set(articleId, el);
    ids.set(el, articleId);
    io.observe(el);
  };

  const startDwell = (articleId: string, mode: DwellMode = 'sheet') => {
    let total = 0;
    let since: number | null = isHidden() ? null : now();
    let stopped = false;
    const onVisibility = () => {
      if (isHidden()) {
        if (since !== null) total += now() - since;
        since = null;
      } else if (since === null) {
        since = now();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    const stop = () => {
      if (stopped) return;
      stopped = true;
      document.removeEventListener('visibilitychange', onVisibility);
      dwells.delete(stop);
      if (since !== null) total += now() - since;
      track({ type: 'dwell', articleId, value: Math.round(total), meta: { mode } });
    };
    dwells.add(stop);
    return stop;
  };

  const start = () => {
    const interval = setInterval(flush, FLUSH_MS);
    const onVisibility = () => flush();
    const onPageHide = () => beacon();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      stopAllDwells();
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
      io?.disconnect();
      io = null;
      watched.clear();
      ids.clear();
      detaching.clear();
      flush(); // keepalive lets this last batch outlive the page
    };
  };

  return {
    track,
    observeImpression,
    startDwell,
    setEditionId: (id) => {
      editionId = id;
    },
    start,
  };
}

export function useSignals(editionId: string | null): {
  track: (e: SignalEvent) => void; // queued; flushed every 2 s, on visibilitychange, and via sendBeacon on pagehide
  lastResult: EventsResult | null; // streak and deltas, for chips and toasts
  observeImpression: (el: Element | null, articleId: string) => void; // ≥1 s in viewport → 'impression' (once); meta.slot from el.dataset.slot
  startDwell: (articleId: string, mode?: 'sheet' | 'bytes') => () => void; // default 'sheet'; stop() emits 'dwell' {value: ms, meta.mode} (paused while hidden)
} {
  const [lastResult, setLastResult] = useState<EventsResult | null>(null);
  const [engine] = useState(() => createSignalsEngine(setLastResult, editionId));

  useEffect(() => {
    engine.setEditionId(editionId);
  }, [engine, editionId]);

  useEffect(() => engine.start(), [engine]);

  return useMemo(
    () => ({ track: engine.track, lastResult, observeImpression: engine.observeImpression, startDwell: engine.startDwell }),
    [engine, lastResult],
  );
}
