// Layout-only CSS for the printed paper (A4). Colours come from Morrow tokens (var(--…)) and type from the
// Morrow type classes (print-*, deck, dateline, ui-*); no hex colours, font families, radii or shadows here.
// The Morrow components (mw-*) are composed as they are; the one print adjustment is the nameplate size.
export const PRINT_CSS = `
@page { size: A4; margin: 0 }

.print-root { color: var(--ink); background: var(--paper); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.print-root *, .print-root *::before, .print-root *::after { box-sizing: border-box; }
.print-root h1, .print-root h2, .print-root h3, .print-root p, .print-root figure, .print-root ol, .print-root ul { margin: 0; }
.print-root ol, .print-root ul { padding: 0; list-style: none; }
.print-root a { color: inherit; text-decoration: none; }

/* The sheet */
.page { position: relative; display: flex; flex-direction: column; width: 210mm; height: 297mm; padding: 12mm 11mm 14mm;
  overflow: hidden; background: var(--paper); color: var(--ink); break-after: page; page-break-after: always; }
.page:last-child { break-after: auto; page-break-after: auto; }
.page--front .masthead { font-size: 60px; }

/* Shared type roles */
.print-kicker { color: var(--press); text-transform: uppercase; }
.print-body { color: var(--ink); text-align: justify; hyphens: auto; hyphenate-limit-chars: 6 3 2; orphans: 3; widows: 3; }
.print-headline, .print-lead { color: var(--ink); text-wrap: balance; }
.deck { color: var(--ink-soft); }

/* Stories */
.story { break-inside: avoid; }
.story__head { break-inside: avoid; break-after: avoid; }
.story .print-headline { margin: 1mm 0 1.5mm; }
.story + .story { margin-top: 3.5mm; padding-top: 3mm; border-top: 1px solid var(--rule); }
.source { display: flex; align-items: flex-end; justify-content: space-between; gap: 3mm; margin-top: 2mm; break-inside: avoid; break-before: avoid; color: var(--ink-muted); }
.source__text { display: flex; flex-direction: column; gap: 0.5mm; min-width: 0; overflow-wrap: anywhere; }
.source__name { color: var(--ink); font-weight: 600; }
.qr { display: block; width: 16mm; height: 16mm; flex: none; }
.qr svg { display: block; width: 100%; height: 100%; }
.why { color: var(--pen); margin: 0 0 1.5mm; }

/* Pictures, or the typographic fallback */
.visual { break-inside: avoid; }
.figure img { display: block; width: 100%; height: 100%; object-fit: cover; }
.visual--lead { height: 48mm; margin: 3mm 0; }
.visual--section { height: 62mm; }
.visual .figure { height: 100%; }
.img-fallback { display: flex; align-items: flex-end; height: 100%; padding: 2.5mm 3mm; background: var(--paper-sunk); color: var(--ink-muted); }
.visual--lead .img-fallback, .visual--section .img-fallback { height: 22mm; }
.visual--lead:has(.img-fallback), .visual--section:has(.img-fallback) { height: auto; }
.opener__row .visual:has(.img-fallback) { align-self: stretch; }
.opener__row .visual .img-fallback { height: 100%; min-height: 22mm; }

/* Page 1: a 5-column grid, lead in columns 1-3, rail in 4-5 */
.front { display: grid; grid-template-columns: repeat(5, 1fr); column-gap: 5mm; margin-top: 3mm; flex: 1 0 auto; }
.front__lead { grid-column: 1 / span 3; }
.front__rail { grid-column: 4 / span 2; position: relative; display: flex; flex-direction: column; gap: 2mm; }
.front__rail::before { content: ""; position: absolute; top: 0; bottom: 0; left: -2.5mm; width: 1px; background: var(--rule); }
.front__lead .print-kicker { margin-bottom: 1.5mm; }
.front__deck { margin-top: 2mm; }
.lead-body { column-count: 2; column-gap: 5mm; column-rule: 1px solid var(--rule); }
.lead-body::first-letter { float: left; font-size: 54px; line-height: 46px; font-weight: 700; margin: 2px 5px 0 0; color: var(--ink); }
.front__rail .story + .story { margin-top: 0; }
.front__rail .story { padding-top: 2mm; border-top: 1px solid var(--rule); }
/* The rail story sets its QR beside the summary to save a row */
.story--rail { display: grid; grid-template-columns: 1fr 16mm; column-gap: 3mm; }
.story--rail .story__head { grid-column: 1 / -1; }
.story--rail .print-body { grid-column: 1; }
.story--rail .source { display: contents; }
.story--rail .source__text { grid-column: 1; margin-top: 1.5mm; }
.story--rail .source__text a { display: none; }
.story--rail .qr-link { grid-column: 2; grid-row: 2 / span 2; align-self: end; }
.inside { border-top: 1px solid var(--ink); padding-top: 1.5mm; }
.inside__title { color: var(--ink); margin-bottom: 0.5mm; }
.inside__list li { border-bottom: 1px solid var(--rule); }
.inside__list a { display: flex; justify-content: space-between; gap: 3mm; padding: 0.3mm 0; }
.inside__page { color: var(--ink-muted); }

/* Teasers under a heavy rule */
.teasers { display: grid; grid-template-columns: repeat(5, 1fr); column-gap: 5mm; margin-top: 3mm; padding-top: 2mm; border-top: var(--rule-heavy) solid var(--ink); }
.teaser { position: relative; display: flex; flex-direction: column; gap: 1mm; }
.teaser + .teaser::before { content: ""; position: absolute; top: 0; bottom: 0; left: -2.5mm; width: 1px; background: var(--rule); }
.teaser__headline { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; text-wrap: wrap; }
.teaser__page { color: var(--ink-muted); }

/* Inner pages: running head, one section, 3-5 columns */
.page .mw-masthead--compact { flex: none; }
.section-head { margin-top: 4mm; padding-top: 1.5mm; border-top: var(--rule-heavy) solid var(--ink); }
.opener { margin-top: 4mm; }
.opener .print-kicker { margin-bottom: 1.5mm; }
.opener__row { display: grid; grid-template-columns: repeat(5, 1fr); column-gap: 5mm; margin-top: 3mm; align-items: start; }
.opener__row .visual { grid-column: 1 / span 3; }
.opener__row .mw-pq { grid-column: 4 / span 2; break-inside: avoid; }
.opener__row--solo .visual { grid-column: 1 / -1; }
.cols { margin-top: 4mm; column-gap: 5mm; column-rule: 1px solid var(--rule); column-fill: balance; }
.cols--3 { column-count: 3; }
.cols--4 { column-count: 4; }
.cols--5 { column-count: 5; }
.cols .story { break-inside: auto; }
.cols .story + .story { margin-top: 3mm; }

/* Briefs: run-in bold headline, one sentence, source; in up to 3 ruled columns */
.briefs { margin-top: 2mm; }
.brief-strip { margin-top: 2.5mm; column-gap: 5mm; column-rule: 1px solid var(--rule); }
.brief-strip--2 { column-count: 2; }
.brief-strip--3 { column-count: 3; }
.brief-strip .story--brief { break-inside: avoid; }
.brief-strip .story + .story { margin-top: 3mm; }
.brief__headline { margin-top: 0.8mm; font-weight: 700; text-align: left; hyphens: manual; }
.brief__text { margin-top: 0.5mm; }

/* Last page: briefs in columns 1-3, what the paper learned in 4-5 */
.last { display: grid; grid-template-columns: repeat(5, 1fr); column-gap: 5mm; flex: 1 0 auto; }
.last__main { grid-column: 1 / span 3; }
.last__rail { grid-column: 4 / span 2; position: relative; display: flex; flex-direction: column; gap: 3mm; }
.last__rail::before { content: ""; position: absolute; top: 4mm; bottom: 0; left: -2.5mm; width: 1px; background: var(--rule); }
.beyond { margin-top: 3mm; column-count: 2; column-gap: 5mm; column-rule: 1px solid var(--rule); }
.beyond .story { break-inside: avoid; }
.last .brief-strip--3 { column-count: 2; }
.brief__meta { margin-top: 1.5mm; color: var(--ink-muted); }
.movers { display: flex; flex-direction: column; gap: 2mm; margin-top: 2.5mm; }
.mover { display: grid; grid-template-columns: 1fr 26mm; align-items: center; column-gap: 3mm; }
.mover__bars { display: block; width: 26mm; height: 3.2mm; }
.mover__delta { grid-column: 1; color: var(--ink-muted); }
.bar-track { fill: var(--paper-sunk); }
.bar--before { fill: var(--rule-strong); }
.bar--after { fill: var(--pen); }
.reasons { color: var(--ink-muted); }

/* Every page ends with who it was made for, set in the bottom margin like a folio */
.foot { position: absolute; left: 11mm; right: 11mm; bottom: 6mm; padding-top: 1.5mm; border-top: 1px solid var(--rule); text-align: center; color: var(--ink-muted); }

/* On screen (the print route): sheets on a sunk desk, scaled to fit */
@media screen {
  .print-root { padding: 24px 0 48px; background: var(--paper-sunk); }
  .page { margin: 0 auto 24px; border: 1px solid var(--rule); }
  .screen-only { display: flex; justify-content: center; padding: 0 16px 24px; }
}
@media screen and (max-width: 840px) { .page { zoom: .85; } }
@media screen and (max-width: 700px) { .page { zoom: .7; } }
@media screen and (max-width: 580px) { .page { zoom: .58; } }
@media screen and (max-width: 480px) { .page { zoom: .47; } }
@media screen and (max-width: 400px) { .page { zoom: .42; } }
@media print {
  .screen-only { display: none; }
  .print-root { padding: 0; background: none; }
  .page { margin: 0; border: 0; }
}
`;
