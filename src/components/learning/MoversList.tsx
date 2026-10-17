import { Icon } from '@/components/morrow';
import type { WeightDelta } from '@/contracts/signals';
import { deltaLabel, splitMovers } from './learning-view';

function MoverColumn({ title, movers }: { title: string; movers: WeightDelta[] }) {
  if (movers.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="kicker m-0 text-ink-muted">{title}</h3>
      <ul className="flex flex-col">
        {movers.map((m) => {
          const up = m.after > m.before;
          return (
            <li key={m.slug} className="flex items-baseline justify-between gap-4 border-t border-rule py-2 first:border-t-0">
              <span className="ui-text text-ink">{m.name}</span>
              <span className="ui-meta inline-flex shrink-0 items-center gap-1 text-pen">
                <Icon name={up ? 'plus' : 'minus'} size={14} />
                {deltaLabel(m.before, m.after)}
              </span>
            </li>
          );
        })}
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
