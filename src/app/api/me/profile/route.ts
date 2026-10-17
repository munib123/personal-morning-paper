// PATCH /api/me/profile (L3, §9.2) { paperName?, presentation?, city? } → Profile (the next build uses it).
import { ProfilePatchSchema, ProfileSchema } from '@/contracts/api';
import { requireUser } from '@/server/auth/session';
import { readJson, route } from '@/server/edition/http';
import { updateProfile } from '@/server/profile';

export const PATCH = route(async (request: Request) => {
  const { userId } = await requireUser();
  const patch = ProfilePatchSchema.parse(await readJson(request));
  return Response.json(ProfileSchema.parse(await updateProfile(userId, patch)));
});
