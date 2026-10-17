'use client';
// "Listen · 7 min": the paper reads itself on the commute, with the browser's own voice. Collapsed it
// is one quiet ghost button; expanded, a thin bar with previous / play-pause / next, the story being
// read (section kicker and headline, announced politely), the speed and a close. Morrow only; hidden
// entirely where speechSynthesis does not exist.
import { Headphones, Pause, Play, SkipBack, SkipForward, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, Segmented } from '@/components/morrow';
import type { Edition, EditionItem } from '@/contracts/edition';
import type { Rate } from '@/lib/audio/prefs';
import { buildReadingQueue } from '@/lib/audio/queue';
import { cn } from '@/lib/utils';
import { useReadAloud } from './useReadAloud';

export interface ListenBarProps {
  /** The stories on the page, in reading order (EditionState.items). */
  items: EditionItem[];
  /** Skipped stories are not read (EditionState.skippedIds). */
  skippedIds?: string[];
  sectionNames?: Edition['sectionNames'];
  /** A story was read to its end: mark it read and log it through your own signals hook. */
  onStoryFinished?(id: string): void;
  /** A listening session started: log `audio_play`. */
  onPlay?(): void;
  className?: string;
}

export const RATE_OPTIONS: { value: string; label: string }[] = [
  { value: '0.9', label: '0.9×' },
  { value: '1', label: '1×' },
  { value: '1.2', label: '1.2×' },
];

const ICON = { size: 16, strokeWidth: 1.75, 'aria-hidden': true } as const;

export function listenLabel(minutes: number): string {
  return `Listen · ${minutes} min`;
}

export function ListenBar({ items, skippedIds, sectionNames, onStoryFinished, onPlay, className }: ListenBarProps) {
  const queue = useMemo(() => buildReadingQueue(items, { skippedIds, sectionNames }), [items, skippedIds, sectionNames]);
  const audio = useReadAloud(queue, { onStoryFinished, onPlay });
  const [open, setOpen] = useState(false);

  if (!audio.supported || queue.length === 0) return null;

  if (!open) {
    return (
      <div className={cn('flex justify-end', className)}>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Listen to this paper, about ${audio.minutes} min`}
          onClick={() => {
            setOpen(true);
            audio.play();
          }}
        >
          <span className="inline-flex items-center gap-2">
            <Headphones {...ICON} />
            {listenLabel(audio.minutes)}
          </span>
        </Button>
      </div>
    );
  }

  const playing = audio.status === 'playing';
  const position = audio.current ? queue.indexOf(audio.current) + 1 : 0;
  const done = audio.status === 'done';

  return (
    <section
      aria-label="Listen to this paper"
      className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 border-y border-rule bg-paper-raised px-3 py-2 md:flex-nowrap', className)}
    >
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" aria-label="Previous story" onClick={audio.prev}>
          <SkipBack {...ICON} />
        </Button>
        <Button variant="primary" size="sm" aria-label={playing ? 'Pause' : 'Play'} onClick={audio.toggle}>
          {playing ? <Pause {...ICON} /> : <Play {...ICON} />}
        </Button>
        <Button variant="ghost" size="sm" aria-label="Next story" onClick={audio.next}>
          <SkipForward {...ICON} />
        </Button>
      </div>

      <div className="min-w-0 flex-1 basis-full md:basis-auto">
        <p className="dateline text-ink-muted">{done ? 'Read to the end' : `Story ${position} of ${queue.length} · ${audio.minutes} min`}</p>
        <p aria-live="polite" aria-atomic="true" className="deck truncate text-ink-soft">
          {audio.current ? (
            <>
              <span className="kicker mr-2 text-press">{audio.current.section}</span>
              {audio.current.headline}
            </>
          ) : done ? (
            "That's your paper, read to the end."
          ) : (
            'Ready to read.'
          )}
        </p>
      </div>

      <div role="group" aria-label="Reading speed" className="shrink-0">
        <Segmented name="listen-rate" options={RATE_OPTIONS} value={String(audio.rate)} onChange={(v) => audio.setRate(Number(v) as Rate)} />
      </div>

      <Button
        variant="ghost"
        size="sm"
        aria-label="Stop listening"
        onClick={() => {
          audio.stop();
          setOpen(false);
        }}
      >
        <X {...ICON} />
      </Button>
    </section>
  );
}

export default ListenBar;
