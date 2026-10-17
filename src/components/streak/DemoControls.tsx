'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/morrow';
import { ROUTES, StreakResponseSchema } from '@/contracts/api';
import { publishStreak } from './live';
import { clockLabel } from './settings';

export interface DemoControlsProps {
  nextMorning: string; // UTC ISO of the next edition day at 07:00 local
  clockIso: string | null;
  tz: string;
}

const JSON_HEADERS = { 'content-type': 'application/json' };

async function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) });
}

/** Re-read the streak for the new clock and publish it, so every streak line on the page follows. */
async function refreshLiveStreak(): Promise<void> {
  try {
    const res = await fetch(ROUTES.streak, { cache: 'no-store' });
    if (!res.ok) return;
    const parsed = StreakResponseSchema.safeParse(await res.json());
    if (parsed.success) publishStreak(parsed.data.streak);
  } catch {
    // the page refresh still shows the server's view
  }
}

/**
 * DEMO_MODE only. Honest time travel (research 03): the dateline says the clock is a demo clock.
 * "Next morning" moves the clock to tomorrow 07:00, rebuilds the paper and refreshes the page.
 */
export function DemoControls({ nextMorning, clockIso, tz }: DemoControlsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const move = async (now: string | null) => {
    setBusy(true);
    try {
      const res = await postJson(ROUTES.demoClock, { now });
      if (!res.ok) throw new Error(`clock ${res.status}`);
      if (now !== null) await postJson(ROUTES.rebuild, {}).catch(() => undefined); // the page still refreshes
      await refreshLiveStreak();
      router.refresh();
    } catch {
      toast("Couldn't move the clock. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section role="group" aria-label="Demo controls" className="flex flex-col gap-3 border-t border-rule pt-4">
      <p className="dateline text-ink-muted">Demo clock · {clockLabel(clockIso, tz)}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" iconRight={busy ? undefined : 'arrow-right'} disabled={busy} onClick={() => move(nextMorning)}>
          {busy ? 'Moving the clock…' : 'Next morning'}
        </Button>
        <Button variant="ghost" disabled={busy || clockIso === null} onClick={() => move(null)}>
          {busy ? 'Moving the clock…' : 'Reset clock'}
        </Button>
      </div>
    </section>
  );
}

export default DemoControls;
