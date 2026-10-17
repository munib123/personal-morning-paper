import { shortDate } from '@/components/streak/copy';

/** The paper's one-sentence account of what changed, and since when. */
export function ChangeSummary({ summary, sinceDate }: { summary: string; sinceDate: string }) {
  return (
    <div className="flex max-w-(--measure) flex-col gap-2">
      <p className="deck m-0 text-ink-soft">{summary}</p>
      <p className="dateline text-ink-muted">Since {shortDate(sinceDate)}</p>
    </div>
  );
}

export default ChangeSummary;
