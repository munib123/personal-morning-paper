import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InterestWeight } from '@/contracts/profile';
import { InterestEditor } from './InterestEditor';

vi.mock('sonner', () => ({ toast: vi.fn() }));

const sports: InterestWeight = { slug: 'sports', name: 'Sports', level: 1, theta: 0.5, alpha: 2, beta: 2, picked: true, muted: false, pinned: false };

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('InterestEditor keyboard', () => {
  it('keeps focus on the weight slider after an arrow-key edit is saved', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined))); // the save stays in flight
    render(<InterestEditor weights={[sports]} />);
    const slider = screen.getByRole('slider', { name: 'Sports weight' });
    slider.focus();
    fireEvent.change(slider, { target: { value: '51' } });
    fireEvent.keyUp(slider, { key: 'ArrowRight' });
    expect(slider.isConnected).toBe(true);
    expect(document.activeElement).toBe(slider);
    expect((screen.getByRole('slider', { name: 'Sports weight' }) as HTMLInputElement).value).toBe('51');
  });

  it('does not reorder rows while editing, so the focused slider stays put', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)));
    const science: InterestWeight = { ...sports, slug: 'science', name: 'Science', theta: 0.6 };
    render(<InterestEditor weights={[sports, science]} />);
    const slider = screen.getByRole('slider', { name: 'Sports weight' });
    slider.focus();
    fireEvent.change(slider, { target: { value: '90' } });
    fireEvent.keyUp(slider, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(slider);
    expect(screen.getAllByRole('slider').map((s) => s.getAttribute('aria-label'))).toEqual(['Science weight', 'Sports weight']);
  });
});
