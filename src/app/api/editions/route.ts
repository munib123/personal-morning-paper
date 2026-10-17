// STUB (L0) — owner: L3. Replace freely; keep the signature.
import { ArchiveQuerySchema } from '@/contracts/api';
import { FIXTURE_USER_ID } from '@/contracts/fixtures';
import { listArchive } from '@/server/edition';

// GET ?limit=60 → ArchiveEntry[], newest first. Stub: no auth; listArchive serves the fixture archive.
export async function GET(request: Request): Promise<Response> {
  const parsed = ArchiveQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return invalid(parsed.error.issues);
  return Response.json(await listArchive(FIXTURE_USER_ID, parsed.data.limit));
}

function invalid(issues: unknown): Response {
  return Response.json({ error: 'invalid', issues }, { status: 400 });
}
