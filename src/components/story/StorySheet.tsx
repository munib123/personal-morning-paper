'use client';
// The reader view (§9.6): the story in a bottom sheet with the reading column, its "why", how the
// summary was made, the deep summary and the key fact, then the link to the original and the same
// FeedbackBar. Opening it marks the story read, logs an open and starts the dwell timer (stopped on
// close). Inside an EditionReader it uses the edition's handlers; elsewhere it shows content only.
import { useEffect, useRef, type ButtonHTMLAttributes } from 'react';
import { StoryListenButton } from '@/components/audio/StoryListenButton';
import { Button, FeedbackBar, WhyTag } from '@/components/morrow';
import { useEditionOptional } from '@/components/paper/EditionContext';
import { PerspectivesPanel } from '@/components/perspectives/PerspectivesPanel';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import type { EditionItem } from '@/contracts/edition';
import { FaithfulnessBadge } from './FaithfulnessBadge';
import { outboundHref, readingTimeLabel, sectionLabel, timeAgo } from './format';
import { ShareButton } from './ShareButton';
import { WhyChip } from './WhyChip';

export interface StorySheetProps {
  item: EditionItem | null;
  editionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Morrow's Button renders an <a> for href and passes the rest through; its props type has no target/rel.
const NEW_TAB = { target: '_blank', rel: 'noopener noreferrer' } as unknown as ButtonHTMLAttributes<HTMLButtonElement>;

export function StorySheet({ item, editionId, open, onOpenChange }: StorySheetProps) {
  const ctx = useEditionOptional();
  const openerRef = useRef<HTMLElement | null>(null);
  const dispatch = ctx?.dispatch;
  const track = ctx?.signals.track;
  const startDwell = ctx?.signals.startDwell;
  const id = item?.article.id ?? null;
  const visible = open && id !== null;

  useEffect(() => {
    if (!visible || !id || !dispatch || !track || !startDwell) return;
    dispatch({ type: 'markRead', articleId: id });
    track({ type: 'open', articleId: id, meta: { mode: 'sheet' } });
    const stop = startDwell(id, 'sheet');
    return () => stop();
  }, [visible, id, dispatch, track, startDwell]);

  if (!item) return null;
  const a = item.article;
  const names = ctx?.edition.sectionNames ?? {};
  const meta = [a.sourceName, readingTimeLabel(a.readingMinutes), ctx ? timeAgo(a.publishedAt, ctx.nowIso) : ''].filter(Boolean).join(' · ');
  const summary = a.summary.deep || a.summary.std || a.summary.brief;

  return (
    <Sheet open={visible} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[90dvh] gap-0 overflow-y-auto rounded-t-card border-t border-rule bg-paper p-0 text-ink shadow-floating data-open:animate-none data-closed:animate-none"
        // Opened without a Radix trigger, so remember what had focus ("Read here") and give it back on close.
        onOpenAutoFocus={() => {
          openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }}
        onCloseAutoFocus={(e) => {
          const opener = openerRef.current;
          openerRef.current = null;
          if (opener?.isConnected) {
            e.preventDefault();
            opener.focus();
          }
        }}
      >
        <div className="mx-auto flex w-full max-w-(--measure) flex-col gap-4 px-5 pt-10 pb-10">
          <div>
            <p className="kicker text-press">{sectionLabel(item.sectionSlug, names)}</p>
            <SheetTitle className="headline-lg mt-1 text-ink">{a.headline}</SheetTitle>
            {a.whyItMatters ? (
              <SheetDescription className="deck mt-2 text-ink-soft">{a.whyItMatters}</SheetDescription>
            ) : (
              <SheetDescription className="sr-only">A story from {a.sourceName}</SheetDescription>
            )}
            <p className="ui-meta mt-3 text-ink-muted">{meta}</p>
            <div className="mt-2">
              <StoryListenButton item={item} sectionNames={names} onPlay={track ? () => track({ type: 'audio_play', articleId: a.id }) : undefined} />
            </div>
          </div>
          {item.reasons.length > 0 ? (
            <div>
              <WhyTag>
                <WhyChip reasons={item.reasons} breakdown={item.breakdown} onAction={ctx ? (w) => ctx.onWhyAction(item, w) : undefined} />
              </WhyTag>
            </div>
          ) : null}
          <div className="flex flex-col gap-2">
            <FaithfulnessBadge provider={a.aiProvider} />
            {summary ? <p className="body-text text-ink">{summary}</p> : null}
          </div>
          {a.keyFact ? (
            <p className="body-text text-ink">
              <span className="ui-label mr-2 text-ink-muted">Key fact</span>
              <mark className="bg-highlight text-ink">{a.keyFact}</mark>
            </p>
          ) : null}
          <PerspectivesPanel clusterId={a.clusterId} sourceCount={a.alsoCoveredBy.length + 1} editionId={editionId} />
          {/* Share sits beside the way out; on a narrow screen with a long domain it wraps below, full width. */}
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" className="grow-3" href={outboundHref(a.id, editionId)} iconRight="external" {...NEW_TAB}>
              Read on {a.sourceDomain}
            </Button>
            <ShareButton className="grow" title={a.headline || a.title} url={a.url} />
          </div>
          {ctx ? (
            <FeedbackBar
              value={ctx.state.feedback[a.id] ?? null}
              saved={ctx.state.saved.includes(a.id)}
              onChange={(f) => ctx.onFeedback(item, f)}
              onSave={(saved) => ctx.onSave(item, saved)}
              onSkip={
                ctx.readOnly
                  ? undefined
                  : () => {
                      onOpenChange(false);
                      ctx.onSkip(item);
                    }
              }
            />
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default StorySheet;
