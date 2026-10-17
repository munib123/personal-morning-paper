// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BottomNav } from './BottomNav';
import { Providers } from './Providers';
import { ThemeToggle } from './ThemeToggle';
import { TopBar } from './TopBar';

const nav = vi.hoisted(() => ({ pathname: '/archive' as string | null }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }));

// useTheme is mocked; ThemeProvider stays real so the Providers test exercises next-themes itself.
const theme = vi.hoisted(() => ({ resolvedTheme: 'morning' as string | undefined, setTheme: vi.fn() }));
vi.mock('next-themes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-themes')>();
  return {
    ...actual,
    useTheme: () => ({ themes: ['morning', 'night', 'system'], theme: theme.resolvedTheme, resolvedTheme: theme.resolvedTheme, setTheme: theme.setTheme }),
  };
});

const hrefs = () => screen.getAllByRole('link').map((a) => a.getAttribute('href'));
const current = () => screen.getAllByRole('link').filter((a) => a.getAttribute('aria-current') === 'page');

afterEach(() => {
  cleanup();
  nav.pathname = '/archive';
  theme.resolvedTheme = 'morning';
  theme.setTheme.mockClear();
});

describe('TopBar', () => {
  it('shows the nameplate "The Morrow" in masthead-sm', () => {
    render(<TopBar />);
    expect(screen.getByText('The Morrow').className).toContain('masthead-sm');
  });

  it('links to /today, /archive and /me', () => {
    render(<TopBar />);
    for (const h of ['/today', '/archive', '/me']) expect(hrefs()).toContain(h);
    expect(current().map((a) => a.textContent)).toEqual(['Past editions']);
  });

  it('renders the right slot and the theme toggle', () => {
    render(<TopBar right={<span>6-day streak</span>} />);
    expect(screen.getByText('6-day streak')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Switch to Night edition' })).toBeTruthy();
  });
});

describe('BottomNav', () => {
  it('marks the current place with aria-current="page"', () => {
    render(<BottomNav />);
    expect(current().map((a) => a.getAttribute('href'))).toEqual(['/archive']);
    expect(screen.getByRole('link', { name: /past editions/i }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('navigation').className).toContain('md:hidden');
  });

  it('counts a past paper as Past editions, and /today as Today', () => {
    nav.pathname = '/paper/2026-10-16';
    const { unmount } = render(<BottomNav />);
    expect(current().map((a) => a.getAttribute('href'))).toEqual(['/archive']);
    unmount();

    nav.pathname = '/today';
    render(<BottomNav />);
    expect(current().map((a) => a.getAttribute('href'))).toEqual(['/today']);
  });
});

describe('ThemeToggle', () => {
  it('offers the Night edition from Morning', () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('button', { name: 'Switch to Night edition' }));
    expect(theme.setTheme).toHaveBeenCalledWith('night');
  });

  it('offers Morning from Night, including a system-dark reader', () => {
    for (const resolved of ['night', 'dark']) {
      theme.resolvedTheme = resolved;
      const { unmount } = render(<ThemeToggle />);
      fireEvent.click(screen.getByRole('button', { name: 'Switch to Morning edition' }));
      expect(theme.setTheme).toHaveBeenLastCalledWith('morning');
      unmount();
    }
  });
});

describe('Providers', () => {
  let systemDark = false;
  beforeEach(() => {
    systemDark = false;
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: systemDark,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  // Guards the value map: next-themes removes data-theme for any theme missing from `value`.
  it.each([
    ['night', false, 'night'],
    ['morning', true, 'morning'],
    [null, true, 'morning'], // light by default, even on a dark system: readers opt into Night
    [null, false, 'morning'],
  ])('stored theme %s with system dark %s gives data-theme="%s"', (stored, dark, expected) => {
    systemDark = dark;
    if (stored) localStorage.setItem('theme', stored);
    render(
      <Providers>
        <p>Paper</p>
      </Providers>,
    );
    expect(screen.getByText('Paper')).toBeTruthy();
    expect(document.documentElement.getAttribute('data-theme')).toBe(expected);
  });
});
