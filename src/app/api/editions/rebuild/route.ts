// STUB (L0) — owner: L3. Replace freely; keep the signature.
import { RebuildRequestSchema } from '@/contracts/api';
import { FIXTURE_USER_ID } from '@/contracts/fixtures';
import { buildEdition } from '@/server/edition';
import { requestNow } from '@/server/time';

export const maxDuration = 60;

// POST { date?: string } → { edition, deltas }. Rebuild is only allowed for the reader's current date (requestNow);
// the real version enforces that and returns the movers. Stub: no auth, ignores date, no deltas.
export async function POST(request: Request): Promise<Response> {
  const parsed = RebuildRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) return invalid(parsed.error.issues);
  const edition = await buildEdition(FIXTURE_USER_ID, await requestNow(), { force: true });
  return Response.json({ edition, deltas: [] });
}

// Reads JSON whatever the content type. Empty → {} (so a bare POST rebuilds today), malformed → undefined.
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
