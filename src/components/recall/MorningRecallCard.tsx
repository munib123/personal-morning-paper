'use client';

import { useState, type KeyboardEvent } from 'react';
import { Button } from '@/components/morrow';
import type { RecallQuestion } from '@/contracts/article';
import { useSignals } from '@/hooks/useSignals';
import { answerEvent, dismissQuestions, firstUnanswered, isHiddenOnLoad, recallScore, saveAnswer, useRecallStore, type Choice } from './recall-state';

export interface MorningRecallCardProps {
  questions: RecallQuestion[];
  editionId: string;
}

const MAX_QUESTIONS = 3;
const KEYS: Record<string, Choice> = { '1': 0, '2': 1, '3': 2 };

// Option buttons are Morrow secondary Buttons. Answers can run long, so they wrap (the Morrow button is
// one line by default); the chosen one takes the single sanctioned state colour, plus an icon and a
// word, never colour alone. `!` is needed because the Morrow component CSS is unlayered.
const OPTION = 'h-auto! min-h-11 whitespace-normal! justify-start! py-2! text-left';
const RIGHT = 'bg-pen-soft! text-pen! border-pen! transition-colors duration-150 motion-reduce:transition-none';
const WRONG = 'bg-press-soft! text-press! border-press! transition-colors duration-150 motion-reduce:transition-none';

/**
 * Morning Recall: up to 3 questions on yesterday's reads, all visible at once, in the TakeawayBox frame
 * (TakeawayBox puts item text in a <p>, which cannot hold a fieldset, so the card reuses its classes).
 * Inline, never a modal; it never blocks the paper. Answers emit recall_answer through useSignals.
 */
export function MorningRecallCard({ questions, editionId }: MorningRecallCardProps) {
  const qs = questions.slice(0, MAX_QUESTIONS);
  const { track } = useSignals(editionId);
  const store = useRecallStore(editionId);
  const [touched, setTouched] = useState(false); // answered during this visit: keep showing the result
  const [skipped, setSkipped] = useState(false);

  if (qs.length === 0 || skipped) return null;
  if (!touched && isHiddenOnLoad(qs, store)) return null;

  const answer = (q: RecallQuestion, chosen: Choice) => {
    if (store.answers[q.articleId] !== undefined) return; // the first answer stands
    setTouched(true);
    saveAnswer(editionId, q.articleId, chosen);
    track(answerEvent(q, chosen, editionId));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const chosen = KEYS[e.key];
    if (chosen === undefined) return;
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
    const next = firstUnanswered(qs, store.answers);
    if (!next) return;
    e.preventDefault();
    answer(next, chosen);
  };

  const skip = () => {
    dismissQuestions(
      editionId,
      qs.map((q) => q.articleId),
    );
    setSkipped(true);
  };

  const allAnswered = firstUnanswered(qs, store.answers) === null;
  const score = recallScore(store.answers, qs);

  return (
    <aside className="mw-takeaway" aria-label="Morning recall" onKeyDown={onKeyDown}>
      <h2 className="mw-takeaway__title kicker">Morning recall</h2>
      <p className="ui-meta mb-1 text-ink-muted">Answer with a tap, or press 1, 2 or 3.</p>
      <ol className="mw-takeaway__list">
        {qs.map((q, i) => {
          const chosen = store.answers[q.articleId];
          const answered = chosen !== undefined;
          const right = answered && chosen === q.answerIndex;
          return (
            <li key={q.articleId} className="mw-takeaway__item">
              <span className="mw-takeaway__num" aria-hidden="true">
                {i + 1}
              </span>
              <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
                <legend className="headline-sm mb-2 p-0 text-ink">{q.question}</legend>
                {q.options.map((option, oi) => {
                  const isChosen = chosen === oi;
                  return (
                    <Button
                      key={oi}
                      variant="secondary"
                      full
                      icon={isChosen ? (right ? 'check' : 'x') : undefined}
                      aria-disabled={answered || undefined}
                      className={[OPTION, isChosen ? (right ? RIGHT : WRONG) : answered ? 'opacity-60' : ''].join(' ')}
                      onClick={() => answer(q, oi as Choice)}
                    >
                      {option}
                      {isChosen ? <span className="whitespace-nowrap">{right ? ' · Right' : ' · Not quite'}</span> : null}
                    </Button>
                  );
                })}
                <div aria-live="polite">{answered ? <p className="body-sm m-0 text-ink-soft">{q.explanation}</p> : null}</div>
              </fieldset>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-2" aria-live="polite">
        {allAnswered ? (
          <p className="ui-meta mw-takeaway__foot">
            You remembered {score.correct} of {score.total}.
          </p>
        ) : (
          <Button variant="ghost" onClick={skip}>
            Skip for today
          </Button>
        )}
      </div>
    </aside>
  );
}

export default MorningRecallCard;
