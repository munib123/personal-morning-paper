import { afterEach, describe, expect, it, vi } from 'vitest';
import { continueReading, firstUnreadStory } from './continue';

const story = (id: string, read: boolean, attrs = '') =>
  `<div data-article-id="${id}" ${attrs}><article class="mw-story${read ? ' is-read' : ''}"><a class="mw-story__link" href="#${id}">${id}</a></article></div>`;

afterEach(() => {
  document.body.innerHTML = '';
});

describe('continue reading', () => {
  it('finds the first story not read yet, skipping hidden ones', () => {
    document.body.innerHTML = `<main>${story('a', true)}${story('b', false, 'hidden')}${story('c', false)}${story('d', false)}</main>`;
    expect(firstUnreadStory(document)?.dataset.articleId).toBe('c');
  });

  it('finds nothing when every story is read, or outside <main>', () => {
    document.body.innerHTML = `<main>${story('a', true)}</main>${story('z', false)}`;
    expect(firstUnreadStory(document)).toBeNull();
  });

  it('scrolls to it and focuses its headline link', () => {
    document.body.innerHTML = `<main>${story('a', true)}${story('b', false)}</main>`;
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    const navigate = vi.fn();
    continueReading(document, navigate);
    expect(scrolled).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
    expect(document.activeElement?.textContent).toBe('b');
    expect(navigate).not.toHaveBeenCalled();
  });

  it("opens today's paper when this page has nothing left to read", () => {
    document.body.innerHTML = `<main>${story('a', true)}</main>`;
    const navigate = vi.fn();
    continueReading(document, navigate); // jsdom's page is '/', not /today
    expect(navigate).toHaveBeenCalledWith('/today');
  });
});
