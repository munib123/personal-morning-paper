// STUB (L0) — owner: L3. Replace freely; keep the signature.
import { OnboardingInputSchema } from '@/contracts/api';
import { FIXTURE_USER_ID } from '@/contracts/fixtures';
import { buildEdition } from '@/server/edition';
import { requestNow } from '@/server/time';

export const maxDuration = 60;

// POST OnboardingInput (needs a session; anonymous OK) → { editionDate }.
// Real version: requireUser(), priorsFromOnboarding, then the first build. Stub: no auth, the fixture edition.
export async function POST(request: Request): Promise<Response> {
  const parsed = OnboardingInputSchema.safeParse(await readJson(request));
  if (!parsed.success) return invalid(parsed.error.issues);
  const edition = await buildEdition(FIXTURE_USER_ID, await requestNow());
  return Response.json({ editionDate: edition.date });
}

// Reads JSON whatever the content type. Empty → {}, malformed → undefined (fails validation).
async function readJson(request: Request): Promise<unknown> {
  try {
    const text = await request.text();
    return text.trim() ? (JSON.parse(text) as unknown) : {};
  } catch {
    return undefined;
  }
}

function invalid(issues: unknown): Response {
  return Response.json({ error: 'invalid', issues }, { status: 400 });
}
