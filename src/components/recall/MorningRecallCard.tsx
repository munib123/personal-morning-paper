// STUB (L0) — owner: L7. Replace freely; keep the props.
import type { RecallQuestion } from '@/contracts/article';

export interface MorningRecallCardProps {
  questions: RecallQuestion[];
  editionId: string;
}

const LETTERS = ['A', 'B', 'C'] as const;

// Morning Recall: up to three questions on yesterday's reads, boxed like the TakeawayBox.
// Stub: a static rendering with the answer behind a native <details>; L7 adds answering and the
// recall_answer signal.
export function MorningRecallCard({ questions, editionId }: MorningRecallCardProps) {
  if (questions.length === 0) return null;
  return (
    <section aria-label="Morning recall" data-edition-id={editionId} className="border-t-3 border-b border-ink pt-3 pb-4">
      <h2 className="kicker mb-2 text-press">Morning recall</h2>
      <ol>
        {questions.map((q) => (
          <li key={q.articleId} className="flex flex-col gap-2 border-t border-rule py-3 first:border-t-0">
            <p className="headline-sm text-ink">{q.question}</p>
            <ol className="flex flex-col gap-1">
              {q.options.map((option, i) => (
                <li key={i} className="ui-text text-ink-soft">
                  <span className="ui-label text-ink">{LETTERS[i]}</span> {option}
                </li>
              ))}
            </ol>
            <details className="ui-meta text-ink-muted">
              <summary className="cursor-pointer">Show the answer</summary>
              <p className="ui-text mt-2 text-ink-soft">
                <span className="ui-label text-ink">{LETTERS[q.answerIndex]}.</span> {q.explanation}
              </p>
            </details>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default MorningRecallCard;
