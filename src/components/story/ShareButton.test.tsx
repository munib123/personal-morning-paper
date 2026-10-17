// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShareButton, shareLink, type ShareTarget } from './ShareButton';

const sonner = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('sonner', () => ({ toast: sonner.toast }));

const STORY = { title: 'Rupee steadies as reserves climb', url: 'https://example.com/rupee' };

function abort(): Error {
  const e = new Error('Share canceled');
  e.name = 'AbortError';
  return e;
}

describe('shareLink', () => {
  it('uses the native share sheet when there is one', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn();
    const target: ShareTarget = { share, clipboard: { writeText } };
    await expect(shareLink(STORY, target)).resolves.toBe('shared');
    expect(share).toHaveBeenCalledWith({ title: STORY.title, text: STORY.title, url: STORY.url });
    expect(writeText).not.toHaveBeenCalled();
  });

  it('treats a dismissed share sheet as cancelled, without copying', async () => {
    const writeText = vi.fn();
    const target: ShareTarget = { share: vi.fn().mockRejectedValue(abort()), clipboard: { writeText } };
    await expect(shareLink(STORY, target)).resolves.toBe('cancelled');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('copies the link when the share sheet fails for another reason', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const target: ShareTarget = { share: vi.fn().mockRejectedValue(new Error('NotAllowedError')), clipboard: { writeText } };
    await expect(shareLink(STORY, target)).resolves.toBe('copied');
    expect(writeText).toHaveBeenCalledWith(STORY.url);
  });

  it('copies the link when the browser cannot share it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const share = vi.fn();
    const target: ShareTarget = { share, canShare: () => false, clipboard: { writeText } };
    await expect(shareLink(STORY, target)).resolves.toBe('copied');
    expect(share).not.toHaveBeenCalled();
    expect(writeText).toHaveBeenCalledWith(STORY.url);
  });

  it('reports failure when neither sharing nor copying works', async () => {
    await expect(shareLink(STORY, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } })).resolves.toBe('failed');
    await expect(shareLink(STORY, {})).resolves.toBe('failed');
  });
});

describe('ShareButton', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('copies the original link and says so when there is no share sheet', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    render(<ShareButton title={STORY.title} url={STORY.url} />);
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    await waitFor(() => expect(sonner.toast).toHaveBeenCalledWith('Link copied'));
    expect(writeText).toHaveBeenCalledWith(STORY.url);
  });

  it('stays quiet when the reader dismisses the share sheet', async () => {
    const share = vi.fn().mockRejectedValue(abort());
    vi.stubGlobal('navigator', { share, clipboard: { writeText: vi.fn() } });
    render(<ShareButton title={STORY.title} url={STORY.url} />);
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(sonner.toast).not.toHaveBeenCalled();
  });
});
