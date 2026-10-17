import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FIXTURE_STREAK } from '@/contracts/fixtures';
import type { StreakView } from '@/contracts/streak';
import { chipLabel } from './copy';
import { publishStreak } from './live';
import { StreakChip } from './StreakChip';

vi.mock('sonner', () => ({ toast: vi.fn() }));

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('StreakChip and the hide-streak setting', () => {
  it('shows the number and the streak label by default', () => {
    render(<StreakChip streak={FIXTURE_STREAK} />);
    const chip = screen.getByRole('button', { name: chipLabel(FIXTURE_STREAK) });
    expect(chip.textContent).toContain('6');
    expect(chip.textContent).toContain('day streak');
  });

  it('renders nothing when the reader hid the streak', () => {
    window.localStorage.setItem('subah:hide-streak', '1');
    const { container } = render(<StreakChip streak={FIXTURE_STREAK} />);
    expect(container.textContent).toBe('');
  });
});

describe('the streak sheet', () => {
  it('opens from the chip with the big number, today’s goal and the way on', () => {
    render(<StreakChip streak={FIXTURE_STREAK} />);
    fireEvent.click(screen.getByRole('button', { name: chipLabel(FIXTURE_STREAK) }));
    const sheet = screen.getByRole('dialog', { hidden: true });
    expect(sheet.textContent).toContain('day streak');
    expect(sheet.textContent).toContain('Streak kept for today');
    expect(screen.getByRole('link', { name: 'Streak & settings', hidden: true }).getAttribute('href')).toBe('/me?tab=streak');
    fireEvent.click(screen.getByRole('button', { name: 'Close', hidden: true }));
    expect(screen.getByRole('button', { name: chipLabel(FIXTURE_STREAK) }).getAttribute('aria-expanded')).toBe('false');
  });

  it('"Continue reading" closes the sheet and goes to the first unread story', () => {
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    render(
      <>
        <main>
          <div data-article-id="a1">
            <article className="mw-story is-read">
              <a className="mw-story__link" href="#a1">
                Read already
              </a>
            </article>
          </div>
          <div data-article-id="a2">
            <article className="mw-story">
              <a className="mw-story__link" href="#a2">
                Not read yet
              </a>
            </article>
          </div>
        </main>
        <StreakChip streak={FIXTURE_STREAK} />
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: chipLabel(FIXTURE_STREAK) }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue reading', hidden: true }));
    expect(scrolled).toHaveBeenCalledTimes(1);
    expect(scrolled.mock.contexts[0]).toBe(document.querySelector('[data-article-id="a2"]'));
    expect(document.activeElement?.textContent).toBe('Not read yet');
    expect(screen.getByRole('button', { name: chipLabel(FIXTURE_STREAK) }).getAttribute('aria-expanded')).toBe('false');
  });
});

describe('the streak kept note', () => {
  it('says "Streak kept" once when a read keeps today', () => {
    vi.mocked(toast).mockClear();
    const pending: StreakView = { ...FIXTURE_STREAK, state: 'pending', current: 7, todayQualified: false, milestone: null };
    render(<StreakChip streak={pending} />);
    expect(toast).not.toHaveBeenCalled();
    act(() => publishStreak({ ...pending, state: 'done_today', current: 8, todayQualified: true }));
    expect(toast).toHaveBeenCalledWith('Streak kept: 8 days.');
    act(() => publishStreak({ ...pending, state: 'done_today', current: 8, todayQualified: true, todayStoriesRead: 5 }));
    expect(toast).toHaveBeenCalledTimes(1);
  });
});
