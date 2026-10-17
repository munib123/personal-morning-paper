// STUB (L0) — owner: L3. Replace freely; keep the signature.
import { FIXTURE_USER_ID } from '@/contracts/fixtures';
import { getEdition } from '@/server/edition';

// GET → the reader's Edition for {date} ('YYYY-MM-DD'), or 404. Stub: no auth; only the fixture date exists.
export async function GET(_request: Request, { params }: { params: Promise<{ date: string }> }): Promise<Response> {
  const { date } = await params;
  const edition = await getEdition(FIXTURE_USER_ID, date);
  if (!edition) return Response.json({ error: 'not found' }, { status: 404 });
  return Response.json(edition);
}
