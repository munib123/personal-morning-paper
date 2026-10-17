'use client';

import { useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import { Icon } from '@/components/morrow';

const noopSubscribe = () => () => {};
// false on the server and during hydration, true afterwards: the theme is only known on the client,
// so the first client render matches the server HTML (Morning filled, the switch off).
const useMounted = () =>
  useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

// One edition of the pair, drawn like a Morrow Segmented option: the current one is filled in ink.
// The word shows from lg up; below that the sun and the moon carry it. Under sm the cells are 20px
// wide so the switch (42px) fits the 390px header beside the nameplate and the streak chip.
function Edition({ on, icon, label }: { on: boolean; icon: 'sun' | 'moon'; label: string }) {
  return (
    <span className={`flex items-center gap-1.5 px-0.5 transition-colors duration-150 sm:px-2 ${on ? 'bg-ink text-on-ink' : 'text-ink-muted group-hover:text-ink'}`}>
      <Icon name={icon} size={16} />
      <span className="ui-meta hidden lg:inline">{label}</span>
    </span>
  );
}

// The Morning | Night switch in the header: a two-state control with one name ("Night edition") and
// aria-checked for the state, so a screen reader hears "Night edition, switch, off" in the morning.
// The whole 44 px button flips it; the title says what a click will do.
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();
  // 'dark' is the system-resolved value before next-themes maps it to 'night'.
  const night = mounted && (resolvedTheme === 'night' || resolvedTheme === 'dark');
  const title = night ? 'Switch to Morning edition' : 'Switch to Night edition';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={night}
      aria-label="Night edition"
      title={title}
      onClick={() => setTheme(night ? 'morning' : 'night')}
      className="group inline-flex h-11 shrink-0 cursor-pointer items-center rounded-control border-0 bg-transparent p-0 font-ui outline-none focus-visible:shadow-(--focus-ring)"
    >
      <span aria-hidden="true" className="flex h-7 items-stretch overflow-hidden sm:h-8 rounded-control border border-rule-strong transition-colors duration-150 group-hover:border-ink">
        <Edition on={!night} icon="sun" label="Morning" />
        <Edition on={night} icon="moon" label="Night" />
      </span>
    </button>
  );
}
