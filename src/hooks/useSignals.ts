// Reading signals (ARCHITECTURE §9.4, §9.7). L0 created this hook; L4 owns it (same signature).
// Events are queued and POSTed to /api/events in batches of at most 50: every 2 s, at once (keepalive)
// when the tab is hidden, and with sendBeacon on pagehide. Every flush that returns a valid
// EventsResult sets lastResult and publishes the streak on the live channel, so StreakChip updates.
import { useEffect, useMemo, useState } from 'react';
import { EventsResultSchema, ROUTES } from '@/contracts/api';
import type { EventsResult, SignalEvent } from '@/contracts/signals';
import { publishStreak } from '@/components/streak/live';

type DwellMode = 'sheet' | 'bytes';
export type FlushMode = 'fetch' | 'keepalive' | 'beacon';

const FLUSH_MS = 2000;
const MAX_BATCH = 50; // SignalBatchSchema accepts at most 50 events per request
const MAX_QUEUE = 200; // offline guard: past this the oldest events are dropped
const IMPRESSION_MS = 1000; // at least 1 s in view…
const IMPRESSION_RATIO = 0.5; // …with at least half of the card visible
const JSON_HEADERS = { 'Content-Type': 'application/json' };

export interface SignalQueue {
  push(e: SignalEvent): void;
  flush(mode?: FlushMode): Promise<void>;
  dispose(): void;
  setEditionId(id: string | null): void;
}

/**
 * The batching queue on its own (no React). Its 2 s timer starts with the first push, so nothing runs
 * on the server or before anything is tracked; dispose() stops it (a later push re-arms it).
 */
export function createSignalQueue(opts: {
  editionId: string | null;
  endpoint?: string;
  intervalMs?: number;
  onResult?: (r: EventsResult) => void;
}): SignalQueue {
  const endpoint = opts.endpoint ?? ROUTES.events;
  const intervalMs = opts.intervalMs ?? FLUSH_MS;
  let editionId = opts.editionId;
  let queue: SignalEvent[] = [];
  let timer: ReturnType<typeof setInterval> | null = null;

  const cap = () => {
    if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
  };

  const take = (): SignalEvent[][] => {
    const batches: SignalEvent[][] = [];
    for (let i = 0; i < queue.length; i += MAX_BATCH) batches.push(queue.slice(i, i + MAX_BATCH));
    queue = [];
    return batches;
  };

  const send = async (events: SignalEvent[], keepalive: boolean) => {
    let res: Response;
    try {
      res = await fetch(endpoint, { method: 'POST', keepalive, headers: JSON_HEADERS, body: JSON.stringify({ events }) });
    } catch {
      queue = [...events, ...queue]; // network error: retry on the next tick
      cap();
      return;
    }
    if (!res.ok) return; // rejected (401 in the preview, 400 on a bad batch): drop it rather than retry forever
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return;
    }
    const parsed = EventsResultSchema.safeParse(body);
    if (parsed.success) opts.onResult?.(parsed.data);
  };

  const flush = async (mode: FlushMode = 'fetch') => {
    const batches = take();
    if (batches.length === 0) return;
    if (mode === 'beacon') {
      for (const events of batches) {
        const body = JSON.stringify({ events });
        const queued =
          typeof navigator !== 'undefined' &&
          typeof navigator.sendBeacon === 'function' &&
          navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }));
        if (!queued) void fetch(endpoint, { method: 'POST', keepalive: true, headers: JSON_HEADERS, body }).catch(() => undefined);
      }
      return;
    }
    await Promise.all(batches.map((events) => send(events, mode === 'keepalive')));
  };

  const push = (e: SignalEvent) => {
    queue.push(e.editionId || !editionId ? e : { ...e, editionId });
    cap();
    if (timer === null && intervalMs > 0) timer = setInterval(() => void flush('fetch'), intervalMs);
  };

  const dispose = () => {
    if (timer !== null) clearInterval(timer);
    timer = null;
  };

  return {
    push,
    flush,
    dispose,
    setEditionId: (id) => {
      editionId = id;
    },
  };
}

interface SignalsEngine {
  track: (e: SignalEvent) => void;
  observeImpression: (el: Element | null, articleId: string) => void;
  startDwell: (articleId: string, mode?: DwellMode) => () => void;
  setEditionId: (id: string | null) => void;
  /** Adds the page listeners; returns the teardown (which flushes what is left). */
  start: () => () => void;
}

// All mutable state lives here, outside React, so the hook's functions are stable across renders.
// Nothing touches window or document until a method is called, so creating it during SSR is safe.
function createSignalsEngine(onResult: (r: EventsResult) => void, initialEditionId: string | null): SignalsEngine {
  const queue = createSignalQueue({ editionId: initialEditionId, onResult });
  const dwells = new Set<() => void>(); // stop() of every running dwell
  const seen = new Set<string>(); // article ids that already have an impression
  const watched = new Map<string, Element>(); // article id → observed element
  const ids = new Map<Element, string>(); // observed element → article id
  const timers = new Map<Element, ReturnType<typeof setTimeout>>();
  let io: IntersectionObserver | null = null;

  const isHidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';
  const now = () => performance.now();
  const track = (e: SignalEvent) => queue.push(e);

  const stopAllDwells = () => {
    for (const stop of [...dwells]) stop();
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
    const onVisibility = () => {
      if (isHidden()) void queue.flush('keepalive');
    };
    const onPageHide = () => {
      stopAllDwells();
      void queue.flush('beacon');
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
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
      void queue.flush('keepalive'); // keepalive lets this last batch outlive the page
      queue.dispose();
    };
  };

  return { track, observeImpression, startDwell, setEditionId: queue.setEditionId, start };
}

export function useSignals(editionId: string | null): {
  track: (e: SignalEvent) => void; // queued; flushed every 2 s, on visibilitychange, and via sendBeacon on pagehide
  lastResult: EventsResult | null; // streak and deltas, for chips and toasts
  observeImpression: (el: Element | null, articleId: string) => void; // ≥1 s in viewport → 'impression' (once); meta.slot from el.dataset.slot
  startDwell: (articleId: string, mode?: 'sheet' | 'bytes') => () => void; // default 'sheet'; stop() emits 'dwell' {value: ms, meta.mode} (paused while hidden)
} {
  const [lastResult, setLastResult] = useState<EventsResult | null>(null);
  const [engine] = useState(() =>
    createSignalsEngine((r) => {
      setLastResult(r);
      publishStreak(r.streak);
    }, editionId),
  );

  useEffect(() => {
    engine.setEditionId(editionId);
  }, [engine, editionId]);

  useEffect(() => engine.start(), [engine]);

  return useMemo(
    () => ({ track: engine.track, lastResult, observeImpression: engine.observeImpression, startDwell: engine.startDwell }),
    [engine, lastResult],
  );
}
