// STUB (L0) — owner: L3. Replace freely; keep the signature.
import { FastForwardRequestSchema } from '@/contracts/api';
import { FIXTURE_SIMULATION } from '@/contracts/fixtures';

// POST { days?: 7 } (DEMO_MODE only) → SimulationResult (learning vs onboarding-only vs popularity).
// Stub: the fixture simulation; nothing is simulated.
export async function POST(request: Request): Promise<Response> {
  if (process.env.DEMO_MODE !== '1') return Response.json({ error: 'demo mode is off' }, { status: 403 });
  const parsed = FastForwardRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) return invalid(parsed.error.issues);
  return Response.json(FIXTURE_SIMULATION);
}

// Reads JSON whatever the content type. Empty → {} (days defaults), malformed → undefined (fails validation).
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
