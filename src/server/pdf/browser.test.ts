import { describe, expect, it } from 'vitest';
import { FIXTURE_EDITION } from '@/contracts/fixtures';
import { canRenderHere, getBrowser } from './browser';
import { fixtureExtras } from './fixture';
import { buildPrintLayout } from './layout';
import { buildPrintHtml, MEASURE_OVERFLOW_JS } from './render';
import type { PrintModel } from './types';

describe('canRenderHere', () => {
  it('renders with full Puppeteer locally and in Actions, never on Vercel', () => {
    expect(canRenderHere({ VERCEL: '1' })).toBe(false);
    expect(canRenderHere({})).toBe(true);
  });

  it('refuses to launch a browser on Vercel', async () => {
    const before = process.env.VERCEL;
    process.env.VERCEL = '1';
    try {
      await expect(getBrowser()).rejects.toThrow('[pdf] no browser on Vercel');
    } finally {
      if (before === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = before;
    }
  });
});

describe('MEASURE_OVERFLOW_JS', () => {
  const run = (heights: number[]) => {
    const pages = heights.map((scrollHeight) => ({ scrollHeight, clientHeight: 1123 }));
    const document = { querySelectorAll: (sel: string) => (sel === '.page' ? pages : []) };
    return new Function('document', `return ${MEASURE_OVERFLOW_JS}`)(document) as number[];
  };

  it('lists the 1-indexed pages whose content is taller than the sheet', () => {
    expect(run([1130, 1123, 1123, 1200])).toEqual([1, 4]);
  });

  it('ignores up to 2px of rounding', () => {
    expect(run([1124, 1125, 1126])).toEqual([3]);
  });
});

describe('buildPrintHtml', () => {
  it('wraps the paper in a Morning, self-contained HTML document', async () => {
    const model: PrintModel = {
      edition: FIXTURE_EDITION,
      layout: buildPrintLayout(FIXTURE_EDITION),
      extras: fixtureExtras(),
      assets: { qr: {}, images: {} },
    };
    const html = await buildPrintHtml(model);
    expect(html.startsWith('<!doctype html><html lang="en" data-theme="morning">')).toBe(true);
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain(`<title>The Morrow · Edition No. ${FIXTURE_EDITION.number}</title>`);
    expect(html).toContain('@font-face');
    expect(html).toContain('.mw-masthead');
    expect(html).toContain('<div class="print-root">');
    expect(html.endsWith('</body></html>')).toBe(true);
  });
});
