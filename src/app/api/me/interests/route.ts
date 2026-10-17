// PATCH /api/me/interests (L3, §9.2) { slug, action: pin|unpin|mute|unmute|set, value? } → InterestWeight[].
import { z } from 'zod';
import { InterestEditSchema, InterestWeightSchema } from '@/contracts/api';
import { requireUser } from '@/server/auth/session';
import { readJson, route } from '@/server/edition/http';
import { editInterest } from '@/server/learn';
import { requestNow } from '@/server/time';

export const PATCH = route(async (request: Request) => {
  const { userId } = await requireUser();
  const edit = InterestEditSchema.parse(await readJson(request));
  if (edit.action === 'set' && edit.value === undefined) {
    return Response.json({ error: 'invalid', issues: [{ path: ['value'], message: 'set needs a value in [0, 1]' }] }, { status: 400 });
  }
  const weights = await editInterest(userId, edit, await requestNow());
  return Response.json(z.array(InterestWeightSchema).parse(weights));
});
