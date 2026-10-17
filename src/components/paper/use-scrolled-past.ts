'use client';
// True once the element has scrolled up out of view (under the reader shell's 56 px sticky TopBar),
// false while it is visible or still below. Used to swap in the compact masthead.
import { useEffect, useState, type RefObject } from 'react';

const TOP_BAR_PX = 56;

export function useScrolledPast(ref: RefObject<Element | null>): boolean {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (!entry) return;
        const top = entry.rootBounds?.top ?? 0;
        setPast(!entry.isIntersecting && entry.boundingClientRect.bottom <= top);
      },
      { rootMargin: `-${TOP_BAR_PX}px 0px 0px 0px` },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return past;
}
