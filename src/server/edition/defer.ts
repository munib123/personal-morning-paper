// Work after the response (Next.js after()), or inline for scripts and jobs.
import { after } from 'next/server';

/**
 * awaitIt → run now and wait (scripts, jobs: the editor's note must be in the stored paper).
 * Otherwise schedule with after(); outside a request scope after() throws, so fall back to a
 * fire-and-forget promise. Failures are logged, never thrown: the template note is already stored.
 */
export async function deferNote(task: () => Promise<void>, awaitIt: boolean): Promise<void> {
  const safe = () =>
    task().catch((e) => {
      console.error('[edition] editor note failed; the template note stays', e);
    });
  if (awaitIt) {
    await safe();
    return;
  }
  try {
    after(safe);
  } catch {
    void safe();
  }
}
