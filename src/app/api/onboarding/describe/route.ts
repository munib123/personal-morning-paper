// STUB (L0) — owner: L5. Replace freely; keep the signature.
import { DescribeRequestSchema } from '@/contracts/api';
import { mapTextToTopics } from '@/server/enrich';

// POST { text } → { picks, blocked, provider }. The only request path allowed to call Gemini (with a timeout and
// a keyword fallback), and that lives inside mapTextToTopics. Stub: no auth.
export async function POST(request: Request): Promise<Response> {
  const parsed = DescribeRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) return invalid(parsed.error.issues);
  return Response.json(await mapTextToTopics(parsed.data.text));
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
