'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_ITEMS, isNavActive } from './NavLinks';

// Mobile tab bar (hidden from md up, where the TopBar shows the nav). Each target is the full third
// of the bar and at least 44px tall; the bar clears the iOS home indicator.
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-paper-raised pb-[env(safe-area-inset-bottom)] md:hidden">
      <ul className="grid grid-cols-3">
        {NAV_ITEMS.map((item) => {
          const active = isNavActive(pathname, item);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`ui-meta flex min-h-14 flex-col items-center justify-center gap-1 no-underline transition-colors duration-150 ${active ? 'text-press' : 'text-ink-muted hover:text-ink'}`}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
