'use client';
// The /start flow: 4 Morrow OnboardingStep frames (Welcome → Topics → In your words → Your routine),
// then the first-front-page preview (step 5). No sign-up wall: the draft lives in localStorage and
// the guest session is created only when the reader builds their paper.
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react';
import { Button, Masthead, OnboardingStep } from '@/components/morrow';
import type { TopicNode } from '@/contracts/taxonomy';
import { InterestPicker } from './InterestPicker';
import { RoutineStep } from './RoutineStep';
import { WelcomeStep } from './WelcomeStep';
import { DEFAULT_DRAFT, cleanName, loadDraft, saveDraft, type DraftStep, type OnboardingDraft } from './lib/draft';
import { MIN_PICKS, ctaLabel } from './lib/picker-state';

export interface OnboardingFlowProps {
  taxonomy: TopicNode[];
  /** The paper date, already written in full ('Saturday, 17 October 2026'). */
  date: string;
  demoUnavailable?: boolean;
}

const TOTAL = 4;
const noopSubscribe = () => () => {};
// false on the server and during hydration, true afterwards (the draft is only readable in the browser).
const useMounted = () => useSyncExternalStore(noopSubscribe, () => true, () => false);

export function OnboardingFlow(props: OnboardingFlowProps) {
  const mounted = useMounted();
  // The server renders step 1 from the defaults; once mounted, the flow restarts from the saved draft.
  return mounted ? <Flow key="browser" {...props} initial={loadDraft()} persist /> : <Flow key="server" {...props} initial={DEFAULT_DRAFT} persist={false} />;
}

function Flow({ taxonomy, date, initial, persist }: OnboardingFlowProps & { initial: OnboardingDraft; persist: boolean }) {
  const [draft, setDraft] = useState<OnboardingDraft>(initial);
  const update = (patch: Partial<OnboardingDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const go = (step: DraftStep) => update({ step });

  useEffect(() => {
    if (persist) saveDraft(draft);
  }, [draft, persist]);

  // A new step starts at the top, with focus on its title for screen-reader and keyboard users.
  const shownStep = useRef(draft.step);
  useEffect(() => {
    if (shownStep.current === draft.step) return;
    shownStep.current = draft.step;
    window.scrollTo({ top: 0 });
    const title = document.getElementById('mw-ob-title');
    if (!title) return;
    if (!title.hasAttribute('tabindex')) title.setAttribute('tabindex', '-1');
    title.focus({ preventScroll: true });
  }, [draft.step]);

  const picks = draft.picks.length;
  let header: ReactNode = null;
  let body: ReactNode;

  switch (draft.step) {
    case 1:
      header = <Masthead date={date} reader={cleanName(draft.name) ?? undefined} />;
      body = (
        <OnboardingStep step={1} total={TOTAL} title="Welcome to your paper" description="One paper, every morning, about what you care about." nextLabel="Continue" onNext={() => go(2)}>
          {/* A form so Enter in the name field continues, like the button. */}
          <form onSubmit={(e: FormEvent) => { e.preventDefault(); go(2); }}>
            <WelcomeStep name={draft.name} onChange={(name) => update({ name })} />
          </form>
        </OnboardingStep>
      );
      break;
    case 2:
      body = (
        <OnboardingStep
          step={2}
          total={TOTAL}
          title="What do you want to read about?"
          description="Pick at least three. Tap › to get more specific. You can change this anytime."
          nextLabel={ctaLabel(picks)}
          nextDisabled={picks < MIN_PICKS}
          onNext={() => update({ step: 3, skipped: { ...draft.skipped, picks: false } })}
          onSkip={() => update({ step: 3, skipped: { ...draft.skipped, picks: true } })}
        >
          <InterestPicker taxonomy={taxonomy} value={{ picks: draft.picks, blocked: draft.blocked }} onChange={(v) => update(v)} mode="onboarding" />
        </OnboardingStep>
      );
      break;
    case 3:
      body = (
        <OnboardingStep
          step={3}
          total={TOTAL}
          title="In your words"
          description="Anything we missed? Describe it the way you would to a friend."
          onNext={() => update({ step: 4, skipped: { ...draft.skipped, words: false } })}
          onSkip={() => update({ step: 4, skipped: { ...draft.skipped, words: true } })}
        />
      );
      break;
    case 4:
      body = (
        <OnboardingStep step={4} total={TOTAL} title="Your routine" description="This changes how much you get, not what's in it." nextLabel="Preview my paper" onNext={() => go(5)}>
          {/* Enter in the city field previews the paper, like the button. */}
          <form onSubmit={(e: FormEvent) => { e.preventDefault(); go(5); }}>
            <RoutineStep value={{ presentation: draft.presentation, deliveryHour: draft.deliveryHour, city: draft.city }} onChange={(v) => update(v)} />
          </form>
        </OnboardingStep>
      );
      break;
    case 5:
      header = <Masthead date={date} reader={cleanName(draft.name) ?? undefined} location={draft.city} edition={1} storyCount={20} />;
      body = <OnboardingStep step={TOTAL} total={TOTAL} title="A preview of your first front page" nextLabel="Build my paper" nextDisabled />;
      break;
  }

  // Back sits above the frame, not in its footer: at 390 px the footer cannot hold Back, Skip and
  // Continue on one line (Morrow's .mw-ob__foot does not wrap; requested from L0 in docs/handoff/L5.md).
  const back = draft.step > 1 ? (
    <div>
      <Button variant="ghost" icon="arrow-left" onClick={() => go((draft.step - 1) as DraftStep)}>
        Back
      </Button>
    </div>
  ) : null;

  return (
    <>
      {draft.step >= 2 && draft.step <= 4 ? (
        <>
          <h1 className="sr-only">Build your paper</h1>
          <Masthead variant="compact" date={date} />
        </>
      ) : null}
      <main className="mx-auto flex w-full max-w-(--page-max) flex-col gap-8 px-4 pt-6 pb-16 md:px-6 md:pt-10">
        {header}
        <div className="mx-auto flex w-full max-w-(--measure) flex-col gap-4">
          {back}
          {body}
        </div>
      </main>
    </>
  );
}

export default OnboardingFlow;
