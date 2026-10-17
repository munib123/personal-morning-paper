// STUB (L0) — owner: L6. Replace freely; keep the signature.
import { NextResponse } from 'next/server';
import { ROUTES } from '@/contracts/api';
import { FIXTURE_USER_ID } from '@/contracts/fixtures';
import { getEdition } from '@/server/edition';
import { getEditionPdfUrl, renderAndStoreEditionPdf } from '@/server/pdf';

export const maxDuration = 60;

// GET → 302 to the stored PDF's signed URL · or render, store and 302 · or 503 { fallback: '/paper/{date}/print' }.
// Stub: no auth; nothing is stored and rendering always rejects, so the fixture date gets the 503 fallback.
export async function GET(_request: Request, { params }: { params: Promise<{ date: string }> }): Promise<Response> {
  const { date } = await params;
  const edition = await getEdition(FIXTURE_USER_ID, date);
  if (!edition) return Response.json({ error: 'not found' }, { status: 404 });
  try {
    const stored = await getEditionPdfUrl(edition.id);
    if (stored) return NextResponse.redirect(stored, 302);
    await renderAndStoreEditionPdf(edition);
    const fresh = await getEditionPdfUrl(edition.id);
    if (fresh) return NextResponse.redirect(fresh, 302);
  } catch {
    // Storage or Chromium failed: the reader can still print the HTML edition.
  }
  return Response.json({ fallback: ROUTES.print(date) }, { status: 503 });
}
