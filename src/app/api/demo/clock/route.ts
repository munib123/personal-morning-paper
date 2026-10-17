// POST /api/demo/clock (DEMO_MODE only, owner L7). { now: string | null } → { now: string }.
// A date-time sets the demo clock; null resets it to real time. §9.7: the `subah_now` cookie holds an
// ISO 8601 UTC string, and requestNow() reads it on every page and route when DEMO_MODE=1.
import { NextResponse } from 'next/server';
import { DemoClockRequestSchema } from '@/contracts/api';

const DEMO_COOKIE = 'subah_now';
// Site-wide, so every page and route sees it. Clearing must repeat the path, or the browser keeps the old cookie.
const COOKIE_PATH = '/';
const MAX_AGE_S = 60 * 60 * 24 * 30;

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  if (process.env.DEMO_MODE !== '1') return NextResponse.json({ error: 'not found' }, { status: 404 });

  const parsed = DemoClockRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) return invalid(parsed.error.issues);

  if (parsed.data.now === null) {
    // Resetting is the one place that wants the real clock, not requestNow() (which still sees the old cookie).
    const res = NextResponse.json({ now: new Date().toISOString() });
    res.cookies.delete({ name: DEMO_COOKIE, path: COOKIE_PATH });
    return res;
  }

  const at = Date.parse(parsed.data.now);
  if (Number.isNaN(at)) return invalid([{ code: 'custom', path: ['now'], message: 'Expected an ISO 8601 date-time' }]);
  const now = new Date(at).toISOString();
  const res = NextResponse.json({ now });
  res.cookies.set(DEMO_COOKIE, now, { path: COOKIE_PATH, httpOnly: true, sameSite: 'lax', maxAge: MAX_AGE_S });
  return res;
}

// Reads JSON whatever the content type. Empty → {}, malformed → undefined (fails validation).
async function readJson(request: Request): Promise<unknown> {
  try {
    const text = await request.text();
    return text.trim() ? (JSON.parse(text) as unknown) : {};
  } catch {
    return undefined;
  }
}

function invalid(issues: unknown): Response {
  return NextResponse.json({ error: 'invalid', issues }, { status: 400 });
}
