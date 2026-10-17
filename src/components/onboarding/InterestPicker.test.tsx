import { useState } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FIXTURE_TAXONOMY } from '@/contracts/fixtures';
import DefaultPicker, { InterestPicker, type InterestPickerValue } from './InterestPicker';

const EMPTY: InterestPickerValue = { picks: [], blocked: [] };

afterEach(() => { cleanup(); });

function Controlled({ initial = EMPTY, mode = 'onboarding', spy = vi.fn() }: { initial?: InterestPickerValue; mode?: 'onboarding' | 'edit'; spy?: (v: InterestPickerValue) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <InterestPicker
      taxonomy={FIXTURE_TAXONOMY}
      value={value}
      mode={mode}
      onChange={(v) => { spy(v); setValue(v); }}
    />
  );
}

describe('InterestPicker', () => {
  test('is also the default export (L7 imports it that way)', () => {
    expect(DefaultPicker).toBe(InterestPicker);
  });

  test('renders the 9 root groups in taxonomy order, each with an "All of" chip', () => {
    render(<Controlled />);
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(['World & Pakistan', 'Business & Economy', 'Technical', 'Science', 'Health', 'Sports', 'Entertainment', 'Arts & Culture', 'Lifestyle']);
    const technical = screen.getByRole('region', { name: 'Technical' });
    expect(within(technical).getByRole('button', { name: 'All of Technical' })).toHaveAttribute('aria-pressed', 'false');
    expect(within(technical).getByRole('button', { name: 'Computer Science' })).toBeInTheDocument();
  });

  test('a root chip picks as a tile and a level-2 chip as a chip', async () => {
    const spy = vi.fn();
    render(<Controlled spy={spy} />);
    await userEvent.click(screen.getByRole('button', { name: 'All of Technical' }));
    expect(spy).toHaveBeenLastCalledWith({ picks: [{ slug: 'technical', via: 'tile' }], blocked: [] });
    await userEvent.click(screen.getByRole('button', { name: 'Cricket' }));
    expect(spy).toHaveBeenLastCalledWith({ picks: [{ slug: 'technical', via: 'tile' }, { slug: 'sports.cricket', via: 'chip' }], blocked: [] });
    expect(screen.getByRole('button', { name: 'All of Technical' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('the › disclosure opens the level-3 chips in place without changing picks', async () => {
    const spy = vi.fn();
    render(<Controlled spy={spy} />);
    const more = screen.getByRole('button', { name: 'Show Computer Science topics' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    expect(more).toHaveAttribute('aria-controls', 'panel-technical.cs');
    expect(screen.queryByRole('button', { name: 'AI & Machine Learning' })).toBeNull();
    await userEvent.click(more);
    expect(more).toHaveAttribute('aria-expanded', 'true');
    const panel = document.getElementById('panel-technical.cs')!;
    await userEvent.click(within(panel).getByRole('button', { name: 'AI & Machine Learning' }));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenLastCalledWith({ picks: [{ slug: 'technical.cs.ai-ml', via: 'chip' }], blocked: [] });
    // jsdom joins the chip's inline spans without a space; browsers blockify flex items and add one.
    expect(screen.getByRole('button', { name: /^Computer Science\s?1 picked$/ })).toBeInTheDocument();
    await userEvent.click(more);
    expect(more).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: 'AI & Machine Learning' })).toBeNull();
  });

  test('chips and disclosures work from the keyboard', async () => {
    render(<Controlled />);
    const more = screen.getByRole('button', { name: 'Show Cricket topics' });
    more.focus();
    await userEvent.keyboard('{Enter}');
    expect(more).toHaveAttribute('aria-expanded', 'true');
    const chip = screen.getByRole('button', { name: 'T20 Leagues' });
    chip.focus();
    await userEvent.keyboard(' ');
    expect(chip).toHaveAttribute('aria-pressed', 'true');
  });

  test('onboarding mode shows a live pick counter; edit mode does not', async () => {
    const { unmount } = render(<Controlled />);
    const counter = screen.getByText('0 topics picked');
    expect(counter).toHaveAttribute('aria-live', 'polite');
    await userEvent.click(screen.getByRole('button', { name: 'All of Science' }));
    expect(screen.getByText('1 topic picked')).toBe(counter);
    unmount();
    render(<Controlled mode="edit" />);
    expect(screen.queryByText(/topics? picked/)).toBeNull();
  });

  test('shows no emoji', () => {
    const { container } = render(<Controlled />);
    const emoji = FIXTURE_TAXONOMY.map((n) => n.emoji).filter((e): e is string => !!e);
    expect(emoji.length).toBeGreaterThan(0);
    for (const e of emoji) expect(container.textContent).not.toContain(e);
  });
});
