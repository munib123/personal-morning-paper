'use client';

import { useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';
import { Button, Segmented, TextField } from '@/components/morrow';
import { ROUTES } from '@/contracts/api';
import type { Depth, Profile, TimeBudget } from '@/contracts/profile';
import { useHideStreak } from './prefs';
import { budgetOptions, depthOptions, streakOptions, themeOptions } from './settings';

const JSON_HEADERS = { 'content-type': 'application/json' };
const noopSubscribe = () => () => {};
// The theme is only known on the client: false on the server and during hydration.
const useMounted = () =>
  useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

type SaveState = 'idle' | 'saving' | 'saved' | 'rebuilding';

/** Paper length, depth, city and theme. Saving changes tomorrow's paper; "Rebuild" shows it today. */
export function SettingsPanel({ profile }: { profile: Profile }) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();
  const [budget, setBudget] = useState<string>(String(profile.presentation.timeBudget ?? 15));
  const [depth, setDepth] = useState<string>(profile.presentation.depth);
  const [city, setCity] = useState(profile.city);
  const [state, setState] = useState<SaveState>('idle');
  const [streakHidden, setStreakHidden] = useHideStreak();

  const night = mounted && (resolvedTheme === 'night' || resolvedTheme === 'dark');
  const cityError = city.trim().length === 0 ? 'Add a city for local news and weather' : undefined;

  const save = async () => {
    if (cityError) return;
    setState('saving');
    try {
      const res = await fetch(ROUTES.profile, {
        method: 'PATCH',
        headers: JSON_HEADERS,
        body: JSON.stringify({ presentation: { timeBudget: Number(budget) as TimeBudget, depth: depth as Depth }, city: city.trim() }),
      });
      if (!res.ok) throw new Error(`profile ${res.status}`);
      setState('saved');
    } catch {
      setState('idle');
      toast("Couldn't save your settings. Try again.");
    }
  };

  const rebuild = async () => {
    setState('rebuilding');
    try {
      const res = await fetch(ROUTES.rebuild, { method: 'POST', headers: JSON_HEADERS, body: '{}' });
      if (!res.ok) throw new Error(`rebuild ${res.status}`);
      router.refresh();
    } catch {
      toast("Couldn't rebuild today's paper. Try again.");
    } finally {
      setState('saved');
    }
  };

  const edit = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    if (state === 'saved') setState('idle');
  };

  return (
    <div className="flex max-w-(--measure) flex-col gap-6">
      <Segmented label="Paper length" name="paper-length" options={budgetOptions} value={budget} onChange={edit(setBudget)} />
      <Segmented label="Depth" name="depth" options={depthOptions} value={depth} onChange={edit(setDepth)} />
      <TextField label="City" hint="For local news and weather" value={city} error={cityError} onChange={edit(setCity)} />
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={save} disabled={state === 'saving' || state === 'rebuilding' || !!cityError}>
            {state === 'saving' ? 'Saving…' : 'Save'}
          </Button>
          {state === 'saved' || state === 'rebuilding' ? (
            <Button variant="secondary" onClick={rebuild} disabled={state === 'rebuilding'}>
              {state === 'rebuilding' ? 'Rebuilding…' : "Rebuild today's paper"}
            </Button>
          ) : null}
        </div>
        <p className="ui-meta min-h-[18px] text-ink-muted" aria-live="polite">
          {state === 'saved' || state === 'rebuilding' ? "Saved. Tomorrow's paper will use this." : ''}
        </p>
      </div>
      <Segmented label="Streak" name="streak" options={streakOptions} value={streakHidden ? 'hide' : 'show'} onChange={(v) => setStreakHidden(v === 'hide')} />
      <Segmented label="Theme" name="theme" options={themeOptions} value={night ? 'night' : 'morning'} onChange={(v) => setTheme(v === 'night' ? 'night' : 'morning')} />
    </div>
  );
}

export default SettingsPanel;
