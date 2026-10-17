// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Rendering a whole edition under jsdom takes seconds on a busy machine; give these tests room.
vi.setConfig({ testTimeout: 30_000 });
import { FIXTURE_EDITION, FIXTURE_STREAK } from '@/contracts/fixtures';
import type { Edition } from '@/contracts/edition';
import { EditionContext, type EditionContextValue } from './EditionContext';
import { EditionReader } from './EditionReader';
import { initEditionState } from './edition-state';
import { EndOfPaper } from './EndOfPaper';
import { HOW_MADE_ID, HowThisPaperWasMade } from './HowThisPaperWasMade';

vi.mock('@/components/recall/DoneForToday', () => ({
  DoneForToday: ({ readIds, streak }: { readIds: string[]; streak: unknown }) => (
    <section data-testid="done" data-read={readIds.join(',')} data-streak={streak ? 'yes' : 'no'}>
      <h2>That&apos;s your paper for today.</h2>
    </section>
  ),
}));
vi.mock('@/components/pdf/PdfButton', () => ({
  PdfButton: ({ date, editionId }: { date: string; editionId: string | null }) => (
    <a data-testid="pdf" href={`/api/editions/${date}/pdf`} data-edition-id={editionId ?? ''}>
      Download PDF
    </a>
  ),
}));
vi.mock('@/components/recall/MorningRecallCard', () => ({ MorningRecallCard: () => null }));

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function ctx(patch: Partial<EditionContextValue> = {}): EditionContextValue {
  const state = initEditionState(FIXTURE_EDITION);
  return {
    state: { ...state, read: [FIXTURE_EDITION.items[2].article.id] },
    dispatch: vi.fn(),
    signals: { track: vi.fn(), lastResult: null, observeImpression: vi.fn(), startDwell: vi.fn(() => () => {}) },
    edition: FIXTURE_EDITION,
    nowIso: FIXTURE_EDITION.createdAt,
    readOnly: false,
    view: 'front',
    setView: vi.fn(),
    openSheet: vi.fn(),
    onFeedback: vi.fn(),
    onSkip: vi.fn(),
    onSave: vi.fn(),
    onWhyAction: vi.fn(),
    liveStreak: FIXTURE_STREAK,
    ...patch,
  };
}

const follows = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe('EndOfPaper', () => {
  it('closes the paper in order: done, tomorrow, PDF and past editions, then the closed panel', () => {
    render(
      <EditionContext.Provider value={ctx()}>
        <EndOfPaper />
      </EditionContext.Provider>,
    );
    const done = screen.getByTestId('done');
    expect(within(done).getByRole('heading', { level: 2, name: "That's your paper for today." })).toBeInTheDocument();
    expect(done).toHaveAttribute('data-read', FIXTURE_EDITION.items[2].article.id);
    expect(done).toHaveAttribute('data-streak', 'yes');
    const tomorrow = screen.getByText("Tomorrow's paper builds on what you read today.");
    expect(tomorrow).toHaveClass('deck');
    const pdf = screen.getByTestId('pdf');
    expect(pdf).toHaveAttribute('data-edition-id', FIXTURE_EDITION.id);
    const past = screen.getByRole('link', { name: 'Past editions' });
    expect(past).toHaveAttribute('href', '/archive');
    const details = document.getElementById(HOW_MADE_ID) as HTMLDetailsElement;
    expect(details.tagName).toBe('DETAILS');
    expect(details.open).toBe(false);
    expect(within(details).getByText('How this paper was made')).toBeInTheDocument();
    expect(follows(done, tomorrow) && follows(tomorrow, pdf) && follows(pdf, past) && follows(past, details)).toBe(true);
  });

  it('the tomorrow line follows the learning deltas', () => {
    const value = ctx();
    value.signals = {
      ...value.signals,
      lastResult: { accepted: 1, streak: FIXTURE_STREAK, deltas: [{ slug: 'science.space', name: 'Space', before: 0.4, after: 0.5 }], toast: null },
    };
    render(
      <EditionContext.Provider value={value}>
        <EndOfPaper />
      </EditionContext.Provider>,
    );
    expect(screen.getByText('Tomorrow your paper leans a little more toward Space.')).toBeInTheDocument();
  });
});

describe('HowThisPaperWasMade', () => {
  const withShare = (gemini: number, extractive: number): Edition => ({
    ...FIXTURE_EDITION,
    receipt: { ...FIXTURE_EDITION.receipt, aiShare: { gemini, extractive } },
  });

  it('shows the funnel, the build and the AI share when open', () => {
    render(<HowThisPaperWasMade edition={withShare(15, 5)} />);
    const details = document.getElementById(HOW_MADE_ID) as HTMLDetailsElement;
    details.open = true;
    const r = FIXTURE_EDITION.receipt;
    expect(within(details).getAllByRole('listitem').length).toBeGreaterThanOrEqual(4);
    expect(within(details).getByText('20 picked + 8 reserve')).toBeInTheDocument();
    expect(within(details).getByText(`Built in ${r.buildMs} ms`)).toBeInTheDocument();
    expect(within(details).getByText(`LLM calls for you: ${r.llmCallsThisEdition}`)).toBeInTheDocument();
    expect(within(details).getByText('Ranking is local math, 0 AI calls per reader')).toBeInTheDocument();
    expect(within(details).getByText("AI summaries 75% · Publisher's excerpts 25%")).toBeInTheDocument();
    expect((details.querySelector('[data-share="ai"]') as HTMLElement).style.width).toBe('75%');
    expect(within(details).getByText(r.algoVersion, { exact: false })).toBeInTheDocument();
  });

  it('with no summaries says so and draws no bar', () => {
    render(<HowThisPaperWasMade edition={withShare(0, 0)} />);
    const details = document.getElementById(HOW_MADE_ID) as HTMLDetailsElement;
    expect(within(details).getByText('No summaries in this edition')).toBeInTheDocument();
    expect(details.querySelector('[data-share="ai"]')).toBeNull();
    expect(details.textContent).not.toMatch(/NaN/);
  });

  it('the masthead link opens the panel', () => {
    render(
      <EditionReader
        edition={FIXTURE_EDITION}
        nowIso={FIXTURE_EDITION.createdAt}
        initialView="front"
        streak={FIXTURE_STREAK}
        readOnly={false}
        readerName="Ayesha"
        city="Lahore"
      />,
    );
    const link = screen.getByRole('link', { name: 'How this paper was made' });
    expect(link).toHaveAttribute('href', `#${HOW_MADE_ID}`);
    fireEvent.click(link);
    expect((document.getElementById(HOW_MADE_ID) as HTMLDetailsElement).open).toBe(true);
  });
});
