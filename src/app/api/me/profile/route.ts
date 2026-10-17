// STUB (L0) — owner: L3. Replace freely; keep the signature.
import { ProfilePatchSchema } from '@/contracts/api';
import { FIXTURE_USER_ID } from '@/contracts/fixtures';
import type { Profile } from '@/contracts/profile';
import { getProfile } from '@/server/profile';

// PATCH { paperName?, presentation?: Partial<Presentation>, city? } → Profile. The next build uses it
// ("Rebuild" shows the change). Stub: no auth; echoes the patched fixture profile and stores nothing.
export async function PATCH(request: Request): Promise<Response> {
  const parsed = ProfilePatchSchema.safeParse(await readJson(request));
  if (!parsed.success) return invalid(parsed.error.issues);
  const profile = await getProfile(FIXTURE_USER_ID);
  if (!profile) return Response.json({ error: 'not onboarded' }, { status: 404 });
  const patch = parsed.data;
  const next: Profile = {
    ...profile,
    paperName: patch.paperName ?? profile.paperName,
    city: patch.city ?? profile.city,
    presentation: { ...profile.presentation, ...patch.presentation },
  };
  return Response.json(next);
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
