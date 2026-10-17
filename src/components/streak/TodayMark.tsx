import type { StreakView } from '@/contracts/streak';

export type TodayMarkState = 'kept' | 'pending' | 'at-risk';

/** Where today stands for the streak: kept (a qualifying read today), pending, or at risk (late in the day). */
export function todayMark(v: StreakView): TodayMarkState {
  if (v.todayQualified) return 'kept';
  return v.state === 'at_risk' ? 'at-risk' : 'pending';
}

/**
 * The chip's tiny today indicator. Kept: a filled pen disc with a check (the paper noticed you read).
 * Not yet: a dashed ring, like today's square on the 7-day strip; ink when the day is nearly over.
 * Shape tells the states apart, never colour alone.
 */
export function TodayMark({ mark, className }: { mark: TodayMarkState; className?: string }) {
  return (
    <svg width={18} height={18} viewBox="0 0 18 18" aria-hidden="true" data-mark={mark} className={className}>
      {mark === 'kept' ? (
        <>
          <circle cx={9} cy={9} r={8} className="fill-pen" />
          <path d="M5.4 9.3l2.4 2.4 4.8-5" fill="none" className="stroke-on-pen" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <circle
          cx={9}
          cy={9}
          r={7.25}
          fill="none"
          strokeWidth={1.5}
          strokeDasharray="2.6 2.4"
          className={mark === 'at-risk' ? 'stroke-ink' : 'stroke-ink-muted'}
        />
      )}
    </svg>
  );
}

export default TodayMark;
