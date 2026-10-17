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
              <div className="flex flex-wrap items-end justify-center gap-2 sm:justify-end">
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
        {compactOnly || scrolledPast ? (
          <motion.div
            key="compact-masthead"
            data-masthead="compact"
            className="fixed inset-x-0 top-14 z-30 bg-paper-raised shadow-floating"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div className="mx-auto max-w-(--page-max)">
              <Masthead
                variant="compact"
                title={BRAND.nameplate}
                date={date}
                actions={
                  // On a phone the Front page keeps its toggle in the full masthead; Bytes has only this one.
                  <div role="group" aria-label="View" className={compactOnly ? undefined : 'hidden sm:block'}>
                    <Segmented name="view-compact" options={VIEW_OPTIONS} value={view} onChange={choose} />
                  </div>
                }
              />
              <div className="px-6 pt-1 pb-2">
                <ReadingProgress value={progress.total > 0 ? progress.read / progress.total : 0} label={progressLabel(progress)} />
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

export default PaperMasthead;
