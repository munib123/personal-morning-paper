# 10 — Newspaper-style personalized PDF generation

Researched 2026-10-17. All versions below were checked on the npm, PyPI or GitHub registries today unless marked (unverified).

## TL;DR
- **Use HTML/CSS and headless Chromium's `page.pdf()`** with **puppeteer-core**. Use local Chrome on Windows, and `@sparticuz/chromium` 153 with `puppeteer-core` **25.11.x** (which targets Chrome 153) in serverless. One React/HTML template then serves the web "print view", the PDF, and the `window.print()` fallback.
- **Use fixed page boxes, not free-flowing columns.** Render each page as its own `.page` element (A4, `break-after: page`) with a CSS grid inside. Fit the content by giving each slot a word budget. Page numbers and running headers become ordinary markup, which is deterministic and needs no Paged.js.
- **Skip Paged.js** (stable 0.4.3 dates from Jul 2023; 0.5.0-beta.2 from Oct 2024, so it is stalled). Skip **@react-pdf/renderer** (no CSS columns or text flow, and RTL bugs). Skip **pdfmake, jsPDF and pdf-lib** for layout; they are too low-level. **Typst** (v0.15.1) has the best typography and is fast, but it adds a second template language. It is a stretch option only.
- **Fallback:** the same `/paper/[date]/print` route with `@media print` CSS and a "Print / Save as PDF" button that calls `window.print()`. It needs no server Chromium, and on Chrome 131+ it still gets `@page` margin-box page numbers.
- **Pre-generate** each reader's PDF when their edition is compiled (cron at ~06:00 PKT). Store it in object storage as `pdf/{userId}/{date}-{hash}.pdf` and fall back to on-demand generation. **Commit a seeded demo PDF** so the live demo never depends on Chromium.
- Our differentiator is **QR codes that point to our own `/r/{storyId}?src=print` redirect**. Scanning a printed story counts as a reading signal for the learning loop. The PDF's back page also shows "Why you got these stories" and the streak, which makes personalization visible on paper.

## Findings

### Option comparison (Oct 2026)

