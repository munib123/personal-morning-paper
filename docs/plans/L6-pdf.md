# L6 PDF Newspaper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every reader can download a real A4 newspaper PDF of their edition, set in the team's **Morrow** design system: the nameplate "The Morrow", "Prepared for {name}", per-story QR codes through `/r`, and a last page that shows what the paper learned. PDFs are **pre-rendered** with full Puppeteer (by `scripts/job-editions.ts` or a local `scripts/render-pdfs.ts` run) and served from Storage. On a miss, the route renders only where full Puppeteer exists (local/Actions); on Vercel it falls back to the `window.print()` route. The demo persona's 7 past editions plus today are pre-rendered, and committed `public/demo/sample.pdf` + two persona PDFs mean the demo never depends on Chromium. (Vercel on-demand Chromium is stretch S1.)

**Architecture:** A pure layout step (`buildPrintLayout`) assigns the 20 `EditionItem`s to a front page, one inner page per section (at most 3) and a last page, with a word budget per slot, so a paper has 2–5 pages. An asset step inlines images (data URIs) and QR codes (SVG) into a `PrintModel`. The React `PrintEdition` **composes Morrow components** (`Masthead`, `TakeawayBox`, `PullQuote` from `@/components/morrow`) plus a few print-only parts set in the Morrow `print-*` type classes, and turns the model into static markup. That markup serves both the Puppeteer `page.pdf()` render (with Morrow CSS and the self-hosted fonts inlined as base64) and the `/paper/[date]/print` page (which already has them from the app). An overflow guard measures each `.page` and re-lays out up to 2 times.

**Tech Stack:** React 19 `renderToStaticMarkup`, Morrow components (`@/components/morrow`), Morrow CSS (`src/styles/morrow/tokens.css` + `bundle.css`), self-hosted fonts (`src/app/fonts/*.woff2`), puppeteer 25.14.0 (local and Actions; the only browser in core), qrcode 1.5.4, Supabase Storage (supabase-js 2.118.0), Next.js 16.4.2 route handler, Vitest 5. Stretch S1 only: puppeteer-core 25.11.0 + @sparticuz/chromium 153.0.0 (Vercel).

**Spec:** `design/project/README.md` ("Layout: the PDF", "Color", "Typography", "Voice and copy"; **binding**), `design/project/components/index.d.ts`, `design/project/tokens.json`. `docs/ARCHITECTURE.md` §3a (Morrow adoption; its PDF bullets replace the §10.8 grid, fonts and page-4 details), §9.5 (`BRAND.nameplate = 'The Morrow'`), §10.8 (rendering, overflow guard, images, browser, caching), §9.3 (`getEditionPdfUrl`, `renderAndStoreEditionPdf`; consumed: `getLearningView`, `getProfile`, `getEdition`), §9.2 (`/api/editions/[date]/pdf`), §9.6 (`PdfButton` props), §9.7 (Storage, `pdf_download` fields, pages vs routes), §3 routes, §12 (jobs, `public/demo/*.pdf`). `docs/PLAN.md` §3 (Checkpoints A 14:30 / B 15:30 / C 16:30) and §5a (Vercel on-demand Chromium moved to stretch; seeded 7-day demo persona added). Research: `docs/research/10-pdf-generation.md` for page mechanics only (Morrow overrides its type, colours and masthead).

**Time budget: ~2 h 35 min core** (stretch not counted). Morrow supplies the masthead, takeaway box, pull quote, button, icons, tokens and fonts, so the font generator, the custom palette and the streak/quiz blocks are gone.

| Slice | Merge at | Tasks | Est. |
|---|---|---|---|
| A: fixture → template → `public/demo/sample.pdf` | ⛳ A 14:30 | 0–5 | ~70 min |
| B: print route, Storage, download route, button | ⛳ B 15:30 | 6–9 | ~45 min |
| C: demo persona PDFs (after L3 seeds the persona at B) | ⛳ C 16:30 | 10 | ~40 min |

If Task 5 is not green at 14:30, merge Tasks 0–4 (tests green) at A and land `sample.pdf` with slice B.

**APIs verified on Context7 (2026-10-17):**
- `/puppeteer/puppeteer`: `page.pdf(options?: PDFOptions): Promise<Uint8Array>`; `preferCSSPageSize` and `printBackground` both default to false; `waitForFonts` defaults to true.
- `/sparticuz/chromium` (stretch S1 only): `puppeteer.launch({ args: await puppeteer.defaultArgs({ args: chromium.args, headless: 'shell' }), executablePath: await chromium.executablePath(), headless: 'shell' })`.
- `/soldair/node-qrcode`: `QRCode.toString(text, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }): Promise<string>` (plus the `color: { dark, light }` option, RGBA hex).
- `/supabase/supabase-js`: `storage.from(b).upload(path, body, { contentType, upsert })`, `createSignedUrl(path, expiresInSeconds)` → `data.signedUrl`, `getBucket` / `createBucket(name, { public: false })`.
- `/vercel/next.js`: route `params` is a `Promise`; `export const maxDuration = 60`.

## Global Constraints

