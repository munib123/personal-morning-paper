// STUB (L0) — owner: L3. Replace freely; keep the signature.
import { LearningQuerySchema } from '@/contracts/api';
import { FIXTURE_USER_ID } from '@/contracts/fixtures';
import { getLearningView } from '@/server/learn';
import { requestNow } from '@/server/time';

// GET ?since=7 → LearningView (weights, movers since N days ago, change summary, timeline).
// Stub: no auth; getLearningView serves the fixture view.
export async function GET(request: Request): Promise<Response> {
  const parsed = LearningQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return invalid(parsed.error.issues);
  return Response.json(await getLearningView(FIXTURE_USER_ID, parsed.data.since, await requestNow()));
}

function invalid(issues: unknown): Response {
  return Response.json({ error: 'invalid', issues }, { status: 400 });
}
