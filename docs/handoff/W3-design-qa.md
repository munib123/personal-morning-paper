# W3-design-qa: handoff

Status: ready for review (branch `lane/W3-design-qa`; audited on `58caa01`, then merged with main at `fd110e5`). Not merged into main.

Lane: a design-system and QA pass over what a judge sees in the Loom, at 390 px and 1280 px, in the
Morning and Night themes. Files touched: `src/app/not-found.tsx` (new), `src/components/shell/TopBar.tsx`,
`src/components/paper/PaperMasthead.tsx`, `src/components/paper/FrontPage.tsx`,
`src/components/recall/MorningRecallCard.tsx`, `src/components/learning/{SignalTimeline,MoversList,InterestBars}.tsx`,
one test (`src/components/paper/FrontPage.test.tsx`), this file and `docs/handoff/screens/W3-*.png`.
Nothing under `src/components/morrow/**`, `src/contracts/**`, `src/server/**` or `supabase/**` was changed.

## How the audit ran

- Signed in through `/demo` (Ayesha, 8 editions), then a throwaway Playwright script (system Chrome)
  screenshotted `/`, `/start` (step 1, the Computer Science drill-down, step 3, step 4, the preview), `/today`
  (top, middle, end, scrolled), the story sheet (lead story, "Other angles" expanded on a 3-source story,
  the Listen bar expanded), Bytes, `/paper/2026-10-16`, `/archive`, `/me` (all three tabs and the
  fast-forward simulation), `/paper/2026-10-16/print` and two 404s, at 390×844 and 1280×800, with
  `colorScheme` light and dark (next-themes resolves those to Morning and Night).
- Each page was also checked in the browser for horizontal scroll (`scrollWidth > innerWidth`), elements
  past the right edge, tap targets under 44 px (40 px for chips), the blackletter on anything but
  "The Morrow", images without a fixed aspect ratio, and console errors.
- Code scan: no hard-coded colours, no non-token Tailwind colours/fonts/radii/shadows, no emoji outside
  `src/components/morrow/**` (the only hex values are the two `themeColor` metas in `src/app/layout.tsx`,
  which cannot read CSS variables).

## Findings

