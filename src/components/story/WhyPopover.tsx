'use client';
// "Why this story?": the match, the reasons, and one bar per part of the rank-v1 score, in the pen
// colour (the paper learned this). The negative part is shown as a subtraction, in muted ink, with
// text so it never relies on colour. Then the three ways to steer: More, Less, Hide this source.
import { Button } from '@/components/morrow';
import type { EditionItem, Reason, ScoreBreakdown } from '@/contracts/edition';
import type { SignalEvent } from '@/contracts/signals';
import { breakdownRows, matchPct, topReasons } from './format';
import type { WhyAction } from './WhyChip';

export function whyActionEvent(a: WhyAction, item: EditionItem): SignalEvent {
  if (a === 'hide_source') return { type: 'hide_source', articleId: item.article.id, meta: { sourceId: item.article.sourceId } };
  return { type: a, articleId: item.article.id };
}

export interface WhyPopoverProps {
  reasons: Reason[];
  breakdown: ScoreBreakdown;
  onAction?: (a: WhyAction) => void;
}

export function WhyPopover({ reasons, breakdown, onAction }: WhyPopoverProps) {
  const rows = breakdownRows(breakdown);
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="ui-label text-ink">{matchPct(breakdown)}% match</p>
        <ul className="mt-1 flex flex-col gap-0.5">
          {topReasons(reasons, 3).map((r) => (
            <li key={`${r.code}-${r.text}`} className="ui-meta text-pen">
              {r.text}
            </li>
          ))}
        </ul>
      </div>
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.key} aria-label={row.negative ? `${row.label} lowers the score by ${row.pct}%` : `${row.label} ${row.pct}%`}>
            <div className="ui-meta flex items-baseline justify-between gap-3 text-ink-soft">
              <span>
                {row.negative ? '− ' : ''}
                {row.label}
              </span>
              <span className="text-ink-muted">{row.pct}%</span>
            </div>
            <div className="mt-1 h-1.5 bg-paper-sunk">
              <div
                data-bar
                className={`h-full transition-[width] duration-300 ${row.negative ? 'bg-ink-muted' : 'bg-pen'}`}
                style={{ width: `${row.pct}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-1 border-t border-rule pt-2">
        <Button variant="ghost" size="sm" icon="plus" onClick={() => onAction?.('more')}>
          More like this
        </Button>
        <Button variant="ghost" size="sm" icon="minus" onClick={() => onAction?.('less')}>
          Less like this
        </Button>
        <Button variant="ghost" size="sm" icon="x" onClick={() => onAction?.('hide_source')}>
          Hide this source
        </Button>
      </div>
    </div>
  );
}

export default WhyPopover;
