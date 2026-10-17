// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FIXTURE_EDITION } from '@/contracts/fixtures';
import { AUDIO_PREFS_KEY } from '@/lib/audio/prefs';
import { buildReadingQueue, estimateMinutes } from '@/lib/audio/queue';
import { FakeSynth, FakeUtterance } from './fake-speech';
import { ListenBar } from './ListenBar';
import { StoryListenButton } from './StoryListenButton';

const items = FIXTURE_EDITION.items;
const names = FIXTURE_EDITION.sectionNames;
let synth: FakeSynth;

beforeEach(() => {
  synth = new FakeSynth();
  vi.stubGlobal('speechSynthesis', synth);
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ListenBar', () => {
  it('renders nothing where speechSynthesis is unsupported', () => {
    vi.unstubAllGlobals();
    const { container } = render(<ListenBar items={items} sectionNames={names} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('collapses to one quiet "Listen · N min" button whose estimate leaves skipped stories out', () => {
    const all = estimateMinutes(buildReadingQueue(items, { sectionNames: names }));
    const { rerender } = render(<ListenBar items={items} sectionNames={names} />);
    const button = screen.getByRole('button', { name: `Listen to this paper, about ${all} min` });
    expect(button).toHaveTextContent(`Listen · ${all} min`);
    expect(button).toHaveClass('mw-btn--ghost');
    expect(screen.queryByRole('region', { name: 'Listen to this paper' })).not.toBeInTheDocument();

    const skipped = items.slice(0, 12).map((i) => i.article.id);
    const fewer = estimateMinutes(buildReadingQueue(items, { skippedIds: skipped, sectionNames: names }));
    expect(fewer).toBeLessThan(all);
    rerender(<ListenBar items={items} skippedIds={skipped} sectionNames={names} />);
    expect(screen.getByRole('button', { name: `Listen to this paper, about ${fewer} min` })).toBeInTheDocument();
  });

  it('expands and starts reading on the first press: controls, the live headline, the speed and a close', () => {
    const onPlay = vi.fn();
    const onStoryFinished = vi.fn();
    render(<ListenBar items={items} sectionNames={names} onPlay={onPlay} onStoryFinished={onStoryFinished} />);
    fireEvent.click(screen.getByRole('button', { name: /^Listen to this paper/ }));

    const bar = screen.getByRole('region', { name: 'Listen to this paper' });
    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(synth.history.length).toBeGreaterThan(0);
    expect(synth.history[0].text.startsWith(names[items[0].sectionSlug])).toBe(true);

    const live = bar.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
    expect(live).toHaveClass('deck');
    expect(live).toHaveTextContent(items[0].article.headline);
    expect(within(live as HTMLElement).getByText(names[items[0].sectionSlug])).toHaveClass('kicker');
    expect(within(bar).getByText(`Story 1 of ${items.length} · ${estimateMinutes(buildReadingQueue(items, { sectionNames: names }))} min`)).toBeInTheDocument();

    // next / previous
    fireEvent.click(within(bar).getByRole('button', { name: 'Next story' }));
    expect(live).toHaveTextContent(items[1].article.headline);
    expect(onStoryFinished).not.toHaveBeenCalled();
    fireEvent.click(within(bar).getByRole('button', { name: 'Previous story' }));
    expect(live).toHaveTextContent(items[0].article.headline);

    // a story read to its end is reported and the next one starts
    act(() => synth.endStory());
    expect(onStoryFinished).toHaveBeenCalledWith(items[0].article.id);
    expect(live).toHaveTextContent(items[1].article.headline);

    // pause / play
    fireEvent.click(within(bar).getByRole('button', { name: 'Pause' }));
    expect(synth.calls).toContain('pause');
    fireEvent.click(within(bar).getByRole('button', { name: 'Play' }));
    expect(synth.calls.at(-1)).toBe('resume');

    // speed is a Morrow Segmented radio group, persisted
    const speed = within(bar).getByRole('group', { name: 'Reading speed' });
    expect(within(speed).getByRole('radio', { name: '1×' })).toBeChecked();
    fireEvent.click(within(speed).getByRole('radio', { name: '1.2×' }));
    expect(within(speed).getByRole('radio', { name: '1.2×' })).toBeChecked();
    expect(JSON.parse(window.localStorage.getItem(AUDIO_PREFS_KEY) ?? '{}').rate).toBe(1.2);
    expect(synth.pending[0].rate).toBe(1.2);

    // close stops the voice and collapses
    fireEvent.click(within(bar).getByRole('button', { name: 'Stop listening' }));
    expect(synth.pending).toHaveLength(0);
    expect(screen.queryByRole('region', { name: 'Listen to this paper' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Listen to this paper/ })).toBeInTheDocument();
  });

  it('skips over a story that is skipped while it is being read', () => {
    const { rerender } = render(<ListenBar items={items} sectionNames={names} />);
    fireEvent.click(screen.getByRole('button', { name: /^Listen to this paper/ }));
    const live = screen.getByRole('region', { name: 'Listen to this paper' }).querySelector('[aria-live="polite"]');
    expect(live).toHaveTextContent(items[0].article.headline);
    rerender(<ListenBar items={items} skippedIds={[items[0].article.id]} sectionNames={names} />);
    expect(live).toHaveTextContent(items[1].article.headline);
    expect(screen.getByText(`Story 1 of ${items.length - 1}`, { exact: false })).toBeInTheDocument();
  });
});

describe('StoryListenButton', () => {
  it('reads one story: Listen, then Pause and Resume; closing the sheet (unmount) stops it', () => {
    const onPlay = vi.fn();
    const { unmount } = render(<StoryListenButton item={items[2]} sectionNames={names} onPlay={onPlay} />);
    const button = screen.getByRole('button', { name: /^Listen · \d+ min$/ });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(button);
    expect(onPlay).toHaveBeenCalledTimes(1);
    const spoken = synth.history.map((u) => u.text).join(' ');
    expect(spoken).toContain(items[2].article.headline);
    expect(spoken).toContain(items[2].article.summary.deep);
    expect(screen.getByRole('button', { name: 'Pause' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
    unmount();
    expect(synth.pending).toHaveLength(0);
  });

  it('renders nothing where speechSynthesis is unsupported', () => {
    vi.unstubAllGlobals();
    const { container } = render(<StoryListenButton item={items[0]} sectionNames={names} />);
    expect(container).toBeEmptyDOMElement();
  });
});
