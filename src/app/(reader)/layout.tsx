import type { ReactNode } from 'react';
import { BottomNav } from '@/components/shell/BottomNav';
import { TopBar } from '@/components/shell/TopBar';
import { StreakChip } from '@/components/streak/StreakChip';

// Reader shell for /today, /paper/[date], /archive and /me. pb-20 keeps content clear of the
// fixed mobile BottomNav.
export default function ReaderLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <TopBar right={<StreakChip />} />
      <main className="pb-20 md:pb-0">{children}</main>
      <BottomNav />
    </>
  );
}
