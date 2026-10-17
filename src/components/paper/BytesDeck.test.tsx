// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Rendering a whole edition under jsdom takes seconds on a busy machine; give these tests room.
vi.setConfig({ testTimeout: 30_000 });
import { FIXTURE_EDITION, FIXTURE_STREAK } from '@/contracts/fixtures';
import { EditionReader } from './EditionReader';

const signals = vi.hoisted(() => ({
  track: vi.fn(),
  lastResult: null,
  observeImpression: vi.fn(),
  startDwell: vi.fn(() => () => {}),
}));
const sonner = vi.hoisted(() => ({ toast: Object.assign(vi.fn(), { custom: vi.fn(), dismiss: vi.fn() }) }));
vi.mock('@/hooks/useSignals', () => ({ useSignals: () => signals }));
vi.mock('sonner', () => ({ toast: sonner.toast }));
vi.mock('@/components/recall/MorningRecallCard', () => ({ MorningRecallCard: () => null }));
vi.mock('@/components/recall/DoneForToday', () => ({ DoneForToday: () => <p>That&apos;s your paper for today.</p> }));
vi.mock('@/components/pdf/PdfButton', () => ({ PdfButton: () => null }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.cookie = 'subah_view=; max-age=0; path=/';
});

function renderBytes() {
  return render(
    <EditionReader
      edition={FIXTURE_EDITION}
      nowIso={FIXTURE_EDITION.createdAt}
      initialView="bytes"
      streak={FIXTURE_STREAK}
      readOnly={false}
      readerName="Ayesha"
      city="Lahore"
    />,
  );
}

const slides = () => screen.getAllByRole('region', { name: "Today's stories, one at a time" })[0].querySelectorAll('[data-slide]');
const press = (key: string, init: KeyboardEventInit = {}) => act(() => {
  fireEvent.keyDown(window, { key, ...init });
});

describe('BytesDeck', () => {
  it('is a carousel of the 20 stories and the end of the paper, under the compact masthead', () => {
    renderBytes();
    const deck = screen.getByRole('region', { name: "Today's stories, one at a time" });
    expect(deck).toHaveAttribute('aria-roledescription', 'carousel');
    expect(slides()).toHaveLength(21);
    expect(slides()[0]).toHaveAttribute('aria-label', '1 of 20');
    expect(slides()[0]).toHaveAttribute('aria-current', 'true');
    expect(slides()[20]).toHaveAttribute('aria-label', 'End of paper');
    expect(document.querySelector('[data-masthead="compact"]')).not.toBeNull();
    expect(document.querySelector('[data-masthead="full"]')).toBeNull();
    expect(screen.getByRole('progressbar', { name: '0 of 20 read' })).toBeInTheDocument();
    expect(document.querySelectorAll('article')).toHaveLength(20);
  });

  it('uses the labelled feedback bar, or the icon-only one on a narrow phone', () => {
    renderBytes();
    expect(screen.getAllByRole('button', { name: 'More like this' })[0].textContent).toBe('More like this');
    cleanup();
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('max-width'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    renderBytes();
    const more = screen.getAllByRole('button', { name: 'More like this' })[0];
    expect(more.textContent).toBe('');
    expect(more).toHaveAttribute('title', 'More like this');
  });

  it('j and k move between stories; Next and Previous do the same', () => {
    renderBytes();
    press('j');
    expect(slides()[1]).toHaveAttribute('aria-current', 'true');
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    press('k');
    expect(slides()[0]).toHaveAttribute('aria-current', 'true');
    fireEvent.click(screen.getAllByRole('button', { name: 'Next' })[0]);
    expect(slides()[1]).toHaveAttribute('aria-current', 'true');
  });

  it('x skips the story in view, o opens it, s saves it', () => {
    renderBytes();
    const first = FIXTURE_EDITION.items[0].article;
    press('s');
    expect(signals.track).toHaveBeenCalledWith({ type: 'save', articleId: first.id });
    press('x');
    expect(sonner.toast.custom).toHaveBeenCalledTimes(1);
    press('o');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('ignores reader keys while typing or with modifiers', () => {
    renderBytes();
    const input = document.createElement('input');
    document.body.appendChild(input);
    act(() => {
      fireEvent.keyDown(input, { key: 'j' });
    });
    press('j', { ctrlKey: true });
    expect(slides()[0]).toHaveAttribute('aria-current', 'true');
    input.remove();
  });

  it('b switches to the Front page and back', () => {
    renderBytes();
    press('b');
    expect(screen.getByRole('heading', { level: 1, name: 'The Morrow' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Three things to know' })).toBeInTheDocument();
    expect(document.cookie).toContain('subah_view=front');
    press('b');
    expect(screen.getByRole('region', { name: "Today's stories, one at a time" })).toBeInTheDocument();
  });

  it('a story in view for 8 visible seconds is read, logged once as an open in bytes', () => {
    vi.useFakeTimers();
    renderBytes();
    const first = FIXTURE_EDITION.items[0].article;
    expect(signals.startDwell).toHaveBeenCalledWith(first.id, 'bytes');
    act(() => {
      vi.advanceTimersByTime(7999);
    });
    expect(signals.track).not.toHaveBeenCalledWith({ type: 'open', articleId: first.id, meta: { mode: 'bytes' } });
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(signals.track).toHaveBeenCalledWith({ type: 'open', articleId: first.id, meta: { mode: 'bytes' } });
    expect(document.querySelector(`[data-article-id="${first.id}"] article`)).toHaveClass('is-read');
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(signals.track.mock.calls.filter((c) => (c[0] as { type: string }).type === 'open')).toHaveLength(1);
  });
});
