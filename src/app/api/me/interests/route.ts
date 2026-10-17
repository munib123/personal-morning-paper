// STUB (L0) — owner: L3. Replace freely; keep the signature.
import { InterestEditSchema } from '@/contracts/api';
import { FIXTURE_USER_ID } from '@/contracts/fixtures';
import { getLearningView, processSignals } from '@/server/learn';
import { requestNow } from '@/server/time';

// PATCH { slug, action: 'pin'|'unpin'|'mute'|'unmute'|'set', value? } → InterestWeight[].
// The edit is a weight_edit signal through the one pipeline (§9.3). Stub: no auth; returns the fixture weights.
export async function PATCH(request: Request): Promise<Response> {
  const parsed = InterestEditSchema.safeParse(await readJson(request));
  if (!parsed.success) return invalid(parsed.error.issues);
  const { slug, action, value } = parsed.data;
  const now = await requestNow();
  await processSignals(FIXTURE_USER_ID, [{ type: 'weight_edit', value, meta: { slug, action } }], now);
  const view = await getLearningView(FIXTURE_USER_ID, 7, now);
  return Response.json(view.weights);
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
