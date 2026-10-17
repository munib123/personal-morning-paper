// STUB (L0) — owner: L3. Replace freely; keep the signature.

export const maxDuration = 60;

// GET (Vercel cron, 0 0 * * * UTC) and POST, both behind `Authorization: Bearer ${CRON_SECRET}` → job stats.
// Real version: buildEdition for every onboarded profile, one job_runs row 'editions-cron'. Stub: 501.
export async function GET(): Promise<Response> {
  return notImplemented();
}

export async function POST(): Promise<Response> {
  return notImplemented();
}

function notImplemented(): Response {
  return Response.json({ error: 'not implemented', owner: 'L3' }, { status: 501 });
}
