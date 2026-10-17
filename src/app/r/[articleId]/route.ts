// GET /r/{articleId}?src=web|print&e={editionId} (ARCHITECTURE §9.2): every link to an original goes
// through here. It answers 302 to the article's http(s) URL at once and hands the signal to the one
// learning pipeline after the response: read_original for the signed-in web reader, qr_scan for the
// owner of the printed edition. Unknown or unsafe targets are a 404, never an open redirect.
import { after, NextResponse } from 'next/server';
import { FIXTURE_ARTICLES } from '@/contracts/fixtures';
import type { SignalEvent } from '@/contracts/signals';
import { getSessionUser } from '@/server/auth/session';
import { createSupabaseAdminClient } from '@/server/db/admin';
import { processSignals } from '@/server/learn';
import { requestNow } from '@/server/time';
import { isDemoFallback, snapshotGetArticle, snapshotPersonaId } from '@/server/demo';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const notFound = () => NextResponse.json({ error: 'not_found' }, { status: 404 });

/** Only http(s) targets: never javascript:, data: or anything unparseable. */
function httpUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

async function articleUrl(articleId: string): Promise<string | null> {
  if (isDemoFallback()) return snapshotGetArticle(articleId)?.url ?? null;
  try {
    const { data } = await createSupabaseAdminClient().from('articles').select('url').eq('id', articleId).maybeSingle();
    return data?.url ?? null;
  } catch (err) {
    console.error('[r] article lookup failed', err);
    return null;
  }
}

async function editionOwner(editionId: string): Promise<string | null> {
  if (isDemoFallback()) return snapshotPersonaId();
  try {
    const { data } = await createSupabaseAdminClient().from('editions').select('user_id').eq('id', editionId).maybeSingle();
    return data?.user_id ?? null;
  } catch (err) {
    console.error('[r] edition lookup failed', err);
    return null;
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ articleId: string }> }): Promise<Response> {
  const { articleId } = await params;
  if (!UUID.test(articleId)) return notFound();

  const query = new URL(request.url).searchParams;
  const src = query.get('src') === 'print' ? 'print' : 'web';
  const e = query.get('e');
  const editionId = e && UUID.test(e) ? e : null;

  const stored = httpUrl(await articleUrl(articleId));
  if (!stored) {
    // The fixture edition (DEMO_MODE preview) links to real sources but has no article rows: redirect, log nothing.
    const fixture = httpUrl(FIXTURE_ARTICLES.find((a) => a.id === articleId)?.url);
    return fixture ? NextResponse.redirect(fixture, 302) : notFound();
  }

  const userId = src === 'print' ? (editionId ? await editionOwner(editionId) : null) : ((await getSessionUser())?.userId ?? null);
  if (userId) {
    const event: SignalEvent = {
      type: src === 'print' ? 'qr_scan' : 'read_original',
      articleId,
      ...(editionId ? { editionId } : {}),
      meta: { src },
    };
    const now = await requestNow();
    after(async () => {
      try {
        await processSignals(userId, [event], now);
      } catch (err) {
        console.error('[r] processSignals failed', err);
      }
    });
  }
  return NextResponse.redirect(stored, 302);
}
