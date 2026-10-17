'use client';
// Share a story: the native share sheet where the browser has one, else the original link goes to
// the clipboard with a quiet "Link copied". Shares the publisher's URL (not our /r redirect, which
// needs a session), and logs nothing new.
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/morrow';

export interface ShareData {
  title: string;
  url: string;
}

/** The parts of `navigator` sharing needs; injected so the logic is testable. */
export interface ShareTarget {
  share?: (data: { title: string; text: string; url: string }) => Promise<void>;
  canShare?: (data: { title: string; text: string; url: string }) => boolean;
  clipboard?: { writeText: (text: string) => Promise<void> };
}

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

const isAbort = (e: unknown): boolean => e instanceof Error && e.name === 'AbortError';

export async function shareLink(data: ShareData, target: ShareTarget): Promise<ShareOutcome> {
  const payload = { title: data.title, text: data.title, url: data.url };
  if (typeof target.share === 'function' && target.canShare?.(payload) !== false) {
    try {
      await target.share(payload);
      return 'shared';
    } catch (e) {
      if (isAbort(e)) return 'cancelled'; // the reader closed the sheet
      // Anything else (no user activation, a desktop without a share target): copy instead.
    }
  }
  try {
    if (!target.clipboard) return 'failed';
    await target.clipboard.writeText(data.url);
    return 'copied';
  } catch {
    return 'failed';
  }
}

export interface ShareButtonProps extends ShareData {
  className?: string;
}

export function ShareButton({ title, url, className }: ShareButtonProps) {
  const [busy, setBusy] = useState(false);

  async function onClick() {
    if (busy) return;
    setBusy(true);
    try {
      const outcome = await shareLink({ title, url }, typeof navigator === 'undefined' ? {} : (navigator as ShareTarget));
      if (outcome === 'copied') toast('Link copied');
      else if (outcome === 'failed') toast("Couldn't copy the link", { description: url });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="secondary" className={className} onClick={onClick} aria-busy={busy || undefined}>
      Share
    </Button>
  );
}

export default ShareButton;
