// A timer that counts only the time the tab is visible: in Bytes a story counts as read after 8 s
// in view (ARCHITECTURE §10.7). stop() pauses it (the slide left the screen), start() resumes it,
// and it fires at most once.
export function createVisibleTimer(ms: number, onDone: () => void): { start(): void; stop(): void; dispose(): void } {
  let elapsed = 0;
  let since: number | null = null; // when the current visible, running stretch began
  let running = false;
  let fired = false;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';

  const pause = () => {
    if (timeout !== null) clearTimeout(timeout);
    timeout = null;
    if (since !== null) elapsed += performance.now() - since;
    since = null;
  };

  const resume = () => {
    if (fired || !running || hidden() || since !== null) return;
    since = performance.now();
    timeout = setTimeout(() => {
      timeout = null;
      fired = true;
      since = null;
      onDone();
    }, Math.max(0, ms - elapsed));
  };

  const onVisibility = () => (hidden() ? pause() : resume());
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);

  return {
    start() {
      running = true;
      resume();
    },
    stop() {
      running = false;
      pause();
    },
    dispose() {
      running = false;
      pause();
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
