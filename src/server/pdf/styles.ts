// Morrow CSS and fonts for the Puppeteer render: read from the repo (L0 owns the files) and inlined,
// so the PDF HTML is self-contained. Paths are relative to process.cwd(), i.e. the repo root.
import fs from 'node:fs';
import path from 'node:path';

const MORROW_CSS_FILES = ['src/styles/morrow/tokens.css', 'src/styles/morrow/bundle.css'];

// tokens.json type.fonts (family, weight range, style) → the self-hosted files in src/app/fonts.
const FONTS = [
  { family: 'Newsreader', file: 'Newsreader-Variable.woff2', weight: '200 800', style: 'normal' },
  { family: 'Newsreader', file: 'Newsreader-Variable-Italic.woff2', weight: '200 800', style: 'italic' },
  { family: 'Libre Franklin', file: 'LibreFranklin-Variable.woff2', weight: '100 900', style: 'normal' },
  { family: 'UnifrakturMaguntia', file: 'UnifrakturMaguntia-Regular.woff2', weight: '400', style: 'normal' },
] as const;

// tokens.json type.families: the stacks without the next/font variables.
const FAMILIES = {
  masthead: '"UnifrakturMaguntia", "Newsreader", Georgia, serif',
  serif: '"Newsreader", Georgia, "Times New Roman", serif',
  sans: '"Libre Franklin", "Franklin Gothic Medium", "Helvetica Neue", Arial, sans-serif',
};

let morrow: string | null = null;
let fonts: string | null = null;

/** tokens.css + bundle.css, with any @font-face removed (fontFaceCss supplies the fonts). */
export function morrowCss(): string {
  if (morrow === null) {
    morrow = MORROW_CSS_FILES.map((f) => fs.readFileSync(path.join(process.cwd(), f), 'utf8'))
      .join('\n')
      .replace(/@font-face\s*\{[^}]*\}/g, '');
  }
  return morrow;
}

/** The four Morrow fonts as base64 @font-face rules, then the font variables pinned to the tokens.json stacks. */
export function fontFaceCss(): string {
  if (fonts === null) {
    const faces = FONTS.map(({ family, file, weight, style }) => {
      const data = fs.readFileSync(path.join(process.cwd(), 'src/app/fonts', file)).toString('base64');
      return `@font-face { font-family: "${family}"; src: url(data:font/woff2;base64,${data}) format("woff2"); font-weight: ${weight}; font-style: ${style}; font-display: block; }`;
    });
    const vars = `:root { --font-masthead: ${FAMILIES.masthead}; --font-serif: ${FAMILIES.serif}; --font-sans: ${FAMILIES.sans}; }`;
    fonts = [...faces, vars].join('\n');
  }
  return fonts;
}
