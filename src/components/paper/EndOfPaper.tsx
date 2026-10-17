'use client';
// The end of the paper (design README "Layout: the web paper" item 5): L7's DoneForToday ("That's your
// paper for today.", the three things you learned and the quiet streak line), one sentence on what
// tomorrow will change, Download PDF (the one accent button, L6) and Past editions, then the closed
// "How this paper was made" panel.
import { Button } from '@/components/morrow';
import { TellYourEditorEntry } from '@/components/editor/TellYourEditor';
import { PdfButton } from '@/components/pdf/PdfButton';
import { DoneForToday } from '@/components/recall/DoneForToday';
import { ROUTES } from '@/contracts/api';
import { useEdition } from './EditionContext';
import { HowThisPaperWasMade } from './HowThisPaperWasMade';
import { tomorrowLine } from './tomorrow';

export function EndOfPaper() {
  const { edition, state, liveStreak, signals } = useEdition();
  const line = tomorrowLine(signals.lastResult?.deltas ?? [], state.feedback, state.items, edition.sectionNames);
  return (
    <div id="end-of-paper" className="mx-auto mt-12 flex max-w-(--measure) flex-col gap-6 border-t border-rule pt-12 md:mt-16 md:pt-16">
      <DoneForToday edition={edition} readIds={state.read} streak={liveStreak} />
      <p className="deck text-ink-soft">{line}</p>
      <div className="flex flex-wrap items-center gap-3">
        <PdfButton date={edition.date} editionId={edition.id} />
        <Button variant="secondary" icon="archive" href={ROUTES.archive}>
          Past editions
        </Button>
      </div>
      <TellYourEditorEntry />
      <HowThisPaperWasMade edition={edition} />
    </div>
  );
}

export default EndOfPaper;
