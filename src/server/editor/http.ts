// The editor routes' one error rule: a thrown Response (401, 409 not_onboarded, 503 no_candidates) passes
// through; anything else (a database that is down, a failed edit) is a calm 503, never a 500.
export async function orUnavailable<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (e) {
    if (e instanceof Response) throw e;
    console.error('[editor] failed', e);
    throw Response.json({ error: 'unavailable' }, { status: 503 });
  }
}
