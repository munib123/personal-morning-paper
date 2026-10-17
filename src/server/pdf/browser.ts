// The one browser of the core PDF path: full Puppeteer, locally and in GitHub Actions. Vercel never launches a
// browser (pre-rendered PDFs or the print route serve it there; serverless Chromium is stretch S1).
import type { Browser } from 'puppeteer';

/** True where full Puppeteer can run: everywhere except Vercel. */
export function canRenderHere(env: Record<string, string | undefined> = process.env): boolean {
  return !env.VERCEL;
}

let launching: Promise<Browser> | null = null;

/** A process-wide browser, relaunched when it has disconnected. Callers close their pages, never the browser. */
export async function getBrowser(): Promise<Browser> {
  if (!canRenderHere()) throw new Error('[pdf] no browser on Vercel');
  if (launching) {
    const current = await launching.catch(() => null);
    if (current?.connected) return current;
  }
  launching = (async () => {
    // Dynamic import keeps Puppeteer out of any bundle that never renders.
    const puppeteer = (await import('puppeteer')).default;
    return puppeteer.launch({
      headless: true,
      // System Chrome when set (PUPPETEER_SKIP_DOWNLOAD installs), else Puppeteer's own download.
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ['--font-render-hinting=none'],
    });
  })();
  return launching;
}

/** Ends the shared browser (scripts and jobs call this once at the end). */
export async function closeBrowser(): Promise<void> {
  const current = launching ? await launching.catch(() => null) : null;
  launching = null;
  await current?.close().catch(() => {});
}
