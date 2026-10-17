// POST /api/events (L3, §9.2) { events: SignalEvent[] } (≤ 50, sendBeacon text/plain OK) → EventsResult.
import { EventsResultSchema, SignalBatchSchema } from '@/contracts/api';
import { requireUser } from '@/server/auth/session';
import { readJson, route } from '@/server/edition/http';
import { processSignals } from '@/server/learn';
import { requestNow } from '@/server/time';

export const POST = route(async (request: Request) => {
  const { userId } = await requireUser();
  const { events } = SignalBatchSchema.parse(await readJson(request));
  const result = await processSignals(userId, events, await requestNow());
  return Response.json(EventsResultSchema.parse(result));
});
