// One sentence at the end of the paper on what tomorrow will change: the biggest rise and fall in
// the reader's interest weights (EventsResult.deltas), else this session's More / Less, else a calm line.
import { sectionLabel } from '@/components/story/format';
import type { Edition, EditionItem } from '@/contracts/edition';
import type { WeightDelta } from '@/contracts/signals';

export function tomorrowLine(
  deltas: WeightDelta[],
  feedback: Record<string, 'more' | 'less'>,
  items: EditionItem[],
  names: Edition['sectionNames'],
): string {
  // L3 may send the slug as the name; then use the edition's display name.
  const nameOf = (d: WeightDelta) => (d.name && d.name !== d.slug ? d.name : sectionLabel(d.slug, names));
  const change = (d: WeightDelta) => d.after - d.before;
  const rising = deltas.filter((d) => change(d) > 0).sort((a, b) => change(b) - change(a))[0];
  const falling = deltas.filter((d) => change(d) < 0).sort((a, b) => change(a) - change(b))[0];
  let more = rising ? nameOf(rising) : null;
  let less = falling ? nameOf(falling) : null;

  if (!more && !less) {
    const byId = new Map(items.map((i) => [i.article.id, i]));
    for (const [id, value] of Object.entries(feedback)) {
      const item = byId.get(id);
      if (!item) continue;
      const topic = sectionLabel(item.sectionSlug, names);
      if (value === 'more' && !more) more = topic;
      if (value === 'less' && !less) less = topic;
    }
  }
  if (more && less === more) less = null;

  if (more && less) return `Tomorrow your paper leans a little more toward ${more} and a little less toward ${less}.`;
  if (more) return `Tomorrow your paper leans a little more toward ${more}.`;
  if (less) return `Tomorrow your paper leans a little less toward ${less}.`;
  return "Tomorrow's paper builds on what you read today.";
}
