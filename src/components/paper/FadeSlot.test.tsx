// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const seen = vi.hoisted(() => ({ props: [] as Record<string, unknown>[], presence: [] as Record<string, unknown>[] }));
vi.mock('motion/react', () => ({
  AnimatePresence: (p: { children: ReactNode; mode?: string; initial?: boolean }) => {
    seen.presence.push(p);
    return <>{p.children}</>;
  },
  motion: {
    div: (p: Record<string, unknown> & { children?: ReactNode }) => {
      seen.props.push(p);
      return <div data-testid="fade">{p.children}</div>;
    },
  },
}));

import { FadeSlot } from './FadeSlot';

afterEach(cleanup);

describe('FadeSlot', () => {
  it('fades the story in place: opacity only, no layout animation', () => {
    render(
      <FadeSlot id="a1">
        <p>story</p>
      </FadeSlot>,
    );
    expect(screen.getByTestId('fade').textContent).toBe('story');
    const p = seen.props.at(-1)!;
    expect(p.layout).toBeUndefined();
    expect(p.layoutId).toBeUndefined();
    expect(p.initial).toEqual({ opacity: 0 });
    expect(p.animate).toEqual({ opacity: 1 });
    expect(p.exit).toEqual({ opacity: 0 });
    expect(p.transition).toEqual({ duration: 0.15 });
    expect(seen.presence.at(-1)).toMatchObject({ mode: 'wait', initial: false });
  });
});
