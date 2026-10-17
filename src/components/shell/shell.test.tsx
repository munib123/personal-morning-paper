// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BottomNav } from './BottomNav';
import { Providers } from './Providers';
import { ThemeToggle } from './ThemeToggle';
import { TopBar, startsPageNavigation } from './TopBar';

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
  window.scrollY = 0;
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
    expect(screen.getByRole('switch', { name: 'Night edition' })).toBeTruthy();
  });

  it('draws its hairline rule only once the page has scrolled', () => {
    render(<TopBar />);
    const header = screen.getByRole('banner');
    expect(header.hasAttribute('data-scrolled')).toBe(false);
    act(() => {
      window.scrollY = 120;
      window.dispatchEvent(new Event('scroll'));
    });
    expect(header.hasAttribute('data-scrolled')).toBe(true);
    act(() => {
      window.scrollY = 0;
      window.dispatchEvent(new Event('scroll'));
    });
    expect(header.hasAttribute('data-scrolled')).toBe(false);
  });

  it('shows the pending line from a click on a nav link until the page changes', () => {
    nav.pathname = '/today';
    window.history.replaceState(null, '', '/today');
    const { container, rerender } = render(<TopBar />);
    const line = () => container.querySelector('[data-nav-pending]');
    expect(line()).toBeNull();
    const link = screen.getByRole('link', { name: 'Past editions' });
    link.addEventListener('click', (e) => e.preventDefault()); // jsdom cannot navigate
    fireEvent.click(link);
    expect(line()).not.toBeNull();
    nav.pathname = '/archive';
    rerender(<TopBar />);
    expect(line()).toBeNull();
  });
});

describe('startsPageNavigation', () => {
  const here = { origin: 'https://paper.test', pathname: '/today' };
  const plain = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
  const link = (href: string, extra: Partial<{ target: string; download: boolean }> = {}) => ({
    href,
    target: extra.target ?? '',
    download: extra.download ?? false,
  });

  it('is true for a plain click to another page of the app', () => {
    expect(startsPageNavigation(link('https://paper.test/archive'), plain, here)).toBe(true);
    expect(startsPageNavigation(link('https://paper.test/paper/2026-10-16'), plain, here)).toBe(true);
  });

  it('is false for the same page, a new tab, a modified click, another site, an API route, the outbound redirect or a download', () => {
    expect(startsPageNavigation(link('https://paper.test/today#how-made'), plain, here)).toBe(false);
    expect(startsPageNavigation(link('https://paper.test/archive', { target: '_blank' }), plain, here)).toBe(false);
    expect(startsPageNavigation(link('https://paper.test/archive'), { ...plain, metaKey: true }, here)).toBe(false);
    expect(startsPageNavigation(link('https://paper.test/archive'), { ...plain, button: 1 }, here)).toBe(false);
    expect(startsPageNavigation(link('https://elsewhere.test/archive'), plain, here)).toBe(false);
    expect(startsPageNavigation(link('https://paper.test/api/editions/2026-10-17/pdf'), plain, here)).toBe(false);
    expect(startsPageNavigation(link('https://paper.test/r/abc'), plain, here)).toBe(false);
    expect(startsPageNavigation(link('https://paper.test/archive', { download: true }), plain, here)).toBe(false);
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

// A two-state switch named "Night edition" (off in Morning), drawn as Morning | Night with the current one filled.
describe('ThemeToggle', () => {
  it('is off in Morning and turns the Night edition on', () => {
    render(<ThemeToggle />);
    const toggle = screen.getByRole('switch', { name: 'Night edition' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(toggle.getAttribute('title')).toBe('Switch to Night edition');
    fireEvent.click(toggle);
    expect(theme.setTheme).toHaveBeenCalledWith('night');
  });

  it('is on in Night, including a system-dark reader, and turns Morning back on', () => {
    for (const resolved of ['night', 'dark']) {
      theme.resolvedTheme = resolved;
      const { unmount } = render(<ThemeToggle />);
      const toggle = screen.getByRole('switch', { name: 'Night edition' });
      expect(toggle.getAttribute('aria-checked')).toBe('true');
      expect(toggle.getAttribute('title')).toBe('Switch to Morning edition');
      fireEvent.click(toggle);
      expect(theme.setTheme).toHaveBeenLastCalledWith('morning');
      unmount();
    }
  });

  it('shows both editions, Morning and Night', () => {
    render(<ThemeToggle />);
    expect(screen.getByText('Morning')).toBeTruthy();
    expect(screen.getByText('Night')).toBeTruthy();
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
