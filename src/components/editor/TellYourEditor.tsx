'use client';
// "Tell your editor" (W2): the reader writes what should change, sees the proposed diff on their
// interests (in pen: the paper learned this), confirms, and today's paper is rebuilt with it.
// Morrow components and tokens only; status lines are aria-live; everything works from the keyboard.
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Button, Icon, TextField } from '@/components/morrow';
import { ROUTES } from '@/contracts/api';
import type { EditorAction, EditorChange } from '@/server/editor/propose';
import { ApplyResponseSchema, EDITOR_ROUTES, MAX_TEXT, TellResponseSchema, type EditorEdition } from '@/server/editor/schema';

export interface TellYourEditorProps {
  /** Called once today's paper has been rebuilt (a mount can refresh its own data here). */
  onApplied?: (edition: EditorEdition) => void;
  /** Shows a "Close" control; used by TellYourEditorEntry to fold the card back to one line. */
  onClose?: () => void;
  autoFocus?: boolean;
}

type Phase = 'idle' | 'proposing' | 'proposed' | 'applying' | 'done';

const PLACEHOLDER = 'More of, less of, or something new. Your editor is listening.';
const pct = (x: number) => Math.round(Math.max(0, Math.min(1, x)) * 100);

const LABEL: Record<EditorAction, { text: string; icon: string }> = {
  raise: { text: 'More', icon: 'plus' },
  add: { text: 'New in your paper', icon: 'plus' },
  lower: { text: 'Less', icon: 'minus' },
  pin: { text: 'Always in your paper', icon: 'check' },
  mute: { text: 'Leaves your paper', icon: 'x' },
};

const quoteList = (words: string[]) => words.map((w) => `"${w}"`).join(', ');

async function postJson(url: string, body: unknown): Promise<unknown> {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.json();
}

/** A thin before → after bar: what stays in soft pen, what is added in pen, what is taken away outlined. */
function DiffBar({ change }: { change: EditorChange }) {
  const before = pct(change.before);
  const after = pct(change.after);
  const kept = change.action === 'mute' ? 0 : Math.min(before, after);
  const delta = change.action === 'mute' ? before : Math.abs(after - before);
  const removing = change.action === 'mute' || after < before;
  return (
    <div className="flex h-1.5 w-full bg-paper-sunk" aria-hidden="true">
      <div className="h-full bg-pen-soft transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${kept}%` }} />
      {delta > 0 ? (
        <div
          className={`h-full transition-[width] duration-300 motion-reduce:transition-none ${removing ? 'border border-pen' : 'bg-pen'}`}
          style={{ width: `${delta}%` }}
        />
      ) : null}
    </div>
  );
}

