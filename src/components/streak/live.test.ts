import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { FIXTURE_STREAK } from '@/contracts/fixtures';
import type { StreakView } from '@/contracts/streak';
import { getLiveStreak, publishStreak, subscribeLiveStreak, useLiveStreak } from './live';

function Probe({ initial }: { initial: StreakView | null }) {
  const s = useLiveStreak(initial);
  return createElement('span', null, s ? String(s.current) : 'none');
}

describe('live streak channel', () => {
  it('has nothing before the first publish', () => {
    expect(getLiveStreak()).toBeNull();
  });

  it('notifies subscribers once per publish and stops after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeLiveStreak(listener);
    publishStreak(FIXTURE_STREAK);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getLiveStreak()).toBe(FIXTURE_STREAK);

    unsubscribe();
    publishStreak({ ...FIXTURE_STREAK, current: 7 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getLiveStreak()?.current).toBe(7);
  });

  it('renders the initial value on the server (server snapshot = initial)', () => {
    // A value published in this module (a server process) must not leak into server renders.
    publishStreak({ ...FIXTURE_STREAK, current: 99 });
    expect(renderToStaticMarkup(createElement(Probe, { initial: FIXTURE_STREAK }))).toBe(`<span>${FIXTURE_STREAK.current}</span>`);
    expect(renderToStaticMarkup(createElement(Probe, { initial: null }))).toBe('<span>none</span>');
  });
});
