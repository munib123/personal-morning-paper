// STUB (L0) — owner: L3. Replace freely; keep the signature.
import { SignalBatchSchema } from '@/contracts/api';
import { FIXTURE_USER_ID } from '@/contracts/fixtures';
import { processSignals } from '@/server/learn';
import { requestNow } from '@/server/time';

// POST { events: SignalEvent[] } (1..50, sendBeacon-friendly) → EventsResult.
// Everything goes through the one signal pipeline (processSignals). Stub: no auth, the fixture reader.
export async function POST(request: Request): Promise<Response> {
  const parsed = SignalBatchSchema.safeParse(await readJson(request));
  if (!parsed.success) return invalid(parsed.error.issues);
  return Response.json(await processSignals(FIXTURE_USER_ID, parsed.data.events, await requestNow()));
}

// Reads JSON whatever the content type (sendBeacon posts text/plain). Empty → {}, malformed → undefined (fails validation).
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