| Option | Version (verified) | Newspaper fidelity | Urdu/RTL | Links | Speed | Windows dev | Deploy | Agent effort |
|---|---|---|---|---|---|---|---|---|
| **HTML/CSS → Chromium `page.pdf()`** (Puppeteer/Playwright) | puppeteer-core 25.14.0 (Chrome 155); playwright 1.64.1 | High: grid, multi-column, `column-span`, `break-inside`, filters, SVG | **Best**: HarfBuzz shaping, `dir="rtl"`, Noto Nastaliq | Yes, `<a href>` stays clickable | ~1–3 s per 4-page edition warm (estimate, unverified) | Excellent | Vercel via @sparticuz/chromium, or any Node host | **Lowest**: agents know HTML/CSS best |
| + Paged.js polyfill | 0.4.3 (2023-07), 0.5.0-beta.2 (2024-10) | Adds running heads, named strings, footnotes | Same as Chromium | Yes | Slower (it paginates in JS) | OK | Same | Medium; fragile with columns |
| @react-pdf/renderer | 4.9.0 (2026-08-27) | Low–medium: Yoga flexbox only, **no CSS columns** and no text flow between columns | Weak: RTL Arabic crash bug (#3195, closed), large-text crash (#3050, open) | Yes (`<Link>`) | Fast | Good | Anywhere (pure JS) | Medium–high: you hand-split columns |
| **Typst** (CLI / typst.ts) | typst v0.15.1 (2026-07-17); `@myriaddreamin/typst-ts-node-compiler` 0.7.0 with win32-x64 prebuilt | **Highest typography** (justification, hyphenation), `page(columns:)`, floats spanning columns via `place(scope:"parent", float:true)`. **Columns are not balanced.** | RTL works via `text(dir:)`/`lang`; open Arabic glyph issues (#7245, #8500); Nastaliq quality (unverified) | `#link()` | Very fast (milliseconds to a second; unverified) | Good (native binary) | Anywhere; needs local image bytes | High: a new language for agents and the team |
| WeasyPrint (Python) | 70.0 (2026-09-08) | High paged media (margin boxes, counters, columns) | Good (Pango) | Yes | Seconds | **Poor**: GTK/Pango on Windows | Python service | High: stack mismatch, no JS |
| pdfmake | 0.3.11 | Low: column blocks, no flow | Poor | Yes | Fast | Good | Anywhere | High |
| jsPDF | 4.2.1 | Low (imperative drawing) | Poor | Yes | Fast | Good | Client or server | Very high |
| pdf-lib | 1.17.1 | Not a layout engine | — | Yes | Fast | Good | Anywhere | Use only for post-processing (metadata, merging) |
| `window.print()` + print CSS | n/a | High (same Chromium engine on desktop) | Best | Yes (Chrome "Save as PDF" keeps links) | Instant | Excellent | Nothing to deploy | Lowest; but user-initiated, and Safari/Firefox differ |

### Key facts behind the choice
- **Chrome 131+ supports `@page` margin boxes** (`@top-center`, `@bottom-right` and the others) with `counter(page)` and `counter(pages)` in print. Paged.js was mainly needed for these, and Chromium now does them natively. Source: developer.chrome.com/blog/print-margins.
- **Puppeteer `PDFOptions`** include `preferCSSPageSize` (default false; **set it to true**), `printBackground` (default false; **set it to true**), `tagged` (experimental, default true), `outline` (experimental, default false), `waitForFonts` (default true) and `timeout` (default 30 000 ms). `headerTemplate`/`footerTemplate` support `pageNumber` and `totalPages`, but they do not see page styles. Prefer in-page markup.
- **@sparticuz/chromium 153.0.0** (2026-09-11): the x64 pack is ~70 MB and the npm package needs Node `^22.17 || >=24`. It is Linux x64 only and will not run on Windows, so branch on environment. It uses headless_shell. Allocate ≥512 MB RAM (1600 MB recommended). It ships only Open Sans, so **we must supply our fonts**. With Playwright, `/tmp` fills up across warm invocations; pass a unique `--user-data-dir`. Puppeteer is not affected. Mark it external in the bundler.
- **Puppeteer and Chromium versions must match:** puppeteer-core 25.11.0 targets Chrome 153.0.8010.36 and 25.12.0 targets 154, so **pin `puppeteer-core@25.11.x` with `@sparticuz/chromium@153`**. For local dev, use full `puppeteer` (it downloads Chrome for Testing) or point `executablePath` at the installed Chrome.
- **Vercel limits** (docs, Oct 2026): Node function bundle 250 MB, with a 5 GB public beta on Fluid compute (Jun 2026 changelog). Duration on Hobby is 300 s; Pro defaults to 300 s and can be raised to 800 s. Chromium fits easily.
- **Browserless** (hosted): Free plan has 1k units/month and 2 concurrent browsers. A unit is up to 30 s of browser time. Prototyping is $25/mo for 20k units. It offers PDF REST APIs (exact path unverified). This is a good **emergency fallback** if serverless Chromium misbehaves.
- **Typst columns** (docs): use `page(columns: n)` for whole-page columns, `colbreak()`, and `place(top, scope: "parent", float: true)` for spanning headlines. The docs say columns are *not* balanced. Typst cannot fetch URLs, so images must be downloaded first.
- **Fonts** are all on Google Fonts / Fontsource under **SIL OFL 1.1** (verified on npm): `@fontsource/unifrakturmaguntia`, `@fontsource/playfair-display`, `@fontsource/newsreader`, `@fontsource/source-serif-4`, `@fontsource/libre-franklin`, `@fontsource/noto-nastaliq-urdu` (all 5.3.x). Self-hosting through Fontsource means rendering never needs network access for fonts.

### Reusable templates (licence checked where stated)
- **Typst `dashing-dept-news` 0.1.1**: by Typst GmbH, **MIT-0**. A newsletter with a hero image, main column and margin articles. It is a good reference for a Typst stretch version.
- **AlexDawsonUK/Printed**: an **MIT** print stylesheet with 2/3/4-column print classes. We can borrow its print-reset ideas.
- **German-Cobian/New-York-Times-Page-Clone**: an **MIT** HTML/CSS front-page clone. It is a web layout, not print, so treat it as a visual reference only.
- No well-maintained, MIT-licensed, print-ready HTML newspaper template turned up. **Build our own** from the spec below; the grid is ~150 lines of CSS. Avoid Tooplate and Lovable templates (licences unclear or commercial-only) and the GPL LibreOffice template.

## Page template spec (A4 portrait, 210 × 297 mm)

**Grid:** `@page { size: A4; margin: 0 }`. Each `.page` is `width:210mm; height:297mm; padding:12mm 11mm 14mm; overflow:hidden; break-after:page`. Inside it is a **6-column CSS grid** with a 4 mm gutter and hairline 0.5 pt column rules (`border-left` on cells). Body text is 9.5/12.5 pt, justified with `hyphens:auto` (`lang="en"`). Use `orphans:3; widows:3` and `break-inside:avoid` on `.story`, `figure` and `.pullquote`.

**Type scale** (all OFL):

| Role | Font | Size |
|---|---|---|
| Masthead | UnifrakturMaguntia (blackletter), or Playfair Display 900 small caps for a modern variant | 54–64 pt |
| Lead headline | Playfair Display 800 | 30–34 pt |
| Section headline | Playfair Display 700 | 18–22 pt |
| Brief headline | Libre Franklin 700 | 10 pt |
| Body | Newsreader (designed for news, optical sizes) or Source Serif 4 | — |
| Kickers, labels, folio, running head | Libre Franklin 600, caps, letter-spacing .08em | 7–8 pt |
| Urdu edition | Noto Nastaliq Urdu, `dir="rtl" lang="ur"`, line-height ≥ 2.0 (Nastaliq is tall) | — |

**Page 1 (front)**
1. **Ears**: left ear shows "Streak 🔥 12 days" (a drawn SVG flame, since emoji may not render in headless_shell). Right ear shows the Islamabad weather or "Your top interest today".
2. **Masthead**: the reader's paper name ("The Ayesha Times") centred above a double rule.
3. **Folio line**: "Vol. I · No. {editionNumber} · Saturday, 17 October 2026 · Islamabad · {N} stories picked for you".
4. **Lead story** spans columns 1–4: kicker, headline, deck, an image at 16:9 with caption and credit, and ~180 words. The last line ends "Continued online →" with a QR code.
5. **Right rail** spans columns 5–6: "In this edition", an index of the 20 stories with page numbers, plus "Today in 30 seconds" (5 one-line briefs).
6. **Lower band**: 3 stories × 2 columns each (headline, 80–110 words, small QR).

**Pages 2–3 (sections)**
- **Running header** (in markup): "{Paper name} · Sat 17 Oct 2026 · **Technology**" with the folio "2" at the outer edge (alternate on left and right pages).
- Each page takes the reader's top 1–2 sections, **ordered by interest weight**, which personalizes *how* the paper is presented.
- One section lead uses 4 columns with an image; 2–3 secondary stories use 2 columns each.
- One **pull quote** spans 2 columns, set in Playfair Italic 16 pt between rules.
- Every story gets a 16 mm QR code bottom-right and a clickable headline.

**Page 4 (back page)**
- **Briefs**: the remaining stories at 40–60 words each, in 3 columns.
- **"Why these stories?"**: a learning panel such as "You read 9 AI stories this week, so AI moved up. You skipped 4 cricket stories, so it moved down." Include a mini bar chart in SVG.
- **Quiz or crossword**: 5 AI-generated questions from today's stories, with upside-down answers. A mini 5×5 crossword is an optional stretch.
- **Footer**: "Printed for {name} · generated 06:00 PKT · scan any code to open the original". Include the colophon and the font licences in fine print.

**Story count:** 20 = front (1 lead + 3 + 5 one-line briefs that also appear in full inside) + inner pages (≈10) + back-page briefs (≈6). An LLM writes each summary **to a word budget per slot** (`lead:180, secondary:100, brief:50`). That keeps every page from overflowing. A server-side guard catches the rest: after `setContent`, measure `scrollHeight > clientHeight` per `.page`, then trim or move the last story to the briefs and re-render.

**Images:** fetch the `og:image` server-side with a 3 s timeout. Use `sharp` (unverified version) to resize to 1200 px wide, JPEG q70, optionally grayscale for an "ink" look. Inline the result as a data URI, or serve it from our own `/img/` path so Chromium never hotlinks. If an image is missing, use a typographic fallback (a big kicker letter on a tinted block) and never a broken image. Wait for `img.decode()` on every image before calling `pdf()`. Target a total PDF size under 3 MB.

**QR codes:** generate them with `qrcode` 1.5.4 (`QRCode.toString(url, {type:'svg', margin:0, errorCorrectionLevel:'M'})`), inline as vector SVG, at 16 mm minimum. Encode our short redirect `https://<app>/r/{storyId}?src=print&u={editionId}`, not the long original URL. This keeps the QR small and gives us a print-click signal.

## Generation and caching strategy
1. **Edition compile job** (cron ~06:00 PKT, or on demand at first visit) writes `editions` rows and the HTML-ready JSON.
2. **PDF job:** `renderPdf(editionId)` loads `/paper/{date}/print?token=…`, or better, calls `setContent(renderToStaticMarkup(<PrintEdition/>))` with fonts and images inlined. This removes any network or auth dependency during rendering. It produces the PDF and uploads it to Supabase Storage or Vercel Blob as `pdf/{userId}/{date}-{contentHash}.pdf`, and saves the URL on the edition.
3. **Download endpoint:** if a cached PDF exists, redirect to it. Otherwise render now (~seconds), store it, and return it. If rendering fails, show a "Print / Save as PDF" button (the `window.print()` fallback) on the same print route.
4. **Archive:** previous papers link to their stored PDFs, which are immutable per date.
5. **Demo safety:** commit `public/demo/edition-2026-10-17.pdf` and the seeded edition JSON. The demo account always works offline.
6. **Concurrency:** reuse one browser per warm instance, open a new page per edition, `page.close()`, and never close the browser mid-batch. For a batch, render sequentially or with concurrency 2. Twenty demo users at ~2 s each takes under a minute (estimate).

## Pipeline sketch
```ts
// lib/pdf/render.ts  (server only)
async function getBrowser() {
  if (process.env.VERCEL || process.env.AWS_REGION) {
    const chromium = (await import('@sparticuz/chromium')).default;      // 153.x
    const puppeteer = await import('puppeteer-core');                    // 25.11.x
    return puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: 'shell' });
  }
  return (await import('puppeteer')).launch();                           // Windows/mac dev: bundled Chrome for Testing
}
export async function renderEditionPdf(edition: Edition): Promise<Buffer> {
  const html = renderToStaticMarkup(<PrintEdition e={await inlineAssets(edition)} />); // fonts as base64 @font-face, images as data URIs, QR as SVG
  const page = await (browser ??= await getBrowser()).newPage();
  try {
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => Promise.all([document.fonts.ready, ...[...document.images].map(i => i.decode().catch(() => {}))]));
    const overflow = await page.evaluate(() => [...document.querySelectorAll('.page')].some(p => p.scrollHeight > p.clientHeight + 2));
    if (overflow) return renderEditionPdf(shrink(edition));               // move the last story to briefs, at most 2 retries
    return Buffer.from(await page.pdf({ preferCSSPageSize: true, printBackground: true, tagged: true, outline: false }));
  } finally { await page.close(); }
}
// route: GET /api/paper/:date/pdf -> cache hit ? redirect(blobUrl) : render -> put(blob) -> stream
```

## Recommendations for our build (ranked; effort is in hours for one Claude Code agent)
1. **Build `PrintEdition` as a React component with print CSS** (A4 page boxes, 6-column grid, the type scale above, Fontsource fonts). Expose it at `/paper/[date]/print` so it also serves as the `window.print()` fallback. **3 h.**
2. **Add `renderEditionPdf()` with puppeteer-core and Chromium** (local `puppeteer` on Windows, `@sparticuz/chromium@153` + `puppeteer-core@25.11.x` in prod). Include the font and image inlining and the overflow guard. **1.5 h.**
3. **Add QR codes and the `/r/[storyId]` redirect** that logs the `print_open` signal to the learning loop and then 302s to the original. **0.75 h.**
4. **Cache and archive:** upload to storage with a hash key, and add the download endpoint with fallback and a seeded demo PDF in `public/demo/`. **1 h.**
5. **Build the back page:** the "Why these stories?" panel (data from the learning model), a 5-question quiz from the LLM, and the streak. **1 h** (the quiz prompt is shared with whoever owns AI features).
6. **Add the per-slot word-budget summaries** to the summarizer prompt (`lead 180 / secondary 100 / brief 50`). **0.5 h**, coordinated with the summarization workstream.
7. *(Stretch)* **Urdu edition:** a `dir="rtl"` variant of the same template with Noto Nastaliq Urdu and LLM-translated summaries. It mirrors the grid with logical CSS properties (`margin-inline-start` and similar). **2 h.**
8. *(Fallback, if serverless Chromium fails for more than 20 min)* Point `renderEditionPdf` at a Browserless PDF REST API (free plan, 1k units/month) or run the renderer on a small Node host. Failing that, ship only `window.print()`. **0.5 h.**
9. *(Do not do)* Paged.js, react-pdf, pdfmake, jsPDF, WeasyPrint. Consider Typst only if a spare agent wants a "premium typesetting" toggle (**4 h+**).

## Innovation ideas
- **Print-to-learning loop (wow 4, 0.75 h):** each QR goes to our redirect, so a scan from paper becomes an explicit interest signal, and the web shows "You scanned 3 stories from your paper this morning." This scores on Innovation, Technical Complexity and Learning visibility.
- **"How your paper was made" back-page panel (wow 4, 1 h):** interest weights over time drawn as an SVG sparkline, plus a "moved up / moved down" list. It makes the learning visible on paper, which the brief requires. Scores on UI/UX, Presentation and Practical Impact.
- **Personalized presentation (wow 3, 1 h):** the reader picks a masthead style (Classic blackletter, Modern, Tabloid), a density (more briefs or more depth) and a **Large-print edition** (12 pt body, 4-column grid) for older readers. These are CSS variables on the same template. Scores on Originality, Accessibility and Usability.
- **Urdu edition (wow 5 for local judges, 2 h):** a properly shaped Nastaliq RTL newspaper, which Chromium can do and most PDF libraries cannot. Scores on Originality, Practical Impact and Technical Complexity.
- **Daily crossword from your own news (wow 4, 2 h):** the LLM picks 6–8 answer words from today's stories and a small JS grid filler builds a 7×7 mini puzzle. Scores on Innovation and Engagement (it ties into streaks).
- **Print-shop mode (wow 2, 0.5 h):** a "Print 2-up booklet" option that uses pdf-lib to impose pages for home printers.

## Risks
- **The serverless Chromium binary or version mismatch** breaks in production. *Mitigation:* pin `@sparticuz/chromium@153` with `puppeteer-core@25.11.x`, mark both external (`serverExternalPackages` in Next.js), and test a deploy in hour 2, not hour 9. Keep Browserless and `window.print()` as fallbacks, plus the seeded demo PDF.
- **Fonts are missing in Lambda** (only Open Sans ships), which gives tofu boxes in the Urdu edition or wrong metrics. *Mitigation:* base64 `@font-face` from Fontsource files, and keep `waitForFonts` true.
- **Emoji do not render** in headless_shell. *Mitigation:* use SVG icons in the print template.
- **Overflow or cut-off text** in fixed page boxes. *Mitigation:* word budgets, the overflow guard with re-render, and `line-clamp` as a last resort.
- **Hotlinked images** 403, time out or are huge. *Mitigation:* server-side fetch, `sharp` resize, data URI, and a typographic fallback.
- **Cold start plus render** exceeds the time a user will wait (~5–10 s first hit; unverified). *Mitigation:* pre-generate at edition time and show a skeleton with "Typesetting your paper…" progress on demand.
- **Copyright:** we print summaries plus a link and QR to the original, not full article text. We use only images whose `og:image` is meant for sharing, credit the source, and fall back to no image when unsure.
- **Playwright on Lambda** fills `/tmp`. Use Puppeteer, or pass a unique `--user-data-dir`.

## Sources
- Chrome margin boxes in print (Chrome 131): https://developer.chrome.com/blog/print-margins
- Puppeteer PDFOptions: https://pptr.dev/api/puppeteer.pdfoptions
- Puppeteer Chrome revision mapping: https://unpkg.com/puppeteer-core@25.11.0/src/revisions.ts and https://unpkg.com/puppeteer-core@25.14.0/src/revisions.ts
- Playwright page.pdf: https://playwright.dev/docs/api/class-page#page-pdf
- @sparticuz/chromium README and releases: https://github.com/Sparticuz/chromium
- Vercel function limits: https://vercel.com/docs/functions/limitations ; 5 GB functions changelog: https://vercel.com/changelog/vercel-functions-can-now-be-up-to-5-gb-in-package-size
- Browserless pricing: https://www.browserless.io/pricing
- Paged.js on npm (versions and dates): https://www.npmjs.com/package/pagedjs
- @react-pdf/renderer on npm: https://www.npmjs.com/package/@react-pdf/renderer ; issues https://github.com/diegomura/react-pdf/issues/3195 , https://github.com/diegomura/react-pdf/issues/3050
- Typst releases: https://github.com/typst/typst/releases ; columns docs: https://typst.app/docs/reference/layout/columns/ ; RTL/Arabic issues https://github.com/typst/typst/issues/7245 , https://github.com/typst/typst/issues/8500
- typst.ts node compiler: https://www.npmjs.com/package/@myriaddreamin/typst-ts-node-compiler
- Typst template dashing-dept-news (MIT-0): https://typst.app/universe/package/dashing-dept-news
- WeasyPrint on PyPI: https://pypi.org/project/weasyprint/
- pdfmake / jsPDF / pdf-lib / qrcode on npm: https://www.npmjs.com/package/pdfmake , https://www.npmjs.com/package/jspdf , https://www.npmjs.com/package/pdf-lib , https://www.npmjs.com/package/qrcode
- Fontsource packages (OFL-1.1): https://www.npmjs.com/package/@fontsource/newsreader , https://www.npmjs.com/package/@fontsource/noto-nastaliq-urdu , https://www.npmjs.com/package/@fontsource/unifrakturmaguntia
- MIT print stylesheet: https://github.com/AlexDawsonUK/Printed ; NYT clone (MIT): https://github.com/German-Cobian/New-York-Times-Page-Clone
