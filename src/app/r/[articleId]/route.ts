// STUB (L0) — owner: L4. Replace freely; keep the signature.
import { NextResponse } from 'next/server';
import { FIXTURE_ARTICLES, FIXTURE_USER_ID } from '@/contracts/fixtures';
import type { SignalEvent } from '@/contracts/signals';
import { processSignals } from '@/server/learn';
import { requestNow } from '@/server/time';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /r/{articleId}?src=web|print&e={editionId} → logs read_original (web) or qr_scan (print), then 302 to the
// original article. Stub: fixture articles only; the fixture reader stands in for the session / edition owner.
export async function GET(request: Request, { params }: { params: Promise<{ articleId: string }> }): Promise<Response> {
  const { articleId } = await params;
  const article = FIXTURE_ARTICLES.find((a) => a.id === articleId);
  const target = article ? httpUrl(article.url) : null;
  if (!target) return Response.json({ error: 'not found' }, { status: 404 });

  const query = new URL(request.url).searchParams;
  const src = query.get('src') === 'print' ? 'print' : 'web';
  const editionId = query.get('e');
  const event: SignalEvent = {
    type: src === 'print' ? 'qr_scan' : 'read_original',
    articleId,
    ...(editionId && UUID.test(editionId) ? { editionId } : {}),
    meta: { src },
  };
  try {
    await processSignals(FIXTURE_USER_ID, [event], await requestNow());
  } catch {
    // Logging must never break the redirect.
  }
  return NextResponse.redirect(target, 302);
}

// Only http(s) targets: never redirect to javascript: or data: URLs.
function httpUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}
