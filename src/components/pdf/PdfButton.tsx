'use client';
// Download PDF: the screen's one accent button (Morrow). The route 302s to the stored PDF's signed URL, or answers
// 503 { fallback: '/paper/{date}/print' }; the button saves the PDF or opens the print route. Clicking also tells
// the paper the reader printed it (pdf_download, §9.7).
import { useState } from 'react';
import { Button } from '@/components/morrow';
import { ROUTES } from '@/contracts/api';
import { useSignals } from '@/hooks/useSignals';
import { resolvePdfAction } from './pdf-action';

export interface PdfButtonProps {
  date: string;
  editionId: string | null;
}

function openFallback(href: string) {
  // A blocked pop-up (no user activation left after the wait) opens the print route here instead.
  if (!window.open(href, '_blank')) window.location.assign(href);
}

function saveBlob(blob: Blob, date: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `morrow-${date}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function PdfButton({ date, editionId }: PdfButtonProps) {
  const { track } = useSignals(editionId);
  const [busy, setBusy] = useState(false);

  async function download() {
    if (busy) return;
    if (editionId) track({ type: 'pdf_download', editionId });
    setBusy(true);
    try {
      const res = await fetch(ROUTES.pdf(date));
      const contentType = res.headers.get('content-type');
      const isJson = (contentType ?? '').includes('application/json');
      const body: unknown = isJson ? await res.json().catch(() => null) : undefined;
      const action = resolvePdfAction({ ok: res.ok, status: res.status, contentType, body }, date);
      if (action.kind === 'download') saveBlob(await res.blob(), date);
      else openFallback(action.href);
    } catch {
      openFallback(ROUTES.print(date));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="accent" icon="download" onClick={download} disabled={busy} aria-busy={busy}>
      {busy ? 'Preparing your PDF…' : 'Download PDF'}
    </Button>
  );
}

export default PdfButton;
