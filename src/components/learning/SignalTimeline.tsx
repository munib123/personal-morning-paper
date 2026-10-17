import type { LearningView } from '@/contracts/learning';
import { timeAgo, timelineLabel } from './learning-view';

const MAX_ENTRIES = 20;

/** The last signals and what each one changed: "1h ago · Opened · {headline} → Cricket +1%". */
export function SignalTimeline({ timeline, nowIso }: { timeline: LearningView['timeline']; nowIso: string }) {
  return (
    <ol className="flex max-w-(--measure) flex-col">
      {timeline.slice(0, MAX_ENTRIES).map((t, i) => (
        <li key={`${t.at}-${i}`} className="ui-meta border-t border-rule py-2 text-ink-muted first:border-t-0">
          <span>{timeAgo(t.at, nowIso)}</span>
          <span aria-hidden="true"> · </span>
          <span className="text-ink">{timelineLabel(t.type)}</span>
          {t.headline ? (
            <>
              <span aria-hidden="true"> · </span>
              <span className="text-ink-soft">{t.headline}</span>
            </>
          ) : null}
          {/* The server falls back to the raw signal type ("dwell", "audio_play") when a signal moved
              nothing; show an effect only when there is one, never an internal event name. */}
          {t.effect && t.effect !== t.type ? (
            <>
              <span aria-hidden="true"> → </span>
              <span className="sr-only">, effect: </span>
              <span className="text-pen">{t.effect}</span>
            </>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

export default SignalTimeline;
