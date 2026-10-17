'use client';
// One story on the paper: the Morrow StoryCard, fed by toStoryCardProps, with the WhyTag content and
// the footer. The headline links out through /r (which logs read_original server-side), and the
// click marks the story read here. The wrapper carries data-slot for impressions.
import { useEffect, useRef } from 'react';
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
  /** Icon-only FeedbackBar, for the narrow columns of the front page. */
  compactFeedback?: boolean;
}

/**
 * Fades a story image in once it has loaded, over the paper-sunk box that already holds its 3:2 space
 * (globals.css: [data-img="pending"] is transparent). An image that has already loaded (cached, or
 * before hydration) is left alone so nothing blinks, and cleanup never leaves one hidden.
 */
export function fadeInWhenLoaded(img: HTMLImageElement): () => void {
  if (img.complete) return () => {};
  const ready = () => {
    img.dataset.img = 'ready';
  };
  img.dataset.img = 'pending';
  img.addEventListener('load', ready, { once: true });
  img.addEventListener('error', ready, { once: true });
  return () => {
    img.removeEventListener('load', ready);
    img.removeEventListener('error', ready);
    if (img.dataset.img === 'pending') ready();
  };
}

export function PaperStory({ item, variant, withDeck, readOnly, compactFeedback }: PaperStoryProps) {
  const ctx = useEdition();
  const { state, edition } = ctx;
  const id = item.article.id;
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const imageUrl = item.article.imageUrl;
  useEffect(() => {
    const img = imageUrl ? wrapRef.current?.querySelector<HTMLImageElement>('.mw-story__figure img') : null;
    return img ? fadeInWhenLoaded(img) : undefined;
  }, [imageUrl]);
  const card = toStoryCardProps(item, variant, {
    editionId: edition.id,
    nowIso: ctx.nowIso,
    sectionName: sectionLabel(item.sectionSlug, edition.sectionNames),
    isRead: state.read.includes(id),
    withDeck,
  });
  const canSkip = !(readOnly ?? ctx.readOnly);

  return (
    <div
      data-slot={item.slot}
      data-article-id={id}
      ref={(el) => {
        wrapRef.current = el;
        ctx.signals.observeImpression(el, id);
      }}
    >
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
            compact={compactFeedback}
          />
        }
        onOpen={() => ctx.dispatch({ type: 'markRead', articleId: id })}
      />
    </div>
  );
}

export default PaperStory;
