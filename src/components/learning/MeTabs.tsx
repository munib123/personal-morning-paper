'use client';

import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { SectionHeader } from '@/components/morrow';
import { DemoControls } from '@/components/streak/DemoControls';
import { SettingsPanel } from '@/components/streak/SettingsPanel';
import { StreakPanel } from '@/components/streak/StreakPanel';
import { FastForward } from './FastForward';
import { InterestEditor } from './InterestEditor';
import { LearnedTab } from './LearnedTab';
import { ME_TABS, nextTab, type MeData, type MeTab } from './me-tabs';

export interface MeTabsProps {
  initialTab: MeTab;
  data: MeData;
}

const TAB_CLASS =
  'ui-button -mb-px min-h-11 shrink-0 cursor-pointer border-0 border-b-2 bg-transparent px-1 text-ink outline-none transition-colors duration-150 focus-visible:shadow-(--focus-ring) motion-reduce:transition-none';

/**
 * /me: "Your paper learned" · "Your interests" · "Streak & settings". A hand-built WAI-ARIA tablist
 * (automatic activation; arrows, Home, End), the active tab underlined in ink, synced to ?tab=.
 */
export function MeTabs({ initialTab, data }: MeTabsProps) {
  const router = useRouter();
  const [tab, setTab] = useState<MeTab>(initialTab);
  const refs = useRef<Partial<Record<MeTab, HTMLButtonElement | null>>>({});

  const select = (next: MeTab, focus = false) => {
    setTab(next);
    if (focus) refs.current[next]?.focus();
    const url = new URL(window.location.href);
    url.searchParams.set('tab', next);
    router.replace(`${url.pathname}${url.search}`, { scroll: false });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const next = nextTab(tab, e.key);
    if (!next) return;
    e.preventDefault();
    select(next, true);
  };

  return (
    <div className="flex flex-col gap-8">
      <div role="tablist" aria-label="Your paper" className="flex gap-6 overflow-x-auto border-b border-rule" onKeyDown={onKeyDown}>
        {ME_TABS.map((t) => {
          const selected = t.id === tab;
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[t.id] = el;
              }}
              type="button"
              role="tab"
              id={`me-tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`me-panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              className={`${TAB_CLASS} ${selected ? 'border-ink' : 'border-transparent text-ink-muted hover:text-ink'}`}
              onClick={() => select(t.id)}
            >
              <span className="sm:hidden">{t.short}</span>
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={`me-panel-${tab}`} aria-labelledby={`me-tab-${tab}`} tabIndex={0} className="outline-none focus-visible:shadow-(--focus-ring)">
        {panel(tab, data)}
      </div>
    </div>
  );
}

function panel(tab: MeTab, data: MeData): ReactNode {
  switch (tab) {
    case 'learned':
      return (
        <LearnedTab
          initial={data.learning}
          nowIso={data.nowIso}
          after={<FastForward weights={data.learning?.weights ?? []} demoMode={data.demoMode} initial={data.simulation ?? undefined} />}
        />
      );
    case 'interests':
      return <InterestEditor weights={data.learning?.weights ?? []} movers={data.learning?.movers ?? []} />;
    case 'streak':
      return (
        <div className="flex flex-col gap-10">
          <section className="flex max-w-(--measure) flex-col">
            <SectionHeader title="Your streak" />
            <StreakPanel streak={data.streak} heatmap={data.heatmap} />
          </section>
          <section className="flex max-w-(--measure) flex-col">
            <SectionHeader title="Settings" />
            <SettingsPanel profile={data.profile} />
          </section>
          {data.demoMode ? (
            <div className="max-w-(--measure)">
              <DemoControls nextMorning={data.nextMorning} clockIso={data.clockIso} tz={data.profile.tz} />
            </div>
          ) : null}
        </div>
      );
    default: {
      const never: never = tab;
      return never;
    }
  }
}

export default MeTabs;
