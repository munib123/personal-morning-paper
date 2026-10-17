import type { WeightDelta } from '@/contracts/signals';
import { deltaLabel, splitMovers } from './learning-view';

function MoverColumn({ title, movers }: { title: string; movers: WeightDelta[] }) {
  if (movers.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="kicker m-0 text-ink-muted">{title}</h3>
      <ul className="flex flex-col">
        {/* The label carries its own sign ("+12 pts", "−3 pts"); a plus/minus icon beside it read "+ +12 pts". */}
        {movers.map((m) => (
          <li key={m.slug} className="flex items-baseline justify-between gap-4 border-t border-rule py-2 first:border-t-0">
            <span className="ui-text text-ink">{m.name}</span>
            <span className="ui-meta shrink-0 text-pen">{deltaLabel(m.before, m.after)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** What moved this week: rises and drops, the change in pen (the paper learned this). */
export function MoversList({ movers }: { movers: WeightDelta[] }) {
  const { up, down } = splitMovers(movers);
  return (
    <div className="grid max-w-(--measure) grid-cols-1 gap-6 sm:grid-cols-2">
      <MoverColumn title="Up" movers={up} />
      <MoverColumn title="Down" movers={down} />
    </div>
  );
}

export default MoversList;
