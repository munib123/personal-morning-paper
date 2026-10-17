// GET /api/editions?limit=60 (L3, §9.2) → ArchiveEntry[], newest first.
import { ArchiveQuerySchema } from '@/contracts/api';
import { requireUser } from '@/server/auth/session';
import { listArchive } from '@/server/edition';
import { route } from '@/server/edition/http';

const MAX_LIMIT = 120;

export const GET = route(async (request: Request) => {
  const { userId } = await requireUser();
  const raw = new URL(request.url).searchParams.get('limit');
  const { limit } = ArchiveQuerySchema.parse({ limit: raw?.trim() ? raw : undefined });
  return Response.json(await listArchive(userId, Math.min(Math.max(limit, 1), MAX_LIMIT)));
});
