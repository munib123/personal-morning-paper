'use client';

import { useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/morrow';

const noopSubscribe = () => () => {};
// false on the server and during hydration, true afterwards: the theme is only known on the client,
// so the first client render matches the server HTML (moon, "Switch to Night edition").
const useMounted = () =>
  useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

// The moon in the header switches to the Night edition; the sun switches back to Morning.
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();
  // 'dark' is the system-resolved value before next-themes maps it to 'night'.
  const night = mounted && (resolvedTheme === 'night' || resolvedTheme === 'dark');
  const label = night ? 'Switch to Morning edition' : 'Switch to Night edition';
  return <Button variant="ghost" icon={night ? 'sun' : 'moon'} aria-label={label} title={label} onClick={() => setTheme(night ? 'morning' : 'night')} />;
}
