'use client';
// One story, read aloud from the story sheet: a quiet ghost button that says "Listen · 1 min",
// then "Pause" / "Resume" while it reads. Unmounting (closing the sheet) stops the voice.
import { Headphones, Pause, Play } from 'lucide-react';
import { useMemo } from 'react';
import { Button } from '@/components/morrow';
import type { Edition, EditionItem } from '@/contracts/edition';
import { buildReadingQueue } from '@/lib/audio/queue';
import { listenLabel } from './ListenBar';
import { useReadAloud } from './useReadAloud';

export interface StoryListenButtonProps {
  item: EditionItem;
  sectionNames?: Edition['sectionNames'];
  /** The story was read to its end. */
  onStoryFinished?(id: string): void;
  /** Listening started: log `audio_play` with the article id. */
  onPlay?(): void;
  className?: string;
}

const ICON = { size: 16, strokeWidth: 1.75, 'aria-hidden': true } as const;

export function StoryListenButton({ item, sectionNames, onStoryFinished, onPlay, className }: StoryListenButtonProps) {
  const queue = useMemo(() => buildReadingQueue([item], { sectionNames, tier: 'deep' }), [item, sectionNames]);
  const audio = useReadAloud(queue, { onStoryFinished, onPlay });
  if (!audio.supported || queue.length === 0) return null;

  const playing = audio.status === 'playing';
  const paused = audio.status === 'paused';
  const label = playing ? 'Pause' : paused ? 'Resume' : listenLabel(audio.minutes);
  return (
    <Button variant="ghost" size="sm" aria-pressed={playing || paused} className={className} onClick={audio.toggle}>
      <span className="inline-flex items-center gap-2">
        {playing ? <Pause {...ICON} /> : paused ? <Play {...ICON} /> : <Headphones {...ICON} />}
        {label}
      </span>
    </Button>
  );
}

export default StoryListenButton;
