// POST /api/onboarding (L3, §9.2): OnboardingInput → { editionDate }, after the first paper is built.
import { OnboardingInputSchema, OnboardingResponseSchema } from '@/contracts/api';
import { requireUser } from '@/server/auth/session';
import { readJson, route } from '@/server/edition/http';
import { onboardUser } from '@/server/learn/onboard';
import { requestNow } from '@/server/time';

export const maxDuration = 60;

export const POST = route(async (request: Request) => {
  const { userId } = await requireUser();
  const input = OnboardingInputSchema.parse(await readJson(request));
  const out = await onboardUser(userId, input, await requestNow());
  return Response.json(OnboardingResponseSchema.parse(out));
});
