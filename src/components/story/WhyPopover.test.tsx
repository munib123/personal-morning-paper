// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { FIXTURE_EDITION } from '@/contracts/fixtures';
import type { ScoreBreakdown } from '@/contracts/edition';
import { initEditionState } from '@/components/paper/edition-state';
import { EditionContext, type EditionContextValue } from '@/components/paper/EditionContext';
import { breakdownRows } from './format';
import { StorySheet } from './StorySheet';
import { WhyChip } from './WhyChip';
import { whyActionEvent } from './WhyPopover';

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
afterEach(cleanup);

const item = FIXTURE_EDITION.items[0];
const breakdown: ScoreBreakdown = { topic: 0.3, similarity: 0.1, negative: 0.05, importance: 0.1, freshness: 0.05, source: 0.02, total: 0.52 };

function openChip(onAction = vi.fn()) {
  render(<WhyChip reasons={item.reasons} breakdown={breakdown} onAction={onAction} />);
  fireEvent.click(screen.getByRole('button', { name: /why this story/i }));
  return { onAction, dialog: screen.getByRole('dialog') };
}

describe('WhyChip + WhyPopover', () => {
  it('shows the match and one bar per score part', () => {
    const { dialog } = openChip();
    expect(within(dialog).getByText('52% match')).toBeInTheDocument();
    const rows = breakdownRows(breakdown);
    const bars = dialog.querySelectorAll('[data-bar]');
    expect(bars).toHaveLength(6);
    rows.forEach((row, i) => {
      expect(within(dialog).getByText(row.label, { exact: false })).toBeInTheDocument();
      expect((bars[i] as HTMLElement).style.width).toBe(`${row.pct}%`);
      expect(bars[i]).toHaveClass(row.negative ? 'bg-ink-muted' : 'bg-pen');
    });
  });

  it('marks the negative row as a subtraction', () => {
    const { dialog } = openChip();
    const negative = within(dialog).getByLabelText(/Like stories you skipped lowers the score/);
    expect(negative.textContent).toContain('−');
    expect(negative.querySelector('[data-bar]')).toHaveClass('bg-ink-muted');
  });

  it('routes More, Less and Hide this source', () => {
    for (const [name, action] of [
      ['More like this', 'more'],
      ['Less like this', 'less'],
      ['Hide this source', 'hide_source'],
    ] as const) {
      const { onAction, dialog } = openChip();
      fireEvent.click(within(dialog).getByRole('button', { name }));
      expect(onAction).toHaveBeenCalledWith(action);
      cleanup();
    }
  });

  it('without a breakdown the chip is text only', () => {
    render(<WhyChip reasons={item.reasons} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText(item.reasons[0].text)).toBeInTheDocument();
  });

  it('turns actions into signal events', () => {
    expect(whyActionEvent('more', item)).toEqual({ type: 'more', articleId: item.article.id });
    expect(whyActionEvent('less', item)).toEqual({ type: 'less', articleId: item.article.id });
    expect(whyActionEvent('hide_source', item)).toEqual({ type: 'hide_source', articleId: item.article.id, meta: { sourceId: item.article.sourceId } });
  });
});

function ctxValue(patch: Partial<EditionContextValue> = {}): EditionContextValue {
  return {
    state: initEditionState(FIXTURE_EDITION),
    dispatch: vi.fn(),
    signals: { track: vi.fn(), lastResult: null, observeImpression: vi.fn(), startDwell: vi.fn(() => vi.fn()) },
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
    liveStreak: null,
    ...patch,
  };
}

describe('StorySheet', () => {
  it('reads the story: headline, why tag, faithfulness line, summary, key fact, link out', () => {
    const value = ctxValue();
    render(
      <EditionContext.Provider value={value}>
        <StorySheet item={item} editionId={FIXTURE_EDITION.id} open onOpenChange={vi.fn()} />
      </EditionContext.Provider>,
    );
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: item.article.headline })).toBeInTheDocument();
    expect(dialog.querySelectorAll('.mw-why')).toHaveLength(1);
    expect(within(dialog).getByRole('button', { name: /AI summary|Publisher's excerpt/ })).toBeInTheDocument();
    expect(within(dialog).getByText(item.article.summary.deep)).toBeInTheDocument();
    if (item.article.keyFact) expect(within(dialog).getByText(item.article.keyFact).tagName).toBe('MARK');
    const out = within(dialog).getByRole('link', { name: `Read on ${item.article.sourceDomain}` });
    expect(out).toHaveAttribute('href', `/r/${item.article.id}?src=web&e=${FIXTURE_EDITION.id}`);
    expect(out).toHaveAttribute('target', '_blank');
    expect(out).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('on open marks read, logs the open and starts the dwell; on close the dwell stops', () => {
    const stop = vi.fn();
    const value = ctxValue();
    (value.signals.startDwell as ReturnType<typeof vi.fn>).mockReturnValue(stop);
    const view = render(
      <EditionContext.Provider value={value}>
        <StorySheet item={item} editionId={FIXTURE_EDITION.id} open onOpenChange={vi.fn()} />
      </EditionContext.Provider>,
    );
    const id = item.article.id;
    expect(value.dispatch).toHaveBeenCalledWith({ type: 'markRead', articleId: id });
    expect(value.signals.track).toHaveBeenCalledWith({ type: 'open', articleId: id, meta: { mode: 'sheet' } });
    expect(value.signals.startDwell).toHaveBeenCalledWith(id, 'sheet');
    expect(stop).not.toHaveBeenCalled();
    view.rerender(
      <EditionContext.Provider value={value}>
        <StorySheet item={item} editionId={FIXTURE_EDITION.id} open={false} onOpenChange={vi.fn()} />
      </EditionContext.Provider>,
    );
    expect(stop).toHaveBeenCalledTimes(1);
    expect(value.signals.track).toHaveBeenCalledTimes(1);
  });

  it('Escape asks to close; Skip closes the sheet and skips', () => {
    const value = ctxValue();
    const onOpenChange = vi.fn();
    render(
      <EditionContext.Provider value={value}>
        <StorySheet item={item} editionId={FIXTURE_EDITION.id} open onOpenChange={onOpenChange} />
      </EditionContext.Provider>,
    );
    act(() => {
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    onOpenChange.mockClear();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Skip' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(value.onSkip).toHaveBeenCalledWith(item);
  });

  it('outside an edition it renders the story and tracks nothing', () => {
    render(<StorySheet item={item} editionId={FIXTURE_EDITION.id} open onOpenChange={vi.fn()} />);
    expect(screen.getByRole('heading', { name: item.article.headline })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull();
  });

  it('renders nothing without an item', () => {
    render(<StorySheet item={null} editionId={FIXTURE_EDITION.id} open onOpenChange={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
