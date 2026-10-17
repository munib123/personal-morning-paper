import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalizeUrl, urlHash } from './canonical';

describe('canonicalizeUrl', () => {
  it('lowercases the host and strips utm_*, fbclid, the fragment and the trailing slash', () => {
    expect(canonicalizeUrl('https://www.Dawn.com/news/1950001/?utm_source=rss&utm_medium=feed&fbclid=abc#comments')).toBe(
      'https://www.dawn.com/news/1950001',
    );
  });

  it('sorts the remaining query params', () => {
    expect(canonicalizeUrl('https://x.com/a?b=2&utm_campaign=z&a=1')).toBe('https://x.com/a?a=1&b=2');
  });

  it('keeps the slash of a root path', () => {
    expect(canonicalizeUrl('https://example.com/')).toBe('https://example.com/');
  });

  it('resolves a relative link against the base', () => {
    expect(canonicalizeUrl('/story/9', 'https://tribune.com.pk/feed/home')).toBe('https://tribune.com.pk/story/9');
  });

  it('trims surrounding whitespace', () => {
    expect(canonicalizeUrl('  https://a.com/x  ')).toBe('https://a.com/x');
  });

  it('rejects non-http schemes and unparseable input', () => {
    expect(canonicalizeUrl('javascript:alert(1)')).toBeNull();
    expect(canonicalizeUrl('not a url')).toBeNull();
    expect(canonicalizeUrl('')).toBeNull();
  });
});

describe('urlHash', () => {
  it('is the sha256 hex of the canonical url', () => {
    const h = urlHash(canonicalizeUrl('https://a.com/x/?utm_source=1')!);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).toBe(createHash('sha256').update('https://a.com/x').digest('hex'));
  });
});
