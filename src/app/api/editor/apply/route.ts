// POST /api/editor/apply (W2 "Tell your editor") { changes: 1..6 } → { edition: { date, number, leadHeadline, changed } }.
// Applies the confirmed changes through the /me interest edit path, then rebuilds today's paper.
// Never calls Gemini on the request path.
import { requireUser } from '@/server/auth/session';
import { applyEditorChanges } from '@/server/editor';
import { orUnavailable } from '@/server/editor/http';
import { ApplyRequestSchema, ApplyResponseSchema } from '@/server/editor/schema';
import { readJson, route } from '@/server/edition/http';
import { requestNow } from '@/server/time';

export const maxDuration = 60;

export const POST = route(async (request: Request) => {
  const { userId } = await requireUser();
  const { changes } = ApplyRequestSchema.parse(await readJson(request));
  const now = await requestNow();
  const edition = await orUnavailable(() => applyEditorChanges(userId, changes, now));
  return Response.json(ApplyResponseSchema.parse({ edition }));
});
