// @vitest-environment jsdom
import { act, cleanup, configure, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Rendering a whole edition under jsdom takes seconds on a busy machine; give these tests room.
vi.setConfig({ testTimeout: 30_000 });
configure({ asyncUtilTimeout: 5000 }); // waitFor covers the 150 ms fades even under load
import { FIXTURE_EDITION, FIXTURE_STREAK } from '@/contracts/fixtures';
import { sectionLabel } from '@/components/story/format';
import { memoryKey } from './edition-memory';
import { EditionReader } from './EditionReader';
import { layoutFrontPage } from './layout';

// Other lanes' components are covered by their own tests; here they only need to be mounted with their §9.6 props.
vi.mock('@/components/recall/MorningRecallCard', () => ({
  MorningRecallCard: ({ questions, editionId }: { questions: unknown[]; editionId: string }) => (
    <div data-testid="recall" data-edition-id={editionId}>
      {questions.length} recall questions
    </div>
  ),
}));
vi.mock('@/components/recall/DoneForToday', () => ({ DoneForToday: () => <div data-testid="done" /> }));
vi.mock('@/components/pdf/PdfButton', () => ({ PdfButton: () => <a href="#pdf">Download PDF</a> }));

class FakeIntersectionObserver {
  static all: FakeIntersectionObserver[] = [];
  readonly observed = new Set<Element>();
  constructor(readonly callback: IntersectionObserverCallback) {
    FakeIntersectionObserver.all.push(this);
  }
  observe(el: Element) {
    this.observed.add(el);
  }
  unobserve(el: Element) {
    this.observed.delete(el);
  }
  disconnect() {
    this.observed.clear();
  }
  takeRecords() {
    return [];
  }
}

function scrollPast(el: Element) {
  for (const io of FakeIntersectionObserver.all) {
    if (!io.observed.has(el)) continue;
    const entry = { target: el, isIntersecting: false, intersectionRatio: 0, boundingClientRect: { top: -600, bottom: -100 }, rootBounds: null };
    io.callback([entry as unknown as IntersectionObserverEntry], io as unknown as IntersectionObserver);
  }
}

beforeEach(() => {
  FakeIntersectionObserver.all = [];
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
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
  localStorage.clear();
});

const layout = layoutFrontPage(FIXTURE_EDITION.items, FIXTURE_EDITION.sectionOrder, FIXTURE_EDITION.leadArticleId);

function renderFront() {
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

describe('FrontPage', () => {
  it('full masthead', () => {
    renderFront();
    expect(screen.getByRole('heading', { level: 1, name: 'The Morrow' })).toBeInTheDocument();
    expect(screen.getByText(`Edition No. ${FIXTURE_EDITION.number}`)).toBeInTheDocument();
    expect(screen.getByText('Prepared for Ayesha')).toBeInTheDocument();
    const strip = document.querySelector('.mw-masthead__strip')?.textContent ?? '';
    expect(strip).toContain('Saturday, 17 October 2026');
    expect(strip).toContain('Lahore');
    expect(strip).toContain('20 stories');
    expect(strip).toContain(`${FIXTURE_EDITION.presentation.timeBudget} min read`);
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'How this paper was made' })).toHaveAttribute('href', '#how-this-paper-was-made');
  });

  it("shows the editor's note under the masthead", () => {
    renderFront();
    expect(screen.getByText(FIXTURE_EDITION.editorNote)).toHaveClass('ui-text', 'text-ink-soft');
    expect(screen.getByText('Note written with AI')).toBeInTheDocument();
  });

  it('above the fold', () => {
    const { container } = renderFront();
    const articles = container.querySelectorAll('article');
    expect(articles[0].textContent).toContain(layout.lead?.article.headline);
    const aside = screen.getByRole('complementary', { name: 'Three things to know' });
    const links = within(aside).getAllByRole('link');
    expect(links).toHaveLength(3);
    links.forEach((l) => expect(l.getAttribute('href')).toMatch(/^\/r\/.+\?src=web&e=/));
    expect(articles[1].textContent).toContain(layout.second?.article.headline);
    expect(articles[0].compareDocumentPosition(aside) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(aside.compareDocumentPosition(articles[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId('recall')).toHaveAttribute('data-edition-id', FIXTURE_EDITION.id);
  });

  it('sections', () => {
    renderFront();
    const h2s = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent ?? '');
    const expected = [
      ...layout.sections.map((s) => sectionLabel(s.slug, FIXTURE_EDITION.sectionNames)),
      'Beyond your usual',
      ...(layout.briefs.length > 0 ? ['In brief'] : []),
      ...(layout.longRead ? ['Long read'] : []),
    ];
    const positions = expected.map((title) => h2s.indexOf(title));
    positions.forEach((p, i) => expect(p, expected[i]).toBeGreaterThanOrEqual(0));
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(layout.sections.map((s) => s.slug)).toEqual(FIXTURE_EDITION.sectionOrder.filter((s) => layout.sections.some((x) => x.slug === s)));
  });

  it('counts and colours', () => {
    const { container } = renderFront();
    expect(container.querySelectorAll('article')).toHaveLength(20);
    const offenders = [...container.querySelectorAll('*')].filter((el) => /(^|\s)(sec-|font-headline)/.test(el.getAttribute('class') ?? ''));
    expect(offenders).toHaveLength(0);
    expect(container.querySelector('main')).toBeNull(); // the reader shell owns <main>
  });

  it('compact masthead on scroll', () => {
    const { container } = renderFront();
    // W3: the compact bar no longer renders Morrow's compact Masthead (a second nameplate under the
    // TopBar); it is the date, the view toggle and the progress, marked data-masthead="compact".
    expect(container.querySelector('[data-masthead="compact"]')).toBeNull();
    const full = container.querySelector('[data-masthead="full"]');
    expect(full).not.toBeNull();
    act(() => scrollPast(full as Element));
    expect(container.querySelector('[data-masthead="compact"]')).not.toBeNull();
    expect(screen.getByRole('progressbar', { name: '0 of 20 read' })).toBeInTheDocument();
  });

  it('restores skips and reads from this browser after a reload', async () => {
    const lead = FIXTURE_EDITION.items[0].article;
    const read = FIXTURE_EDITION.items[6].article;
    localStorage.setItem(memoryKey(FIXTURE_EDITION.id), JSON.stringify({ read: [read.id], skipped: [lead.id] }));
    const { container } = renderFront();
    await waitFor(() => expect(screen.queryByText(lead.headline)).toBeNull()); // after its 150 ms fade
    await waitFor(() => expect(container.querySelectorAll('article')).toHaveLength(20));
    const readCard = container.querySelector(`[data-article-id="${read.id}"] article`);
    expect(readCard).toHaveClass('is-read');
  });

  it('a garbage or throwing localStorage still gives a fresh edition', async () => {
    localStorage.setItem(memoryKey(FIXTURE_EDITION.id), '{oops');
    const { container } = renderFront();
    await act(async () => {});
    expect(container.querySelectorAll('article')).toHaveLength(20);
    cleanup();
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const again = renderFront();
    await act(async () => {});
    expect(again.container.querySelectorAll('article')).toHaveLength(20);
    getItem.mockRestore();
  });
});
