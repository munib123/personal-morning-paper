'use client';
// The /start flow: 4 Morrow OnboardingStep frames (Welcome → Topics → In your words → Your routine),
// then the first-front-page preview (step 5). No sign-up wall: the draft lives in localStorage and
// the guest session is created only when the reader builds their paper.
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Button, Masthead, OnboardingStep } from '@/components/morrow';
import { ROUTES, TasteCardSchema } from '@/contracts/api';
import type { OnboardingInput, TasteCard } from '@/contracts/profile';
import type { TopicNode } from '@/contracts/taxonomy';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { FirstPagePreview } from './FirstPagePreview';
import { InterestPicker } from './InterestPicker';
import { InYourWordsStep } from './InYourWordsStep';
import { RoutineStep } from './RoutineStep';
import { WelcomeStep } from './WelcomeStep';
import { DEFAULT_CITY, DEFAULT_DRAFT, buildOnboardingInput, cleanName, clearDraft, loadDraft, saveDraft, type DraftStep, type OnboardingDraft } from './lib/draft';
import { runFinish, type FinishDeps } from './lib/finish';
import { MIN_PICKS, ctaLabel } from './lib/picker-state';

export interface OnboardingFlowProps {
  taxonomy: TopicNode[];
  /** The paper date, already written in full ('Saturday, 17 October 2026'). */
  date: string;
  demoUnavailable?: boolean;
}

const TOTAL = 4;
const STORY_COUNT = 20;
const TICK_MS = 150;
const Cards = z.array(TasteCardSchema);
const noopSubscribe = () => () => {};
// false on the server and during hydration, true afterwards (the draft is only readable in the browser).
const useMounted = () => useSyncExternalStore(noopSubscribe, () => true, () => false);

// The real dependencies of runFinish: the Supabase browser client (guest session) and L3's route.
const finishDeps: FinishDeps = {
  hasSession: async () => Boolean((await createSupabaseBrowserClient().auth.getSession()).data.session),
  signInAnonymously: async () => {
    const { error } = await createSupabaseBrowserClient().auth.signInAnonymously();
    if (error) throw error;
  },
  post: (input: OnboardingInput) =>
    fetch(ROUTES.onboarding, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) }),
};

export function OnboardingFlow(props: OnboardingFlowProps) {
  const mounted = useMounted();
  // The server renders step 1 from the defaults; once mounted, the flow restarts from the saved draft.
  return mounted ? <Flow key="browser" {...props} initial={loadDraft()} persist /> : <Flow key="server" {...props} initial={DEFAULT_DRAFT} persist={false} />;
}

// The preview's headlines: fetched once per set of picks, null while loading, [] when unavailable.
function usePreviewCards(active: boolean, picksKey: string): TasteCard[] | null {
  const [loaded, setLoaded] = useState<{ key: string; cards: TasteCard[] } | null>(null);
  useEffect(() => {
    if (!active || loaded?.key === picksKey) return;
    let cancelled = false;
    fetch(`${ROUTES.taste}?picks=${encodeURIComponent(picksKey)}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((json: unknown) => {
        const parsed = Cards.safeParse(json);
        if (!cancelled) setLoaded({ key: picksKey, cards: parsed.success ? parsed.data : [] });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ key: picksKey, cards: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [active, picksKey, loaded?.key]);
  return loaded?.key === picksKey ? loaded.cards : null;
}

// "Build my paper": guest session if needed → POST /api/onboarding → /today. One submit at a time;
// on failure the draft stays and the button offers "Try again".
function useBuildPaper(draft: OnboardingDraft) {
  const router = useRouter();
  const [state, setState] = useState<{ status: 'idle' | 'building' | 'error'; built: number }>({ status: 'idle', built: 0 });
  const inFlight = useRef(false);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopTicker = () => {
    if (ticker.current) clearInterval(ticker.current);
    ticker.current = null;
  };
  useEffect(() => stopTicker, []);

  async function build() {
    if (inFlight.current) return;
    inFlight.current = true;
    setState({ status: 'building', built: 0 });
    ticker.current = setInterval(() => setState((s) => (s.status === 'building' ? { ...s, built: Math.min(STORY_COUNT - 1, s.built + 1) } : s)), TICK_MS);
    try {
      await runFinish(buildOnboardingInput(draft), finishDeps);
      stopTicker();
      setState({ status: 'building', built: STORY_COUNT });
      clearDraft();
      router.push(ROUTES.today);
    } catch {
      stopTicker();
      setState({ status: 'error', built: 0 });
      inFlight.current = false;
    }
  }
  return { ...state, build };
}

function Flow({ taxonomy, date, initial, persist }: OnboardingFlowProps & { initial: OnboardingDraft; persist: boolean }) {
  const [draft, setDraft] = useState<OnboardingDraft>(initial);
  const update = (patch: Partial<OnboardingDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const go = (step: DraftStep) => update({ step });
  const paper = useBuildPaper(draft);
  const cards = usePreviewCards(draft.step === 5, draft.picks.map((p) => p.slug).join(','));

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

  if (draft.step === 5) {
    return (
      <main className="mx-auto w-full max-w-(--page-max) px-4 pt-6 pb-16 md:px-6 md:pt-10">
        <FirstPagePreview
          date={date}
          name={cleanName(draft.name)}
          city={draft.city.trim() || DEFAULT_CITY}
          cards={cards}
          status={paper.status}
          built={paper.built}
          onBuild={paper.build}
          onBack={() => go(4)}
        />
      </main>
    );
  }

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
        >
          <InYourWordsStep
            words={draft.words}
            avoidSources={draft.avoidSources}
            value={{ picks: draft.picks, blocked: draft.blocked }}
            taxonomy={taxonomy}
            onChange={(patch) => update(patch)}
          />
        </OnboardingStep>
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
      {draft.step >= 2 ? (
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
