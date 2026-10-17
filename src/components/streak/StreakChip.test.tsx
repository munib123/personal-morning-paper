import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FIXTURE_STREAK } from '@/contracts/fixtures';
import { StreakChip } from './StreakChip';

vi.mock('sonner', () => ({ toast: vi.fn() }));

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('StreakChip and the hide-streak setting', () => {
  it('shows the streak line by default', () => {
    const { container } = render(<StreakChip streak={FIXTURE_STREAK} />);
    expect(container.textContent).toContain('6-day streak');
  });

  it('renders nothing when the reader hid the streak', () => {
    window.localStorage.setItem('subah:hide-streak', '1');
    const { container } = render(<StreakChip streak={FIXTURE_STREAK} />);
    expect(container.textContent).toBe('');
  });
});
