'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Button } from '@/components/morrow';
import type { SimulationResult } from '@/contracts/learning';
import { linePath, simSeries, type SimKey, type SimSeries } from './sim-geometry';

export interface SimulationChartProps {
  result: SimulationResult | null;
  upToDay?: number;
}

// Morrow colours only, one hue each, no rainbow: learning is pen (the paper learned this); the
// baselines are ink and ink-muted, told apart by dash pattern, direct labels, a legend and a table.
const STYLE: Record<SimKey, { stroke: string; dash?: string }> = {
  learning: { stroke: 'stroke-pen' },
  onboardingOnly: { stroke: 'stroke-ink', dash: '6 4' },
  popularity: { stroke: 'stroke-ink-muted', dash: '2 4' },
};
const TICKS = [0, 0.25, 0.5, 0.75, 1];
const M = { left: 48, top: 12, bottom: 30 };
const RIGHT_WIDE = 160; // room for 'Onboarding only 45%'
const RIGHT_NARROW = 112; // names only under 480 px
const HEIGHT = 260;
const LABEL_GAP = 14;
const pct = (v: number) => `${Math.round(v * 100)}%`;

/** The container's width in px (640 until measured), so 1 SVG unit is 1 px and text never shrinks. */
function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0]?.contentRect.width ?? 0);
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/** Spread end labels so none collide (at least LABEL_GAP px apart), keeping their order. */
function spreadLabels(ys: { key: SimKey; y: number }[]): Record<SimKey, number> {
  const sorted = [...ys].sort((a, b) => a.y - b.y);
  for (let i = 1; i < sorted.length; i++) sorted[i].y = Math.max(sorted[i].y, sorted[i - 1].y + LABEL_GAP);
  return Object.fromEntries(sorted.map((s) => [s.key, s.y])) as Record<SimKey, number>;
}

function LegendSwatch({ k }: { k: SimKey }) {
  return (
    <svg width="24" height="8" aria-hidden="true" className="shrink-0">
      <line x1="0" y1="4" x2="24" y2="4" strokeWidth="2" className={STYLE[k].stroke} strokeDasharray={STYLE[k].dash} />
    </svg>
  );
}