function ChangeRow({ change, dim }: { change: EditorChange; dim: boolean }) {
  const label = LABEL[change.action];
  const numbers =
    change.action === 'pin' ? (
      <>{pct(change.before)}</>
    ) : (
      <>
        {pct(change.before)} <span aria-hidden="true">→</span>
        <span className="sr-only"> to </span> {change.action === 'mute' ? 0 : pct(change.after)}
      </>
    );
  return (
    <li className={`flex flex-col gap-1 border-t border-rule py-3 first:border-t-0 transition-opacity duration-150 motion-reduce:transition-none ${dim ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="ui-text text-ink">{change.name}</span>
        <span className="ui-meta inline-flex shrink-0 items-center gap-2 text-pen">
          <span className="inline-flex items-center gap-1">
            <Icon name={label.icon} size={14} />
            {label.text}
          </span>
          <span className="text-ink-muted">{numbers}</span>
        </span>
      </div>
      <DiffBar change={change} />
      <p className="ui-meta m-0 text-ink-soft">{change.reason}</p>
    </li>
  );
}

export function TellYourEditor({ onApplied, onClose, autoFocus = false }: TellYourEditorProps) {
  const uid = useId();
  const fieldId = `tell-editor-${uid.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const titleId = `${fieldId}-title`;
  const proposalRef = useRef<HTMLHeadingElement>(null);
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [changes, setChanges] = useState<EditorChange[]>([]);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [edition, setEdition] = useState<EditorEdition | null>(null);
  const [status, setStatus] = useState('');

  const focusField = () => document.getElementById(fieldId)?.focus();
  useEffect(() => {
    if (autoFocus) document.getElementById(fieldId)?.focus();
  }, [autoFocus, fieldId]);
  useEffect(() => {
    if (phase === 'proposed' && changes.length > 0) proposalRef.current?.focus();
  }, [phase, changes.length]);

  const tooLong = text.length > MAX_TEXT;
  const busy = phase === 'proposing' || phase === 'applying';
  const canPropose = text.trim().length > 0 && !tooLong && !busy;

  const propose = async () => {
    if (!canPropose) return;
    setPhase('proposing');
    setStatus('Reading what you wrote…');
    try {
      const parsed = TellResponseSchema.safeParse(await postJson(EDITOR_ROUTES.tell, { text }));
      if (!parsed.success) throw new Error('tell');
      setChanges(parsed.data.changes);
      setUnmatched(parsed.data.unmatched);
      setPhase('proposed');
      const n = parsed.data.changes.length;
      setStatus(
        n === 0
          ? 'Nothing to change yet. Name a topic, like "more cricket" or "less showbiz".'
          : `${n} ${n === 1 ? 'change' : 'changes'} proposed. Nothing changes until you confirm.`,
      );
    } catch {
      setPhase('idle');
      setStatus("Your editor couldn't read that just now. Your words are still here; try again in a moment.");
    }
  };

  const apply = async () => {
    if (changes.length === 0 || busy) return;
    setPhase('applying');
    setStatus("Rebuilding today's paper…");
    try {
      const parsed = ApplyResponseSchema.safeParse(await postJson(EDITOR_ROUTES.apply, { changes }));
      if (!parsed.success) throw new Error('apply');
      setEdition(parsed.data.edition);
      setPhase('done');
      setStatus(
        parsed.data.edition.leadHeadline
          ? `Done. Today's paper now leads with "${parsed.data.edition.leadHeadline}".`
          : "Done. Today's paper has been rebuilt.",
      );
      onApplied?.(parsed.data.edition);
    } catch {
      setPhase('proposed');
      setStatus("Couldn't rebuild your paper just now. Your changes are still here; try again.");
    }
  };

  const dismiss = () => {
    setPhase('idle');
    setChanges([]);
    setUnmatched([]);
    setStatus('');
    focusField();
  };

  const startOver = () => {
    setText('');
    setEdition(null);
    dismiss();
  };

  // Ctrl/Cmd + Enter in the text box proposes, like sending a note.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void propose();
    }
  };

  const showProposal = (phase === 'proposed' || phase === 'applying') && (changes.length > 0 || unmatched.length > 0);

  return (
    <section aria-labelledby={titleId} className="flex max-w-(--measure) flex-col gap-4 rounded-card border border-rule bg-paper p-4 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id={titleId} className="kicker m-0 text-pen">
            Tell your editor
          </h2>
          <p className="ui-meta m-0 text-ink-soft">Say it in your own words. You see every change before it happens.</p>
        </div>
        {onClose ? (
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        ) : null}
      </div>

      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void propose();
        }}
      >
        <div onKeyDown={onKeyDown}>
          <TextField
            id={fieldId}
            label="What should change in your paper?"
            multiline
            rows={3}
            placeholder={PLACEHOLDER}
            value={text}
            onChange={setText}
            hint={tooLong ? undefined : `${text.length} of ${MAX_TEXT} characters`}
            error={tooLong ? `Keep it under ${MAX_TEXT} characters (${text.length} now).` : undefined}
          />
        </div>
        <div>
          <Button type="submit" variant="primary" disabled={!canPropose}>
            Propose changes
          </Button>
        </div>
      </form>

      <p role="status" aria-live="polite" aria-atomic="true" className="ui-meta m-0 flex min-h-[18px] items-center gap-2 text-ink-soft">
        {busy ? <span className="inline-block h-1.5 w-1.5 shrink-0 bg-pen motion-safe:animate-pulse" aria-hidden="true" /> : null}
        <span>{status}</span>
      </p>

      {showProposal ? (
        <div className="flex flex-col gap-3" aria-busy={phase === 'applying'}>
          {changes.length > 0 ? (
            <>
              <h3 ref={proposalRef} tabIndex={-1} className="ui-label m-0 text-ink outline-none focus-visible:shadow-(--focus-ring)">
                Your editor proposes
              </h3>
              <ul className="m-0 flex list-none flex-col p-0">
                {changes.map((c) => (
                  <ChangeRow key={c.slug} change={c} dim={phase === 'applying'} />
                ))}
              </ul>
            </>
          ) : null}
          {unmatched.length > 0 ? (
            <p className="ui-meta m-0 text-ink-muted">
              Your editor couldn&apos;t place {quoteList(unmatched)} yet. Try a broader word, like a section of the paper.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {changes.length > 0 ? (
              <Button variant="primary" onClick={() => void apply()} disabled={phase === 'applying'}>
                Make these changes
              </Button>
            ) : null}
            <Button variant="ghost" onClick={dismiss} disabled={phase === 'applying'}>
              Not now
            </Button>
          </div>
        </div>
      ) : null}

      {phase === 'done' && edition ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" href={ROUTES.today} iconRight="arrow-right">
            Read today&apos;s paper
          </Button>
          <Button variant="ghost" onClick={startOver}>
            Tell your editor something else
          </Button>
        </div>
      ) : null}
    </section>
  );
}

/** One quiet line and a button; the button opens the full card in place (for /me and the end of the paper). */
export function TellYourEditorEntry({ onApplied }: { onApplied?: (edition: EditorEdition) => void }) {
  const [open, setOpen] = useState(false);
  const lineRef = useRef<HTMLDivElement>(null);
  const [returnFocus, setReturnFocus] = useState(false);
  useEffect(() => {
    if (!open && returnFocus) lineRef.current?.querySelector('button')?.focus();
  }, [open, returnFocus]);

  if (open) {
    return (
      <TellYourEditor
        autoFocus
        onApplied={onApplied}
        onClose={() => {
          setReturnFocus(true);
          setOpen(false);
        }}
      />
    );
  }
  return (
    <div ref={lineRef} className="flex max-w-(--measure) flex-wrap items-center justify-between gap-3 border-y border-rule py-3">
      <p className="ui-text m-0 text-ink-soft">Want something different tomorrow? Tell your editor in your own words.</p>
      <Button variant="secondary" icon="reason" aria-expanded={false} onClick={() => setOpen(true)}>
        Tell your editor
      </Button>
    </div>
  );
}

export default TellYourEditor;
