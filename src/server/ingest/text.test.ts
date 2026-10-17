import { describe, expect, it } from 'vitest';
import { countWords, htmlToText, truncateWords } from './text';

describe('htmlToText', () => {
  it('decodes entities, separates paragraphs and collapses whitespace', () => {
    expect(htmlToText('<p>PM &amp; army   chief</p><p>meet\n today</p>')).toBe('PM & army chief meet today');
  });

  it('drops script and style contents', () => {
    expect(htmlToText('<p>Hello</p><script>track()</script><style>p{}</style><p>world</p>')).toBe('Hello world');
  });

  it('passes plain text through', () => {
    expect(htmlToText('just a < b')).toBe('just a < b');
    expect(htmlToText('')).toBe('');
  });
});

describe('countWords / truncateWords', () => {
  it('counts whitespace-separated words', () => {
    expect(countWords('  one two\nthree ')).toBe(3);
    expect(countWords('')).toBe(0);
  });

  it('truncates to max words', () => {
    expect(truncateWords('a b c d e', 3)).toBe('a b c');
    expect(truncateWords('a b', 3)).toBe('a b');
  });
});
