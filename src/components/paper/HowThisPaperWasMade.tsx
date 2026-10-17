'use client';
// "How this paper was made" (PLAN §5a): the receipt as a stepped funnel on a log scale, the build
// time, the LLM calls spent on this reader, and the share of AI summaries vs publisher's excerpts.
// A native <details>, so it is keyboard and screen-reader collapsible for free; closed by default.
import { Icon } from '@/components/morrow';
import type { Edition } from '@/contracts/edition';
import { aiShareOf, editionFunnel } from './receipt';

export const HOW_MADE_ID = 'how-this-paper-was-made';

const count = (n: number) => n.toLocaleString('en-GB');
/** Bar width on a log10 scale, so 20 of 1,000 is still visible. */
const logWidth = (value: number, max: number) => (value <= 0 || max <= 1 ? 0 : Math.max(2, Math.round((Math.log10(Math.max(1, value)) / Math.log10(max)) * 100)));

export function HowThisPaperWasMade({ edition }: { edition: Edition }) {
  const r = edition.receipt;
  const funnel = editionFunnel(edition);
  const max = Math.max(...funnel.map((s) => s.value), 1);
  const share = aiShareOf(r);
  const shareText = `AI summaries ${share.aiPct}% · Publisher's excerpts ${share.extractivePct}%`;

  return (
    <details id={HOW_MADE_ID} className="group scroll-mt-40 border-t border-rule">
      <summary className="ui-label flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-3 text-ink [&::-webkit-details-marker]:hidden">
        <span>How this paper was made</span>
        <Icon name="chevron-right" size={16} className="transition-transform duration-150 group-open:rotate-90" />
      </summary>
      <div className="flex flex-col gap-6 pb-8">
        <ol className="flex flex-col gap-3" aria-label="From the web to your paper">
          {funnel.map((step) => (
            <li key={step.key}>
              <div className="ui-meta flex items-baseline justify-between gap-3 text-ink-soft">
                <span>{step.label}</span>
                <span className="text-ink">{count(step.value)}</span>
              </div>
              <div className="mt-1 h-2 bg-paper-sunk">
                <div className="h-full bg-ink-muted" style={{ width: `${logWidth(step.value, max)}%` }} />
              </div>
            </li>
          ))}
        </ol>

        <ul className="ui-text flex flex-col gap-1 text-ink-soft">
          <li>{`Built in ${count(r.buildMs)} ms`}</li>
          <li>{`LLM calls for you: ${count(r.llmCallsThisEdition)}`}</li>
          <li>Ranking is local math, 0 AI calls per reader</li>
        </ul>

        <div className="flex flex-col gap-2">
          {share.total > 0 ? (
            <>
              <div className="flex h-2 bg-paper-sunk" aria-hidden="true">
                <div data-share="ai" className="h-full bg-ink" style={{ width: `${share.aiPct}%` }} />
                <div data-share="extractive" className="h-full bg-rule-strong" style={{ width: `${share.extractivePct}%` }} />
              </div>
              <p className="ui-meta text-ink-soft">{shareText}</p>
            </>
          ) : (
            <p className="ui-meta text-ink-soft">No summaries in this edition</p>
          )}
        </div>

        <p className="ui-meta text-ink-muted">Ranked with {r.algoVersion}, the same rules for every reader.</p>
      </div>
    </details>
  );
}

export default HowThisPaperWasMade;
