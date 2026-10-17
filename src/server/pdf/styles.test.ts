import { describe, expect, it } from 'vitest';
import { fontFaceCss, morrowCss } from './styles';

describe('fontFaceCss', () => {
  const css = fontFaceCss();

  it('inlines the four Morrow fonts as base64 woff2', () => {
    expect(css.match(/@font-face/g)).toHaveLength(4);
    expect(css).toContain('data:font/woff2;base64,');
    expect(css).toContain('font-family: "UnifrakturMaguntia"');
    expect(css).toContain('font-family: "Newsreader"');
    expect(css).toContain('font-family: "Libre Franklin"');
    expect(css).toContain('font-style: italic');
    expect(css).toContain('font-weight: 200 800');
  });

  it('pins the font variables to the tokens.json stacks, so the PDF never needs next/font', () => {
    expect(css).toMatch(/:root\s*\{[^}]*--font-masthead:\s*"UnifrakturMaguntia"/);
    expect(css).toMatch(/--font-serif:\s*"Newsreader"/);
    expect(css).toMatch(/--font-sans:\s*"Libre Franklin"/);
  });

  it('stays small enough to embed in every render', () => {
    expect(css.length).toBeLessThan(600_000);
  });

  it('is memoized', () => {
    expect(fontFaceCss()).toBe(css);
  });
});

describe('morrowCss', () => {
  const css = morrowCss();

  it('carries the Morrow tokens, type classes and component styles', () => {
    expect(css).toContain('--press');
    expect(css).toContain('.mw-masthead');
    expect(css).toContain('.print-body');
    expect(css).toContain('[data-theme="morning"]');
  });

  it('points at no font file (fonts come inlined from fontFaceCss)', () => {
    expect(css).not.toMatch(/url\([^)]*\.woff2/);
    expect(css).not.toContain('@font-face');
  });

  it('is memoized', () => {
    expect(morrowCss()).toBe(css);
  });
});
