'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { BRAND } from '@/lib/brand';
import { ROUTES } from '@/contracts/api';
import { NavLinks } from './NavLinks';
import { ThemeToggle } from './ThemeToggle';

export interface TopBarProps {
  right?: ReactNode;
}

interface LinkLike {
  href: string;
  target: string;
  download: boolean;
}
interface ClickLike {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/**
 * Whether a click on this link starts a move to another page of the app, the only case that earns the
 * pending line: a plain left click in the same tab, same origin, a different path, and not an API
 * route (PDFs), the /r outbound redirect or a download.
 */
export function startsPageNavigation(link: LinkLike, click: ClickLike, here: { origin: string; pathname: string }): boolean {
  if (click.button !== 0 || click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return false;
  if (link.download || (link.target !== '' && link.target !== '_self')) return false;
  let url: URL;
  try {
    url = new URL(link.href, here.origin);
  } catch {
    return false;
  }
  if (url.origin !== here.origin || url.pathname === here.pathname) return false;
  return !/^\/(api|r)(\/|$)/.test(url.pathname);
}

const PENDING_MAX_MS = 8000; // a navigation that never lands (offline) stops showing after this

const subscribeScroll = (onChange: () => void) => {
  window.addEventListener('scroll', onChange, { passive: true });
  return () => window.removeEventListener('scroll', onChange);
};
// Re-renders only when the answer flips, not on every scroll event.
const useScrolled = () =>
  useSyncExternalStore(
    subscribeScroll,
    () => window.scrollY > 4,
    () => false,
  );

// The path a page navigation started from, from the click until the new page's path lands.
function usePendingNavigation(): boolean {
  const pathname = usePathname();
  const [from, setFrom] = useState<string | null>(null);
  const [seen, setSeen] = useState(pathname);
  if (seen !== pathname) {
    setSeen(pathname);
    setFrom(null);
  }

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = e.target instanceof Element ? e.target.closest('a[href]') : null;
      if (!(a instanceof HTMLAnchorElement)) return;
      if (startsPageNavigation({ href: a.href, target: a.target, download: a.hasAttribute('download') }, e, window.location)) {
        setFrom(window.location.pathname);
      }
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  useEffect(() => {
    if (from === null) return;
    const t = window.setTimeout(() => setFrom(null), PENDING_MAX_MS);
    return () => window.clearTimeout(t);
  }, [from]);

  return from !== null && from === pathname;
}

// Compact Morrow header for the reader shell: the nameplate (blackletter, masthead-sm) on the
// left, the nav from md up, then the right slot (the streak chip) and the theme switch. Pages
// render their own full Masthead with the <h1>, so the nameplate here is a link, not a heading.
// At the top of the page it sits on the paper with no rule; once the page scrolls it lifts to
// paper-raised with a hairline. A 2px ink line along its foot shows a page on its way.
export function TopBar({ right }: TopBarProps) {
  const scrolled = useScrolled();
  const pending = usePendingNavigation();
  return (
    <header
      data-scrolled={scrolled ? '' : undefined}
      className={`sticky top-0 z-40 border-b transition-[background-color,border-color] duration-150 ${scrolled ? 'border-rule bg-paper-raised' : 'border-transparent bg-paper'}`}
    >
      {/* Tighter gaps below md: at 390px the nameplate, streak chip and theme switch must fit in one row. */}
      <div className="mx-auto flex h-14 max-w-(--page-max) items-center gap-3 px-4 md:gap-6 md:px-6">
        <Link href={ROUTES.today} className="masthead-sm shrink-0 whitespace-nowrap text-ink no-underline">
          {BRAND.nameplate}
        </Link>
        <NavLinks className="reader-nav hidden md:block" />
        <div className="ml-auto flex min-w-0 items-center gap-1 sm:gap-3">
          {right}
          <ThemeToggle />
        </div>
      </div>
      {pending ? <div aria-hidden="true" data-nav-pending="" className="reader-pending" /> : null}
    </header>
  );
}
