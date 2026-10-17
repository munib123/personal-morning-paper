// "Continue reading" from the streak sheet: go to the first story on this page not read yet (every
// paper story is a [data-article-id] wrapper; a read one holds an .is-read StoryCard). With none
// here, off /today, it opens today's paper instead.
import { ROUTES } from '@/contracts/api';

/** The first story wrapper on the page without a read StoryCard, skipping hidden or inert ones; or null. */
export function firstUnreadStory(root: ParentNode): HTMLElement | null {
  for (const el of root.querySelectorAll<HTMLElement>('main [data-article-id]')) {
    if (el.querySelector('.is-read')) continue;
    if (el.closest('[hidden], [inert], [aria-hidden="true"]')) continue;
    return el;
  }
  return null;
}

/** Scroll the first unread story into view and focus its headline link; else go to today's paper. */
export function continueReading(doc: Document, navigate: (href: string) => void): void {
  const story = firstUnreadStory(doc);
  if (!story) {
    if (doc.location.pathname !== ROUTES.today) navigate(ROUTES.today);
    return;
  }
  const reduce = doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
  story.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
  story.querySelector<HTMLElement>('a.mw-story__link, a[href], button')?.focus({ preventScroll: true });
}
