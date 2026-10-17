'use client';

import { useState } from 'react';
import { Button, TakeawayBox } from '@/components/morrow';
import type { RecallQuestion } from '@/contracts/article';
import type { Edition } from '@/contracts/edition';
import type { StreakView } from '@/contracts/streak';
import { useLiveStreak } from '@/components/streak/live';
import { MorningRecallCard } from './MorningRecallCard';
import { isHiddenOnLoad, useRecallStore } from './recall-state';
import { doneStreakLine, pickThreeThings } from './three-things';

export interface DoneForTodayProps {
  edition: Edition;
  readIds: string[];
  streak: StreakView | null;
}

const TITLES = ['', 'One thing you learned', 'Two things you learned', 'Three things you learned'] as const;

/**
 * End of paper (§9.6): "That's your paper for today.", the key facts of up to 3 stories read today
 * (Morrow TakeawayBox), the quiet streak line, and "Quiz me now" with those stories' questions.
 * No ring, badge or celebration: finishing the paper is the reward.
 */
export function DoneForToday({ edition, readIds, streak }: DoneForTodayProps) {
  const live = useLiveStreak(streak);
  const things = pickThreeThings(edition, readIds);
  const quiz = things.map((t) => t.recall).filter((q): q is RecallQuestion => q !== null);
  const store = useRecallStore(edition.id);
  const [quizOpen, setQuizOpen] = useState(false);
  // Quizzed on an earlier visit: the card would stay hidden, so don't offer a button that opens nothing.
  const canQuiz = quiz.length > 0 && (quizOpen || !isHiddenOnLoad(quiz, store));

  return (
    <section aria-label="End of paper" className="flex flex-col gap-6">
      <h2 className="headline-md text-ink">{"That's your paper for today."}</h2>
      {things.length > 0 ? (
        <TakeawayBox
          title={TITLES[things.length]}
          items={things.map((t) => ({ kicker: t.section, text: t.fact }))}
          footnote="Tomorrow's Morning Recall will ask about these."
        />
      ) : (
        <p className="ui-text text-ink-muted">Read a story and its key fact lands here.</p>
      )}
      {live ? <p className="ui-meta text-ink-muted">{doneStreakLine(live)}</p> : null}
      {canQuiz ? (
        quizOpen ? (
          <MorningRecallCard questions={quiz} editionId={edition.id} />
        ) : (
          <div>
            <Button variant="secondary" onClick={() => setQuizOpen(true)}>
              Quiz me now
            </Button>
          </div>
        )
      ) : null}
    </section>
  );
}

export default DoneForToday;
