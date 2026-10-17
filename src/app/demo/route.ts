// GET /demo (L5, ARCHITECTURE §3/§12): signs in the seeded demo persona (DEMO_USER_EMAIL /
// DEMO_USER_PASSWORD) and lands on today's paper. If that cannot happen, it goes back to /start,
// which offers to build your own paper instead. Always a redirect, never a 500.
// The Supabase client writes its session cookies straight onto the redirect response, so the
// handler also works when called outside a Next request scope (L0's route guard calls it directly).
import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { ROUTES } from '@/contracts/api';
import { isDemoFallback } from '@/server/demo';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const req = request instanceof NextRequest ? request : new NextRequest(request);
  const res = NextResponse.redirect(new URL(ROUTES.today, req.url));
  if (isDemoFallback()) return res; // the persona is the session (getSessionUser); no sign-in needed
  if (await signInDemo(req, res)) return res;
  return NextResponse.redirect(new URL(`${ROUTES.start}?demo=unavailable`, req.url));
}

async function signInDemo(req: NextRequest, res: NextResponse): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const email = process.env.DEMO_USER_EMAIL;
  const password = process.env.DEMO_USER_PASSWORD;
  if (!url || !key || !email || !password) return false;
  try {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (toSet, headers) => {
          toSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
          // Auth responses must not be cached (headers supplied by @supabase/ssr).
          Object.entries(headers ?? {}).forEach(([k, v]) => res.headers.set(k, String(v)));
        },
      },
    });
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return !error;
  } catch {
    return false;
  }
}
