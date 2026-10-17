import { createSupabaseServerClient } from '@/server/db/server';
import { isDemoFallback, snapshotPersonaId } from '@/server/demo';

export interface SessionUser {
  userId: string;
  isAnonymous: boolean;
}

/** The signed-in reader (anonymous guests included), or null. Never throws: missing env reads as signed out. */
export async function getSessionUser(): Promise<SessionUser | null> {
  // DEMO_FALLBACK: the network is off, so the persona is the only reader and the session is hers.
  if (isDemoFallback()) return { userId: snapshotPersonaId(), isAnonymous: false };
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getClaims();
    const claims = data?.claims as { sub?: string; is_anonymous?: boolean } | null | undefined;
    if (!claims?.sub) return null;
    return { userId: claims.sub, isAnonymous: claims.is_anonymous === true };
  } catch {
    return null;
  }
}

/** For route handlers: throws a 401 JSON Response when nobody is signed in. Pages use getSessionUser + redirect. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    throw new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }
  return user;
}
