'use client';
// One story on the paper: the Morrow StoryCard, fed by toStoryCardProps, with the WhyTag content and
// the footer. The headline links out through /r (which logs read_original server-side), and the
// click marks the story read here. The wrapper carries data-slot for impressions.
import { StoryCard } from '@/components/morrow';
import { useEdition } from '@/components/paper/EditionContext';
import type { EditionItem } from '@/contracts/edition';
import { toStoryCardProps } from './card-props';
import { sectionLabel, type CardVariant } from './format';
import { StoryFooter } from './StoryFooter';
import { WhyChip } from './WhyChip';

export interface PaperStoryProps {
  item: EditionItem;
  variant: CardVariant;
  withDeck?: boolean;
  readOnly?: boolean;
}

export function PaperStory({ item, variant, withDeck, readOnly }: PaperStoryProps) {
  const ctx = useEdition();
  const { state, edition } = ctx;
  const id = item.article.id;
  const card = toStoryCardProps(item, variant, {
    editionId: edition.id,
    nowIso: ctx.nowIso,
    sectionName: sectionLabel(item.sectionSlug, edition.sectionNames),
    isRead: state.read.includes(id),
    withDeck,
  });
  const canSkip = !(readOnly ?? ctx.readOnly);

  return (
    <div data-slot={item.slot} data-article-id={id} ref={(el) => ctx.signals.observeImpression(el, id)}>
      <StoryCard
        {...card}
        why={
          item.reasons.length > 0 ? (
            <WhyChip reasons={item.reasons} breakdown={item.breakdown} onAction={(a) => ctx.onWhyAction(item, a)} />
          ) : undefined
        }
        footer={
          <StoryFooter
            item={item}
            showBadge={variant === 'lead' || variant === 'standard'}
            feedback={state.feedback[id] ?? null}
            saved={state.saved.includes(id)}
            onFeedback={(f) => ctx.onFeedback(item, f)}
            onSave={(saved) => ctx.onSave(item, saved)}
            onSkip={canSkip ? () => ctx.onSkip(item) : undefined}
            onRead={() => ctx.openSheet(id)}
          />
        }
        onOpen={() => ctx.dispatch({ type: 'markRead', articleId: id })}
      />
    </div>
  );
}

export default PaperStory;
