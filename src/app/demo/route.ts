// STUB (L0) — owner: L5. Replace freely; keep the signature.
import { NextResponse } from 'next/server';
import { ROUTES } from '@/contracts/api';

// GET /demo → signs in the seeded demo persona (DEMO_USER_EMAIL / DEMO_USER_PASSWORD), then redirects to /today.
// Stub: no sign-in yet; straight to today's paper.
export async function GET(request: Request): Promise<Response> {
  return NextResponse.redirect(new URL(ROUTES.today, request.url), 302);
}
