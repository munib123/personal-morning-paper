'use client';
// The Morrow masthead for this edition: the full nameplate with its ears at the top of the Front
// page, and, once that has scrolled away (always in Bytes), a fixed compact masthead with the
// reading progress, under the reader shell's TopBar. It fades in; nothing slides.
import { AnimatePresence, motion } from 'motion/react';
import { useRef } from 'react';
import { Button, Masthead, ReadingProgress, Segmented } from '@/components/morrow';
import { formatEditionDate, readingTimeLabel } from '@/components/story/format';
import { BRAND } from '@/lib/brand';
import { useEdition } from './EditionContext';
import { progressLabel, progressOf } from './edition-state';
import { HOW_MADE_ID } from './HowThisPaperWasMade';
import { useScrolledPast } from './use-scrolled-past';
import { persistView, type ReaderView } from './view-pref';

const HOW_MADE_HREF = `#${HOW_MADE_ID}`;

const VIEW_OPTIONS = [
  { value: 'front', label: 'Front page' },
  { value: 'bytes', label: 'Bytes' },
];

export interface PaperMastheadProps {
  readerName: string | null;
  city: string | null;
  /** Bytes has no full masthead: only the compact one. */
  compactOnly?: boolean;
  onHowMade?: () => void;
}

export function PaperMasthead({ readerName, city, compactOnly = false, onHowMade }: PaperMastheadProps) {
  const { edition, state, view, setView } = useEdition();
  const fullRef = useRef<HTMLDivElement>(null);
  const scrolledPast = useScrolledPast(fullRef);
  const date = formatEditionDate(edition.date);
  const progress = progressOf(state);

  const choose = (value: string) => {
    const next: ReaderView = value === 'bytes' ? 'bytes' : 'front';
    setView(next);
    persistView(next);
  };

  const toggle = (name: string) => (
    <div role="group" aria-label="View">
      <Segmented name={name} options={VIEW_OPTIONS} value={view} onChange={choose} />
    </div>
  );

  const compactBar = (
    <div className="mx-auto max-w-(--page-max)">
      {/* The TopBar above already shows the nameplate, so on a phone the compact Masthead (a second
          nameplate, and a toggle squeezed onto two lines) gives way: the Front page keeps just the
          progress (its toggle stays in the full masthead) and Bytes keeps its toggle on its own row. */}
      <div className="hidden sm:block">
        <Masthead variant="compact" title={BRAND.nameplate} date={date} actions={toggle('view-compact')} />
      </div>
      {compactOnly ? <div className="flex justify-end px-4 pt-3 sm:hidden">{toggle('view-compact-phone')}</div> : null}
      <div className="px-4 pt-2 pb-2 sm:px-6 sm:pt-1">
        <ReadingProgress value={progress.total > 0 ? progress.read / progress.total : 0} label={progressLabel(progress)} />
      </div>
    </div>
  );

  return (
    <>
      {compactOnly ? null : (
        <div ref={fullRef} data-masthead="full" className="pt-6">
          <Masthead
            title={BRAND.nameplate}
            edition={edition.number}
            reader={readerName ?? undefined}
            date={date}
            location={city ?? undefined}
            storyCount={state.items.length}
            readingTime={readingTimeLabel(edition.presentation.timeBudget)}
            actions={
              // The ear is a dateline (uppercase, tracked); the controls inside it keep their own sentence case.
              <div className="flex flex-wrap items-end justify-center gap-2 tracking-normal normal-case sm:justify-end">
                <Segmented label="View" name="view-full" options={VIEW_OPTIONS} value={view} onChange={choose} />
                <Button variant="ghost" size="sm" href={HOW_MADE_HREF} onClick={onHowMade}>
                  How this paper was made
                </Button>
              </div>
            }
          />
        </div>
      )}
      <AnimatePresence initial={false}>
        {!compactOnly && scrolledPast ? (
          <motion.div
            key="compact-masthead"
            data-masthead="compact"
            className="fixed inset-x-0 top-14 z-30 bg-paper-raised shadow-floating"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {compactBar}
          </motion.div>
        ) : null}
      </AnimatePresence>
      {/* Bytes: the compact masthead sits at the top of the deck, in flow. */}
      {compactOnly ? (
        <div data-masthead="compact" className="relative z-10 bg-paper-raised shadow-floating">
          {compactBar}
        </div>
      ) : null}
    </>
  );
}

export default PaperMasthead;
