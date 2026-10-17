// Reader-facing copy from the learning loop (Morrow voice, §3a): calm, sentence case, "you" / "your paper",
// no exclamation marks, no emoji. The toast is the one-line note under the FeedbackBar.
import type { Candidate } from '@/contracts/engine';
import type { SignalEvent } from '@/contracts/signals';
import type { TopicNode } from '@/contracts/taxonomy';

/** Display name of the item's top label (highest confidence; labels come most specific first). */
function topicNameOf(item: Candidate | null, taxonomy: TopicNode[]): string | null {
  if (!item || item.labels.length === 0) return null;
  let top = item.labels[0];
  for (const l of item.labels) if (l.conf > top.conf) top = l;
  return taxonomy.find((t) => t.slug === top.slug)?.name ?? null;
}

export function toastFor(ev: SignalEvent, item: Candidate | null, taxonomy: TopicNode[]): string | null {
  if (ev.type === 'hide_source') return 'Got it. Fewer stories from this source tomorrow.';
  const more = ev.type === 'more' || ev.type === 'taste_more';
  const less = ev.type === 'less' || ev.type === 'taste_less' || (ev.type === 'skip' && ev.meta?.reason === 'not_interested');
  if (!more && !less) return null;
  const topic = topicNameOf(item, taxonomy);
  if (!topic) return null;
  return more ? `Got it. More ${topic} tomorrow.` : `Got it. Less ${topic} tomorrow.`;
}