/** precision@20 by simulated day for learning vs onboarding-only vs popularity. */
export function SimulationChart({ result, upToDay }: SimulationChartProps) {
  const [ref, width] = useWidth();
  const [active, setActive] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  if (!result) return null;

  const series: SimSeries[] = simSeries(result);
  const maxDay = Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.day)));
  const last = upToDay ?? maxDay;
  const shown = series.map((s) => ({ ...s, points: s.points.filter((p) => p.day <= last) }));
  const narrow = width < 480;
  const plotW = Math.max(120, width - M.left - (narrow ? RIGHT_NARROW : RIGHT_WIDE));
  const plotH = HEIGHT - M.top - M.bottom;
  const xOf = (d: number) => ((d - 1) / Math.max(1, maxDay - 1)) * plotW;
  const yOf = (v: number) => (1 - v) * plotH;
  const days = Array.from({ length: maxDay }, (_, i) => i + 1);
  const ends = spreadLabels(shown.filter((s) => s.points.length > 0).map((s) => ({ key: s.key, y: yOf(s.points.at(-1)!.value) })));
  const activeValues = active === null ? [] : shown.map((s) => ({ s, p: s.points.find((p) => p.day === active) })).filter((x) => x.p);

  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const cur = active ?? (e.key === 'ArrowRight' ? 0 : last + 1);
    const next = Math.min(last, Math.max(1, cur + (e.key === 'ArrowRight' ? 1 : -1)));
    setActive(next);
  };

  return (
    <figure className="m-0 flex flex-col gap-3">
      <ul className="flex flex-wrap gap-x-5 gap-y-1" aria-label="Legend">
        {series.map((s) => (
          <li key={s.key} className="ui-meta flex items-center gap-2 text-ink-soft">
            <LegendSwatch k={s.key} />
            {s.label}
          </li>
        ))}
      </ul>
      <div ref={ref} className="relative w-full">
        <svg
          width={width}
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          role="img"
          aria-label="Share of the reader's top 20 stories the paper picked, by day, for three ways of ranking. Use the arrow keys to read each day."
          tabIndex={0}
          onKeyDown={onKeyDown}
          onBlur={() => setActive(null)}
          className="block max-w-full rounded-control bg-paper outline-none focus-visible:shadow-(--focus-ring)"
        >
          <g transform={`translate(${M.left},${M.top})`}>
            {TICKS.map((t) => (
              <g key={t}>
                <line x1={0} x2={plotW} y1={yOf(t)} y2={yOf(t)} className="stroke-rule" strokeWidth={1} />
                <text x={-8} y={yOf(t)} dy="0.32em" textAnchor="end" className="ui-meta fill-ink-muted" fontSize={12}>
                  {pct(t)}
                </text>
              </g>
            ))}
            {days.map((d) => (
              <text key={d} x={xOf(d)} y={plotH + 20} textAnchor="middle" className="ui-meta fill-ink-muted" fontSize={12}>
                {d === 1 && !narrow ? 'Day 1' : d}
              </text>
            ))}
            {active !== null ? <line x1={xOf(active)} x2={xOf(active)} y1={0} y2={plotH} className="stroke-ink-muted" strokeWidth={1} /> : null}
            {shown.map((s) => (
              <path
                key={s.key}
                d={linePath(s.points, { w: plotW, h: plotH, pad: 0 }, maxDay)}
                fill="none"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={STYLE[s.key].dash}
                className={STYLE[s.key].stroke}
              />
            ))}
            {shown.map((s) => {
              const end = s.points.at(-1);
              if (!end) return null;
              return (
                <g key={`${s.key}-end`}>
                  <circle cx={xOf(end.day)} cy={yOf(end.value)} r={4} className={`${STYLE[s.key].stroke} fill-paper`} strokeWidth={2} />
                  <text x={xOf(end.day) + 10} y={ends[s.key]} dy="0.32em" className="ui-meta fill-ink" fontSize={12}>
                    {narrow ? s.label : `${s.label} ${pct(end.value)}`}
                  </text>
                </g>
              );
            })}
            {days
              .filter((d) => d <= last)
              .map((d) => {
                const half = plotW / Math.max(1, maxDay - 1) / 2;
                return (
                  <rect
                    key={`hit-${d}`}
                    x={xOf(d) - half}
                    y={0}
                    width={half * 2}
                    height={plotH}
                    fill="transparent"
                    onMouseEnter={() => setActive(d)}
                    onMouseLeave={() => setActive(null)}
                  />
                );
              })}
          </g>
        </svg>
        {active !== null && activeValues.length > 0 ? (
          <div
            className="pointer-events-none absolute top-2 z-10 flex flex-col gap-1 rounded-card border border-rule bg-paper-raised px-3 py-2 shadow-floating"
            style={{ left: Math.min(M.left + xOf(active) + 12, Math.max(0, width - 190)) }}
            role="status"
          >
            <span className="dateline text-ink-muted">Day {active}</span>
            {activeValues.map(({ s, p }) => (
              <span key={s.key} className="ui-meta flex items-center gap-2 text-ink">
                <LegendSwatch k={s.key} />
                {s.label} {pct(p!.value)}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <figcaption className="ui-meta text-ink-muted">Precision@20: the share of the 20 stories you would pick that the paper picked.</figcaption>
      <div>
        <Button variant="ghost" aria-expanded={table} onClick={() => setTable((t) => !t)}>
          {table ? 'Hide table' : 'Show table'}
        </Button>
      </div>
      {table ? (
        <table className="ui-meta w-full max-w-(--measure) border-collapse text-left text-ink">
          <thead>
            <tr className="border-b border-rule-strong">
              <th scope="col" className="py-1 pr-3 font-semibold">
                Day
              </th>
              {series.map((s) => (
                <th key={s.key} scope="col" className="py-1 pr-3 font-semibold">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days
              .filter((d) => d <= last)
              .map((d) => (
                <tr key={d} className="border-b border-rule">
                  <th scope="row" className="py-1 pr-3 font-normal">
                    {d}
                  </th>
                  {series.map((s) => {
                    const p = s.points.find((x) => x.day === d);
                    return (
                      <td key={s.key} className="py-1 pr-3">
                        {p ? pct(p.value) : '–'}
                      </td>
                    );
                  })}
                </tr>
              ))}
          </tbody>
        </table>
      ) : null}
    </figure>
  );
}

export default SimulationChart;
