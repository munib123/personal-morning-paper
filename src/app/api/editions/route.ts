// STUB (L0) — owner: L3. Replace freely; keep the signature.
import { ArchiveQuerySchema } from '@/contracts/api';
import { FIXTURE_USER_ID } from '@/contracts/fixtures';
import { listArchive } from '@/server/edition';

const MAX_LIMIT = 365;

// GET ?limit=60 → ArchiveEntry[], newest first. Stub: no auth; listArchive serves the fixture archive.
export async function GET(request: Request): Promise<Response> {
  const parsed = ArchiveQuerySchema.safeParse(queryOf(request));
  if (!parsed.success) return invalid(parsed.error.issues);
  // The schema only coerces; clamping the range is the handler's job.
  const limit = Math.min(Math.max(parsed.data.limit, 1), MAX_LIMIT);
  return Response.json(await listArchive(FIXTURE_USER_ID, limit));
}

// Query params as a plain object. An empty value (?limit=) counts as absent, so the schema default applies.
function queryOf(request: Request): Record<string, string> {
  return Object.fromEntries([...new URL(request.url).searchParams].filter(([, v]) => v.trim() !== ''));
}

function invalid(issues: unknown): Response {
  return Response.json({ error: 'invalid', issues }, { status: 400 });
}
