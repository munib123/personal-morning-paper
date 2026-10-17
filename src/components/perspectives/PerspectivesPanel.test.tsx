import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PerspectivesResponse } from '@/server/perspectives/build';
import { angleRows, differenceLabel, providerLabel, sourcesLabel } from './copy';
import { PerspectivesPanel } from './PerspectivesPanel';

const CLUSTER = '84b4576e-1b2c-4d3e-8f90-a1b2c3d4e5f6';
const A1 = '11111111-1111-4111-8111-111111111111';
const A2 = '22222222-2222-4222-8222-222222222222';
const EDITION = '04c7df3d-2837-4577-a562-a27285e275fe';

const body: PerspectivesResponse = {
  perspectives: {
    summary: 'The spokeswoman left her post this week after a briefing row.',
    angles: [
      { source: 'BBC News', angle: 'Frames it as a dismissal by the chief of staff.', headline: 'White House spokeswoman dismissed' },
      { source: 'Dawn', angle: 'Ties it to the row over Pakistan coverage.', headline: 'US press secretary out after briefing row' },
    ],
    disagreements: ['BBC News says she was dismissed; Dawn says she resigned.', 'Dawn dates the row to Monday; BBC News to Tuesday.'],
    confidence: 'medium',
    provider: 'gemini',
    model: 'gemini-3.5-flash-lite',
    computedAt: '2026-10-17T03:00:00.000Z',
  },
  sources: [
    { articleId: A1, name: 'BBC News', url: 'https://www.bbc.com/news/1', headline: 'White House spokeswoman dismissed', publishedAt: '2026-10-16T08:00:00.000Z' },
    { articleId: A2, name: 'Dawn', url: 'https://www.dawn.com/news/2', headline: 'US press secretary out after briefing row', publishedAt: '2026-10-16T09:00:00.000Z' },
  ],
};

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('copy helpers', () => {
  it('pluralise quietly', () => {
    expect(sourcesLabel(1)).toBe('1 source');
    expect(sourcesLabel(4)).toBe('4 sources');
    expect(differenceLabel(0)).toBe('no points of difference');
    expect(differenceLabel(1)).toBe('1 point of difference');
    expect(differenceLabel(2)).toBe('2 points of difference');
    expect(providerLabel('gemini')).toBe('with Gemini');
    expect(providerLabel('fallback')).toBe("from the sources' own words");
  });

  it('pairs angles to sources by name, keeps unmatched sources, drops unknown outlets', () => {
    const rows = angleRows([{ source: 'dawn', angle: 'x', headline: 'h' }, { source: 'Reuters', angle: 'y', headline: 'r' }], body.sources);
    expect(rows.map((r) => [r.name, r.angle])).toEqual([
      ['BBC News', ''],
      ['Dawn', 'x'],
    ]);
    expect(rows[1]).toMatchObject({ url: 'https://www.dawn.com/news/2', articleId: A2, headline: 'US press secretary out after briefing row' });
  });

  it('pairs by position when no name matches but the counts do', () => {
    const rows = angleRows([{ source: 'Outlet A', angle: 'a', headline: '' }, { source: 'Outlet B', angle: 'b', headline: '' }], body.sources);
    expect(rows.map((r) => r.angle)).toEqual(['a', 'b']);
  });
});

describe('PerspectivesPanel', () => {
  it('renders nothing for a single-source story or without a cluster', () => {
    const { container } = render(<PerspectivesPanel clusterId={CLUSTER} sourceCount={1} />);
    expect(container).toBeEmptyDOMElement();
    const { container: c2 } = render(<PerspectivesPanel clusterId={null} sourceCount={5} />);
    expect(c2).toBeEmptyDOMElement();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('starts collapsed with the source count and a quiet button, and does not fetch', () => {
    render(<PerspectivesPanel clusterId={CLUSTER} sourceCount={4} />);
    expect(screen.getByText('4 sources')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Other angles' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button.className).toContain('mw-btn--ghost');
    expect(screen.queryByRole('region', { name: 'Other angles' })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('expands, fetches once, shows a skeleton, then the summary, linked sources, differences and the footer', async () => {
    let resolve: (r: Response) => void = () => {};
    fetchMock.mockReturnValue(new Promise<Response>((r) => (resolve = r)));
    render(<PerspectivesPanel clusterId={CLUSTER} sourceCount={4} editionId={EDITION} />);
    fireEvent.click(screen.getByRole('button', { name: 'Other angles' }));

    const button = screen.getByRole('button', { name: 'Other angles' });
    expect(button).toHaveAttribute('aria-expanded', 'true');
    const region = screen.getByRole('region', { name: 'Other angles' });
    expect(region).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveAttribute('aria-controls', region.id);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(`/api/perspectives/${CLUSTER}`);

    resolve(Response.json(body));
    await waitFor(() => expect(screen.getByText(body.perspectives.summary)).toBeInTheDocument());
    expect(region).toHaveAttribute('aria-busy', 'false');
    expect(screen.getByText('4 sources · 2 points of difference')).toBeInTheDocument();

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute('href', `/r/${A1}?src=web&e=${EDITION}`);
    expect(links[1]).toHaveAttribute('href', `/r/${A2}?src=web&e=${EDITION}`);
    for (const link of links) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
    expect(screen.getByText('BBC News')).toBeInTheDocument();
    expect(screen.getByText('White House spokeswoman dismissed')).toBeInTheDocument();
    expect(screen.getByText('Frames it as a dismissal by the chief of staff.')).toBeInTheDocument();
    expect(screen.getByText('Where they differ')).toBeInTheDocument();
    expect(screen.getByText('BBC News says she was dismissed; Dawn says she resigned.')).toBeInTheDocument();
    expect(screen.getByText('Written from 2 sources · with Gemini')).toBeInTheDocument();

    // Collapse and expand again: no second request.
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('region', { name: 'Other angles' })).not.toBeInTheDocument();
    fireEvent.click(button);
    expect(screen.getByText(body.perspectives.summary)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("says the fallback was written from the sources' own words and links straight to the url without an article id", async () => {
    const fallback: PerspectivesResponse = {
      perspectives: { ...body.perspectives, disagreements: [], provider: 'fallback', model: null },
      sources: [{ ...body.sources[0], articleId: '' }],
    };
    fetchMock.mockResolvedValue(Response.json(fallback));
    render(<PerspectivesPanel clusterId={CLUSTER} sourceCount={2} />);
    fireEvent.click(screen.getByRole('button', { name: 'Other angles' }));
    await waitFor(() => expect(screen.getByText("Written from 1 source · from the sources' own words")).toBeInTheDocument());
    expect(screen.getByText('2 sources · no points of difference')).toBeInTheDocument();
    expect(screen.queryByText('Where they differ')).not.toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://www.bbc.com/news/1');
  });

  it('shows a quiet message with a retry when the request fails, and retries on demand', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(Response.json(body));
    render(<PerspectivesPanel clusterId={CLUSTER} sourceCount={3} />);
    fireEvent.click(screen.getByRole('button', { name: 'Other angles' }));
    await waitFor(() => expect(screen.getByText('Other angles are not available right now.')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByText(body.perspectives.summary)).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('treats a non-200 answer as unavailable', async () => {
    fetchMock.mockResolvedValue(Response.json({ error: 'not found' }, { status: 404 }));
    render(<PerspectivesPanel clusterId={CLUSTER} sourceCount={3} />);
    fireEvent.click(screen.getByRole('button', { name: 'Other angles' }));
    await waitFor(() => expect(screen.getByText('Other angles are not available right now.')).toBeInTheDocument());
  });
});
