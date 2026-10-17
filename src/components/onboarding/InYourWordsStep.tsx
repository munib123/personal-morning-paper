'use client';
// Step 3, "In your words": free text → topics, through POST /api/onboarding/describe (Gemini with a
// keyword fallback on the server). Added topics show as removable chips; things to see less of show
// under "Less of". "Sources to avoid" stays in the draft only (OnboardingInput has no field for it yet).
import { useRef, useState } from 'react';
import { Button, TextField, TopicChip } from '@/components/morrow';
import { DescribeResponseSchema, ROUTES } from '@/contracts/api';
import type { InterestPick } from '@/contracts/profile';
import type { TopicNode, TopicSlug } from '@/contracts/taxonomy';
import { pickerReducer, type InterestPickerValue } from './lib/picker-state';

export type InYourWordsPatch = { words?: string; avoidSources?: string; picks?: InterestPick[]; blocked?: TopicSlug[] };

const MAX_TEXT = 1000; // DescribeRequestSchema
const NOTE = {
  added: "Added to your paper. Remove anything that's wrong.",
  none: 'No topics matched that. Try other words, or continue.',
} as const;
const FAILED = "That didn't go through. Your picks are saved; try again or continue.";

export function InYourWordsStep({ words, avoidSources, value, taxonomy, onChange }: {
  words: string;
  avoidSources: string;
  value: InterestPickerValue;
  taxonomy: TopicNode[];
  onChange: (patch: InYourWordsPatch) => void;
}) {
  const [status, setStatus] = useState<'idle' | 'busy' | 'added' | 'none' | 'error'>('idle');
  const inFlight = useRef(false);
  const nameOf = (slug: TopicSlug) => taxonomy.find((n) => n.slug === slug)?.name ?? slug;

  const apply = (action: Parameters<typeof pickerReducer>[1]) => {
    const next = pickerReducer({ ...value, open: [] }, action, taxonomy);
    if (next.picks !== value.picks || next.blocked !== value.blocked) onChange({ picks: next.picks, blocked: next.blocked });
    return next;
  };

  async function describe() {
    const text = words.trim().slice(0, MAX_TEXT);
    if (inFlight.current || !text) return;
    inFlight.current = true;
    setStatus('busy');
    try {
      const res = await fetch(ROUTES.describe, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
      if (!res.ok) throw new Error(`describe ${res.status}`);
      const result = DescribeResponseSchema.parse(await res.json());
      const next = apply({ type: 'merge', picks: result.picks, blocked: result.blocked });
      setStatus(next.picks !== value.picks || next.blocked !== value.blocked ? 'added' : 'none');
    } catch {
      setStatus('error');
    } finally {
      inFlight.current = false;
    }
  }

  const described = value.picks.filter((p) => p.via === 'describe');
  const note = status === 'added' || status === 'none' ? NOTE[status] : '';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <TextField
          label="Anything else you want in your paper?"
          multiline
          rows={3}
          placeholder="More climate tech and Pakistani startups, less celebrity news"
          value={words}
          error={status === 'error' ? FAILED : undefined}
          onChange={(w) => onChange({ words: w })}
        />
        <div>
          <Button variant="secondary" disabled={status === 'busy' || !words.trim()} onClick={describe}>
            Add to my topics
          </Button>
        </div>
        <p className="ui-meta text-pen" aria-live="polite">
          {note}
        </p>
        {described.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {described.map((p) => (
              <TopicChip key={p.slug} label={nameOf(p.slug)} selected onToggle={() => apply({ type: 'toggle', slug: p.slug })} />
            ))}
          </div>
        ) : null}
        {value.blocked.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="ui-label text-ink-muted">Less of</p>
            <div className="flex flex-wrap gap-2">
              {value.blocked.map((slug) => (
                <TopicChip key={slug} label={nameOf(slug)} selected onToggle={() => apply({ type: 'unblock', slug })} />
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <TextField label="Sources to avoid" hint="Optional." value={avoidSources} onChange={(v) => onChange({ avoidSources: v })} />
    </div>
  );
}

export default InYourWordsStep;
