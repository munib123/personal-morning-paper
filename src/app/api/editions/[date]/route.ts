// GET /api/editions/[date] (L3, §9.2) → that day's Edition, 404 when there is none.
import { requireUser } from '@/server/auth/session';
import { getEdition } from '@/server/edition';
import { route } from '@/server/edition/http';

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

export const GET = route(async (_request: Request, { params }: { params: Promise<{ date: string }> }) => {
  const { userId } = await requireUser();
  const { date } = await params;
  if (!isDate(date)) return Response.json({ error: 'invalid', issues: [{ message: 'Expected a YYYY-MM-DD date' }] }, { status: 400 });
  const edition = await getEdition(userId, date);
  if (!edition) return Response.json({ error: 'not_found' }, { status: 404 });
  return Response.json(edition);
});