- Edit only: `src/server/pdf/**`, `src/app/paper/[date]/print/**`, `src/components/print/**`, `src/components/pdf/**`, `src/app/api/editions/[date]/pdf/route.ts`, `public/demo/**`, `scripts/render-sample-pdf.ts`, `scripts/render-pdfs.ts`, `docs/handoff/L6.md`, `docs/handoff/screens/L6-*.png`. No `package.json`, `next.config.*`, `src/contracts/**`, `src/components/morrow/**`, `src/styles/**` or `src/app/fonts/**` edits (L0 owns them; L6 only reads them).
- Import contracts from `@/contracts/...` (`Edition`, `EditionItem`, `WeightDelta`, `Profile`, `LearningView`, `TopicSlug`, `rootOf`, `PdfFallbackSchema`). Never redefine them. Fixtures come from `@/contracts/fixtures`: `FIXTURE_EDITION`, `FIXTURE_LEARNING`, `FIXTURE_PROFILE`. `BRAND` comes from `@/lib/brand` (`BRAND.nameplate === 'The Morrow'`).
- **Morrow is binding.** Compose `Masthead`, `TakeawayBox`, `PullQuote`, `Button` and `Icon` from `@/components/morrow`; never restyle their `mw-*` classes. The only print adjustment is the front-page nameplate size (`.page--front .masthead { font-size: 60px }`), which the README's PDF layout asks for ("nameplate at about 60px").
- **Colour and type** come only from Morrow tokens (`var(--paper)`, `var(--ink)`, `var(--ink-soft)`, `var(--ink-muted)`, `var(--rule)`, `var(--rule-strong)`, `var(--paper-sunk)`, `var(--press)`, `var(--pen)`, `var(--rule-heavy)`) and type classes (`print-lead`, `print-headline`, `print-body`, `print-kicker`, `deck`, `dateline`, `ui-meta`, `ui-label`, `masthead`, `masthead-sm`). `PRINT_CSS` holds layout only: no hex colours, no font families, no `--sec-*` vars. `press` is used at most once per story (the kicker). `pen` marks only what the paper learned or personalized (reason labels, mover "after" bars). No section colour-coding. No emoji.
- **Always the Morning theme:** the PDF HTML is `<html lang="en" data-theme="morning">`; the print route wraps the paper in `<div data-theme="morning" lang="en">`.
- **No gamification and no interactive affordances in the PDF:** no streak, no quiz, no badges, no buttons, no FeedbackBar or WhyTag. Links (headlines, QR codes) are fine.
- `@page { size: A4; margin: 0 }`. `.page` is `210mm × 297mm`, `padding: 12mm 11mm 14mm`, `overflow: hidden`, `break-after: page`, background `var(--paper)`. Square corners and rules, not boxes: no `border-radius`, no `box-shadow`, no four-sided borders. `print-body` is justified with `hyphens: auto`, `orphans: 3; widows: 3`, and `break-inside: avoid` on `.story`, `figure` and `.mw-pq`.
- **Page 1:** the Morrow `Masthead` (full) with ears "Edition No. {n}" / "Prepared for {displayName}", the nameplate, the double rule and the dateline strip `{Weekday, d Month yyyy} · {city} · Page 1 of {N}`. Then a 5-column grid (`grid-template-columns: repeat(5, 1fr); column-gap: 5mm`, a 1px `var(--rule)` between lead and rail), a heavy rule (`var(--rule-heavy) solid var(--ink)`) and a row of 5 teasers.
- **Inner pages:** a running head (Morrow `Masthead` compact: `masthead-sm` "The Morrow" · full date · "Page {p}"), one section per page, CSS columns 3–5 with `column-rule: 1px solid var(--rule)`.
- **Every story** ends with its source and a QR code (lead, rail and inner stories) or a printed short link (briefs). **Every page** ends with the footer `Prepared for {displayName ?? 'you'} · from {N} sources`.
- **Fonts:** inline base64 `@font-face` from `src/app/fonts/` (Newsreader-Variable, Newsreader-Variable-Italic, LibreFranklin-Variable, UnifrakturMaguntia-Regular, `.woff2`), with the family names from `tokens.json`. The blackletter is the nameplate only. **SVG icons only (Morrow `Icon`), no emoji.**
- QR target: `{APP_URL}/r/{articleId}?src=print&e={editionId}`, rendered at 16 mm in `ink` on transparent, via `toString(type 'svg', margin 0, level M)`. `APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'`.
- Images: fetched server-side, 3 s timeout, 1 MB cap, `image/*` only, `http(s)` only, inlined as data URIs, with a `paper-sunk` fallback block.
- Browser: full `puppeteer` only, locally and in Actions. `canRenderHere(env = process.env) = !env.VERCEL`; core code never imports `puppeteer-core` or `@sparticuz/chromium` (that is stretch S1). Render with `page.pdf({ preferCSSPageSize: true, printBackground: true })`.
- PDFs are pre-rendered: `scripts/job-editions.ts` (L3) and `scripts/render-pdfs.ts` (Task 10) call `renderAndStoreEditionPdf`. The download route renders on a miss only when `canRenderHere()`.
- Storage: private bucket `papers` (created by L0's migration), object key `{userId}/{date}-{hash}.pdf`, saved to `editions.pdf_path` **without** the bucket prefix. Signed URLs last 3600 s. `ensurePapersBucket` is only a safety net.
- Route: `maxDuration = 60`. Responses are 302 to the signed URL (stored, or rendered + stored when `canRenderHere()`), or 503 `{ fallback: '/paper/{date}/print' }` (not stored on Vercel, or render failed).
- Copy follows the README "Voice and copy": calm, "you" and "your paper", sentence case (kickers and datelines uppercase in CSS only), never "I" or "our AI", no exclamation marks. Section display names always come from `edition.sectionNames[slug]` (via `sectionName`, Task 2); mover names from `WeightDelta.name`. L6 never reads `seed/taxonomy.json`.
- Server functions consumed (§9.3), never re-implemented: `getEdition` (`@/server/edition`), `getProfile` (`@/server/profile`: city, displayName), `getLearningView` (`@/server/learn`: movers), `requestNow` (`@/server/time`), `getSessionUser` / `requireUser` (`@/server/auth/session`), `createSupabaseAdminClient` (`@/server/db/admin`).
- Layout reads tiers as built; `presentation.timeBudget` (5 | 15 | 30, default 15) already shaped them upstream, so L6 does not branch on it.
- Commits use conventional messages and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Push after every task.
- Run JSX outside Next with `npx tsx --tsconfig src/server/pdf/tsconfig.tsx.json …` (`jsx: react-jsx`), because Next's tsconfig may use `jsx: preserve`.
- Rolling integration: merge your first vertical slice (fixtures OK) at Checkpoint A 14:30, then again at B 15:30; end-to-end green by C 16:30.

## Review Focus

1. **A story with no image, a 404, a slow host (> 3 s) or a 5 MB image.** Expect the `paper-sunk` fallback block, never a broken `<img>`, and a render that still takes < 5 s. Pinned in Task 4 (`inlineImage` tests).
2. **A thin edition** (12 items, no `top` slot, a `sectionOrder` root with no core items, `keyFact` null everywhere). Expect 2–3 pages, no crash, fewer than 5 teasers with no empty slots, and both takeaway lists falling back to the first sentence of `summary.brief`. Pinned in Task 2 (`buildPrintLayout thin edition`) and Task 3 (`threeThingsToKnow`, `threeThingsLearned`).
3. **Markup-hostile text:** a headline like `AT&T <b>"wins"</b>`, or a URL containing `&`. Expect escaped text and a valid `href`. Pinned in Task 3 (`PrintEdition escapes`).
4. **Overflow from max-length copy** (deep summaries of 140 words, 14-word headlines). Expect the guard to move stories into the briefs, and no `.page` with `scrollHeight > clientHeight` in the final render. Pinned in Task 2 (`shrinkLayout`) and Task 5 (script prints `overflow=[]`).
5. **Morrow fidelity:** no hex colour or font family in `PRINT_CSS`, no streak, no `<button>`, no emoji, the Morrow `mw-masthead` / `mw-takeaway` / `mw-pq` markup present, and Morning theme fonts actually embedded (no tofu, blackletter nameplate). Pinned in Task 3 and the Task 5 visual check.
6. **A wrong date or another user's edition** (`/api/editions/2026-13-99/pdf`, a date with no edition, no session). Expect 400 / 404 / 401, and never a signed URL for another user's object. Pinned in Task 8 route tests.
7. **A miss on Vercel** (`VERCEL=1`, `pdf_path` null). Expect an immediate 503 `{ fallback }` with no browser launch attempted, and a 302 to the stored object when one exists. Pinned in Task 8 route tests.

---

### Task 0: Worktree setup and draft PR

**Files:** none (environment only)

- [ ] **Step 1: Branch.** Run `git fetch origin && (git switch lane/L6-pdf || git switch -c lane/L6-pdf origin/main)`, then `git branch --show-current`. Expected: `lane/L6-pdf`.
- [ ] **Step 2: Env and deps.** Run `cp /d/Documents/fast_Ai_Heckathon/.env.local ./.env.local && npm ci`. Set the model cache with `setx MODEL_CACHE_DIR "%USERPROFILE%\.cache\subah-models"` (PowerShell: `$env:MODEL_CACHE_DIR="$env:USERPROFILE\.cache\subah-models"` for this session).
- [ ] **Step 3: Browsers.** Run `node -e "console.log(require('puppeteer').executablePath())"`. If the path does not exist, run `npx puppeteer browsers install chrome`. Then run `npx playwright install chromium`.
- [ ] **Step 4: Verify L0's outputs against the spec (read only, edit nothing).**
  - `grep -n "FIXTURE_EDITION\|FIXTURE_LEARNING\|FIXTURE_PROFILE" src/contracts/fixtures.ts`: all 3 are exported.
  - `grep -n "sectionNames\|keyFact" src/contracts/edition.ts src/contracts/article.ts`: present per §9.1.
  - `grep -n "export" src/server/learn/index.ts src/server/profile/index.ts src/server/pdf/index.ts`: `getLearningView`, `getProfile` and the two pdf stubs exist.
  - `grep -n "nameplate" src/lib/brand.ts`: `'The Morrow'`.
  - **Morrow:** `grep -n "export function" src/components/morrow/index.tsx` lists `Masthead`, `TakeawayBox`, `PullQuote`, `Button`, `Icon` (15 in all); `ls src/styles/morrow` shows `tokens.css` and `bundle.css`; `grep -n "print-lead\|print-body\|print-kicker\|masthead-sm" src/styles/morrow/tokens.css` finds the print classes; `grep -n "data-theme" src/styles/morrow/tokens.css` shows how themes are scoped (note whether `[data-theme="morning"]` works on a nested element; if it is `:root`-only, the print route relies on the app's default Morning theme and the handoff says so).
  - `ls src/app/fonts`: the 4 `.woff2` files named in Global Constraints.
  - `grep -n "serverExternalPackages" next.config.ts`: it lists at least `'puppeteer'`. If not, record it in the handoff for the integrator; do not edit `next.config.ts`.
  - `grep -rn "PdfButton" src/components/pdf`: note the stub's props. Task 9 implements the §9.6 props `{ date: string; editionId: string | null }` regardless.
- [ ] **Step 5: Baseline.** Run `npm run typecheck`. Expected: exit 0 on the L0 stubs.
- [ ] **Step 6: Push and open the PR.** Run `git push -u origin lane/L6-pdf`, then `gh pr create --draft --base main --title "L6: PDF newspaper" --body "Plan: docs/plans/L6-pdf.md · Req 2 (PDF)"`. Expected: a PR URL is printed.

### Task 1: Handoff skeleton, print extras type and fixture extras

**Files:**
- Create: `docs/handoff/L6.md`, `src/server/pdf/tsconfig.tsx.json`, `src/server/pdf/types.ts`, `src/server/pdf/fixture.ts`
- Test: `src/server/pdf/fixture.test.ts`

**Interfaces:**
- Consumes: `FIXTURE_EDITION`, `FIXTURE_LEARNING`, `FIXTURE_PROFILE` from `@/contracts/fixtures`.
- Produces:
  - in `types.ts`: `export interface PrintExtras { city: string; displayName: string | null; movers: WeightDelta[]; appUrl: string; }` (no streak: the PDF carries no gamification)
  - `fixtureExtras(): PrintExtras` = `{ city: FIXTURE_PROFILE.city, displayName: FIXTURE_PROFILE.displayName, movers: FIXTURE_LEARNING.movers.slice(0, 5), appUrl: APP_URL }`, with `APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'` exported from `fixture.ts`.
  - `tsconfig.tsx.json` = `{ "extends": "../../../tsconfig.json", "compilerOptions": { "jsx": "react-jsx" } }`.

- [ ] **Step 1: Write `docs/handoff/L6.md`** with empty Done / Exports / Verify sections, plus the Task 0 Step 4 results (`serverExternalPackages`, the L0 `PdfButton` stub props, the Morrow theme scoping).
- [ ] **Step 2: Test.** In `fixture.test.ts`: `movers.length <= 5`; `city === FIXTURE_PROFILE.city`; `'streak' in fixtureExtras()` is `false`; `FIXTURE_EDITION.items.length === 20`.
- [ ] **Step 3:** Run `npx vitest run src/server/pdf/fixture.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 4:** Implement `types.ts` and `fixture.ts`.
- [ ] **Step 5:** Run the same command. Expected: PASS.
- [ ] **Step 6:** Commit `chore(pdf): handoff skeleton and fixture print extras`, then push.

### Task 2: Pure layout, word budgets and overflow decision

**Files:**
- Create: `src/server/pdf/layout.ts`
- Modify: `src/server/pdf/types.ts`
- Test: `src/server/pdf/layout.test.ts`

**Interfaces:**
- Consumes: `Edition`, `EditionItem`, `rootOf` from `@/contracts/edition` and `@/contracts/taxonomy`.
- Produces (types in `types.ts`):
  ```ts
  export type StoryRole = 'lead' | 'rail' | 'section-lead' | 'secondary' | 'brief';
  export interface WordBudgets { lead: number; rail: number; sectionLead: number; secondary: number; brief: number; }
  export const DEFAULT_BUDGETS: WordBudgets = { lead: 180, rail: 70, sectionLead: 120, secondary: 70, brief: 45 };
  export interface InnerPage { root: TopicSlug; items: EditionItem[]; }   // items[0] is the section lead
  export interface PrintLayout { lead: EditionItem; rail: EditionItem[]; inner: InnerPage[]; beyond: EditionItem[]; briefs: EditionItem[]; budgets: WordBudgets; }
  export const RAIL_MAX = 2, MAX_INNER_PAGES = 3, INNER_PAGE_CAPACITY = 5, TEASER_COUNT = 5;
  export const MAX_OVERFLOW_RETRIES = 2;
  ```
  - `buildPrintLayout(edition: Edition, budgets?: WordBudgets): PrintLayout`
  - `pageCount(layout): number` = `2 + layout.inner.length`; `pageOf(layout, articleId): number`
  - `teasers(layout): { item: EditionItem; page: number }[]`: up to `TEASER_COUNT`, each inner page's section lead first, then further inner stories, then briefs (pointers; they do not consume items)
  - `insideIndex(edition, layout): { label: string; page: number }[]`: one entry per inner page (`sectionName` of its root), then `In brief` on the last page
  - `pickSummary(item: EditionItem, role: StoryRole, budgets: WordBudgets): string`
  - `clampWords(text: string, max: number): string` (appends `…` when it cuts)
  - `firstSentence(text: string): string`
  - `shrinkLayout(layout: PrintLayout, overflowingPages: number[]): PrintLayout | null`
  - `formatPaperDate(date: string): string` (full, e.g. `Saturday, 17 October 2026`)
  - `storyHref(appUrl: string, articleId: string, editionId: string): string`; `shortLink(href: string): string` (the href without its protocol)
  - `countSources(layout): number` (distinct `article.sourceName` across every printed story)
  - `sectionName(edition: Edition, slug: TopicSlug): string` = `edition.sectionNames[slug]`, falling back to the sentence-cased last segment of the slug

Layout rules:
- Lead = the item whose `article.id === edition.leadArticleId`. Rail = the first `RAIL_MAX` items with `slot === 'top'`; any other top items flow on with the core items.
- Items with slot `bigstory` / `explore` / `serendipity` → `beyond` (printed first on the last page, labelled "Beyond your usual").
- Core (+ leftover top) items are grouped by `rootOf(sectionSlug)` in `sectionOrder` order (unknown roots go last). The first `MAX_INNER_PAGES` roots with ≥ 2 items each get an inner page (at most `INNER_PAGE_CAPACITY`, in rank order); the extra items and all other roots go to `briefs`.
- `pickSummary`: lead → `deep`; rail → `std`; section-lead → `deep` if `tier === 'deep'`, else `std`; secondary → `brief` if `tier === 'brief'`, else `std`; brief → `brief`. The result is clamped to the role's budget.

`shrinkLayout` (pages are 1-indexed, last = `pageCount`), returning `null` when nothing can move:
- an inner page p (2 … last − 1) overflows → move the last item of `inner[p-2]` to `briefs[0]`;
- page 1 overflows → if `budgets.lead > 120`, set it to 120, else if `rail.length > 1`, move the last rail story to `briefs[0]`;
- the last page overflows → if `budgets.brief > 30`, set it to 30, else drop the last brief.

- [ ] **Step 1: Write the failing tests.** Use `FIXTURE_EDITION`.
  - `sectionName(FIXTURE_EDITION, FIXTURE_EDITION.sectionOrder[0])` equals `FIXTURE_EDITION.sectionNames[FIXTURE_EDITION.sectionOrder[0]]`; `sectionName(FIXTURE_EDITION, 'x.unknown-node')` → `'Unknown node'`.
  - `formatPaperDate('2026-10-17')` → `'Saturday, 17 October 2026'`. Build it with `Intl.DateTimeFormat('en-GB', { timeZone: 'UTC' }).formatToParts` on `${date}T12:00:00Z`.
  - `storyHref('https://subah.app','a1','e9')` → `'https://subah.app/r/a1?src=print&e=e9'`; `shortLink` of that → `'subah.app/r/a1?src=print&e=e9'`.
  - `clampWords('one two three', 2)` → `'one two…'`; `clampWords('one two', 5)` → `'one two'`.
  - Fixture layout:
    - `lead.article.id === edition.leadArticleId`; `rail.length === 2`;
    - `1 <= inner.length <= 3`; every inner page has 2–5 items, all with the same root;
    - every id appears exactly once across lead + rail + inner + beyond + briefs (20 unique);
    - `inner[0].root` is the first root in `sectionOrder` with ≥ 2 flowing items;
    - `pageCount === 2 + inner.length`; `pageOf(layout, inner[0].items[0].article.id) === 2`.
  - `teasers(layout)`: length `Math.min(5, inner stories + briefs)`; the first is `inner[0].items[0]` on page 2; every `page` equals `pageOf`.
  - `insideIndex`: one entry per inner page with its section name and page, then `{ label: 'In brief', page: pageCount }`.
  - `buildPrintLayout thin edition`: 12 items with no `top` slot → `rail.length === 0`, `pageCount >= 2`, and the function does not throw.
  - `shrinkLayout`:
    - page [2] → `inner[0]` loses its last item, and that item becomes `briefs[0]`;
    - page [1] → `budgets.lead === 120`; a second call → `rail.length === 1`;
    - the last page twice → `budgets.brief === 30`, then `briefs.length` decreases by 1;
    - a layout with nothing left to move → `null`.
  - `pickSummary` for the lead uses `summary.deep`, clamped to 180 words.
  - `countSources(layout)` equals the number of distinct `sourceName`s in the fixture.
- [ ] **Step 2:** Run `npx vitest run src/server/pdf/layout.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `types.ts` and `layout.ts`. They are pure: no I/O, no `Date.now()`.
- [ ] **Step 4:** Run it again. Expected: PASS (about 16 tests).
- [ ] **Step 5:** Commit `feat(pdf): pure print layout, word budgets and overflow decision`, then push.

### Task 3: Inlined Morrow CSS and fonts, print CSS and the PrintEdition template

**Files:**
- Create: `src/server/pdf/styles.ts` (`morrowCss`, `fontFaceCss`)
- Create, in `src/components/print/`:
  - `print-css.ts`
  - `PrintEdition.tsx`
  - `FrontPage.tsx`, `SectionPage.tsx`, `LastPage.tsx`
  - `parts.tsx` (`StoryBlock`, `StorySource`, `Qr`, `ImageOrFallback`, `RunningHead`, `PageFoot`, `Teaser`, `MoverBars`)
- Modify: `src/server/pdf/types.ts`
- Test: `src/server/pdf/styles.test.ts`, `src/components/print/PrintEdition.test.tsx`

**Interfaces:**
- Consumes: `PrintLayout`, `pickSummary`, `pageCount`, `pageOf`, `teasers`, `insideIndex`, `formatPaperDate`, `storyHref`, `shortLink`, `countSources`, `sectionName`, `firstSentence` (Task 2); `PrintExtras` (Task 1); `Masthead`, `TakeawayBox`, `PullQuote` from `@/components/morrow`; `BRAND` from `@/lib/brand`.
- Produces:
  ```ts
  export interface PrintAssets { qr: Record<string, string>; images: Record<string, string | null>; }  // keyed by article id
  export interface PrintModel { edition: Edition; layout: PrintLayout; extras: PrintExtras; assets: PrintAssets; }
  ```
  - `morrowCss(): string`: `src/styles/morrow/tokens.css` + `bundle.css`, read with `fs.readFileSync(path.join(process.cwd(), …))`, with any `@font-face` blocks removed, memoized
  - `fontFaceCss(): string`: 4 base64 `@font-face` rules (`data:font/woff2;base64,…`) from `src/app/fonts/` with the `tokens.json` families and weight ranges (`Newsreader` 200 800 normal and italic, `Libre Franklin` 100 900, `UnifrakturMaguntia` 400), then `:root { --font-masthead; --font-serif; --font-sans }` set to the `tokens.json` stacks so the PDF never depends on `next/font` variables; memoized
  - `PRINT_CSS: string`
  - `PrintEdition({ model }: { model: PrintModel }): JSX.Element`, which renders `<div class="print-root">` with `<style>{PRINT_CSS}</style>` plus `pageCount` `<section class="page">`
  - `threeThingsToKnow(model): string[]` (FrontPage): `article.keyFact` of the lead + rail stories in rank order, falling back to `firstSentence(summary.brief)`, padded from the inner section leads, at most 3
  - `threeThingsLearned(model): string[]` (LastPage): the same rule over the inner section leads, then the other inner stories, skipping ids already used by `threeThingsToKnow`, at most 3
  - `reasonLine(model): string` (LastPage): counts of `reasons[0].code` across printed items, e.g. `14 from topics you follow · 2 trying something new · 1 step outside your usual`

- [ ] **Step 1: Write the failing tests.**
  - `styles.test.ts`: `fontFaceCss()` has 4 `@font-face`, contains `font-family: "UnifrakturMaguntia"` and `data:font/woff2;base64,`, and is < 600 000 characters; `morrowCss()` contains `--press`, `.mw-masthead` and `.print-body`, and no `url(` pointing at a `.woff2`.
  - `PrintEdition.test.tsx`, with `// @vitest-environment node` at the top (L0's config sends `*.test.tsx` to jsdom): `renderToStaticMarkup(<PrintEdition model={m}/>)`, where `m` is the fixture layout with `assets` faked (`qr[id] = '<svg data-qr="'+id+'"/>'`, `images = {}`). Assert:
    - the markup has exactly `pageCount(layout)` matches of `class="page`;
    - page 1: `mw-masthead`, `The Morrow`, `Edition No. ${edition.number}`, `Prepared for ${displayName}`, `formatPaperDate(edition.date)`, the city, `Page 1 of ${pageCount}`;
    - it contains `Three things to know` (inside `mw-takeaway`), `Inside`, `Beyond your usual`, `Three things you learned`, `Why these stories` and `Tomorrow&#x27;s Morning Recall will ask you about these.`;
    - `masthead-sm` appears `pageCount - 1` times (running heads), and `Prepared for` + ` · from ${countSources} sources` appears on every page;
    - the teaser row has `teasers(layout).length` items, each with `Page {n}`;
    - the count of `href="http://localhost:3000/r/` is ≥ 1 + rail + inner story count (`src=print&amp;e=` + edition id present), and every printed story's `sourceName` appears;
    - `PRINT_CSS` contains `column-rule: 1px solid var(--rule)`, `hyphens: auto` and `repeat(5, 1fr)`, and has no `#[0-9a-fA-F]{3,8}\b`, no `font-family`, no `border-radius`, no `box-shadow` and no `--sec-`;
    - no emoji (`/\p{Extended_Pictographic}/u`), no `/streak/i`, no `Quiz me`, no `<button`, no `mw-feedback` and no `mw-why`;
    - a lead with `imageUrl` but `images[id] = null` renders `class="img-fallback"` and no `<img`;
    - `PrintEdition escapes`: a headline `AT&T <b>"wins"</b>` appears as `AT&amp;T &lt;b&gt;`;
    - `threeThingsToKnow` and `threeThingsLearned` share no story on the fixture, and with every `keyFact` null they return first sentences of `summary.brief`.
- [ ] **Step 2:** Run `npx vitest run src/server/pdf/styles.test.ts src/components/print`. Expected: FAIL.
- [ ] **Step 3: Implement `styles.ts` and `PRINT_CSS`.** `PRINT_CSS` is layout only (Global Constraints): the page box, the front 5-column grid, the 2-column lead body (`column-count: 2; column-rule: 1px solid var(--rule)`) with a 3-line drop cap (`::first-letter`, Newsreader via the `print-lead` family, `ink`), inner `.cols` with `column-count` 3 (≤ 3 stories), 4 or 5 and `column-rule: 1px solid var(--rule)`, `.print-kicker { color: var(--press); text-transform: uppercase }`, the section head (a `var(--rule-heavy) solid var(--ink)` rule over a `print-kicker`), `.qr` 16 mm square, `.img-fallback` (`var(--paper-sunk)` block with the section name in `dateline`), `.why { color: var(--pen) }`, the page foot, the nameplate size override, `@media screen` (body `var(--paper-sunk)`, pages centred with a 1px `var(--rule)` border and no shadow, `zoom: .47` at `max-width: 480px`, `zoom: .9` at `max-width: 840px`) and `@media print { .screen-only { display: none } }`.
- [ ] **Step 4: Implement the components.** They follow README "Layout: the PDF" and ARCHITECTURE §3a.
  - **FrontPage:**
    - `<Masthead variant="full" title={BRAND.nameplate} edition={edition.number} reader={displayName ?? undefined} date={formatPaperDate(date)} location={city} readingTime={`Page 1 of ${pageCount}`} />` (the strip then reads date · city · page);
    - lead on columns 1–3: `print-kicker` section name, `print-lead` headline link, `deck` (`whyItMatters ?? firstSentence(summary.brief)`), image or fallback, `print-body` deep summary in 2 columns with the drop cap, then `StorySource` (source · QR);
    - columns 4–5: `<TakeawayBox title="Three things to know" items={threeThingsToKnow…}/>` (each item links to its `storyHref`), the rail stories (`print-headline`, std summary, `StorySource`), then the **Inside** index (`dateline` label, `ui-label` rows: section name · page);
    - a heavy rule, then the row of 5 `Teaser`s (`print-kicker` section name, `print-headline` headline, `dateline` `Page {n}`).
  - **SectionPage(p):**
    - `RunningHead` = `<Masthead variant="compact" date={formatPaperDate(date)} actions={<span className="dateline">Page {p}</span>} />`;
    - the section head with `sectionName(edition, root)`;
    - `.cols` with every story as a `StoryBlock` (`print-kicker`, `print-headline`, `print-body`, `StorySource` with QR); the section lead gets its image or fallback;
    - one `<PullQuote quote={sectionLead.whyItMatters ?? sectionLead.keyFact}/>` when either is non-null.
  - **LastPage:**
    - a running head, then "Beyond your usual" items first (with `reasons[0].text` in `.why`), then "In brief", in 4 columns with column rules; each brief ends with `ui-meta` `{sourceName} · {shortLink}`;
    - "Why these stories": up to 5 `movers` as `MoverBars` (an SVG with a `var(--rule-strong)` before bar and a `var(--pen)` after bar, width ∝ theta, the mover name in `ui-label`), plus `reasonLine` in `ui-meta`;
    - `<TakeawayBox title="Three things you learned" items={threeThingsLearned…} footnote="Tomorrow's Morning Recall will ask you about these."/>`.
  - **Every page** ends with `PageFoot` (`dateline`): `Prepared for {displayName ?? 'you'} · from {countSources} sources`.
  - `Qr` is a `<span class="qr" dangerouslySetInnerHTML={{ __html: svg }}/>` inside an `<a href>`.
- [ ] **Step 5:** Run `npx vitest run src/server/pdf/styles.test.ts src/components/print && npm run typecheck`. Expected: PASS, exit 0.
- [ ] **Step 6:** Commit `feat(print): Morrow PrintEdition template with inlined tokens and fonts`, then push.

### Task 4: Assets (QR, images) and model preparation

**Files:**
- Create: `src/server/pdf/qr.ts`, `src/server/pdf/images.ts`, `src/server/pdf/model.ts`
- Test: `src/server/pdf/assets.test.ts`

**Interfaces:**
- Consumes: `storyHref`, `buildPrintLayout` (Task 2); the `PrintModel` types (Task 3).
- Produces:
  - `qrSvg(url: string): Promise<string>` with `{ type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#1b1813', light: '#0000' } }` (the Morning `ink` value from `tokens.json` on transparent, so the paper shows through)
  - `inlineImage(url: string | null, opts?: { timeoutMs?: number; maxBytes?: number; fetchImpl?: typeof fetch }): Promise<string | null>`, with defaults `3000` / `1_000_000`
  - `preparePrintModel(edition: Edition, extras: PrintExtras, layout?: PrintLayout): Promise<PrintModel>`. It creates QRs for the lead, rail and inner stories, and images only for the lead and the inner section leads, all in parallel with `Promise.all`.

- [ ] **Step 1: Write the failing tests.**
  - `qrSvg` output starts with `<svg` and equals `QRCode.toString(url, …)` with the options above.
  - **QR decodes to the URL:** `QRCode.create(url, { errorCorrectionLevel: 'M' }).segments`, mapped as `typeof s.data === 'string' ? s.data : Buffer.from(s.data).toString('utf8')` and joined, equals `'https://subah.app/r/a1?src=print&e=e9'`.
  - `inlineImage` with a mocked `fetchImpl`:
    - a 200 `image/jpeg` 10-byte body → it starts with `data:image/jpeg;base64,`;
    - `text/html` → `null`;
    - `content-length: 5000000` → `null`;
    - a body larger than `maxBytes` with no header → `null`;
    - a fetch that never resolves with `timeoutMs: 50` → `null` within 200 ms;
    - `'ftp://x'` → `null` and fetch is not called;
    - a URL of `null` → `null`.
  - `preparePrintModel(FIXTURE_EDITION, fixtureExtras())`, with `inlineImage` stubbed through `vi.mock('./images')`: `Object.keys(assets.qr).length === 1 + rail + inner stories`, and every key is a printed article id.
- [ ] **Step 2:** Run `npx vitest run src/server/pdf/assets.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** `inlineImage` uses `AbortSignal.timeout(timeoutMs)`, checks the `content-type` prefix `image/`, reads `arrayBuffer()` and enforces the byte cap. It never throws: it catches errors, returns `null`, and logs `[pdf] image skipped` with the host.
- [ ] **Step 4:** Run it again. Expected: PASS.
- [ ] **Step 5:** Commit `feat(pdf): inline QR codes and images into the print model`, then push.

### Task 5: Browser, render pipeline with overflow guard, and sample.pdf (demo-critical)

**Files:**
- Create: `src/server/pdf/browser.ts`, `src/server/pdf/render.ts`, `scripts/render-sample-pdf.ts`, `public/demo/sample.pdf` (generated), `docs/handoff/screens/L6-page-{1..N}.png`
- Test: `src/server/pdf/browser.test.ts`

**Interfaces:**
- Consumes: `preparePrintModel` (Task 4); `shrinkLayout`, `MAX_OVERFLOW_RETRIES`, `buildPrintLayout`, `pageCount` (Task 2); `PrintEdition`, `morrowCss`, `fontFaceCss` (Task 3); `fixtureExtras` (Task 1); `FIXTURE_EDITION`.
- Produces:
  - `canRenderHere(env: NodeJS.ProcessEnv = process.env): boolean`, which returns `!env.VERCEL` (full Puppeteer is available locally and in Actions only)
  - `getBrowser(): Promise<Browser>` (the type comes from `puppeteer`), a module singleton that is relaunched if `!browser.connected`; it throws `Error('[pdf] no browser on Vercel')` when `!canRenderHere()`
  - `buildPrintHtml(model: PrintModel): Promise<string>`, which does `await import('react-dom/server')` and returns `<!doctype html><html lang="en" data-theme="morning"><head><meta charset="utf-8"><title>The Morrow · Edition No. {n}</title><style>{morrowCss() + fontFaceCss()}</style></head><body>…</body></html>`
  - `renderEditionPdf(edition: Edition, extras: PrintExtras, opts?: { screenshotsDir?: string }): Promise<{ pdf: Uint8Array; pages: number; attempts: number; overflow: number[]; ms: number }>`

- [ ] **Step 1: Write the failing test.**
  - `canRenderHere({ VERCEL: '1' })` → `false`; `canRenderHere({})` → `true`.
  - The overflow measurement script, exported as the string `MEASURE_OVERFLOW_JS`, run through `new Function` against a fake `document` with 4 `.page` stubs (`scrollHeight` 1130/1123/1123/1200, `clientHeight` 1123) → `[1, 4]`. A tolerance of 2 px means 1124 does not count.
  - `buildPrintHtml(fixture model)` starts with `<!doctype html><html lang="en" data-theme="morning">` and contains `@font-face`.
- [ ] **Step 2:** Run `npx vitest run src/server/pdf/browser.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `getBrowser`.** If `!canRenderHere()`, throw. Otherwise `(await import('puppeteer')).default.launch({ headless: true })`. The dynamic import keeps Puppeteer out of the Vercel bundle path. (The serverless branch is stretch S1.)
- [ ] **Step 4: Implement `renderEditionPdf`.** Loop `attempt = 0..MAX_OVERFLOW_RETRIES`:
  - prepare the model, then `page.setContent(html, { waitUntil: 'load' })`;
  - `page.emulateMediaType('print')`;
  - `page.evaluate(() => Promise.all([document.fonts.ready, ...[...document.images].map(i => i.decode().catch(() => {}))]))`;
  - `overflow = await page.evaluate(MEASURE_OVERFLOW_JS)`;
  - if overflow is non-empty and attempts remain, `next = shrinkLayout(layout, overflow)`; if `next` is non-null, continue with it;
  - otherwise `page.pdf({ preferCSSPageSize: true, printBackground: true })`, and `pages = pageCount(layout)`.

  When `screenshotsDir` is set, run `page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 })` and screenshot each `.page` element handle to `L6-page-{i}.png`. Always `page.close()` in `finally`, and never close the shared browser.
- [ ] **Step 5: Write `scripts/render-sample-pdf.ts`.**
  - It calls `renderEditionPdf(FIXTURE_EDITION, fixtureExtras(), { screenshotsDir: 'docs/handoff/screens' })`.
  - It writes `public/demo/sample.pdf` and prints `pages=<count of /\/Type\s*\/Page[^s]/g> expected=<pages> links=<count of /\/URI\s*\(/g> overflow=[…] attempts=N ms=M bytes=B`.
  - It closes the browser and exits.
- [ ] **Step 6: Verify.** Run `npx tsx --tsconfig src/server/pdf/tsconfig.tsx.json --env-file=.env.local scripts/render-sample-pdf.ts`.
  - Expected: `pages` equals `expected` (3–5 for the fixture), `links=` ≥ 1 + rail + inner stories + takeaway links, `overflow=[]`, `ms` < 5000 (the second run, with a warm Chrome cache), `bytes` < 5000000.
  - If the `pages` regex reads 0, the PDF uses object streams. Then count the screenshots instead and note it in the handoff.
- [ ] **Step 7: Visual check against Morrow.** Open the PNGs with the Read tool. Check that:
  - page 1 has the blackletter "The Morrow" at about 60 px, the ears "Edition No. N" / "Prepared for {name}", the double rule, the dateline strip with "Page 1 of N", the 5-column grid (lead 1–3 with a drop cap; "Three things to know", rail stories and "Inside" in 4–5), the heavy rule and the teaser row;
  - inner pages have the `masthead-sm` running head, one section, column rules and a pull quote;
  - the last page has "Beyond your usual", "In brief", "Why these stories" (blue after bars) and "Three things you learned", and no streak;
  - every story ends with its source and a QR or short link; every page has the footer;
  - the paper is warm newsprint with near-black ink, red only on kickers, blue only on learned items; square corners; no tofu boxes; no text clipped at a page bottom.

  Open `public/demo/sample.pdf` in Chrome and click one headline: it goes to `/r/{id}?src=print&e=…`. Fix the CSS and re-run until all of these hold.
- [ ] **Step 8:** Run `npx vitest run src/server/pdf && npm run typecheck`. Expected: PASS.
- [ ] **Step 9:** Commit `feat(pdf): Puppeteer render with overflow guard and committed sample PDF`, including `public/demo/sample.pdf` and the PNGs, then push. **Slice A done:** tell the integrator the PR is ready for the Checkpoint A (14:30) merge.

### Task 6: Print route with the window.print() fallback

**Files:**
- Create: `src/app/paper/[date]/print/page.tsx`, `src/components/print/PrintButton.tsx`, `docs/handoff/screens/L6-print-{390,1280}.png`

**Interfaces:**
- Consumes:
  - `getSessionUser()` from `@/server/auth/session`, `getProfile(userId)` from `@/server/profile`
  - `getEdition(userId, date)` from `@/server/edition`
  - `loadPrintExtras` (Task 7). Until Task 7 lands, use `fixtureExtras()`.
  - `preparePrintModel`, `PrintEdition`, `FIXTURE_EDITION`, `fixtureExtras`; `Button` from `@/components/morrow`
- Produces:
  - the page `/paper/[date]/print`, a Server Component with `export const dynamic = 'force-dynamic'`; it uses the app's global Morrow CSS and L0's fonts, so it does not inline `morrowCss` / `fontFaceCss`
  - `PrintButton(): JSX.Element` (`'use client'`): `<div className="screen-only"><Button variant="primary" icon="download" onClick={() => window.print()}>Print / Save as PDF</Button></div>` (Morrow `md` is 44 px tall)

- [ ] **Step 1: Implement the page.**
  - Read `const { date } = await params`, and call `notFound()` unless the date matches `/^\d{4}-\d{2}-\d{2}$/`.
  - When `?fixture=1` and (`DEMO_MODE === '1'` or `NODE_ENV !== 'production'`), use `FIXTURE_EDITION` + `fixtureExtras()`.
  - Otherwise, per §9.7 (pages vs routes): no session user, or `getProfile(userId)` is `null` → `redirect('/start')`.
  - Then `edition = await getEdition(userId, date)`; `null` → `notFound()`.
  - Render `<div data-theme="morning" lang="en"><PrintButton/><PrintEdition model={await preparePrintModel(edition, extras)}/></div>`.
- [ ] **Step 2: Real-browser check.**
  - Start `npx next dev -p 3006`.
  - Run `npx playwright screenshot --viewport-size=390,844 --full-page "http://localhost:3006/paper/2026-10-17/print?fixture=1" docs/handoff/screens/L6-print-390.png`, and the same with `1280,900` → `L6-print-1280.png`. Use the fixture's own date if it differs.
  - Expected: the paper sheets with the button on top, no horizontal scroll at 390 (the zoom rule), and readable at 1280. (At 390 the Morrow masthead's own 640 px rule may stack the ears inside the zoomed sheet; that is screen-only and acceptable.)
  - Then open the URL in Chrome, press Ctrl+P, and confirm the preview shows the A4 pages without the button.
- [ ] **Step 3:** Run `npm run typecheck && npm run lint`. Expected: exit 0.
- [ ] **Step 4:** Commit `feat(print): /paper/[date]/print route with Print / Save as PDF fallback`, then push.

### Task 7: Storage cache, extras loader and the §9.3 functions

**Files:**
- Create: `src/server/pdf/storage.ts`, `src/server/pdf/extras.ts`, `src/server/pdf/hash.ts`
- Modify: `src/server/pdf/index.ts` (replace the L0 stub bodies, keeping the signatures); `src/app/paper/[date]/print/page.tsx` (real editions use `loadPrintExtras(edition, await requestNow())` instead of `fixtureExtras()`)
- Test: `src/server/pdf/storage.test.ts`, `src/server/pdf/extras.test.ts`

**Interfaces:**
- Consumes:
  - `createSupabaseAdminClient()` from `@/server/db/admin`
  - `getProfile(userId)` from `@/server/profile` (city, displayName)
  - `getLearningView(userId, sinceDays, now)` from `@/server/learn` (movers)
  - `requestNow()` from `@/server/time`
  - `APP_URL` (Task 1), `renderEditionPdf`
- Produces, exactly per §9.3:
  - `getEditionPdfUrl(editionId: string): Promise<string | null>`
  - `renderAndStoreEditionPdf(edition: Edition): Promise<string>`, which returns the storage path
- Produces, local:
  - `PAPERS_BUCKET = 'papers'`, `SIGNED_URL_TTL_S = 3600`, `PRINT_VERSION = 'print-v2-morrow'`
  - `editionPdfHash(edition: Edition): string`: the first 12 hex of sha256 over `PRINT_VERSION|id|createdAt|items.map(i => i.article.id + ':' + i.tier)`
  - `pdfObjectPath(edition: Edition): string`, which returns `${userId}/${date}-${hash}.pdf` (no `papers/` prefix; this exact string goes into `editions.pdf_path`)
  - `ensurePapersBucket(admin): Promise<void>`, a safety net only (the migration creates the bucket): memoized per process, `getBucket('papers')`, then `createBucket('papers', { public: false })` on a miss
  - `loadPrintExtras(edition: Edition, now: Date): Promise<PrintExtras>`. It calls `getProfile(edition.userId)` (city and displayName; defaults `'Islamabad'` and `null` when null) and `getLearningView(userId, 7, now)` (`movers.slice(0, 5)`) in parallel. A failure is replaced with a neutral value (movers `[]`). `appUrl = APP_URL`. It never reads the streak.

- [ ] **Step 1: Write the failing tests** (mock the admin client with `vi.fn` chains):
  - `editionPdfHash` is stable across calls, has 12 hex characters, and changes when one item's tier changes;
  - `pdfObjectPath(FIXTURE_EDITION)` matches `/^[^/]+\/\d{4}-\d{2}-\d{2}-[0-9a-f]{12}\.pdf$/`;
  - `getEditionPdfUrl`:
    - with a `pdf_path` null row → `null`, and `createSignedUrl` is not called;
    - with a path → it calls `createSignedUrl(path, 3600)` and returns `data.signedUrl`;
    - with a signing error → `null`;
  - `renderAndStoreEditionPdf`, with `renderEditionPdf` mocked:
    - it calls `upload(path, bytes, { contentType: 'application/pdf', upsert: true })`;
    - then `update({ pdf_path: path }).eq('id', edition.id)`;
    - and returns the path;
    - when upload errors, it throws;
  - `ensurePapersBucket`: when `getBucket` succeeds, `createBucket` is not called; on a miss it is called once with `{ public: false }`;
  - `loadPrintExtras` (in `extras.test.ts`, `vi.mock` `@/server/profile` and `@/server/learn`): it passes `(userId, 7, now)` to `getLearningView`; a 7-mover view yields 5 movers; `getProfile → null` gives `'Islamabad'` and `displayName: null`; `getLearningView` throwing gives `movers: []`; the result has no `streak` key.
- [ ] **Step 2:** Run `npx vitest run src/server/pdf/storage.test.ts src/server/pdf/extras.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. `renderAndStoreEditionPdf` = `ensurePapersBucket` → `loadPrintExtras(edition, await requestNow())` → `renderEditionPdf` → upload → update `pdf_path`. Its `now` comes from `requestNow()` because it is only called from requests and the job, and §12 allows it there. Wrap that call in try/catch with a `new Date()` fallback, because `job:editions` runs under `tsx` with no request scope for the `subah_now` cookie.
- [ ] **Step 4:** Run it again, then `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Live check.** Run `npx tsx --tsconfig src/server/pdf/tsconfig.tsx.json --env-file=.env.local -e "…"`. The inline snippet calls `ensurePapersBucket` (expect no `createBucket`, since the migration made `papers`), uploads `public/demo/sample.pdf` to `test/2026-10-17-sample.pdf`, signs it and prints the URL. Expected: `curl -sI <url>` returns 200 with `content-type: application/pdf`. Delete the test object afterwards.
- [ ] **Step 6:** Commit `feat(pdf): storage cache, signed URLs and print extras`, then push.

### Task 8: GET /api/editions/[date]/pdf

**Files:**
- Create: `src/app/api/editions/[date]/pdf/route.ts`
- Test: `src/app/api/editions/[date]/pdf/route.test.ts`

**Interfaces:**
- Consumes: `requireUser()` (throws a 401 `Response`), `getEdition`, `getEditionPdfUrl`, `renderAndStoreEditionPdf`, `canRenderHere` (Task 5).
- Produces:
  - `GET(req: Request, { params }: { params: Promise<{ date: string }> }): Promise<Response>`
  - `export const maxDuration = 60; export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';`

Flow:
1. A bad date → 400 `{ error: 'bad_date' }`.
2. `requireUser`; when it throws a `Response`, return that response.
3. `getEdition(userId, date)`; when it is null → 404 `{ error: 'no_edition' }`.
4. `getEditionPdfUrl(id)` → a 302 `Response.redirect(url, 302)` on a hit (the normal path: pre-rendered by the job or Task 10's script).
5. On a miss with `canRenderHere()` false (Vercel): 503 `{ fallback: '/paper/{date}/print' }` immediately, with no render attempt.
6. On a miss with `canRenderHere()` true (local/Actions): `renderAndStoreEditionPdf`, then `getEditionPdfUrl`, then 302.
7. If any step in 6 throws (or the signed URL comes back null): `console.error('[pdf] render failed', { date, userId, err })` and a 503 `{ fallback: '/paper/{date}/print' }`.

- [ ] **Step 1: Write the failing route tests** (`vi.mock` the four modules plus `canRenderHere`):
  - cached → status 302 with `location` equal to the signed URL, and render is not called (also with `canRenderHere` false);
  - a miss with `canRenderHere` true → render is called once, then 302;
  - a miss with `canRenderHere` false → 503 `{ fallback: '/paper/2026-10-17/print' }`, and render is not called;
  - render throws → 503 with JSON `{ fallback: '/paper/2026-10-17/print' }`, which passes `PdfFallbackSchema.parse`;
  - no session → 401;
  - `2026-13-99` → 400;
  - no edition → 404, and `getEditionPdfUrl` is not called.
- [ ] **Step 2:** Run `npx vitest run "src/app/api/editions/[date]/pdf"`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run it again. Expected: PASS.
- [ ] **Step 5: Real check** (dev on 3006, signed in through `/demo`, or the demo persona cookie from L5 once merged):
  - `curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" -b cookies.txt http://localhost:3006/api/editions/<date>/pdf` → `302 https://…supabase.co/storage/v1/object/sign/papers/…`;
  - a second call returns 302 quickly (< 500 ms);
  - without cookies → `401`.
  - The on-miss render runs `PrintEdition` inside the route handler. If Next resolves the `'use client'` Morrow components as client references there and the render throws, the route already returns 503 → print (flow step 7); record it in the handoff, since the job and `render-pdfs.ts` (plain `tsx`) are the normal render path.
  - If no real edition exists yet (L3 not merged), record "route verified by unit tests only" in the handoff.
- [ ] **Step 6:** Commit `feat(api): PDF download route serving stored PDFs, local render on miss, print fallback`, then push.

### Task 9: PdfButton

**Files:**
- Modify: `src/components/pdf/PdfButton.tsx` (replace the L0 stub, keeping its export name; props are the §9.6 binding ones even if the stub took only `{ date }`)
- Create: `src/components/pdf/pdf-action.ts`
- Test: `src/components/pdf/pdf-action.test.ts`

**Interfaces:**
- Consumes: `useSignals(editionId)` from `@/hooks/useSignals` (`track({ type: 'pdf_download', editionId })`, per §9.7 the event carries only `editionId`); `PdfFallbackSchema` from `@/contracts/api`; `Button` from `@/components/morrow`.
- Produces:
  - `PdfButton({ date, editionId }: { date: string; editionId: string | null }): JSX.Element`, a thin wrapper over `<Button variant="accent" icon="download">Download PDF</Button>` (the screen's one accent button)
  - `resolvePdfAction(res: { ok: boolean; status: number; contentType: string | null; body?: unknown }, date: string): { kind: 'download' } | { kind: 'fallback'; href: string }`. The fallback href comes from `PdfFallbackSchema.safeParse(body)`, else `/paper/{date}/print`.

Behaviour:
- Click → `track` (only when `editionId` is non-null) → state `generating`: the label becomes "Preparing your PDF…", with `aria-busy` and `disabled` (no spinner or printing animation; Morrow's 150 ms colour transition only).
- `fetch('/api/editions/{date}/pdf')` follows the 302. If the action is `download`, take the blob, build an object URL and click an `<a download="morrow-{date}.pdf">`.
- If the action is `fallback`, call `window.open(href, '_blank')`.
- If the network throws, fall back to `/paper/{date}/print`.
- Return to `idle` ("Download PDF").

- [ ] **Step 1: Write the failing tests.**
  - `{ ok: true, status: 200, contentType: 'application/pdf' }` → `download`;
  - `{ ok: false, status: 503, body: { fallback: '/paper/2026-10-17/print' } }` → `fallback` with that href;
  - `{ ok: true, status: 200, contentType: 'text/html' }` → `fallback` with `/paper/2026-10-17/print`;
  - 401 → `fallback` with `/paper/2026-10-17/print`.
- [ ] **Step 2:** Run `npx vitest run src/components/pdf`. Expected: FAIL.
- [ ] **Step 3:** Implement `pdf-action.ts` and `PdfButton.tsx` (`'use client'`).
- [ ] **Step 4:** Run it again, then `npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(pdf): PdfButton on Morrow Button with pdf_download signal and print fallback`, then push. **Slice B done:** tell the integrator the PR is ready for the Checkpoint B (15:30) merge.

### Task 10: Pre-render the demo persona's PDFs (7 past editions + today) and the Loom pair

**Files:**
- Create: `src/server/pdf/batch.ts`, `scripts/render-pdfs.ts`, `public/demo/persona-first.pdf`, `public/demo/persona-today.pdf` (generated)
- Test: `src/server/pdf/batch.test.ts`

**Interfaces:**
- Consumes: `createSupabaseAdminClient()`; `getEdition(userId, date)` from `@/server/edition`; `renderAndStoreEditionPdf` (Task 7); `getBrowser` (Task 5). The persona and its editions come from L3's `scripts/seed-demo-persona.ts` (due at Checkpoint B).
- Produces:
  - `parseRenderArgs(argv: string[]): { userId?: string; allMissing: boolean; force: boolean; exportDemo: boolean }`. It needs exactly one of `--user <id>` or `--all-missing`, else it throws a usage error. `--force` re-renders editions that already have a `pdf_path`; `--export-demo` (with `--user` only) writes the Loom pair.
  - `renderMissingPdfs(opts): Promise<{ rendered: string[]; skipped: number; failed: string[]; ms: number }>`. It selects `editions` (`user_id, edition_date, pdf_path`), filtered by `user_id` when `userId` is set and by `pdf_path is null` unless `force`, ordered by `edition_date` asc. For each row it calls `getEdition` and then `renderAndStoreEditionPdf`, **sequentially**, reusing one browser. A per-edition error goes into `failed` (as `{date}`) and never stops the batch.
  - `scripts/render-pdfs.ts`: parse args → `renderMissingPdfs` → with `--export-demo`, download the earliest and latest stored PDFs of that user (`storage.from('papers').download(path)`) to `public/demo/persona-first.pdf` and `public/demo/persona-today.pdf` → print `rendered=N skipped=N failed=[…] ms=M` → close the browser and exit 1 if `failed` is non-empty.

- [ ] **Step 1: Write the failing tests** (mock the admin client, `@/server/edition` and the Task 7 module that defines `renderAndStoreEditionPdf`):
  - `parseRenderArgs(['--user','u1'])` → `{ userId: 'u1', allMissing: false, force: false, exportDemo: false }`; `['--all-missing']` → `allMissing: true`; `[]` and `['--user','u1','--all-missing']` throw;
  - `renderMissingPdfs({ userId: 'u1' })` over 8 rows with `pdf_path` null: render is called 8 times in date order, and the query applies `.is('pdf_path', null)` and `.eq('user_id', 'u1')`;
  - one row whose render throws → `failed` has that date, and the other 7 are still in `rendered`;
  - `force: true` → no `pdf_path` filter.
- [ ] **Step 2:** Run `npx vitest run src/server/pdf/batch.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `batch.ts` and `scripts/render-pdfs.ts`.
- [ ] **Step 4:** Run it again, then `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Coordinate with L3.** Read `docs/handoff/L3.md` (on `main` after Checkpoint B) for the demo persona's user id and whether `scripts/seed-demo-persona.ts` already calls `renderAndStoreEditionPdf`. Either way this script is the idempotent catch-up. If the persona is not seeded by ~15:45, write that in the handoff, keep `public/demo/sample.pdf` as the Loom fallback, and hand the command below to the integrator.
- [ ] **Step 6: Render.** Set `NEXT_PUBLIC_APP_URL` to the deployed URL (it is baked into the QRs), then run `npx tsx --tsconfig src/server/pdf/tsconfig.tsx.json --env-file=.env.local scripts/render-pdfs.ts --user <personaId> --export-demo`.
  - Expected: `rendered=8 failed=[]` (7 past + today), or `skipped=` covers those L3's seed already rendered (a seed render with the old `PRINT_VERSION` is re-rendered with `--force`).
  - Re-run it: expected `rendered=0`.
  - Then run `--all-missing` once, to cover any other onboarded profile. Expected: `failed=[]`.
- [ ] **Step 7: Check the Loom pair.** Open `public/demo/persona-first.pdf` and `persona-today.pdf` side by side in Chrome. Both carry the same nameplate "The Morrow" and "Prepared for {name}", but different edition numbers, a different lead and sections, and different "Why these stories" movers (the side-by-side Loom beat). Both are < 5 MB.
- [ ] **Step 8: Checkpoint C check (deployed URL, signed in through `/demo`):** the today PDF button returns 302 to `…/storage/v1/object/sign/papers/…`; an archive day returns 302 too; a date with an edition but no stored PDF returns 503 → the print route opens.
- [ ] **Step 9:** Commit `feat(pdf): pre-render demo persona PDFs and commit the Loom pair`, including the two PDFs, then push. **Slice C done** before 16:30.

---

## Acceptance checks

| Command | Expected |
|---|---|
| `npm run typecheck && npm run lint && npm test && npm run build` | All exit 0. The pdf, print and route suites pass (≈ 45 tests). |
| `npx tsx --tsconfig src/server/pdf/tsconfig.tsx.json --env-file=.env.local scripts/render-sample-pdf.ts` | `pages` = `expected` (3–5), `links` ≥ printed stories, `overflow=[] attempts<=2 ms<5000` |
| `npx tsx --tsconfig src/server/pdf/tsconfig.tsx.json --env-file=.env.local scripts/render-pdfs.ts --user <personaId>` (second run) | `rendered=0 failed=[]`: all 8 persona editions have a stored PDF |
| `git ls-files public/demo docs/handoff/screens/L6-*` | `sample.pdf`, `persona-first.pdf`, `persona-today.pdf`, one PNG per page, 2 print-route PNGs |
| `npx vitest run src/server/pdf/assets.test.ts -t "decodes"` | The QR segments reconstruct `https://subah.app/r/a1?src=print&e=e9`. |
| `npx vitest run src/components/print -t "Morrow"` | No hex colour, font family, radius or shadow in `PRINT_CSS`; no streak, button or emoji in the markup. |
| Open `public/demo/sample.pdf` in Chrome | A4 pages in the Morning theme: blackletter "The Morrow", "Prepared for {name}", 5-column front page, one section per inner page, footer on every page. Headlines go to `/r/{id}?src=print&e=…`; scanning one QR with a phone opens the same URL. |
| `curl -s -o /dev/null -w "%{http_code}" http://localhost:3006/api/editions/2026-10-17/pdf` (no cookie) | `401` |
| Deployed URL, demo persona, a date with no stored PDF | 503 → the print route (no Chromium on Vercel) |
| `http://localhost:3006/paper/<fixture-date>/print?fixture=1`, at 390 and 1280 | The sheets and a Morrow "Print / Save as PDF" button. The print preview shows the A4 pages and hides the button. |

## Handoff

Write `docs/handoff/L6.md` with:
1. **Done:** the list of Tasks 0–10 with their commit hashes, the checkpoint each slice merged at, and which stretch items (S1, S2) were done.
2. **Exports:**
   - `getEditionPdfUrl` and `renderAndStoreEditionPdf` (from `@/server/pdf`);
   - `PdfButton({ date, editionId })` (from `@/components/pdf/PdfButton`), a Morrow accent Button;
   - the route `GET /api/editions/[date]/pdf`;
   - the page `/paper/[date]/print` (`?fixture=1` works in dev or with `DEMO_MODE=1`);
   - `scripts/render-pdfs.ts --user <id> | --all-missing [--force] [--export-demo]`;
   - `public/demo/sample.pdf`, `public/demo/persona-first.pdf`, `public/demo/persona-today.pdf`.
3. **Spec checks:** the Task 0 Step 4 results (`serverExternalPackages`, the L0 `PdfButton` stub props, Morrow theme scoping and file names). No contract requests are open.
4. **For L3 (`job:editions`, `seed-demo-persona`):** call `renderAndStoreEditionPdf(edition)` sequentially after each build, reusing one browser. It returns a path and sets `editions.pdf_path`. Close the browser at job end with `(await getBrowser()).close()`. If the seed script skips PDFs, run `scripts/render-pdfs.ts --user <personaId>` after it.
5. **For L4 and L7:** render `<PdfButton date={edition.date} editionId={edition.id}/>` once per screen (it is that screen's one accent button, per Morrow), e.g. in the end-of-paper block. Archive `EditionCard`s pass `pdfHref="/api/editions/{date}/pdf"`.
6. **Env:** `NEXT_PUBLIC_APP_URL` (it is baked into the QR codes, so re-run the sample script and `render-pdfs.ts --force --export-demo` after the deploy URL is known), `SUPABASE_SECRET_KEY`. The bucket `papers` comes from L0's migration; `ensurePapersBucket` only recreates it if it is missing. `pdf_path` holds `{userId}/{date}-{hash}.pdf` without the bucket prefix.
7. **Verify:** the acceptance commands above, with their measured `ms` / `bytes` / `links` / `pages`.
8. **Known risks:**
   - on Vercel, a PDF that was not pre-rendered goes to the print route (on-demand Chromium is stretch S1);
   - a fresh user onboarded after the 06:00 job gets the print route on Vercel until `job:editions` or `render-pdfs.ts --all-missing` runs;
   - QRs point at whatever `NEXT_PUBLIC_APP_URL` was at render time;
   - the PDF reads `src/styles/morrow/*.css` and `src/app/fonts/*.woff2` from `process.cwd()`, so renders must run from the repo root (true for the job, the scripts and `next dev`).

## Cut line (PLAN.md §5, item 2)

If L6 is late:
- Ship a **2-page paper** (the front page plus the last page). Set `MAX_INNER_PAGES = 0` so all core stories flow to the briefs; the teasers then point to page 2.
- If the persona is late, skip `--export-demo` and use `public/demo/sample.pdf` for the Loom; the route still serves whatever `job:editions` stored.
- Never cut: the PDF download (stored or `public/demo/sample.pdf`), the print route, and the Morrow nameplate and tokens.

---

## Cut items (stretch, only if green)

Start these only after Checkpoint C is green, and stop at the 18:00 freeze.

### Task S1 (stretch): Vercel on-demand Chromium

Moved out of core by PLAN.md §5a. It needs `puppeteer-core@25.11.0` + `@sparticuz/chromium@153.0.0` in `package.json` and both in `serverExternalPackages`; ask the integrator, since L6 does not edit either file. The fonts and Morrow CSS must also be traced into the function (`outputFileTracingIncludes` for `src/app/fonts/**` and `src/styles/morrow/**`), which is the integrator's `next.config.ts` edit.

**Files:**
- Modify: `src/server/pdf/browser.ts`, `src/server/pdf/browser.test.ts`

- [ ] **Step 1:** Add `browserMode(env?): 'serverless' | 'local' | 'none'`: `'local'` without `VERCEL`, `'serverless'` when `VERCEL` and `PDF_ON_DEMAND === '1'`, else `'none'`. `canRenderHere` becomes `browserMode() !== 'none'`. Test all three cases.
- [ ] **Step 2:** Serverless branch in `getBrowser`: dynamic-import `@sparticuz/chromium` and `puppeteer-core`, then launch with `args: await puppeteer.defaultArgs({ args: chromium.args, headless: 'shell' })`, `executablePath: await chromium.executablePath()` and `headless: 'shell'`.
- [ ] **Step 3:** Deploy with `PDF_ON_DEMAND=1`. `curl` a date with no stored PDF: expect 302 within `maxDuration = 60` (record the cold-start ms). If it fails, unset `PDF_ON_DEMAND` (the route goes back to 503 → print). Commit `feat(pdf): on-demand serverless Chromium on Vercel (stretch)`, then push.

### Task S2 (stretch): Urdu RTL edition

**Files:**
- Modify: `src/components/print/*`, `src/server/pdf/styles.ts`

- [ ] **Step 1:** Add an Urdu variant for `edition.presentation.lang === 'ur'`:
  - `<div class="print-root" dir="rtl" lang="ur">`;
  - Noto Nastaliq Urdu 400 (from `@fontsource/noto-nastaliq-urdu`, installed by L0) added to `fontFaceCss` for Urdu editions only;
  - `line-height: 2` on Urdu body text;
  - logical properties only;
  - `article.ur?.headline ?? headline` and `ur?.summaryStd ?? summary.std`;
  - the nameplate stays "The Morrow" in UnifrakturMaguntia (it is the wordmark).

  Test: the `dir="rtl"` attribute is present, and the Urdu headline renders.
- [ ] **Step 2:** Render an Urdu fixture to `public/demo/sample-ur.pdf` and check its screenshot for correct shaping (no disconnected letters). Commit `feat(print): Urdu RTL edition (stretch)`, then push.
