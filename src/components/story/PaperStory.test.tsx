// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen } from '@testing-library/react';
import { useRef, type ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// Radix popovers under jsdom take seconds on a busy machine; give these tests room.
vi.setConfig({ testTimeout: 30_000 });
configure({ asyncUtilTimeout: 5000 });
import { FIXTURE_EDITION } from '@/contracts/fixtures';
import type { ArticleCard } from '@/contracts/article';
import type { EditionItem } from '@/contracts/edition';
import { initEditionState } from '@/components/paper/edition-state';
import { EditionContext, type EditionContextValue } from '@/components/paper/EditionContext';
import { useImageFallback } from './image-fallback';
import { PaperStory, fadeInWhenLoaded } from './PaperStory';
import { faithfulnessBadge, topReasons } from './format';

beforeAll(() => {
  // Radix popper measures its trigger; jsdom has no ResizeObserver.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
afterEach(cleanup);

function makeValue(patch: Partial<EditionContextValue> = {}): EditionContextValue {
  return {
    state: initEditionState(FIXTURE_EDITION),
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
    liveStreak: null,
    ...patch,
  };
}

function renderStory(ui: ReactNode, value = makeValue()) {
  return { value, ...render(<EditionContext.Provider value={value}>{ui}</EditionContext.Provider>) };
}

const lead = FIXTURE_EDITION.items[0];
const standard = FIXTURE_EDITION.items[4];
const withArticle = (item: EditionItem, patch: Partial<ArticleCard>): EditionItem => ({ ...item, article: { ...item.article, ...patch } });

describe('PaperStory', () => {
  it('renders a Morrow article with one WhyTag', () => {
    const { container } = renderStory(<PaperStory item={lead} variant="lead" withDeck />);
    expect(container.querySelectorAll('article')).toHaveLength(1);
    const why = container.querySelectorAll('.mw-why');
    expect(why).toHaveLength(1);
    expect(why[0].textContent).toContain(topReasons(lead.reasons, 1)[0].text);
    expect(container.querySelector('[data-slot="lead"]')).not.toBeNull();
  });

  it('shows no WhyTag when the story has no reasons', () => {
    const { container } = renderStory(<PaperStory item={{ ...standard, reasons: [] }} variant="standard" />);
    expect(container.querySelectorAll('.mw-why')).toHaveLength(0);
  });

  it('faithfulness line on the lead: muted, with the guardrail popover', async () => {
    renderStory(<PaperStory item={withArticle(lead, { aiProvider: 'gemini' })} variant="lead" />);
    const trigger = screen.getByRole('button', { name: /AI summary · facts checked against source/ });
    expect(trigger).toHaveClass('ui-meta', 'text-ink-muted');
    expect(trigger.className).not.toMatch(/text-pen/);
    fireEvent.click(trigger);
    expect(await screen.findByText(faithfulnessBadge('gemini').tooltip)).toBeInTheDocument();
  });

  it("faithfulness line on a standard card: Publisher's excerpt", () => {
    renderStory(<PaperStory item={withArticle(standard, { aiProvider: 'extractive' })} variant="standard" />);
    expect(screen.getByRole('button', { name: /Publisher's excerpt/ })).toHaveClass('ui-meta', 'text-ink-muted');
  });

  it('no faithfulness line on brief and compact cards', () => {
    for (const variant of ['brief', 'compact'] as const) {
      renderStory(<PaperStory item={withArticle(standard, { aiProvider: 'gemini' })} variant={variant} />);
      expect(screen.queryByText(/AI summary · facts checked against source|Publisher's excerpt/)).toBeNull();
      cleanup();
    }
  });

  it('also covered by N shown only when non-empty', () => {
    renderStory(<PaperStory item={withArticle(standard, { alsoCoveredBy: [] })} variant="standard" />);
    expect(screen.queryByText(/Also covered by/)).toBeNull();
    cleanup();
    renderStory(<PaperStory item={withArticle(standard, { alsoCoveredBy: ['Dawn', 'BBC'] })} variant="standard" />);
    expect(screen.getByText('Also covered by 2 outlets')).toHaveClass('ui-meta', 'text-ink-muted');
  });

  it('headline click marks read', () => {
    const { value } = renderStory(<PaperStory item={lead} variant="lead" />);
    const link = screen.getByRole('link', { name: lead.article.headline });
    expect(link).toHaveAttribute('href', `/r/${lead.article.id}?src=web&e=${FIXTURE_EDITION.id}`);
    expect(link).toHaveAttribute('target', '_blank');
    link.addEventListener('click', (e) => e.preventDefault()); // jsdom cannot navigate
    fireEvent.click(link);
    expect(value.dispatch).toHaveBeenCalledWith({ type: 'markRead', articleId: lead.article.id });
  });

  it('read story shows Read with a check', () => {
    const base = initEditionState(FIXTURE_EDITION);
    const { container } = renderStory(
      <PaperStory item={standard} variant="standard" />,
      makeValue({ state: { ...base, read: [standard.article.id] } }),
    );
    expect(container.querySelector('article')).toHaveClass('is-read');
    expect(container.querySelector('.mw-story__read')?.textContent).toBe('Read');
  });

  it('wires Read here, the feedback bar and skip to the edition handlers', () => {
    const { value } = renderStory(<PaperStory item={standard} variant="standard" />);
    fireEvent.click(screen.getByRole('button', { name: 'Read here' }));
    expect(value.openSheet).toHaveBeenCalledWith(standard.article.id);
    fireEvent.click(screen.getByRole('button', { name: 'More like this' }));
    expect(value.onFeedback).toHaveBeenCalledWith(standard, 'more');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(value.onSave).toHaveBeenCalledWith(standard, true);
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(value.onSkip).toHaveBeenCalledWith(standard);
  });

  it('can show the feedback bar icon-only for narrow columns', () => {
    renderStory(<PaperStory item={standard} variant="standard" compactFeedback />);
    const more = screen.getByRole('button', { name: 'More like this' });
    expect(more).toHaveAttribute('title', 'More like this');
    expect(more.textContent).toBe('');
    cleanup();
    renderStory(<PaperStory item={lead} variant="lead" />);
    expect(screen.getByRole('button', { name: 'More like this' }).textContent).toBe('More like this');
  });

  it('a read-only edition offers no skip', () => {
    renderStory(<PaperStory item={standard} variant="standard" />, makeValue({ readOnly: true }));
    expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull();
    expect(screen.getByRole('button', { name: 'More like this' })).toBeInTheDocument();
  });

  it('hides the figure when the image errors', () => {
    function Root({ children }: { children: ReactNode }) {
      const ref = useRef<HTMLDivElement>(null);
      useImageFallback(ref);
      return <div ref={ref}>{children}</div>;
    }
    const { container } = renderStory(
      <Root>
        <PaperStory item={withArticle(lead, { imageUrl: 'https://img.example/broken.jpg' })} variant="lead" />
      </Root>,
    );
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    const figure = img!.closest('figure')!;
    expect(figure.hidden).toBe(false);
    fireEvent.error(img!);
    expect(figure.hidden).toBe(true);
  });

  it('renders a text-only card when there is no image', () => {
    const { container } = renderStory(<PaperStory item={withArticle(lead, { imageUrl: null })} variant="lead" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('figure')).toBeNull();
  });

  it('holds a still-loading image back and fades it in on load', () => {
    const { container } = renderStory(<PaperStory item={withArticle(lead, { imageUrl: 'https://img.example/lead.jpg' })} variant="lead" />);
    const img = container.querySelector('img')!;
    // jsdom never loads images, so the card's image is still loading here.
    expect(img.getAttribute('data-img')).toBe('pending');
    fireEvent.load(img);
    expect(img.getAttribute('data-img')).toBe('ready');
  });
});

describe('fadeInWhenLoaded', () => {
  const image = (complete: boolean) => {
    const img = document.createElement('img');
    Object.defineProperty(img, 'complete', { value: complete });
    return img;
  };

  it('leaves an image that has already loaded alone, so nothing blinks', () => {
    const img = image(true);
    fadeInWhenLoaded(img);
    expect(img.hasAttribute('data-img')).toBe(false);
  });

  it('marks a loading image pending, then ready on load or on error', () => {
    for (const event of ['load', 'error']) {
      const img = image(false);
      fadeInWhenLoaded(img);
      expect(img.getAttribute('data-img')).toBe('pending');
      img.dispatchEvent(new Event(event));
      expect(img.getAttribute('data-img')).toBe('ready');
    }
  });

  it('never leaves an image hidden after cleanup', () => {
    const img = image(false);
    const stop = fadeInWhenLoaded(img);
    stop();
    expect(img.getAttribute('data-img')).not.toBe('pending');
  });
});
