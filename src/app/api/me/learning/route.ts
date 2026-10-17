// STUB (L0) — owner: L3. Replace freely; keep the signature.
import { LearningQuerySchema } from '@/contracts/api';
import { FIXTURE_USER_ID } from '@/contracts/fixtures';
import { getLearningView } from '@/server/learn';
import { requestNow } from '@/server/time';

const MAX_SINCE_DAYS = 90;

// GET ?since=7 → LearningView (weights, movers since N days ago, change summary, timeline).
// Stub: no auth; getLearningView serves the fixture view.
export async function GET(request: Request): Promise<Response> {
  const parsed = LearningQuerySchema.safeParse(queryOf(request));
  if (!parsed.success) return invalid(parsed.error.issues);
  // The schema only coerces; clamping the range is the handler's job.
  const since = Math.min(Math.max(parsed.data.since, 1), MAX_SINCE_DAYS);
  return Response.json(await getLearningView(FIXTURE_USER_ID, since, await requestNow()));
}

// Query params as a plain object. An empty value (?since=) counts as absent, so the schema default applies.
function queryOf(request: Request): Record<string, string> {
  return Object.fromEntries([...new URL(request.url).searchParams].filter(([, v]) => v.trim() !== ''));
}

function invalid(issues: unknown): Response {
  return Response.json({ error: 'invalid', issues }, { status: 400 });
}
