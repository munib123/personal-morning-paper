'use client';
// Bytes: the same edition one story at a time, the phone default. A vertical deck with native scroll
// snap (no slide transitions) between the reader shell's bars, under the compact masthead and the
// reading progress. The story in view starts its dwell; 8 s of visible time marks it read and logs an
// open (mode 'bytes'). Keys j / k / x / o / s, and Previous / Next buttons on every slide. The last
// slide is the end of the paper.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/morrow';
import { PaperStory } from '@/components/story/PaperStory';
import type { EditionItem } from '@/contracts/edition';
import { keyToAction } from './bytes-keys';
import { useEdition } from './EditionContext';
import { EndOfPaper } from './EndOfPaper';
import { FadeSlot } from './FadeSlot';
import { PaperMasthead } from './PaperMasthead';
import { createVisibleTimer } from './visible-timer';

const READ_AFTER_MS = 8000;

/**
 * Every slide is one complete byte that fits the screen with its controls: the ~60-word summary
 * (deep-tier stories show their std one here) and no photo (the Front page carries the pictures).
 */
const asByte = (item: EditionItem): EditionItem => ({
  ...item,
  tier: item.tier === 'deep' ? 'std' : item.tier,
  article: { ...item.article, imageUrl: null },
});
const dialogOpen = () => document.querySelector('[role="dialog"]') !== null;

// Narrow phones get the icon-only FeedbackBar so a whole byte and its controls fit one screen.
// The server (and hydration) render the labelled bar; the client switches after hydration.
const NARROW = '(max-width: 479px)';
const subscribeNarrow = (notify: () => void) => {
  const mq = typeof window.matchMedia === 'function' ? window.matchMedia(NARROW) : null;
  mq?.addEventListener('change', notify);
  return () => mq?.removeEventListener('change', notify);
};
const isNarrow = () => (typeof window.matchMedia === 'function' ? window.matchMedia(NARROW).matches : false);
const useNarrow = () => useSyncExternalStore(subscribeNarrow, isNarrow, () => false);

export function BytesDeck({ readerName, city }: { readerName: string | null; city: string | null }) {
  const { state, dispatch, signals, readOnly, openSheet, onSkip, onSave } = useEdition();
  const { startDwell, track } = signals;
  const items = state.items;
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const readByDwell = useRef(new Set<string>());
  const narrow = useNarrow();

  // Latest values for the window key handler, which is bound once.
  const latest = useRef({ items, active, state, readOnly });
  useEffect(() => {
    latest.current = { items, active, state, readOnly };
  });

  const goTo = useCallback((index: number) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const slides = scroller.querySelectorAll<HTMLElement>('[data-slide]');
    const i = Math.max(0, Math.min(index, slides.length - 1));
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    slides[i]?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
    setActive(i);
  }, []);

  // The active slide is the last one whose top has passed 40% of the deck's height.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const probe = scroller.scrollTop + scroller.clientHeight * 0.4;
        let index = 0;
        scroller.querySelectorAll<HTMLElement>('[data-slide]').forEach((slide, i) => {
          if (slide.offsetTop <= probe) index = i;
        });
        setActive(index);
      });
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  // The story in view: dwell while it is on screen, read after 8 visible seconds (once per story).
  const activeId = items[active]?.article.id ?? null;
  useEffect(() => {
    if (!activeId) return;
    const stopDwell = startDwell(activeId, 'bytes');
    const timer = createVisibleTimer(READ_AFTER_MS, () => {
      if (readByDwell.current.has(activeId)) return;
      readByDwell.current.add(activeId);
      dispatch({ type: 'markRead', articleId: activeId });
      track({ type: 'open', articleId: activeId, meta: { mode: 'bytes' } });
    });
    timer.start();
    return () => {
      timer.dispose();
      stopDwell();
    };
  }, [activeId, startDwell, track, dispatch]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = keyToAction({
        key: e.key,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey,
        target: e.target as { tagName?: string; isContentEditable?: boolean } | null,
      });
      if (!action || action === 'toggle' || dialogOpen()) return; // b is handled by the reader for both views
      const { items: list, active: index, state: s, readOnly: ro } = latest.current;
      const item = list[index];
      e.preventDefault();
      if (action === 'next') goTo(index + 1);
      else if (action === 'prev') goTo(index - 1);
      else if (!item) return;
      else if (action === 'skip' && !ro) onSkip(item);
      else if (action === 'open') openSheet(item.article.id);
      else if (action === 'save') onSave(item, !s.saved.includes(item.article.id));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goTo, onSkip, openSheet, onSave]);

  return (
    <div className="fixed inset-x-0 top-14 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 flex flex-col bg-paper md:bottom-0">
      <PaperMasthead readerName={readerName} city={city} compactOnly />
      <div
        ref={scrollerRef}
        role="region"
        aria-roledescription="carousel"
        aria-label="Today's stories, one at a time"
        className="relative min-h-0 flex-1 snap-y snap-mandatory overflow-y-auto overscroll-contain motion-safe:scroll-smooth"
      >
        {items.map((item, i) => (
          <section
            key={i}
            data-slide
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${items.length}`}
            aria-current={i === active ? 'true' : undefined}
            className="flex min-h-full snap-start flex-col border-b border-rule"
          >
            <div className="mx-auto flex w-full max-w-(--measure) flex-1 flex-col justify-center gap-6 px-5 py-8">
              <FadeSlot id={item.article.id}>
                <PaperStory item={asByte(item)} variant={item.tier === 'brief' ? 'brief' : 'standard'} compactFeedback={narrow} />
              </FadeSlot>
              <div className="flex items-center justify-between gap-3">
                <Button variant="ghost" size="sm" icon="arrow-left" onClick={() => goTo(i - 1)} disabled={i === 0}>
                  Previous
                </Button>
                <span className="ui-meta text-ink-muted">
                  {i + 1} of {items.length}
                </span>
                <Button variant="ghost" size="sm" iconRight="arrow-right" onClick={() => goTo(i + 1)}>
                  Next
                </Button>
              </div>
            </div>
          </section>
        ))}
        <section data-slide aria-roledescription="slide" aria-label="End of paper" className="min-h-full snap-start">
          <div className="mx-auto max-w-(--measure) px-5 pb-16">
            <EndOfPaper />
          </div>
        </section>
      </div>
    </div>
  );
}

export default BytesDeck;
