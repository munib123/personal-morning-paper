import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSignals } from '@/hooks/useSignals';
import { PdfButton } from './PdfButton';

vi.mock('@/hooks/useSignals', () => ({ useSignals: vi.fn() }));

const track = vi.fn();
const fetchMock = vi.fn();

beforeEach(() => {
  track.mockReset();
  fetchMock.mockReset();
  vi.mocked(useSignals).mockReturnValue({ track, lastResult: null, observeImpression: vi.fn(), startDwell: vi.fn(() => () => {}) });
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('open', vi.fn(() => ({}) as Window));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('PdfButton', () => {
  it('is the Morrow accent button, labelled with a verb', () => {
    render(<PdfButton date="2026-10-17" editionId="e1" />);
    const button = screen.getByRole('button', { name: 'Download PDF' });
    expect(button.className).toContain('mw-btn--accent');
  });

  it('logs pdf_download, asks the route for the PDF and saves it', async () => {
    fetchMock.mockResolvedValue(new Response(new Blob(['%PDF']), { status: 200, headers: { 'content-type': 'application/pdf' } }));
    const createObjectURL = vi.fn(() => 'blob:pdf');
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<PdfButton date="2026-10-17" editionId="e1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
    expect(track).toHaveBeenCalledWith({ type: 'pdf_download', editionId: 'e1' });
    expect(screen.getByRole('button', { name: 'Preparing your PDF…' })).toHaveAttribute('aria-busy', 'true');
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith('/api/editions/2026-10-17/pdf');
    expect(createObjectURL).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Download PDF' })).not.toBeDisabled());
    click.mockRestore();
  });

  it('opens the print route when the route answers 503', async () => {
    fetchMock.mockResolvedValue(Response.json({ fallback: '/paper/2026-10-17/print' }, { status: 503 }));
    render(<PdfButton date="2026-10-17" editionId={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
    await waitFor(() => expect(window.open).toHaveBeenCalledWith('/paper/2026-10-17/print', '_blank'));
    expect(track).not.toHaveBeenCalled();
  });

  it('opens the print route when the network fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    render(<PdfButton date="2026-10-17" editionId="e1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
    await waitFor(() => expect(window.open).toHaveBeenCalledWith('/paper/2026-10-17/print', '_blank'));
  });
});
