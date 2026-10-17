// STUB (L0) — owner: L7. Replace freely; keep the signature.
import { NextResponse } from 'next/server';
import { DemoClockRequestSchema } from '@/contracts/api';

// §9.7: the demo clock cookie holds an ISO 8601 UTC string; requestNow() reads it when DEMO_MODE=1.
const DEMO_COOKIE = 'subah_now';
// Site-wide, so every page and route sees it. Clearing must repeat the path, or the browser keeps the old cookie.
const COOKIE_PATH = '/';

// POST { now: string | null } (DEMO_MODE only) → { now }. A string sets the demo clock; null resets to real time.
export async function POST(request: Request): Promise<Response> {
  if (process.env.DEMO_MODE !== '1') return Response.json({ error: 'demo mode is off' }, { status: 403 });
  const parsed = DemoClockRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) return invalid(parsed.error.issues);

  if (parsed.data.now === null) {
    // Resetting is the one place that wants the real clock, not requestNow() (which still sees the old cookie).
    const res = NextResponse.json({ now: new Date().toISOString() });
    res.cookies.delete({ name: DEMO_COOKIE, path: COOKIE_PATH });
    return res;
  }

  const at = new Date(parsed.data.now);
  if (Number.isNaN(at.getTime())) {
    return invalid([{ code: 'custom', path: ['now'], message: 'Expected an ISO 8601 date-time' }]);
  }
  const now = at.toISOString();
  const res = NextResponse.json({ now });
  res.cookies.set(DEMO_COOKIE, now, { path: COOKIE_PATH, sameSite: 'lax', httpOnly: true });
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
  return Response.json({ error: 'invalid', issues }, { status: 400 });
}
