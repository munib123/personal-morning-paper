// A story image that fails (hotlink-blocked, 403, gone) leaves a text-only Morrow card instead of a
// broken-image icon. Morrow's <img> has no onError, so one capture-phase listener on the reader root
// catches every image error (error events do not bubble) and hides the image's <figure>.
import { useEffect, type RefObject } from 'react';

function hideFigure(img: HTMLImageElement): void {
  const figure = img.closest('figure');
  if (figure) figure.hidden = true;
}

export function useImageFallback(root: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const onError = (e: Event) => {
      if (e.target instanceof HTMLImageElement) hideFigure(e.target);
    };
    el.addEventListener('error', onError, true);
    // Images that already failed before hydration will not fire again.
    el.querySelectorAll('img').forEach((img) => {
      if (img.getAttribute('src') && img.complete && img.naturalWidth === 0) hideFigure(img);
    });
    return () => el.removeEventListener('error', onError, true);
  }, [root]);
}
