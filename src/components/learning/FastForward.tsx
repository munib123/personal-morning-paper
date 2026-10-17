'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button, SectionHeader } from '@/components/morrow';
import { ROUTES, SimulationResultSchema } from '@/contracts/api';
import type { SimulationResult } from '@/contracts/learning';
import type { InterestWeight } from '@/contracts/profile';
import { InterestMapDiff } from './InterestMapDiff';
import { SimulationChart } from './SimulationChart';
import { simPrimaryView } from './sim-geometry';

export interface FastForwardProps {
  weights: InterestWeight[];
  demoMode: boolean;
  initial?: SimulationResult;
}

const FRAME_MS = 600;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * DEMO_MODE only: "Fast-forward 7 days" replays the simulator (POST /api/demo/fast-forward) one day
 * every 600 ms, driving the day-N interest bars and the chart. Only measured numbers are shown; on an
 * error nothing is drawn. Which visual leads is decided by the result (simPrimaryView).
 */
export function FastForward({ weights, demoMode, initial }: FastForwardProps) {
  const [result, setResult] = useState<SimulationResult | null>(initial ?? null);
  const [frame, setFrame] = useState(() => (initial ? initial.snapshots.length - 1 : 0));
  const [loading, setLoading] = useState(false);

  const lastFrame = result ? result.snapshots.length - 1 : 0;
  const playing = result !== null && frame < lastFrame;

  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => setFrame((f) => f + 1), FRAME_MS);
    return () => clearTimeout(t);
  }, [playing, frame]);

  if (!demoMode) return null;

  const run = async () => {
    setLoading(true);
    try {
      const res = await fetch(ROUTES.fastForward, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ days: 7 }) });
      const parsed = SimulationResultSchema.safeParse(res.ok ? await res.json() : null);
      if (!parsed.success || parsed.data.snapshots.length === 0) throw new Error('simulation');
      setResult(parsed.data);
      setFrame(prefersReducedMotion() ? parsed.data.snapshots.length - 1 : 0);
    } catch {
      setResult(null);
      toast("The simulator didn't answer. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const day = result?.snapshots[frame]?.day ?? 0;
  const totalDays = result?.snapshots.at(-1)?.day ?? 7;
  const primary = result ? simPrimaryView(result) : 'chart';
  const chart = result ? <SimulationChart result={result} upToDay={day} /> : null;
  const map = result ? <InterestMapDiff weights={weights} result={result} frame={frame} /> : null;

  return (
    <section className="flex flex-col gap-4" aria-label="Fast-forward 7 days">
      <SectionHeader title="Fast-forward 7 days" meta="a simulated week of reading" />
      <p className="ui-text max-w-(--measure) text-ink-soft">
        See how a week of reading would reshape your paper, against a paper that never learns and one that only follows popularity.
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <Button variant="secondary" icon="play" onClick={run} disabled={loading || playing}>
          {loading ? 'Simulating…' : 'Fast-forward 7 days'}
        </Button>
        <p className="dateline m-0 text-ink-muted" aria-live="polite">
          {result ? `Day ${day} of ${totalDays}` : ''}
        </p>
      </div>
      {result ? (
        primary === 'chart' ? (
          <div className="flex flex-col gap-8">
            {chart}
            {map}
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            <h3 className="headline-sm m-0 text-ink">Day 1 vs day 7: what your paper learned</h3>
            {map}
            {chart}
          </div>
        )
      ) : null}
    </section>
  );
}

export default FastForward;
