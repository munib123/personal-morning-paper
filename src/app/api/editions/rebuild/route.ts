// POST /api/editions/rebuild (L3, §9.2) { date? } → { edition, deltas }. Only today's paper can be rebuilt;
// the deltas are how the interest weights moved since the paper was last built.
import { RebuildRequestSchema, RebuildResponseSchema } from '@/contracts/api';
import { requireUser } from '@/server/auth/session';
import { buildEdition, loadTaxonomy, moversBetween } from '@/server/edition';
import { snapshotBefore } from '@/server/edition/db';
import { readJson, route } from '@/server/edition/http';
import { getProfile } from '@/server/profile';
import { localDate, requestNow } from '@/server/time';

export const maxDuration = 60;

export const POST = route(async (request: Request) => {
  const { userId } = await requireUser();
  const body = RebuildRequestSchema.parse(await readJson(request));
  const now = await requestNow();
  const profile = await getProfile(userId);
  if (!profile) return Response.json({ error: 'not_onboarded' }, { status: 409 });
  const today = localDate(now, profile.tz);
  if (body.date && body.date !== today) return Response.json({ error: 'past_editions_are_immutable' }, { status: 400 });

  const before = await snapshotBefore(userId, today, true);
  const edition = await buildEdition(userId, now, { force: true });
  const [after, taxonomy] = await Promise.all([snapshotBefore(userId, today, true), loadTaxonomy()]);
  const deltas = after ? moversBetween(before?.weights ?? null, after.weights, taxonomy, 5, 0) : [];
  return Response.json(RebuildResponseSchema.parse({ edition, deltas }));
});
