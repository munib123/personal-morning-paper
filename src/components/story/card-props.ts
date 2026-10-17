// EditionItem → Morrow StoryCard props (pure). The card itself is Morrow's; L4 only feeds it.
import type { StoryCardProps } from '@/components/morrow';
import type { EditionItem } from '@/contracts/edition';
import { outboundHref, readingTimeLabel, summaryFor, timeAgo, type CardVariant } from './format';

export function toStoryCardProps(
  item: EditionItem,
  variant: CardVariant,
  ctx: { editionId: string | null; nowIso: string; sectionName: string; isRead: boolean; withDeck?: boolean },
): Omit<StoryCardProps, 'why' | 'footer' | 'onOpen'> {
  const a = item.article;
  return {
    variant,
    kicker: ctx.sectionName,
    headline: a.headline || a.title,
    deck: ctx.withDeck ? a.whyItMatters || undefined : undefined,
    summary: summaryFor(item, variant),
    source: a.sourceName,
    readingTime: readingTimeLabel(a.readingMinutes),
    published: timeAgo(a.publishedAt, ctx.nowIso) || undefined,
    imageUrl: a.imageUrl ?? undefined, // null → a text-only Morrow card
    href: outboundHref(a.id, ctx.editionId),
    read: ctx.isRead,
  };
}
