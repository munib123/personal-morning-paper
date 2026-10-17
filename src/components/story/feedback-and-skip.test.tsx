// @vitest-environment jsdom
import { act, cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Rendering a whole edition under jsdom takes seconds on a busy machine; give these tests room.
vi.setConfig({ testTimeout: 30_000 });
configure({ asyncUtilTimeout: 5000 }); // waitFor covers the 150 ms fades even under load
import { FIXTURE_EDITION, FIXTURE_STREAK } from '@/contracts/fixtures';
import { EditionReader } from '@/components/paper/EditionReader';
import { sectionLabel } from './format';

const signals = vi.hoisted(() => ({
  track: vi.fn(),
  lastResult: null,
  observeImpression: vi.fn(),
  startDwell: vi.fn(() => () => {}),
}));
const sonner = vi.hoisted(() => {
  const toast = Object.assign(vi.fn(), { custom: vi.fn(), dismiss: vi.fn() });
  return { toast };
});
vi.mock('@/hooks/useSignals', () => ({ useSignals: () => signals }));
vi.mock('sonner', () => ({ toast: sonner.toast }));
vi.mock('@/components/recall/MorningRecallCard', () => ({ MorningRecallCard: () => null }));
vi.mock('@/components/recall/DoneForToday', () => ({ DoneForToday: () => null }));
vi.mock('@/components/pdf/PdfButton', () => ({ PdfButton: () => null }));

type ToastOptions = { id?: string; duration?: number; onAutoClose?: () => void; onDismiss?: () => void };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const lead = FIXTURE_EDITION.items[0];
const leadSection = sectionLabel(lead.sectionSlug, FIXTURE_EDITION.sectionNames);

function renderReader() {
  return render(
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
}

const storyOf = (articleId: string) => document.querySelector(`[data-article-id="${articleId}"]`) as HTMLElement;
const lastSkipToast = () => {
  const call = sonner.toast.custom.mock.calls.at(-1) as [(id: string | number) => ReactElement, ToastOptions];
  return { element: call[0]('t1'), options: call[1] };
};
const skipCalls = () => signals.track.mock.calls.map((c) => c[0]).filter((e) => e.type === 'skip');

describe('feedback notes', () => {
  it('More shows the note and tracks once', () => {
    renderReader();
    const more = within(storyOf(lead.article.id)).getByRole('button', { name: 'More like this' });
    fireEvent.click(more);
    const note = `Got it. More ${leadSection} tomorrow.`;
    expect(signals.track).toHaveBeenCalledTimes(1);
    expect(signals.track).toHaveBeenCalledWith({ type: 'more', articleId: lead.article.id });
    expect(sonner.toast).toHaveBeenCalledWith(note, expect.objectContaining({ duration: 3000 }));
    expect(screen.getByRole('status').textContent).toContain(note);
    expect(within(storyOf(lead.article.id)).getByRole('button', { name: 'More like this' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('Less likewise', () => {
    renderReader();
    fireEvent.click(within(storyOf(lead.article.id)).getByRole('button', { name: 'Less like this' }));
    expect(signals.track).toHaveBeenCalledWith({ type: 'less', articleId: lead.article.id });
    expect(sonner.toast).toHaveBeenCalledWith(`Got it. Less ${leadSection} tomorrow.`, expect.anything());
  });

  it('toggling off is silent', () => {
    renderReader();
    const more = () => within(storyOf(lead.article.id)).getByRole('button', { name: 'More like this' });
    fireEvent.click(more());
    fireEvent.click(more());
    expect(signals.track).toHaveBeenCalledTimes(1);
    expect(sonner.toast).toHaveBeenCalledTimes(1);
    expect(more()).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('server toasts', () => {
  it('shows EventsResult.toast once, not on every flush that repeats it', () => {
    const view = renderReader();
    const result = { accepted: 1, streak: FIXTURE_STREAK, deltas: [], toast: 'You reached a 7-day streak.' };
    const rerenderWith = (r: typeof result) => {
      (signals as { lastResult: unknown }).lastResult = r;
      view.rerender(
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
    };
    rerenderWith(result);
    rerenderWith({ ...result });
    rerenderWith({ ...result, toast: 'Got it, more Pakistan Cricket' }); // feedback acknowledgments are ours to show
    rerenderWith({ ...result, toast: 'Something new.' });
    expect(sonner.toast.mock.calls.map((c) => c[0])).toEqual(['You reached a 7-day streak.', 'Something new.']);
    (signals as { lastResult: unknown }).lastResult = null;
  });
});

describe('why popover and story sheet', () => {
  it('why popover actions reuse the feedback path; Hide this source is its own signal', () => {
    renderReader();
    fireEvent.click(within(storyOf(lead.article.id)).getByRole('button', { name: /why this story/i }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'More like this' }));
    expect(signals.track).toHaveBeenCalledWith({ type: 'more', articleId: lead.article.id });
    expect(sonner.toast).toHaveBeenCalledWith(`Got it. More ${leadSection} tomorrow.`, expect.anything());
    fireEvent.click(within(storyOf(lead.article.id)).getByRole('button', { name: /why this story/i }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Hide this source' }));
    expect(signals.track).toHaveBeenCalledWith({ type: 'hide_source', articleId: lead.article.id, meta: { sourceId: lead.article.sourceId } });
  });

  it('Read here opens the story sheet, which marks the story read; Escape closes it', async () => {
    renderReader();
    const readHere = within(storyOf(lead.article.id)).getByRole('button', { name: 'Read here' });
    readHere.focus();
    fireEvent.click(readHere);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: lead.article.headline })).toBeInTheDocument();
    expect(signals.track).toHaveBeenCalledWith({ type: 'open', articleId: lead.article.id, meta: { mode: 'sheet' } });
    expect(storyOf(lead.article.id).querySelector('article')).toHaveClass('is-read');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(within(storyOf(lead.article.id)).getByRole('button', { name: 'Read here' })));
  });
});

describe('skip with reasons and undo', () => {
  it('skip offers Undo and the three reasons; a reason is tracked exactly once', async () => {
    renderReader();
    fireEvent.click(within(storyOf(lead.article.id)).getByRole('button', { name: 'Skip' }));
    await waitFor(() => expect(storyOf(lead.article.id)).toBeNull()); // faded out; a reserve story took the lead slot
    await waitFor(() => expect(document.querySelector('[data-slot="lead"]')).not.toBeNull());
    expect(document.querySelectorAll('article')).toHaveLength(20);
    expect(screen.getByRole('status').textContent).toMatch(/^Story skipped\. .+ is in its place\.$/);

    const { element, options } = lastSkipToast();
    expect(options).toMatchObject({ duration: 5000 });
    const toastView = render(element);
    const t = within(toastView.container);
    expect(t.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(t.getByRole('button', { name: `Not interested in ${leadSection}` })).toBeInTheDocument();
    expect(t.getByRole('button', { name: 'Not today' })).toBeInTheDocument();
    fireEvent.click(t.getByRole('button', { name: 'Already seen' }));
    expect(skipCalls()).toEqual([{ type: 'skip', articleId: lead.article.id, meta: { reason: 'already_seen' } }]);
    expect(sonner.toast.dismiss).toHaveBeenCalled();
    act(() => options.onDismiss?.()); // sonner reports the dismissal: nothing more is tracked
    act(() => options.onAutoClose?.());
    expect(skipCalls()).toHaveLength(1);
  });

  it('Undo puts the story back and tracks nothing', () => {
    renderReader();
    fireEvent.click(within(storyOf(lead.article.id)).getByRole('button', { name: 'Skip' }));
    const { element, options } = lastSkipToast();
    const toastView = render(element);
    fireEvent.click(within(toastView.container).getByRole('button', { name: 'Undo' }));
    expect(storyOf(lead.article.id)).not.toBeNull();
    expect(skipCalls()).toEqual([]);
    expect(screen.getByRole('status').textContent).toContain('Skip undone.');
    act(() => options.onDismiss?.());
    expect(skipCalls()).toEqual([]);
  });

  it('auto-close after 5 s tracks reason none and commits the skip', async () => {
    renderReader();
    fireEvent.click(within(storyOf(lead.article.id)).getByRole('button', { name: 'Skip' }));
    const { element, options } = lastSkipToast();
    act(() => options.onAutoClose?.());
    expect(skipCalls()).toEqual([{ type: 'skip', articleId: lead.article.id, meta: { reason: 'none' } }]);
    const toastView = render(element);
    fireEvent.click(within(toastView.container).getByRole('button', { name: 'Undo' })); // too late: no-op
    await waitFor(() => expect(storyOf(lead.article.id)).toBeNull());
    expect(skipCalls()).toHaveLength(1);
  });
});
