// HTML → PDF with an overflow guard: render, measure every A4 sheet, move stories to the briefs and re-render
// (at most MAX_OVERFLOW_RETRIES times), then print with Chrome.
import fs from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { PrintEdition } from '@/components/print/PrintEdition';
import type { Edition } from '@/contracts/edition';
import { BRAND } from '@/lib/brand';
import { getBrowser } from './browser';
import { pageCount, shrinkLayout } from './layout';
import { preparePrintModel } from './model';
import { fontFaceCss, morrowCss } from './styles';
import { MAX_OVERFLOW_RETRIES, type PrintExtras, type PrintModel } from './types';

/** Runs in the page: the 1-indexed sheets whose content is taller than the sheet (2px of rounding allowed). */
export const MEASURE_OVERFLOW_JS = `(() => {
  const out = [];
  Array.from(document.querySelectorAll('.page')).forEach((page, i) => {
    if (page.scrollHeight - page.clientHeight > 2) out.push(i + 1);
  });
  return out;
})()`;

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A self-contained Morning document: Morrow CSS and the fonts inlined, then the paper. */
export async function buildPrintHtml(model: PrintModel): Promise<string> {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const body = renderToStaticMarkup(createElement(PrintEdition, { model }));
  const title = escapeHtml(`${BRAND.nameplate} · Edition No. ${model.edition.number}`);
  return (
    '<!doctype html><html lang="en" data-theme="morning"><head><meta charset="utf-8">' +
    `<title>${title}</title><style>${morrowCss()}\n${fontFaceCss()}</style></head><body>${body}</body></html>`
  );
}

export interface RenderResult {
  pdf: Uint8Array;
  pages: number;
  attempts: number;
  overflow: number[];
  ms: number;
}

const A4_PX = { width: 794, height: 1123 };

export async function renderEditionPdf(edition: Edition, extras: PrintExtras, opts: { screenshotsDir?: string } = {}): Promise<RenderResult> {
  const started = Date.now();
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ ...A4_PX, deviceScaleFactor: opts.screenshotsDir ? 2 : 1 });
    await page.emulateMediaType('print');
    // Assets are prepared once: shrinking only moves stories into the briefs, so later layouts need no new fetch.
    let model = await preparePrintModel(edition, extras);
    let attempts = 0;
    let overflow: number[] = [];
    for (let attempt = 0; attempt <= MAX_OVERFLOW_RETRIES; attempt++) {
      attempts = attempt + 1;
      await page.setContent(await buildPrintHtml(model), { waitUntil: 'load' });
      await page.evaluate(() =>
        Promise.all([document.fonts.ready, ...Array.from(document.images).map((img) => img.decode().catch(() => undefined))]),
      );
      overflow = (await page.evaluate(MEASURE_OVERFLOW_JS)) as number[];
      if (overflow.length === 0 || attempt === MAX_OVERFLOW_RETRIES) break;
      const next = shrinkLayout(model.layout, overflow);
      if (!next) break;
      model = { ...model, layout: next };
    }

    if (opts.screenshotsDir) {
      fs.mkdirSync(opts.screenshotsDir, { recursive: true });
      const sheets = await page.$$('.page');
      for (const [i, sheet] of sheets.entries()) {
        await sheet.screenshot({ path: path.join(opts.screenshotsDir, `L6-page-${i + 1}.png`) as `${string}.png` });
      }
    }

    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    return { pdf, pages: pageCount(model.layout), attempts, overflow, ms: Date.now() - started };
  } finally {
    await page.close().catch(() => {});
  }
}
