// GET /api/editions/today (L3, §9.2) → today's Edition, built on first open.
import { requireUser } from '@/server/auth/session';
import { buildEdition } from '@/server/edition';
import { route } from '@/server/edition/http';
import { requestNow } from '@/server/time';

export const maxDuration = 60;

export const GET = route(async () => {
  const { userId } = await requireUser();
  return Response.json(await buildEdition(userId, await requestNow()));
});
