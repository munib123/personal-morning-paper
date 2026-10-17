import { describe, expect, it } from 'vitest';
import { firstImgSrc, isGenericImage, pickFeedImage } from './images';

const base = 'https://s.com/a';
const full = {
  'media:content': [{ $: { url: 'https://s.com/A.jpg', medium: 'image' } }],
  'media:thumbnail': { $: { url: 'https://s.com/B.jpg' } },
  enclosure: { url: 'https://s.com/C.jpg', type: 'image/jpeg' },
  content: '<img src="/img/D.jpg">',
};

describe('pickFeedImage', () => {
  it('prefers media:content, then media:thumbnail, then an image enclosure, then the first <img>', () => {
    expect(pickFeedImage(full, base)).toBe('https://s.com/A.jpg');
    expect(pickFeedImage({ ...full, 'media:content': undefined }, base)).toBe('https://s.com/B.jpg');
    expect(pickFeedImage({ enclosure: full.enclosure, content: full.content }, base)).toBe('https://s.com/C.jpg');
    expect(pickFeedImage({ enclosure: { url: 'https://s.com/p.mp3', type: 'audio/mpeg' }, content: full.content }, base)).toBe(
      'https://s.com/img/D.jpg',
    );
  });

  it('skips generic images (Dawn social-default)', () => {
    const item = {
      'media:content': [{ $: { url: 'https://www.dawn.com/_img/social-default.jpg' } }],
      'media:thumbnail': { $: { url: 'https://s.com/B.jpg' } },
    };
    expect(pickFeedImage(item, 'https://www.dawn.com/x')).toBe('https://s.com/B.jpg');
  });

  it('skips non-image media:content and resolves relative media urls against the item link', () => {
    const item = { 'media:content': [{ $: { url: 'https://s.com/v.mp4', medium: 'video' } }, { $: { url: '/img/E.jpg', type: 'image/jpeg' } }] };
    expect(pickFeedImage(item, base)).toBe('https://s.com/img/E.jpg');
  });

  it('returns null when nothing usable is there', () => {
    expect(pickFeedImage({}, base)).toBeNull();
    expect(pickFeedImage({ content: '<p>no image</p>' }, base)).toBeNull();
  });
});

describe('firstImgSrc', () => {
  it('resolves protocol-relative and relative srcs', () => {
    expect(firstImgSrc('<img src="//cdn.s.com/x.jpg">', base)).toBe('https://cdn.s.com/x.jpg');
    expect(firstImgSrc('<p>hi</p><img src="/img/D.jpg">', base)).toBe('https://s.com/img/D.jpg');
  });

  it('skips tracking pixels, generic images and data: uris', () => {
    const html =
      '<img src="data:image/gif;base64,R0lGOD"><img src="https://feeds.feedburner.com/~r/x/~4/abc" width="1" height="1"><img src="https://s.com/spacer.gif"><img src="https://s.com/real.jpg?w=800&amp;h=600">';
    expect(firstImgSrc(html, base)).toBe('https://s.com/real.jpg?w=800&h=600');
  });
});

describe('isGenericImage', () => {
  it('flags logos, placeholders and default social images', () => {
    expect(isGenericImage('https://static.arxiv.org/static/browse/0.3.4/images/arxiv-logo-fb.png')).toBe(true);
    expect(isGenericImage('https://www.dawn.com/_img/social-default.jpg')).toBe(true);
    expect(isGenericImage('https://s.com/assets/Placeholder.png')).toBe(true);
    expect(isGenericImage('https://i.dawn.com/large/2026/10/abc.jpg')).toBe(false);
  });
});