| Page | Viewport · theme | Problem | Severity | Fix |
|---|---|---|---|---|
| Every reader page (`/today`, `/paper/*`, `/archive`, `/me`) | 390 and 360 · both | Horizontal scroll: the TopBar's streak chip and theme toggle ended at x=391 (x=365 at 360 px) | blocker | **Fixed** (`166cf0a`): tighter TopBar gaps below `md`; 0 px overflow at 360 and 390 |
| Any unknown URL, `notFound()` from a page | both · both | Next's default white "404 \| This page could not be found.": no Morrow, no way back, ignores Night | visible | **Fixed** (`1df6836`): `src/app/not-found.tsx` with the masthead, "This page is not in any edition", Today's paper / Past editions |
| `/today` scrolled, Bytes | 390 and 1280 · both | Two nameplates: Morrow's compact Masthead repeated "The Morrow" right under the TopBar; in Bytes at 390 it squeezed the view toggle onto two lines ("Front / page") | visible | **Fixed** (`06eec33`, `7bf304d`): the scrolled bar is the date, the view toggle and the progress; on a phone the Front page keeps just the progress |
| `/today` full masthead | both · both | The view toggle and "How this paper was made" inherited the ear's uppercase dateline style (FRONT PAGE / BYTES / HOW THIS PAPER WAS MADE) | visible | **Fixed** (`06eec33`): `normal-case tracking-normal` on the actions wrapper |
| `/me` Learned, "What you did" | both · both | Internal event names in the UI: "→ dwell", "→ impression", "→ audio_play", "→ open" (the server falls back to the signal type when nothing moved) | visible | **Fixed** (`b9f3556`): the effect shows only when a signal moved something |
| `/me` Learned "What moved", Interests bars | both · both | "+ +28 pts": a plus icon beside a label that already carries its sign | polish | **Fixed** (`b9f3556`, `92f741b`): icon dropped; the signed label stays the non-colour cue |
| `/today` above the fold | 1280 · both | Morning recall in the 1fr rail made the rail ~600 px taller than the lead: a blank block under the lead | visible | **Fixed** (`3ee7680`): recall sits under the lead with its three answers side by side from `lg`; phone order unchanged |
| `/today`, `/paper/*`, "Three things to know" | both · both | BBC Sport items carry scraped site navigation as the summary ("Home News Sport Weather iPlayer Sounds Bitesize CBeebies…") | visible (content) | **Left**: ingest/enrich (server). `57472e3` filters consent walls; nav boilerplate needs the same filter |
| Masthead dateline strip | 390 · both | Wraps with a leading "·" on the second line ("· 20 STORIES · 15 MIN READ"): the separator is `span + span::before` | polish | **Left**: Morrow `bundle.css` (binding, not edited) |
| Story cards, archive cards | both · both | Morrow `Button size="sm"` and FeedbackBar buttons are 32 px tall (README asks 44 px for buttons); the WhyChip trigger is 18 px and the faithfulness line 24 px tall | visible (a11y) | **Left**: the 32 px sizes are Morrow components; WhyChip/FaithfulnessBadge could take `min-h-11` but that changes the card rhythm |
| `/me` Learned, fast-forward chart | both · both | Learning, Popularity and Onboarding-only all end at 0–5 % precision@20 on a 0–100 % axis, so the chart does not show learning winning | visible (data) | **Left / re-check**: main's #59 "the paper measurably learns (simulator + reward fix)" landed after this audit and targets exactly this; not re-screenshotted here |
| Listen bar, expanded | 390 · both | The current story's kicker renders italic (it sits inside the italic headline line) | polish | **Left** |
| Technical section | 1280 · both | DEV Community stories use dev.to's generated white OG cards as photos | polish (content) | **Left**: image choice (ingest) |
| All pages (dev only) | both · both | Console: "Encountered a script tag while rendering React component" (next-themes' inline theme script under React 19.3) | polish | **Left**: dev-only warning, harmless |

Checked and fine: Night theme contrast on the front page, sheet, archive, `/me` and the heatmap; the
blackletter appears only as "The Morrow"; no section colours or emoji; story images reserve their box
(no layout shift); onboarding at 390 has no overflow; the landing and onboarding pages have no small targets
other than the visually hidden Segmented radios (their labels are the 44 px targets).

## Test change

`src/components/paper/FrontPage.test.tsx` ("compact masthead on scroll") asserted the exact markup that was
the double nameplate (`.mw-masthead--compact`). It now finds the scrolled bar by its existing
`data-masthead="compact"` hook (the hook the L4 e2e spec already uses) and still checks the progress bar.

## Screens (viewport-clipped, each under 400 KB)

`docs/handoff/screens/W3-landing-{390,1280}.png`, `W3-onboarding-preview-{390,1280}.png`,
`W3-today-{390,1280}.png`, `W3-story-sheet-{390,1280}.png`, `W3-me-{390,1280}.png`.
The 1280 onboarding preview is palette-compressed (sharp, quality 80) to stay under 400 KB.

## Notes for whoever runs the app from a worktree

- `npx next dev --webpack` renders **without Tailwind**: the repo has no PostCSS config, Tailwind is wired only
  through the Turbopack CSS loader in `next.config.ts`. Use Turbopack.
- With a `node_modules` junction, Turbopack needs `turbopack.root` pointed at the main checkout (local only,
  never committed). That root makes Turbopack watch every other worktree and `node_modules/.vitest-cache`, so a
  test run elsewhere triggers recompiles and "The server could not finish this Suspense boundary" in the
  browser. A fresh dev server with nothing else writing shows no such error.

## Gates

See the PR description for the final run: `npm run typecheck`, `npm run lint` (the one pre-existing `<img>`
warning in `src/components/morrow/index.tsx`), `npx vitest run`.
