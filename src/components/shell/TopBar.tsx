import Link from 'next/link';
import type { ReactNode } from 'react';
import { BRAND } from '@/lib/brand';
import { ROUTES } from '@/contracts/api';
import { NavLinks } from './NavLinks';
import { ThemeToggle } from './ThemeToggle';

export interface TopBarProps {
  right?: ReactNode;
}

// Compact Morrow header for the reader shell: the nameplate (blackletter, masthead-sm) on the
// left, the nav from md up, then the right slot (the streak chip) and the theme toggle. Pages
// render their own full Masthead with the <h1>, so the nameplate here is a link, not a heading.
export function TopBar({ right }: TopBarProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-paper-raised">
      {/* Tighter gaps below md: at 390px the nameplate, streak chip and theme toggle overflowed by 1px. */}
      <div className="mx-auto flex h-14 max-w-(--page-max) items-center gap-3 px-4 md:gap-6 md:px-6">
        <Link href={ROUTES.today} className="masthead-sm shrink-0 whitespace-nowrap text-ink no-underline">
          {BRAND.nameplate}
        </Link>
        <NavLinks className="hidden md:block" />
        <div className="ml-auto flex min-w-0 items-center gap-1 sm:gap-3">
          {right}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
