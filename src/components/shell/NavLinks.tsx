'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Newspaper } from 'lucide-react';
import { Icon } from '@/components/morrow';
import { ROUTES } from '@/contracts/api';

export interface NavItem {
  href: string;
  label: string;
  /** Path prefixes that count as this section (a past paper at /paper/[date] belongs to Past editions). */
  match: readonly string[];
  icon: ReactNode;
}

// The reader's three places. Labels follow the design voice (buttons and links are plain words).
export const NAV_ITEMS: readonly NavItem[] = [
  { href: ROUTES.today, label: 'Today', match: [ROUTES.today], icon: <Newspaper size={22} strokeWidth={1.75} aria-hidden="true" /> },
  { href: ROUTES.archive, label: 'Past editions', match: [ROUTES.archive, '/paper'], icon: <Icon name="archive" size={22} /> },
  { href: ROUTES.me, label: 'Your interests', match: [ROUTES.me], icon: <Icon name="reason" size={22} /> },
];

export function isNavActive(pathname: string | null, item: NavItem): boolean {
  if (!pathname) return false;
  return item.match.some((m) => pathname === m || pathname.startsWith(`${m}/`));
}

// Inline text links for the TopBar (shown from md up). The active place is press red, the
// token's "active nav item" role.
export function NavLinks({ className }: { className?: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className={className}>
      <ul className="flex items-center gap-6">
        {NAV_ITEMS.map((item) => {
          const active = isNavActive(pathname, item);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`ui-label inline-flex min-h-11 items-center no-underline transition-colors duration-150 ${active ? 'text-press' : 'text-ink-soft hover:text-ink'}`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
