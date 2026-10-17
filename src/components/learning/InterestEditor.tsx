'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button, SectionHeader } from '@/components/morrow';
import { InterestWeightSchema, ROUTES } from '@/contracts/api';
import type { InterestWeight } from '@/contracts/profile';
import type { WeightDelta } from '@/contracts/signals';
import { InterestBars } from './InterestBars';
import { applyEdit, effectCopy, type EditAction } from './interest-edit';
import { barRows, type BarRow } from './learning-view';

export interface InterestEditorProps {
  weights: InterestWeight[];
  movers?: WeightDelta[];
}

const WeightsSchema = z.array(InterestWeightSchema);

function orderOf(rows: BarRow[]): Map<string, number> {
  const order = new Map<string, number>();
  const walk = (list: BarRow[]) =>
    list.forEach((r) => {
      order.set(r.slug, order.size);
      walk(r.children);
    });
  walk(rows);
  return order;
}

/** Sort rows (and their children) by a fixed order; unknown topics go last, in their given order. */
function keepOrder(rows: BarRow[], order: Map<string, number>): BarRow[] {
  const rank = (r: BarRow) => order.get(r.slug) ?? Number.MAX_SAFE_INTEGER;
  return [...rows].sort((a, b) => rank(a) - rank(b)).map((r) => ({ ...r, children: keepOrder(r.children, order) }));
}

/** One row's weight slider: moves freely, saves when released (pointer up, key up or blur). */
function WeightSlider({ row, onCommit }: { row: BarRow; onCommit: (value: number) => void }) {
  const committed = Math.round(row.theta * 100);
  const [draft, setDraft] = useState<number | null>(null);
  const value = draft ?? committed;
  const commit = () => {
    if (draft !== null && draft !== committed) onCommit(draft / 100);
    setDraft(null);
  };
  return (
    <input
      type="range"
      min={0}
      max={100}
      step={1}
      value={value}
      aria-label={`${row.name} weight`}
      aria-valuetext={`${value} out of 100`}
      className="h-11 w-28 cursor-pointer rounded-control accent-ink outline-none focus-visible:shadow-(--focus-ring)"
      onChange={(e) => setDraft(Number(e.target.value))}
      onPointerUp={commit}
      onKeyUp={commit}
      onBlur={commit}
    />
  );
}

/**
 * "Your interests": every topic as an ink bar, grouped by root, with Pin, Mute and a weight slider.
 * Edits show at once and are replaced by the server's weights (reverted with a note on failure);
 * the line under the header says what tomorrow's paper will do differently.
 */
export function InterestEditor({ weights: initial, movers = [] }: InterestEditorProps) {
  const [weights, setWeights] = useState(initial);
  const [effect, setEffect] = useState('');

  const edit = async (row: BarRow, action: EditAction, value?: number) => {
    const before = weights;
    setWeights(applyEdit(weights, row.slug, action, value));
    setEffect(effectCopy(action, row.name, value, row.theta));
    try {
      const res = await fetch(ROUTES.interests, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(value === undefined ? { slug: row.slug, action } : { slug: row.slug, action, value }),
      });
      const parsed = WeightsSchema.safeParse(res.ok ? await res.json() : null);
      if (!parsed.success) throw new Error('interests');
      setWeights(parsed.data);
    } catch {
      setWeights(before);
      setEffect('');
      toast("Couldn't save that change. Try again.");
    }
  };

  // Rows keep the order they had when the tab opened: re-sorting by the edited weight would move the
  // row under the reader's pointer (and take keyboard focus with it).
  const [order] = useState(() => orderOf(barRows(initial, movers, undefined, { includeMuted: true })));
  const rows = keepOrder(barRows(weights, movers, undefined, { includeMuted: true }), order);

  return (
    <section className="flex max-w-(--measure) flex-col gap-4">
      <SectionHeader title="Your interests" meta="pin, mute or weigh each topic" />
      {/* Reserved for wave 2 "Tell your editor" (L2 + L7), directly above the bars. */}
      <div data-slot="tell-your-editor" />
      <p className="ui-meta min-h-[18px] text-ink-muted" aria-live="polite">
        {effect}
      </p>
      {rows.length === 0 ? <p className="ui-text text-ink-muted">Your topics appear here once your first paper is set.</p> : null}
      <InterestBars
        rows={rows}
        renderControls={(row) => (
          <>
            <Button variant="secondary" aria-pressed={row.pinned} onClick={() => edit(row, row.pinned ? 'unpin' : 'pin')}>
              {row.pinned ? 'Pinned' : 'Pin'}
            </Button>
            <Button variant="secondary" aria-pressed={row.muted} onClick={() => edit(row, row.muted ? 'unmute' : 'mute')}>
              {row.muted ? 'Muted' : 'Mute'}
            </Button>
            <WeightSlider key={row.slug} row={row} onCommit={(v) => edit(row, 'set', v)} />
          </>
        )}
      />
    </section>
  );
}

export default InterestEditor;
