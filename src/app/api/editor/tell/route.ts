// POST /api/editor/tell (W2 "Tell your editor") { text ≤ 500 chars } → { changes ≤ 6, unmatched, provider }.
// The one request path besides describe that may reach Gemini: mapTextToTopics has a 6 s deadline and
// a keyword fallback, and a failure still answers 200 with an empty diff.
import { requireUser } from '@/server/auth/session';
import { tellEditor } from '@/server/editor';
import { orUnavailable } from '@/server/editor/http';
import { TellRequestSchema, TellResponseSchema } from '@/server/editor/schema';
import { readJson, route } from '@/server/edition/http';
import { requestNow } from '@/server/time';

export const maxDuration = 30;

export const POST = route(async (request: Request) => {
  const { userId } = await requireUser();
  const { text } = TellRequestSchema.parse(await readJson(request));
  const now = await requestNow();
  const proposal = await orUnavailable(() => tellEditor(userId, text, now));
  return Response.json(TellResponseSchema.parse(proposal));
});
