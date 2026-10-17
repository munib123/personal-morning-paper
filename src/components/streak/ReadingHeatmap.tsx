import type { HeatmapDay } from '@/contracts/streak';
import { shortDate } from './copy';

const CELL = 12;
const GAP = 2;
const ROWS = 7;
const OPACITY: Record<HeatmapDay['level'], number> = { 0: 0, 1: 0.15, 2: 0.35, 3: 0.6, 4: 1 };

/** One hue (ink): level 0 is an outlined cell, levels 1–4 rise in opacity. */
export function cellOpacity(level: HeatmapDay['level']): number {
  return OPACITY[level];
}

const storiesText = (n: number) => (n === 1 ? '1 story' : `${n} stories`);

/** The last 12 weeks of reading as a 7 × 12 grid of ink squares, with a hidden table of the same data. */
export function ReadingHeatmap({ days }: { days: HeatmapDay[] }) {
  const columns = Math.ceil(days.length / ROWS);
  const width = columns * (CELL + GAP) - GAP;
  const height = ROWS * (CELL + GAP) - GAP;
  return (
    <figure className="m-0 flex flex-col gap-2">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Your reading over the last ${columns} weeks`} className="max-w-full">
        {days.map((d, i) => {
          const x = Math.floor(i / ROWS) * (CELL + GAP);
          const y = (i % ROWS) * (CELL + GAP);
          const title = `${shortDate(d.date)} · ${storiesText(d.storiesRead)}`;
          return d.level === 0 ? (
            <rect key={d.date} x={x + 0.5} y={y + 0.5} width={CELL - 1} height={CELL - 1} className="fill-transparent stroke-rule" strokeWidth={1}>
              <title>{title}</title>
            </rect>
          ) : (
            <rect key={d.date} x={x} y={y} width={CELL} height={CELL} className="fill-ink" fillOpacity={cellOpacity(d.level)}>
              <title>{title}</title>
            </rect>
          );
        })}
      </svg>
      <figcaption className="ui-meta flex items-center gap-2 text-ink-muted" aria-hidden="true">
        <span>Fewer</span>
        {([0, 1, 2, 3, 4] as const).map((l) => (
          <span key={l} className={l === 0 ? 'inline-block size-3 border border-rule' : 'inline-block size-3 bg-ink'} style={l === 0 ? undefined : { opacity: cellOpacity(l) }} />
        ))}
        <span>More</span>
      </figcaption>
      <table className="sr-only">
        <caption>Stories read per day, last {columns} weeks</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Stories read</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.date}>
              <td>{shortDate(d.date)}</td>
              <td>{d.storiesRead}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export default ReadingHeatmap;
