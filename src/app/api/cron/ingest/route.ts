// STUB (L0) — owner: L1. Replace freely; keep the signature.

// GET (Vercel cron) and POST, both behind `Authorization: Bearer ${CRON_SECRET}` → job stats.
// Real version: runIngest only (NLP and enrichment run in the worker, never on Vercel) and one job_runs row
// 'ingest-cron'. Stub: 501.
export async function GET(): Promise<Response> {
  return notImplemented();
}

export async function POST(): Promise<Response> {
  return notImplemented();
}

function notImplemented(): Response {
  return Response.json({ error: 'not implemented', owner: 'L1' }, { status: 501 });
}
