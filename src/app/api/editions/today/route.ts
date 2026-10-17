// STUB (L0) — owner: L3. Replace freely; keep the signature.
import { FIXTURE_USER_ID } from '@/contracts/fixtures';
import { buildEdition } from '@/server/edition';
import { requestNow } from '@/server/time';

export const maxDuration = 60;

// GET → today's Edition, built if missing (a reader never waits for a cron).
// Real version: requireUser(). Stub: no auth; buildEdition returns the fixture edition.
export async function GET(): Promise<Response> {
  return Response.json(await buildEdition(FIXTURE_USER_ID, await requestNow()));
}
