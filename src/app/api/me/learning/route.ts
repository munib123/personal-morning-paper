// GET /api/me/learning?since=7 (L3, §9.2) → LearningView: weights, movers since a snapshot, one sentence, timeline.
import { LearningQuerySchema, LearningViewSchema } from '@/contracts/api';
import { requireUser } from '@/server/auth/session';
import { route } from '@/server/edition/http';
import { getLearningView } from '@/server/learn';
import { requestNow } from '@/server/time';

const MAX_SINCE_DAYS = 30;

export const GET = route(async (request: Request) => {
  const { userId } = await requireUser();
  const raw = new URL(request.url).searchParams.get('since');
  const { since } = LearningQuerySchema.parse({ since: raw?.trim() ? raw : undefined });
  const view = await getLearningView(userId, Math.min(Math.max(since, 1), MAX_SINCE_DAYS), await requestNow());
  return Response.json(LearningViewSchema.parse(view));
});
