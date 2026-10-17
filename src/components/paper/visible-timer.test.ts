// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createVisibleTimer } from './visible-timer';

let visibility: DocumentVisibilityState = 'visible';
const setVisibility = (v: DocumentVisibilityState) => {
  visibility = v;
  document.dispatchEvent(new Event('visibilitychange'));
};

beforeEach(() => {
  vi.useFakeTimers();
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('createVisibleTimer', () => {
  it('fires after 8000 visible ms', () => {
    const done = vi.fn();
    const t = createVisibleTimer(8000, done);
    t.start();
    vi.advanceTimersByTime(7999);
    expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(done).toHaveBeenCalledTimes(1);
    t.dispose();
  });

  it('counts visible time only', () => {
    const done = vi.fn();
    const t = createVisibleTimer(8000, done);
    t.start();
    vi.advanceTimersByTime(3000);
    setVisibility('hidden');
    vi.advanceTimersByTime(10_000);
    setVisibility('visible');
    vi.advanceTimersByTime(4999);
    expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(done).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(20_000);
    expect(done).toHaveBeenCalledTimes(1);
    t.dispose();
  });

  it('stop() pauses, start() resumes, and a stopped timer never fires', () => {
    const done = vi.fn();
    const t = createVisibleTimer(8000, done);
    t.start();
    vi.advanceTimersByTime(5000);
    t.stop();
    vi.advanceTimersByTime(30_000);
    expect(done).not.toHaveBeenCalled();
    t.start();
    vi.advanceTimersByTime(3000);
    expect(done).toHaveBeenCalledTimes(1);
    t.dispose();
  });

  it('a timer started while the tab is hidden waits for it to show', () => {
    visibility = 'hidden';
    const done = vi.fn();
    const t = createVisibleTimer(1000, done);
    t.start();
    vi.advanceTimersByTime(5000);
    expect(done).not.toHaveBeenCalled();
    setVisibility('visible');
    vi.advanceTimersByTime(1000);
    expect(done).toHaveBeenCalledTimes(1);
    t.dispose();
  });

  it('dispose() stops listening', () => {
    const done = vi.fn();
    const t = createVisibleTimer(1000, done);
    t.start();
    t.dispose();
    setVisibility('hidden');
    setVisibility('visible');
    vi.advanceTimersByTime(5000);
    expect(done).not.toHaveBeenCalled();
  });
});
