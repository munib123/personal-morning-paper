// STUB (L0) — owner: L5. Replace freely; keep the signature.
import { TasteQuerySchema } from '@/contracts/api';
import { getTasteCards } from '@/server/onboarding';

// GET ?picks=a,b,c → TasteCard[] (8: 6 matched + 2 wildcards). Stub: no auth; getTasteCards serves the fixtures.
export async function GET(request: Request): Promise<Response> {
  const parsed = TasteQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return invalid(parsed.error.issues);
  return Response.json(await getTasteCards(parsed.data.picks));
}

function invalid(issues: unknown): Response {
  return Response.json({ error: 'invalid', issues }, { status: 400 });
}
