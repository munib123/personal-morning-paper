'use client';

import { useState, type ReactNode } from 'react';
import { Button, Icon } from '@/components/morrow';
import type { BarRow } from './learning-view';
import { deltaLabel } from './learning-view';

export interface InterestBarsProps {
  rows: BarRow[];
  dayLabel?: string;
  renderControls?: (row: BarRow) => ReactNode;
}

/**
 * Interest weights as thin ink bars (one hue; no per-topic colour). A learned change shows in pen
 * ("the paper learned this") with a plus or minus icon, never colour alone. Rows with children open
 * through a disclosure button.
 */
export function InterestBars({ rows, dayLabel, renderControls }: InterestBarsProps) {
  return (
    <div className="flex flex-col gap-2">
      {dayLabel ? <p className="dateline text-ink-muted">{dayLabel}</p> : null}
      <ul className="flex flex-col">
        {rows.map((row) => (
          <BarItem key={row.slug} row={row} renderControls={renderControls} depth={0} />
        ))}
      </ul>
    </div>
  );
}

function BarItem({ row, renderControls, depth }: { row: BarRow; renderControls?: (row: BarRow) => ReactNode; depth: number }) {
  const [open, setOpen] = useState(false);
  const pct = Math.round(Math.max(0, Math.min(1, row.theta)) * 100);
  const childListId = `bars-${row.slug.replace(/\./g, '-')}`;
  return (
    <li className={depth === 0 ? 'border-t border-rule py-2 first:border-t-0' : 'py-1'}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="flex min-w-0 flex-1 basis-56 flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className={`ui-text truncate ${row.muted ? 'text-ink-muted' : 'text-ink'}`}>
              {row.name}
              {row.muted ? <span className="ui-meta ml-2 text-ink-muted">Muted</span> : null}
              {row.pinned ? <span className="ui-meta ml-2 text-ink-muted">Pinned</span> : null}
            </span>
            <span className="ui-meta flex shrink-0 items-center gap-2 text-ink-muted">
              {row.delta !== null && Math.round(row.delta * 100) !== 0 ? (
                <span className="inline-flex items-center gap-1 text-pen">
                  <Icon name={row.delta > 0 ? 'plus' : 'minus'} size={14} />
                  {deltaLabel(0, row.delta)}
                </span>
              ) : null}
              <span>{pct}</span>
            </span>
          </div>
          <div className="h-1 w-full bg-paper-sunk" aria-hidden="true">
            <div className="h-1 bg-ink transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${pct}%` }} />
          </div>
        </div>
        {renderControls ? <div className="flex shrink-0 items-center gap-2">{renderControls(row)}</div> : null}
        {row.children.length > 0 ? (
          <Button
            variant="ghost"
            icon="chevron-right"
            aria-expanded={open}
            aria-controls={open ? childListId : undefined}
            aria-label={`${open ? 'Hide' : 'Show'} topics in ${row.name}`}
            className={open ? '[&_svg]:rotate-90' : undefined}
            onClick={() => setOpen((o) => !o)}
          />
        ) : null}
      </div>
      {row.children.length > 0 && open ? (
        <ul id={childListId} className="mt-1 flex flex-col border-l border-rule pl-4">
          {row.children.map((child) => (
            <BarItem key={child.slug} row={child} renderControls={renderControls} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export default InterestBars;
