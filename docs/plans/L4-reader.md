# L4 Reader UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render today's (and past) personal edition as a Morrow front page and as a Bytes stack. Every story carries a WhyTag with a score popover, a FeedbackBar (More/Less/Save/Skip) and a source-faithfulness line. The reader also gets a story sheet, skip/undo with a quiet fade-in of the reserve story, read progress, an end-of-paper block with "How this paper was made", signal tracking and the `/r` outbound redirect.

**Architecture:** Server components (`/today`, `/paper/[date]`) authenticate with `getSessionUser()` + `getProfile()` (`redirect('/start')` when either is null). They load an `Edition` through L3's `buildEdition`/`getEdition` and hand it to one client root, `EditionReader`. It owns a pure reducer (items, reserve, skipped, read, saved, feedback), persisted per `editionId` in `localStorage`, and the upgraded `useSignals` queue, which publishes each flush's streak on L7's live channel. All layout and state logic lives in pure, unit-tested modules. **Components only compose the Morrow library (`@/components/morrow`)** and add the thin §9.6 wrappers (`WhyChip`, `StorySheet`). `/r/[articleId]` is a route handler that hands the outbound signal to L3's `processSignals` (inside `after()`) and 302s.

**Tech Stack:** Next.js 16.4.2 (App Router, async `params`), React 19.3, Tailwind 4.3 with the Morrow token names (ARCHITECTURE §3a), Morrow components `@/components/morrow` (L0), shadcn/ui (Sheet, Popover), `motion` 14.3.0 (`motion/react`, opacity fades only), `sonner` 2.0.8, Vitest 5.0.5 (+ jsdom), @playwright/test 1.64.1.

**Budget:** 3.25 h of core work for Tasks 0–12 (195 min); the stretch section at the end only if green. Morrow supplies the masthead, story cards, section headers, feedback bar, takeaway box and progress bar, so L4 builds no bespoke visuals. Demo-critical order: front page (Tasks 2–5) → Read original (6) → signals (7) → feedback and skip (8) → sheet + why bars (9) → end of paper + How this paper was made (10) → Bytes (11, last core build task, has its own cut line) → verification (12).

**Merge points (PLAN.md §3):** A 14:30 → Tasks 0–5 on fixtures (`/today/preview`); if Task 5 is not green, merge Tasks 0–4 and land Task 5 in round B. B 15:30 → Tasks 6–8 and `/today` on a real edition. C 16:30 → end-to-end green through Task 10; Bytes (Task 11) not green by then ⇒ apply the cut line.

**Spec:** `design/project/README.md` (principles, "Layout: the web paper", Learning, Motion, Voice and copy), `design/project/components/index.d.ts` (the 15 Morrow component APIs), `design/project/tokens.json`, `docs/ARCHITECTURE.md` (§3a Morrow adoption, binding for visuals; §3 routes and read rules; §9 contracts, esp. §9.5 `BRAND`, §9.6 stub props + live streak channel and §9.7 binding decisions; §10.3 enrichment guardrails (badge tooltip); §10.4 layout/reasons/`RankParams`; §10.7 read rules), `docs/PLAN.md` (§3 rolling integration and checkpoints, §4 protocol, §5a scope decisions, §5 cut line).

**APIs verified via Context7 (2026-10-17):** Next.js canary docs (`/vercel/next.js`): `params: Promise<…>`, `await cookies()/headers()`, `redirect()`/`notFound()` throw, `NextResponse.redirect(url, status)`, `after()`. Motion (`/websites/motion_dev`, npm `motion@14.3.0`): `import { motion, AnimatePresence, MotionConfig } from 'motion/react'`, `AnimatePresence mode="wait"` with `initial/animate/exit` opacity, `<MotionConfig reducedMotion="user">`. Sonner (`/websites/sonner_emilkowal_ski`, npm 2.0.8): `toast(msg, { duration, action: { label, onClick }, onAutoClose, onDismiss })`, `toast.custom(jsx)`. shadcn Sheet: `<Sheet open onOpenChange><SheetContent side="bottom|right"><SheetTitle/>`. Playwright `page.screenshot({ path, fullPage })`; `@axe-core/playwright@4.14.0` `new AxeBuilder({ page }).withTags([...]).analyze()` (only if installed). Morrow APIs read from `design/project/components/index.d.ts`. `StoryCard` wraps `why` in its own `WhyTag`, renders the headline as `<a href target="_blank" rel="noopener noreferrer" onClick={onOpen}>`, shows `Read` + check when `read`, and renders `<img>` only when `imageUrl` is set (lead/standard). `FeedbackBar.onChange` toggles a value back to `null`. `Masthead` takes `variant: 'full' | 'compact'` plus `actions`.

## Global Constraints

- Owned paths only: `src/app/(reader)/today/**`, `src/app/(reader)/paper/[date]/**`, `src/components/paper/**`, `src/components/story/**`, `src/hooks/useSignals.ts` (+ its colocated test), `src/app/r/[articleId]/route.ts` (+ colocated test), `e2e/L4-*.spec.ts`, `docs/handoff/L4.md`, `docs/handoff/screens/L4-*.png`. No `package.json` edits. `src/components/morrow/**` is L0's: never edit it, and a needed change is a contract-commit request in the handoff.
- Import contracts from `@/contracts/...` (zod schemas from `@/contracts/api` by their §9.1 names, e.g. `EventsResultSchema`; fixtures `FIXTURE_EDITION`, `FIXTURE_STREAK`, `FIXTURE_PROFILE` from `@/contracts/fixtures`); never redefine a §9 type. `useSignals` keeps the §9.4 signature (incl. the optional `startDwell` `mode`).
- Cross-lane components are mounted with exactly their §9.6 props: `StreakChip({ streak? })`, `PdfButton({ date, editionId })`, `MorningRecallCard({ questions, editionId })`, `DoneForToday({ edition, readIds, streak })`. L4 replaces its own stubs `WhyChip({ reasons, breakdown?, onAction? })` and `StorySheet({ item, editionId, open, onOpenChange })` keeping those props. Both are thin wrappers over Morrow (`WhyTag` + Popover; a Sheet reader view).
- Pages: `getSessionUser()` + `getProfile()` → `redirect('/start')` when either is null (never `requireUser()` in a page). Section display names come from `edition.sectionNames`. The nameplate is `BRAND.nameplate` (`'The Morrow'`, §9.5); the ear reads "Prepared for {first name}" from `profile.displayName` (the ear is omitted when the name is null).
- Client read/skip state per edition: `localStorage` key `subah_edition_{editionId}`, every access in try/catch; the page works without it.
- **Visuals follow Morrow** (ARCHITECTURE §3a, `design/project/README.md`):
  - Compose `Masthead`, `SectionHeader`, `StoryCard`, `WhyTag`, `FeedbackBar`, `TakeawayBox`, `PullQuote`, `ReadingProgress`, `Segmented`, `Button`, `Icon` from `@/components/morrow`. Never restyle them, and never wrap them in boxes, shadows or colours.
  - Utilities are only the Morrow Tailwind names: `bg-paper`, `bg-paper-raised`, `bg-paper-sunk`, `border-rule`, `border-rule-strong`, `text-ink`, `text-ink-soft`, `text-ink-muted`, `text-press`, `text-pen`, `bg-pen`, `bg-pen-soft`, `bg-highlight`, `font-news`, `font-ui`, `rounded-control`, `rounded-card`, `rounded-chip`, `shadow-floating`, and `max-w-(--page-max)` / `max-w-(--measure)`.
  - Type uses the classes `headline-xl|lg|md|sm`, `deck`, `body-text`, `body-sm`, `kicker`, `dateline`, `ui-label`, `ui-text`, `ui-button`, `ui-meta`.
  - Fonts (Newsreader, Libre Franklin, UnifrakturMaguntia) are self-hosted at `src/app/fonts` and loaded by L0. L4 loads none.
- Colour and shape:
  - `press` is the one brand accent. It appears only through Morrow (kickers) and the single accent button per screen (the PDF button at the end of the paper).
  - `pen` means learned/personalized only: WhyTag, pressed feedback, score bars, links, focus.
  - **No section colour-coding, no emoji.**
  - Square corners on paper content. Borders, not shadows; `shadow-floating` is used only on the sticky compact masthead, popovers and the sheet.
- Motion is quiet: 150 ms on colour/opacity, 300 ms on progress fills, **no slide-in, no layout fly, no parallax, no entrance animations, no confetti or printing animations**. Use `<MotionConfig reducedMotion="user">`.
- Forbidden leftovers: Fraunces, Bricolage, Playfair, `sec-*` tokens, `font-headline`/`font-body`, `text-accent`, flame or any emoji, `↗` typed in copy (use `Icon name="external"`), a fold divider, a progress ring.
- Copy follows README "Voice and copy": calm, "you" and "your paper", buttons are verbs, never "I" or "our AI", no exclamation marks, sentence case (kickers and datelines are uppercased by CSS, never typed in caps). Pinned strings:
  - masthead ears "Edition No. N" and "Prepared for {name}"; progress "N of 20 read";
  - TakeawayBox "Three things to know"; sections "Beyond your usual", "In brief", "Long read";
  - feedback note "Got it. More {topic} tomorrow." / "Got it. Less {topic} tomorrow.";
  - skip reasons "Not interested in {topic}" / "Already seen" / "Not today", plus an Undo toast for 5 s;
  - "Also covered by N outlets"; end of paper "That's your paper for today."; the button "Past editions".
- Read state: the headline link to the original was clicked (`onOpen`), OR the story was opened in the sheet, OR it was ≥ 8 s in view in Bytes (paused while the tab is hidden). A read story stays in place with `StoryCard read`.
- A11y: WCAG 2.2 AA. Morrow supplies the heading order (`h1` nameplate, `h2` sections, `h3` stories), the focus ring and the targets ≥ 44 px. L4 adds the `main`/`section aria-labelledby` landmarks, `aria-live="polite"` for skip/undo/feedback notes, and a button plus a key for every gesture.
- Images: `imageUrl: null` → pass `undefined` (Morrow renders a text-only card). A 403/broken image → a capture-phase `error` listener hides its `<figure>` (Task 4), so a broken-image icon never shows. The LCP element is the lead headline text.
- Signals endpoint: `POST /api/events` with `{ events: SignalEvent[] }`, ≤ 50 per request (`SignalBatchSchema`). The queue stamps `editionId` on every event.
- `SignalEvent` fields L4 emits (§9.7, binding):
  - `impression` → `articleId`, `meta.slot`
  - `open` → `articleId`, `meta.mode: 'sheet'|'bytes'`
  - `dwell` → `articleId`, `value` ms, `meta.mode: 'sheet'|'bytes'`
  - `read_original`/`qr_scan` → `articleId`, `meta.src: 'web'|'print'` (logged by `/r`)
  - `skip` → `articleId`, `meta.reason: 'none'|'not_interested'|'already_seen'|'not_today'`
  - `more`/`less`/`save` → `articleId`
  - `hide_source` → `articleId`, `meta.sourceId`
- Commits: `feat|test|fix|chore(reader): …`, second `-m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`. `git push` after every task. Dev server: `npx next dev -p 3004`.
- Gate before done: `npm run typecheck && npm run lint && npm test && npm run build`.
- Rolling integration: merge your first vertical slice (fixtures OK) at Checkpoint A 14:30, then again at B 15:30; end-to-end green by C 16:30.

## Review Focus

1. **Reserve exhausted** (9th skip, or a past edition with 0 reserve): the card is removed, the denominator drops ("7 of 19 read"), nothing crashes. Test: Task 3 `skip with empty reserve`.
2. **Missing or hotlink-blocked image** (`imageUrl: null` or 403): text-only Morrow card, never a broken-image icon. Test: Task 4 `hides the figure when the image errors`.
3. **Shortcut keys while typing or with modifiers** (Ctrl+S, Cmd+K, focus in an input/textarea/contenteditable): no reader action fires. Test: Task 11 `keyToAction ignores…`.
4. **Overlapping skips and undo** (skip A, skip B, undo A; undo after commit): A returns to its original index, no duplicate ids, B stays skipped; undo after commit is a no-op. Test: Task 3.
5. **Hostile or malformed URLs**: `/paper/2026-13-99`, `/paper/abc`, `/r/not-a-uuid`, an article whose stored url is `javascript:…` all give a 404, with no signal processed and no open redirect. Tests: Task 6 and Task 5 `isEditionDate`.
6. **Reload and broken storage**: after a reload skipped stories stay hidden (same promotions) and read ones stay checked. A throwing or garbage `localStorage` yields a fresh edition, never a crash or hydration mismatch. Tests: Task 1 and Task 3 `hydrate`.
7. **Receipt edge values** (`aiShare` 0/0, shortlist larger than `clustersConsidered`, `total` below 0 or above 1): no `NaN%`, the share bar is replaced by text, the shortlist is clamped, `% match` stays in 0–100. Tests: Task 2 `matchPct`, Task 10.

---

### Task 0: Worktree setup (10 min)

**Files:** Create `docs/handoff/L4.md` (status skeleton: "L4 in progress, plan docs/plans/L4-reader.md").

- [ ] **Step 1:** `git rev-parse --abbrev-ref HEAD` → expect `lane/L4-reader`. If not: `git fetch origin && git switch -c lane/L4-reader origin/main`.
- [ ] **Step 2:** `cp /d/Documents/fast_Ai_Heckathon/.env.local ./.env.local && npm ci` → exit 0. Set the model cache: bash `export MODEL_CACHE_DIR="$USERPROFILE/.cache/subah-models"`, PowerShell `$env:MODEL_CACHE_DIR="$env:USERPROFILE\.cache\subah-models"`.
- [ ] **Step 3:** `npm run typecheck` → exit 0 on the L0 stubs.
- [ ] **Step 4: Record L0 facts into `docs/handoff/L4.md`:**
  - `grep -rln "export function \(StreakChip\|PdfButton\|MorningRecallCard\|DoneForToday\|WhyChip\|StorySheet\)" src/components` and `ls src/components/streak/live.ts` → import paths of each stub (their props are fixed by §9.6; if a stub disagrees, §9.6 wins and the mismatch goes in the handoff).
  - Morrow is in place:
    - `ls src/components/morrow src/app/fonts` → the components and the 3 font families exist;
    - `grep -n "nameplate" src/lib/brand.ts` → `'The Morrow'`;
    - `grep -rn "morrow/tokens.css\|bundle.css" src/app` → L0 imports the tokens and the `mw-*` classes.
  - `ls src/components/ui` → confirm `sheet`, `popover` exist. `grep -rn "Toaster" src/app` → is sonner's `<Toaster/>` already mounted by L0?
  - `npm ls jsdom @testing-library/react @axe-core/playwright motion sonner` → which test/UI deps exist. `ls playwright.config.ts e2e` → L0's e2e setup and its `baseURL`.
- [ ] **Step 5:** Commit + push + draft PR:
  ```bash
  git add docs/handoff/L4.md
  git commit -m "chore(reader): start L4 lane handoff" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  git push -u origin lane/L4-reader
  gh pr create --draft --base main --title "L4: Reader UI" --body "Plan: docs/plans/L4-reader.md. Morrow front page + Bytes, story sheet, feedback and skip/undo, why-tags, signals, /r redirect."
  ```
  Expected: PR URL printed.

### Task 1: Edition memory in localStorage (10 min)

**Files:** Create `src/components/paper/edition-memory.ts`; Test `src/components/paper/edition-memory.test.ts` (`// @vitest-environment jsdom`).

**Interfaces:**
- Produces: `interface EditionMemory { read: string[]; skipped: string[] }` (article ids; `skipped` in skip order), `memoryKey(editionId: string): string` (`subah_edition_{editionId}`), `loadEditionMemory(editionId: string): EditionMemory`, `saveEditionMemory(editionId: string, m: EditionMemory): void`.

- [ ] **Step 1: Write failing tests:**
  - round-trip save → load returns the same arrays;
  - missing key → `{ read: [], skipped: [] }`;
  - garbage JSON or wrong shape (`{ read: 3 }`) → empty memory;
  - `localStorage.getItem`/`setItem` stubbed to throw → load returns empty memory and save does not throw;
  - two edition ids do not share state.
- [ ] **Step 2:** `npx vitest run src/components/paper/edition-memory.test.ts` → FAIL.
- [ ] **Step 3:** Implement with try/catch around every access and a shape check (arrays of strings, deduped).
- [ ] **Step 4:** Run → PASS. Commit `feat(reader): per-edition read and skip memory`; push.

### Task 2: Pure helpers: format, layout (15 min)

**Files:** Create `src/components/story/format.ts`, `src/components/paper/layout.ts`; Test `src/components/story/format.test.ts`, `src/components/paper/layout.test.ts`.

**Interfaces:**
- Consumes: `Edition`, `EditionItem`, `ArticleCard`, `Reason`, `ScoreBreakdown`, `TopicSlug`, `rootOf`, `ancestorsOf` from `@/contracts/*`; `type Takeaway` from `@/components/morrow`.
- Produces:
  - `type CardVariant = 'lead' | 'standard' | 'brief' | 'compact'` (= Morrow `StoryCardProps['variant']`).
  - `sectionLabel(slug: TopicSlug, names: Edition['sectionNames']): string`: the exact name, else the nearest ancestor's name, else the humanized last slug segment.
  - Formatting:
    - `timeAgo(publishedAt: string, nowIso: string): string`
    - `formatEditionDate(date: string): string`
    - `readingTimeLabel(minutes: number): string` (`'6 min read'`)
    - `summaryFor(item: EditionItem, variant: CardVariant): string | undefined`
    - `topReasons(reasons: Reason[], n = 2): Reason[]`
    - `alsoCoveredLabel(names: string[]): string | null`
    - `outboundHref(articleId: string, editionId: string | null): string`
  - Score and badge:
    - `breakdownRows(b: ScoreBreakdown): { key: keyof ScoreBreakdown; label: string; value: number; pct: number; negative: boolean }[]`
    - `matchPct(b: ScoreBreakdown): number` (`round(clamp(total, 0, 1) × 100)`; rank-v1 positive weights sum to 1.00)
    - `faithfulnessBadge(p: ArticleCard['aiProvider']): { label: string; tooltip: string; icon: 'check' | 'external' }` (Morrow `IconName`s)
  - Copy and takeaways:
    - `feedbackNote(kind: 'more' | 'less', topic: string): string`
    - `takeawaysOf(items: EditionItem[], editionId: string | null, names: Edition['sectionNames']): Takeaway[]`
  - `interface FrontPageLayout { lead: EditionItem | null; second: EditionItem | null; topThree: EditionItem[]; sections: { slug: TopicSlug; items: EditionItem[] }[]; beyond: EditionItem[]; briefs: EditionItem[]; longRead: EditionItem | null }`, `layoutFrontPage(items: EditionItem[], sectionOrder: TopicSlug[], leadArticleId: string): FrontPageLayout`.

- [ ] **Step 1: Write failing tests** (`format.test.ts`):
  ```ts
  const now = '2026-10-17T06:00:00Z';
  expect(timeAgo('2026-10-17T05:59:30Z', now)).toBe('just now');
  expect(timeAgo('2026-10-17T05:15:00Z', now)).toBe('45m ago');
  expect(timeAgo('2026-10-17T05:00:00Z', now)).toBe('1h ago');
  expect(timeAgo('2026-10-17T03:00:00Z', now)).toBe('3h ago');
  expect(timeAgo('2026-10-16T04:00:00Z', now)).toBe('yesterday');
  expect(timeAgo('2026-10-14T06:00:00Z', now)).toBe('3 days ago');
  expect(formatEditionDate('2026-10-17')).toBe('Saturday, 17 October 2026'); // build with Date.UTC + timeZone 'UTC'
  expect(readingTimeLabel(6)).toBe('6 min read');
  expect(topReasons([{code:'topic',text:'a',weight:.1},{code:'similar',text:'b',weight:.5},{code:'fresh',text:'c',weight:.3}]).map(r=>r.text)).toEqual(['b','c']);
  const b = { topic:.3, similarity:.1, negative:.05, importance:.1, freshness:.05, source:.02, total:.52 };
  const rows = breakdownRows(b);
  expect(rows.map(r=>r.key)).toEqual(['topic','similarity','importance','freshness','source','negative']);
  expect(rows[0]).toMatchObject({ label: 'Matches your interests', pct: 48 });   // .3 / .62, rounded
  expect(rows.at(-1)).toMatchObject({ label: 'Like stories you skipped', negative: true });
  expect(alsoCoveredLabel([])).toBeNull();
  expect(alsoCoveredLabel(['Dawn'])).toBe('Also covered by 1 outlet');
  expect(alsoCoveredLabel(['Dawn','BBC'])).toBe('Also covered by 2 outlets');
  expect(outboundHref('a1','ed1')).toBe('/r/a1?src=web&e=ed1');
  expect(outboundHref('a1', null)).toBe('/r/a1?src=web');
  expect(sectionLabel('technical.cs.ai-ml', { 'technical.cs.ai-ml': 'AI & ML' })).toBe('AI & ML');
  expect(sectionLabel('technical.cs.ai-ml', { technical: 'Technical' })).toBe('Technical');
  expect(sectionLabel('arts.books', {})).toBe('Books');
  expect(matchPct(b)).toBe(52);
  expect(matchPct({ ...b, total: -0.1 })).toBe(0);
  expect(matchPct({ ...b, total: 1.08 })).toBe(100);
  expect(faithfulnessBadge('gemini')).toMatchObject({ label: 'AI summary · facts checked against source', icon: 'check' });
  expect(faithfulnessBadge('extractive')).toMatchObject({ label: "Publisher's excerpt", icon: 'external' });
  expect(faithfulnessBadge('gemini').tooltip).toMatch(/number/i);
  expect(faithfulnessBadge('extractive').tooltip).toMatch(/no AI/i);
  expect(feedbackNote('more', 'Climate tech')).toBe('Got it. More Climate tech tomorrow.');
  expect(feedbackNote('less', 'Cricket')).toBe('Got it. Less Cricket tomorrow.');
  ```
  - Other breakdown labels: similarity "Like stories you read", importance "How widely it's covered", freshness "How recent it is", source "Source quality".
  - `summaryFor`: lead → `deep`; standard → `summary[item.tier]`; brief → `brief`; compact → `undefined` (Morrow hides it).
  - Badge tooltips (from the §10.3 guardrails):
    - gemini → "Written by AI from this article alone. Every number in it appears in the source text, names are checked against the source, and a summary that fails a check is replaced by the publisher's own sentences."
    - extractive → "The publisher's own opening sentences, unedited and cut on a sentence boundary. No AI rewrote this summary."
  - `takeawaysOf(three, 'ed1', names)` → `text` = `article.keyFact` (falls back to `headline` when null), `kicker` = `sectionLabel`, `href` = `outboundHref(id, 'ed1')`.
- [ ] **Step 2: Write failing tests** (`layout.test.ts`, using `FIXTURE_EDITION` and a `makeItem(rank, slot, sectionSlug, tier?, readingMinutes?)` factory cloning a fixture item):
  - `fixture: every item placed once` → `lead.slot === 'lead'`; `second` is the best-ranked `top`; lead + second + sections + beyond + briefs + longRead = 20, with no duplicate article ids.
  - `topThree are ranks 1..3` → `topThree.map(i => i.rank)` equals `[1, 2, 3]` (references, not extra placements).
  - `beyond holds bigstory/explore/serendipity` → every `beyond[i].slot` ∈ those three and none of them appear in `sections`.
  - `briefs and long read` → remaining `tier === 'brief'` items go to `briefs`; `longRead` = the remaining non-brief item with the most `readingMinutes` when ≥ 6, else `null`; neither appears in `sections`.
  - `sections follow sectionOrder, ancestor match` → item `technical.cs.ai-ml` lands in group `technical` when `sectionOrder = ['sports','technical']`; group order `['sports','technical']`.
  - `unknown section appended, empty groups omitted` → item `arts.books` with `sectionOrder=['sports']` gives groups `['sports','arts']`.
  - `no lead slot falls back to leadArticleId, then rank 1`.
- [ ] **Step 3:** Run `npx vitest run src/components/story/format.test.ts src/components/paper/layout.test.ts` → FAIL (modules missing).
- [ ] **Step 4:** Implement.
  - Group key = the first `sectionOrder` entry equal to `sectionSlug` or in `ancestorsOf(sectionSlug)`; else `rootOf(sectionSlug)`, appended in first-seen order.
  - Items keep rank order inside a group. Tops other than `second` join their sections.
- [ ] **Step 5:** Run → PASS. Commit `feat(reader): pure layout and format helpers`; push.

### Task 3: Edition state reducer (15 min)

**Files:** Create `src/components/paper/edition-state.ts`; Test `src/components/paper/edition-state.test.ts`.

**Interfaces:**
- Consumes: `Edition`, `EditionItem`, `rootOf`, `EditionMemory` (Task 1).
- Produces:
  - `interface EditionState { items: EditionItem[]; reserve: EditionItem[]; skipped: { item: EditionItem; index: number; promoted: EditionItem | null; reserveIndex: number }[]; skippedIds: string[]; read: string[]; saved: string[]; feedback: Record<string, 'more' | 'less'> }`. `skipped` holds the undoable skips; `skippedIds` holds every skip not undone, in order.
  - `type EditionAction = { type: 'skip' | 'undo' | 'commitSkip' | 'markRead' | 'toggleSave'; articleId: string } | { type: 'feedback'; articleId: string; value: 'more' | 'less' | null } | { type: 'hydrate'; memory: EditionMemory }`.
  - `initEditionState(e: Edition): EditionState`, `editionReducer(s: EditionState, a: EditionAction): EditionState`, `progressOf(s: EditionState): { read: number; total: number }`, `progressLabel(p: { read: number; total: number }): string`, `toMemory(s: EditionState): EditionMemory`.

- [ ] **Step 1: Write failing tests:**
  - `init` → 20 items, 8 reserve, `progressOf` = `{ read: 0, total: 20 }`; `progressLabel({ read: 7, total: 20 })` → `'7 of 20 read'`.
  - `skip lead promotes into the slot` → items length 20, reserve 7, promoted item at the same index with `rank === 1`, `slot === 'lead'`, `tier === 'deep'`.
  - `promotion prefers same root` → skipped `sports.cricket` item, reserve index 3 is `sports.football` → that one is promoted, not reserve[0].
  - `undo restores exactly` → skip then undo `toEqual` initial `items` and `reserve`; `skippedIds` empty.
  - `skip with empty reserve` → items 19, `progressLabel(progressOf(s)) === '0 of 19 read'`.
  - `overlapping skips` → skip A, skip B, undo A → A back at its original index, B absent, ids unique.
  - `undo after commitSkip is a no-op`.
  - `markRead idempotent; read of a skipped id not counted` → markRead x2 = 1; skip a read item → `read` drops by 1 in `progressOf`.
  - `feedback sets and clears` → `feedback more` → `feedback[A] === 'more'`; `less` replaces it; `null` deletes the key.
  - `hydrate replays skips and reads` → `hydrate({ skipped: [A, B], read: [C, 'unknown'] })` equals skip+commitSkip A, then B, then markRead C (same promotions); unknown ids ignored; `toMemory` of the result round-trips.
- [ ] **Step 2:** `npx vitest run src/components/paper/edition-state.test.ts` → FAIL.
- [ ] **Step 3:** Implement the promotion rule (the spec leaves it open):
  - take the first reserve item with the same `rootOf(sectionSlug)` as the skipped item, else `reserve[0]`;
  - the promoted copy inherits `rank`, `slot` and `tier` (lead → `deep`) and keeps its own `sectionSlug`;
  - `feedback` is session-only (not persisted).
- [ ] **Step 4:** Run → PASS. Commit `feat(reader): edition reducer with skip, promote, undo, feedback and hydrate`; push.

### Task 4: Morrow story composition, faithfulness line, WhyChip trigger (15 min)

No bespoke card. A story is Morrow `StoryCard` fed by a pure prop mapper, with `why={<WhyChip/>}` and `footer={<StoryFooter/>}`.

**Files:**
- Create `src/components/story/card-props.ts`, `src/components/story/FaithfulnessBadge.tsx`, `src/components/story/StoryFooter.tsx`, `src/components/story/PaperStory.tsx`, `src/components/story/image-fallback.ts`.
- Modify `src/components/story/WhyChip.tsx` (replace the L0 stub; same export and §9.6 props).
- Test `src/components/story/card-props.test.ts` and `src/components/story/PaperStory.test.tsx` (`// @vitest-environment jsdom`). If Task 0 found no jsdom/testing-library, skip the render tests and note it in the handoff.

**Interfaces:**
- Consumes: Task 2 helpers; `StoryCard`, `StoryCardProps`, `FeedbackBar`, `Feedback`, `Button`, `Icon` from `@/components/morrow`; shadcn `Popover`; `EditionItem`, `ArticleCard`, `Reason`, `ScoreBreakdown`.
- Produces:
  - `type WhyAction = 'more' | 'less' | 'hide_source'`
  - `toStoryCardProps(item: EditionItem, variant: CardVariant, ctx: { editionId: string | null; nowIso: string; sectionName: string; isRead: boolean; withDeck?: boolean }): Omit<StoryCardProps, 'why' | 'footer' | 'onOpen'>`
  - `FaithfulnessBadge(props: { provider: ArticleCard['aiProvider'] })` (also used by `StorySheet`, Task 9)
  - `StoryFooter(props: { item: EditionItem; showBadge: boolean; feedback: Feedback; saved: boolean; onFeedback(f: Feedback): void; onSave(saved: boolean): void; onSkip?: () => void; onRead?: () => void })`
  - `PaperStory(props: { item: EditionItem; variant: CardVariant; withDeck?: boolean; readOnly?: boolean })`, which reads the state, dispatch and handlers from `useEdition()` (Task 5).
  - `useImageFallback(root: RefObject<HTMLElement | null>): void`
  - `WhyChip(props: { reasons: Reason[]; breakdown?: ScoreBreakdown; onAction?: (a: WhyAction) => void })` (§9.6; the popover arrives in Task 9).

- [ ] **Step 1: Write failing tests:**
  - `card-props.test.ts`:
    - `maps the article` → `kicker` = `sectionName`; `headline`; `source` = `sourceName`; `readingTime` = `readingTimeLabel(readingMinutes)`; `published` = `timeAgo`; `href === '/r/<id>?src=web&e=<editionId>'`; `read` = `isRead`.
    - `imageUrl null → undefined`.
    - `deck only with withDeck` (`whyItMatters`).
    - `summary by variant` (lead deep, compact undefined).
  - `PaperStory.test.tsx`:
    - `renders a Morrow article with one WhyTag` → one `article`, one `.mw-why` containing the top reason text. WhyChip renders no WhyTag of its own because StoryCard wraps `why`.
    - `faithfulness line on lead and standard` → with `aiProvider:'gemini'` shows "AI summary · facts checked against source", with `'extractive'` shows "Publisher's excerpt"; it is `ui-meta text-ink-muted` (never `text-pen`); brief and compact show none; the trigger has an accessible name and its popover text equals `faithfulnessBadge(p).tooltip`.
    - `also covered by N shown only when non-empty`.
    - `headline click marks read` → clicking the `/r/…` link calls the `onOpen` wiring (`markRead`).
    - `read story shows Read with a check` (`StoryCard read`).
    - `hides the figure when the image errors` → dispatching `error` on the `img` sets its `figure` `hidden`; no broken image remains visible.
- [ ] **Step 2:** `npx vitest run src/components/story` → FAIL.
- [ ] **Step 3:** Implement.
  - `PaperStory` = `<div data-slot={item.slot}><StoryCard {...toStoryCardProps(…)} why={<WhyChip reasons={item.reasons} breakdown={item.breakdown} onAction={…} />} footer={<StoryFooter …/>} onOpen={() => dispatch({ type: 'markRead', articleId })} /></div>`. The `/r` link itself logs `read_original` server-side, so the client does not emit a second outbound event.
  - `WhyChip` renders the `topReasons(reasons, 1)[0].text` as a plain `<button className="ui-meta">` (it inherits pen from the surrounding `WhyTag`) that will open the popover. Where no StoryCard wraps it (the sheet), the caller wraps it in Morrow `<WhyTag>`.
  - `StoryFooter`, top to bottom:
    - the `FaithfulnessBadge` when `showBadge`: a `ui-meta text-ink-muted` line with `<Icon name="check"|"external" size={14} />` + label, as a button opening a shadcn `Popover` (`bg-paper-raised border-rule rounded-card shadow-floating`, `aria-describedby`, works on touch);
    - `alsoCoveredLabel` in `ui-meta text-ink-muted`;
    - `<Button variant="ghost" size="sm" onClick={onRead}>Read here</Button>` (opens the sheet, Task 9);
    - `<FeedbackBar value={feedback} saved={saved} onChange={onFeedback} onSave={onSave} onSkip={readOnly ? undefined : onSkip} />`.
  - `useImageFallback`: on mount, add one capture-phase `error` listener on the root that sets `img.closest('figure').hidden = true`. Also check `img.complete && img.naturalWidth === 0` for images that failed before hydration.
- [ ] **Step 4:** Run → PASS; `npm run typecheck` → PASS. Commit `feat(reader): compose Morrow story card with why tag, feedback and faithfulness line`; push.

### Task 5: Front page, masthead, pages (25 min, demo-critical)

Layout = README "Layout: the web paper" + ARCHITECTURE §3a.

**Files:**
- Create `src/components/paper/{PaperMasthead,FrontPage,EditionReader,EditionContext}.tsx`, `src/components/paper/view-pref.ts`, `src/components/paper/use-scrolled-past.ts`.
- Create the pages `src/app/(reader)/today/page.tsx`, `src/app/(reader)/today/preview/page.tsx`, `src/app/(reader)/paper/[date]/page.tsx`.
- Test `src/components/paper/view-pref.test.ts`, `src/components/paper/FrontPage.test.tsx`.

**Interfaces:**
- Consumes:
  - server: `buildEdition(userId, now, opts?)`, `getEdition(userId, date)` (`@/server/edition`), `getProfile(userId)` (`@/server/profile`), `getStreak(userId, now, tz)` (`@/server/streaks`), `getSessionUser()` (`@/server/auth/session`), `requestNow()` (`@/server/time`);
  - client: `useLiveStreak(initial)` (`@/components/streak/live`), `BRAND` (`@/lib/brand`);
  - Morrow: `Masthead`, `SectionHeader`, `TakeawayBox`, `PullQuote`, `ReadingProgress`, `Segmented`, `Button` from `@/components/morrow`;
  - cross-lane: `MorningRecallCard` (§9.6 props, path from Task 0); Tasks 1–4.
- Produces:
  - `type ReaderView = 'front' | 'bytes'`, `VIEW_COOKIE = 'subah_view'`, `resolveView(cookie: string | undefined, ua: string | null, chMobile: string | null): ReaderView`, `persistView(v: ReaderView): void` (cookie `max-age=31536000; path=/`), `isEditionDate(s: string): boolean`.
  - `useScrolledPast(ref: RefObject<Element | null>): boolean`.
  - `EditionReader(props: { edition: Edition; nowIso: string; initialView: ReaderView; streak: StreakView | null; readOnly: boolean; readerName: string | null; city: string | null })`.
  - `useEdition(): { state: EditionState; dispatch: Dispatch<EditionAction>; signals: ReturnType<typeof useSignals>; edition: Edition; nowIso: string; readOnly: boolean; view: ReaderView; setView(v: ReaderView): void; openSheet(id: string): void; onFeedback(item: EditionItem, f: Feedback): void; onSkip(item: EditionItem): void; liveStreak: StreakView | null }`. `onFeedback` and `onSkip` are completed in Task 8. Also `useEditionOptional()`, which returns the same value or `null` outside the provider.

- [ ] **Step 1: Write failing tests:**
  - `view-pref.test.ts`:
    - cookie `'front'` + iPhone UA → `front`; cookie `'garbage'` ignored;
    - no cookie + `chMobile '?1'` → `bytes`; UA with `Android … Mobile` → `bytes`; desktop Chrome UA → `front`;
    - `isEditionDate('2026-10-17')` true; `'2026-13-99'`, `'abc'`, `'2026-02-30'` false.
  - `FrontPage.test.tsx` (`FIXTURE_EDITION`, reader "Ayesha", city "Lahore"):
    - `full masthead` → `h1` "The Morrow"; "Edition No. {number}"; "Prepared for Ayesha"; the strip contains "Saturday, …", "Lahore", "20 stories" and `${presentation.timeBudget} min read`.
    - `above the fold` → the lead `article` comes first; an `aside` named "Three things to know" with 3 items linking to `/r/…`; then one second-rank article.
    - `sections` → `h2` headings in `sectionOrder` order using `edition.sectionNames`; a "Beyond your usual" section; "In brief" and "Long read" when the layout has them.
    - `counts and colours` → 20 `article` elements in total; no element has a class matching `/sec-|font-headline/`.
    - `compact masthead on scroll` → with the `IntersectionObserver` stub reporting the full masthead out of view, a compact masthead and a `ReadingProgress` labelled "0 of 20 read" render.
    - (The end of paper is tested in Task 10.)
- [ ] **Step 2:** Run both → FAIL.
- [ ] **Step 3:** Implement components:
  - **`PaperMasthead`** (`'use client'`):
    - full `<Masthead title={BRAND.nameplate} edition={edition.number} reader={readerName ?? undefined} date={formatEditionDate(edition.date)} location={city ?? undefined} storyCount={state.items.length} readingTime={readingTimeLabel(edition.presentation.timeBudget)} actions={…} />` (`TimeBudget` = 5 | 15 | 30);
    - actions: a `Segmented` labelled "View" with options "Front page" / "Bytes", which calls `setView` + `persistView`, and `<Button variant="ghost" size="sm" href="#how-this-paper-was-made">How this paper was made</Button>`;
    - when `useScrolledPast(fullRef)` turns true, a `sticky top-0 z-10 bg-paper-raised shadow-floating` bar shows `<Masthead variant="compact" title={BRAND.nameplate} date={…} actions={<Segmented …/>} />` above `<ReadingProgress value={read / total} label={progressLabel(p)} />`. It switches with no slide (opacity 150 ms at most).
  - **`FrontPage`** in `<main className="mx-auto max-w-(--page-max) px-4">`:
    - the editor's note directly under the masthead as one `ui-text text-ink-soft max-w-(--measure)` paragraph, with a `ui-meta text-ink-muted` "Note written with AI" when `editorNoteSource === 'gemini'`.
    - **Above the fold**, `grid lg:grid-cols-[2fr_1fr]` with the columns separated by a `rule` (`lg:divide-x divide-rule`, `px-3` per column = `gutter`):
      - left: `<PaperStory variant="lead" withDeck />`;
      - right: `<MorningRecallCard questions={edition.recall} editionId={edition.id} />` (only when `edition.recall.length > 0` and not `readOnly`), then `<TakeawayBox items={takeawaysOf(layout.topThree, edition.id, edition.sectionNames)} />` (default title "Three things to know"), then `<PaperStory item={layout.second} variant="standard" withDeck />`.
      - Below 640 px it is one column: lead, then TakeawayBox, then the rest.
    - **Sections**, in layout order, each a `<section aria-labelledby>`:
      - `<SectionHeader id title={sectionLabel(slug, edition.sectionNames)} />`, then `grid md:grid-cols-3 md:divide-x divide-rule` of `PaperStory variant="standard"`;
      - "Beyond your usual" (beyond items) is its own section with the same header and grid, and is omitted when empty;
      - sections are separated by `space-y-8 md:space-y-12` (`space-6`/`space-7`).
    - **In brief + Long read** side by side (`md:grid-cols-2 md:divide-x divide-rule`):
      - `SectionHeader "In brief"` + `PaperStory variant="brief"` per brief;
      - `SectionHeader "Long read"` + `PaperStory variant="compact"`.
      - A `PullQuote` is rendered only if the data carries a quote. `ArticleCard` has none today, so core renders none.
      - Each column is omitted when empty.
    - The end-of-paper slot (Task 10) closes the page.
  - **`EditionReader`** (`'use client'`):
    - wraps everything in `MotionConfig reducedMotion="user"` and `useReducer(editionReducer, edition, initEditionState)`;
    - on mount, `dispatch({ type: 'hydrate', memory: loadEditionMemory(edition.id) })` in `useEffect` (so the SSR markup matches), then `saveEditionMemory(edition.id, toMemory(state))` on every `read`/`skippedIds` change;
    - calls `useSignals(edition.id)` and `liveStreak = useLiveStreak(streak)`, and `useImageFallback(rootRef)`;
    - `onSave` dispatches `toggleSave` and tracks `{ type: 'save', articleId }` only when the story becomes saved;
    - provides the context, and mounts sonner `<Toaster/>` only if Task 0 found none.
- [ ] **Step 4:** Implement pages:
  - **`/today`:**
    1. `user = await getSessionUser()` → null ⇒ `redirect('/start')`.
    2. `profile = await getProfile(user.userId)` → null ⇒ `redirect('/start')`.
    3. `now = await requestNow()`.
    4. `edition = await buildEdition(user.userId, now)` (default `awaitNote: false`; the note lands via `after()`).
    5. `streak = await getStreak(user.userId, now, profile.tz)`.
    6. View from `resolveView((await cookies()).get(VIEW_COOKIE)?.value, h.get('user-agent'), h.get('sec-ch-ua-mobile'))`.
    7. Render `EditionReader readOnly={false} nowIso={now.toISOString()} readerName={firstName(profile.displayName)} city={profile.city}` (`firstName` = first whitespace token, or null).
  - **`/paper/[date]`:** `{ params }: { params: Promise<{ date: string }> }`; `const { date } = await params`; `!isEditionDate(date)` ⇒ `notFound()`; session + profile as above; `getEdition(user.userId, date)` null ⇒ `notFound()`; `readOnly`.
  - **`/today/preview`:**
    - `process.env.DEMO_MODE !== '1'` ⇒ `notFound()`;
    - renders `FIXTURE_EDITION` with `searchParams` `view=front|bytes`, `nowIso` = `FIXTURE_EDITION.createdAt`, `streak = FIXTURE_STREAK`, and the reader name and city from `FIXTURE_PROFILE`;
    - used by every browser check (no auth needed).
- [ ] **Step 5:** Run tests → PASS; `npm run typecheck && npm run lint` → exit 0.
- [ ] **Step 6: Browser check.**
  1. Run `npx next dev -p 3004`.
  2. Run `npx playwright screenshot --viewport-size=1280,900 --full-page "http://localhost:3004/today/preview?view=front" docs/handoff/screens/L4-front-1280.png`, and the same at `390,844` → `L4-front-390.png`.
  3. Open both and check:
     - the blackletter nameplate with both ears, and the 2fr/1fr fold with the TakeawayBox;
     - column rules between the section stories, with no section colours and no emoji;
     - no broken images, and no horizontal scroll at 390.
- [ ] **Step 7:** Commit `feat(reader): Morrow front page, masthead and today/paper pages`; push. This is the Checkpoint A slice: note "ready for A" in `docs/handoff/L4.md` and mark the PR ready for the merge round.

### Task 6: `/r/[articleId]` outbound redirect (15 min)

**Files:** Create `src/app/r/[articleId]/route.ts`; Test `src/app/r/[articleId]/route.test.ts`.

**Interfaces:**
- Consumes: `processSignals(userId, events, now)` (`@/server/learn`), `createSupabaseAdminClient()` (reads only: `articles.url`, `editions.user_id`), `getSessionUser()`, `requestNow()`, `after` + `NextResponse` from `next/server`.
- Produces: `GET(req: Request, ctx: { params: Promise<{ articleId: string }> }): Promise<Response>`.

- [ ] **Step 1: Write failing tests.** Mock `@/server/learn`, `@/server/db/admin`, `@/server/auth/session` and `@/server/time`. Mock `next/server` with `vi.mock('next/server', async o => ({ ...(await o()), after: (fn: () => unknown) => fn() }))`. A fake admin client answers `select` from `articles`/`editions`.
  - `src=web with session` → 302, `Location` = article url; `processSignals('u1', [{ type:'read_original', articleId:id, editionId:'ed1', meta:{ src:'web' } }], now)` called once.
  - `src=print attributes via edition owner` → no session, `e=ed1` owned by `u9` → `processSignals('u9', [{ type:'qr_scan', articleId:id, editionId:'ed1', meta:{ src:'print' } }], now)`.
  - `print with unknown edition` → 302, `processSignals` not called.
  - `web without session` → 302, not called. `missing src` behaves as `web`. Invalid `e` on web → event without `editionId`.
  - `processSignals rejects` → still 302.
  - `unknown id` → 404, not called. `non-uuid id` → 404, `from` never called. `javascript: url` → 404.
- [ ] **Step 2:** `npx vitest run "src/app/r"` → FAIL.
- [ ] **Step 3:** Implement:
  - check `articleId` and `e` against a uuid regex;
  - select `url` from `articles` and require `http:`/`https:` via `new URL()`;
  - resolve the user (the session for web, `editions.user_id` for print);
  - call `processSignals` inside `after()` with try/catch + `console.error`, so the 302 is never delayed or broken;
  - return `NextResponse.redirect(url, 302)`.

  No hand-rolled `events` insert: the one pipeline does insert, learning and streaks.
- [ ] **Step 4:** Run → PASS. Commit `feat(reader): /r outbound redirect logs read_original and qr_scan`; push.

### Task 7: `useSignals` upgrade (20 min)

**Files:** Modify `src/hooks/useSignals.ts`; Test `src/hooks/useSignals.test.ts` (`// @vitest-environment jsdom`, `vi.useFakeTimers()`, stub `fetch`, `navigator.sendBeacon`, `IntersectionObserver`, `document.visibilityState`; `vi.mock('@/components/streak/live')`).

**Interfaces:**
- Consumes: `SignalEvent`, `EventsResult`, `EventsResultSchema` (`@/contracts/api`), `publishStreak` (`@/components/streak/live`).
- Produces:
  - §9.4 `useSignals(editionId: string | null): { track; lastResult; observeImpression; startDwell }` (`startDwell(articleId, mode: 'sheet'|'bytes' = 'sheet')`);
  - `createSignalQueue(opts: { editionId: string | null; endpoint?: string; intervalMs?: number; onResult?: (r: EventsResult) => void }): { push(e: SignalEvent): void; flush(mode?: 'fetch' | 'keepalive' | 'beacon'): Promise<void>; dispose(): void }`.

- [ ] **Step 1: Write failing tests:**
  - `flushes every 2 s` → push 2, advance 1999 ms → 0 fetches; 2000 ms → 1 POST to `/api/events`, body `{ events }` length 2, each `editionId:'ed-1'`.
  - `chunks at 50` → 120 pushes → 3 fetches (50, 50, 20).
  - `hidden flushes with keepalive` → `visibilitychange` to hidden → fetch init has `keepalive: true`.
  - `pagehide uses sendBeacon` → `sendBeacon('/api/events', Blob)` called, fetch not called.
  - `failed fetch requeues` → first fetch rejects; next tick resends the same events.
  - `lastResult and live streak` → after a flush the hook exposes the `EventsResultSchema`-parsed result, and `publishStreak` was called with `result.streak`, once per flush that returns a result. An invalid body publishes nothing.
  - `impression after 1 s, once` → IO intersecting on an element with `data-slot="lead"`; 999 ms → none; 1000 ms → one `{ type:'impression', articleId, meta:{ slot:'lead' } }`; re-intersect → still one.
  - `dwell pauses while hidden` → `startDwell('a1', 'bytes')`; 3000 ms visible; hidden 5000 ms; visible 1000 ms; `stop()` → one `{ type:'dwell', articleId:'a1', value: 4000, meta:{ mode:'bytes' } }`; second `stop()` emits nothing.
- [ ] **Step 2:** `npx vitest run src/hooks/useSignals.test.ts` → FAIL.
- [ ] **Step 3:** Implement:
  - cap the queue at 200 (drop the oldest);
  - IO at threshold 0.5 with a 1 s timer per element, a `Set` of seen ids, and the slot from `el.dataset.slot`;
  - `startDwell` accumulates only visible time;
  - `onResult` sets `lastResult` and calls `publishStreak(result.streak)` (beacon flushes have no response).
- [ ] **Step 4:** Run → PASS. Commit `feat(reader): signal queue with beacon, impressions, dwell and live streak`; push.

### Task 8: Feedback notes, skip with undo, quiet fade-in (15 min)

**Files:** Create `src/components/story/SkipToast.tsx`, `src/components/paper/FadeSlot.tsx`, `src/components/paper/LiveAnnouncer.tsx`; Modify `FrontPage.tsx`, `EditionReader.tsx`; Test `src/components/story/feedback-and-skip.test.tsx`.

**Interfaces:**
- Consumes: `useEdition()`, `editionReducer` actions, `feedbackNote`, `sectionLabel`, `toast` from `sonner`, `motion` + `AnimatePresence` from `motion/react`, `Button` from `@/components/morrow`.
- Produces: `SkipToast(props: { item: EditionItem; sectionName: string; onUndo(): void; onReason(r: 'not_interested' | 'already_seen' | 'not_today'): void })`, `FadeSlot(props: { id: string; children: ReactNode })`, `announce(msg: string): void` (via `LiveAnnouncer` context), and the completed `onFeedback` / `onSkip` in the context.

- [ ] **Step 1: Write failing test:**
  - `More shows the note and tracks once` → clicking "More like this" on a card dispatches `feedback more`, tracks `{ type:'more', articleId }` exactly once, and shows "Got it. More {sectionName} tomorrow." (toast + `announce`).
  - `Less likewise`.
  - `toggling off is silent` → clicking More again sets `null` and tracks nothing.
  - `why popover actions reuse it` → `onWhyAction('more')` follows the same path.
  - `skip` → clicking FeedbackBar "Skip" dispatches `skip`:
    - the toast offers Undo + the 3 reasons, with `Not interested in {sectionName}`;
    - choosing "Already seen" tracks `{ type:'skip', articleId, meta:{ reason:'already_seen' } }` exactly once;
    - Undo dispatches `undo` and tracks nothing;
    - auto-close after 5000 ms tracks `meta.reason:'none'` and dispatches `commitSkip`.
  - `fade, no layout` → the slot wrapper has no `layout` prop and its exit/enter animate only `opacity`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
  - `onFeedback(item, f)`:
    - dispatch `feedback`;
    - when `f` is non-null, track `{ type: f, articleId }`, then `toast(feedbackNote(f, sectionLabel(item.sectionSlug, edition.sectionNames)), { duration: 3000 })` and `announce` the same text.
  - `onSkip`: `toast.custom(<SkipToast …/>, { duration: 5000, onAutoClose, onDismiss })`, with Undo and the reasons as Morrow `Button size="sm"` (`secondary` for Undo, `ghost` for the reasons).
  - `FadeSlot`: each story position is `<AnimatePresence mode="wait" initial={false}><motion.div key={article.id} initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:0.15}}>`. The skipped card fades out and the reserve story fades into the same slot, with no `layout`, no `LayoutGroup` and no slide.
  - Announce "Story skipped. {new headline} is in its place." / "Skip undone."
  - Server toasts: a `useEffect` on `signals.lastResult` calls `toast(lastResult.toast)` when it is non-null.
  - The compact masthead's `ReadingProgress` (Task 5) already follows `progressOf(state)`; its fill uses Morrow's 300 ms transition.
- [ ] **Step 4:** Run → PASS. Browser check on `/today/preview?view=front` at 1280:
  1. skip the lead → it fades and the reserve story fades in, with no movement;
  2. Undo restores it;
  3. More shows the note;
  4. after a reload the skip persists;
  5. save `docs/handoff/screens/L4-skip-1280.png`.
- [ ] **Step 5:** Commit `feat(reader): more/less notes, skip with reasons and undo, quiet fade-in`; push.

### Task 9: StorySheet reader view + why popover with contribution bars (15 min)

**Files:** Modify (replace L0 stub, same export and §9.6 props) `src/components/story/StorySheet.tsx`; Create `src/components/story/WhyPopover.tsx`; Modify `src/components/story/WhyChip.tsx` (opens `WhyPopover` when `breakdown` is given); Test `src/components/story/WhyPopover.test.tsx`.

**Interfaces:**
- Consumes: shadcn `Sheet`, `SheetContent`, `SheetTitle`, `SheetDescription`, `Popover`; Morrow `WhyTag`, `FeedbackBar`, `Button`; `breakdownRows`, `matchPct`, `topReasons`, `outboundHref`, `sectionLabel`; `FaithfulnessBadge` (Task 4); `useEditionOptional()`.
- Produces:
  - `StorySheet(props: { item: EditionItem | null; editionId: string; open: boolean; onOpenChange: (open: boolean) => void })` (§9.6). `nowIso`, `sectionNames`, `dispatch` and `track` come from `useEditionOptional()`; outside the provider it renders content only, with no tracking.
  - `WhyPopover(props: { reasons: Reason[]; breakdown: ScoreBreakdown; onAction?: (a: WhyAction) => void })`.
  - `whyActionEvent(a: WhyAction, item: EditionItem): SignalEvent`.

- [ ] **Step 1: Write failing test.** Open a `WhyChip` with a `breakdown` (`total: .52`):
  - the header reads "52% match" (`matchPct`);
  - there are 6 contribution-bar rows labelled from `breakdownRows`, each bar `bg-pen` with `style.width === pct + '%'`;
  - the negative row is marked as a subtraction: `bg-ink-muted`, a "−" prefix and `aria-label` "… lowers the score";
  - "More like this" → `onAction('more')`, "Less like this" → `'less'`, "Hide this source" → `'hide_source'`;
  - without `breakdown` the chip is text only and opens no popover.

  Events: `whyActionEvent('more', item)` → `{ type:'more', articleId }`; `whyActionEvent('hide_source', item)` → `{ type:'hide_source', articleId, meta:{ sourceId: item.article.sourceId } }`. The sheet renders its WhyChip inside a Morrow `WhyTag` (exactly one `.mw-why`).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
  - **`WhyPopover`** (`bg-paper-raised border border-rule rounded-card shadow-floating p-4`):
    - "{n}% match" in `ui-label`, then the reason texts in `ui-meta text-pen`;
    - one row per `breakdownRows` entry: the label in `ui-meta`, and a bar on a `bg-paper-sunk` track (`bg-pen`; the negative row `bg-ink-muted` with "−"; width transition 300 ms);
    - then three Morrow `Button variant="ghost" size="sm"`: `icon="plus"` "More like this", `icon="minus"` "Less like this", `icon="x"` "Hide this source".
    - More/Less route through `onFeedback` (Task 8), so the note appears.
  - **Sheet** `side="bottom"`, `bg-paper`, `max-h-[90dvh]`. The reader column is `mx-auto max-w-(--measure)`; the right-side desktop sheet is stretch. Content, in order:
    - `kicker` (sectionLabel), `SheetTitle className="headline-lg"`, `deck text-ink-soft` (`whyItMatters`), and a `ui-meta text-ink-muted` meta line (source · reading time · time ago);
    - `<WhyTag><WhyChip …/></WhyTag>` with the breakdown and `onAction` → `track(whyActionEvent(...))`;
    - `<FaithfulnessBadge provider={item.article.aiProvider} />` directly above the deep summary;
    - the deep summary in `body-text`;
    - the key fact as `body-text` with the key phrase in `<mark className="bg-highlight text-ink">`;
    - `<Button variant="primary" full href={outboundHref(…)} target="_blank" rel="noopener noreferrer" iconRight="external">Read on {sourceDomain}</Button>`;
    - then the same `FeedbackBar` (More/Less/Save/Skip; Skip closes the sheet).
  - **On open:** `markRead`, `track({ type:'open', articleId, meta:{ mode:'sheet' } })`, `stop = startDwell(id, 'sheet')`. **On close:** `stop()`.
  - Wire `StoryFooter`'s "Read here" to `openSheet(id)`. In `EditionReader`, wire `onWhyAction` to `signals.track(whyActionEvent(a, item))` for `hide_source`, and to `onFeedback` for more/less.
- [ ] **Step 4:** Run → PASS. Browser check: open the lead at 390 → `docs/handoff/screens/L4-sheet-390.png`; Esc closes and focus returns to the "Read here" button.
- [ ] **Step 5:** Commit `feat(reader): story sheet reader view and why-this-story popover`; push.

### Task 10: End of paper + "How this paper was made" (15 min)

This replaces the plain receipt footer (PLAN.md §5a). The panel is fed only by `edition.receipt` plus counts from the `Edition` (`items.length`, `reserve.length`); no new fetch. The end-of-paper block follows README "Layout: the web paper" item 5.

**Files:** Create `src/components/paper/receipt.ts`, `src/components/paper/tomorrow.ts`, `src/components/paper/HowThisPaperWasMade.tsx`, `src/components/paper/EndOfPaper.tsx`; Modify `FrontPage.tsx` (mount `EndOfPaper` last); Test `src/components/paper/receipt.test.ts`, `src/components/paper/EndOfPaper.test.tsx` (`// @vitest-environment jsdom`).

**Interfaces:**
- Consumes: `Edition`, `EditionReceipt`, `WeightDelta` (`@/contracts/*`), `FIXTURE_EDITION`, Morrow `Button`, `DoneForToday`, `StreakChip`, `PdfButton` (§9.6 props).
- Produces:
  - `SHORTLIST_DEFAULT = 200` (mirrors `RankParams.shortlist`, rank-v1). `EditionReceipt` has no shortlist field, so a receipt value is used only if one is present.
  - `editionFunnel(e: Edition): { key: 'considered' | 'stories' | 'shortlist' | 'picked'; label: string; value: number }[]`, `aiShareOf(r: EditionReceipt): { aiPct: number; extractivePct: number; total: number }`.
  - `tomorrowLine(deltas: WeightDelta[], feedback: Record<string, 'more' | 'less'>, items: EditionItem[], names: Edition['sectionNames']): string`.
  - `HOW_MADE_ID = 'how-this-paper-was-made'`, `HowThisPaperWasMade(props: { edition: Edition })`, `EndOfPaper()` (reads `useEdition()`).

- [ ] **Step 1: Write failing tests:**
  - `funnel` on `FIXTURE_EDITION` → keys in order `considered, stories, shortlist, picked`; values `articlesConsidered`, `clustersConsidered`, `min(200, clustersConsidered)`, `items.length`; the picked label is "20 picked + 8 reserve" (from `items.length`/`reserve.length`).
  - `shortlist from receipt, clamped` → receipt cast with `shortlist: 150` gives 150; with `clustersConsidered: 90` gives 90.
  - `aiShareOf({ gemini: 15, extractive: 5 })` → `{ aiPct: 75, extractivePct: 25, total: 20 }`; `{ 0, 0 }` → `total: 0`, no `NaN`.
  - `tomorrowLine`:
    - a rising and a falling delta → "Tomorrow your paper leans a little more toward {A} and a little less toward {C}.";
    - with no deltas it falls back to this session's `feedback` topics;
    - with nothing at all → "Tomorrow's paper builds on what you read today."
  - `end of paper` render, in order:
    - `h2` "That's your paper for today.", then the `tomorrowLine` sentence in `deck`;
    - `DoneForToday`, then `StreakChip` (the quiet streak line);
    - `PdfButton` (L6 renders it as the one accent button), then a Morrow secondary `Button` "Past editions" with `href="/archive"`;
    - then `<details id="how-this-paper-was-made">`, closed by default, with the summary "How this paper was made".
  - `panel open` shows:
    - the 4 funnel steps, "Built in {buildMs} ms", "LLM calls for you: {llmCallsThisEdition}" and "Ranking is local math, 0 AI calls per reader";
    - the AI segment with `style.width === '75%'` and the text "AI summaries 75% · Publisher's excerpts 25%";
    - with `total: 0`, the text "No summaries in this edition" and no bar.
  - `masthead link` → `href="#how-this-paper-was-made"`; clicking it sets `details.open`.
- [ ] **Step 2:** `npx vitest run src/components/paper/receipt.test.ts src/components/paper/EndOfPaper.test.tsx` → FAIL.
- [ ] **Step 3:** Implement.
  - **`EndOfPaper`** is a `<section aria-labelledby>` with `pt-24` (`space-9`), centred in `max-w-(--measure)`.
    - Mounts: `<DoneForToday edition={edition} readIds={state.read} streak={liveStreak} />`, `<StreakChip streak={liveStreak ?? undefined} />`, `<PdfButton date={edition.date} editionId={edition.id} />`.
    - `tomorrowLine` reads `signals.lastResult?.deltas ?? []`.
  - **Panel:**
    - native `<details>`/`<summary>` above a `border-t border-rule` (keyboard and screen-reader collapsible for free); the summary is `ui-label`, ≥ 44 px;
    - funnel: a stepped list of `bg-ink-muted` bars on `bg-paper-sunk`, widths on a `log10` scale, with the number printed beside each (`ui-meta`);
    - one stacked share bar (`bg-ink` + `bg-rule-strong`) with a text label beside it, never colour alone;
    - a small `ui-meta text-ink-muted` line with `algoVersion`.
  - The masthead link (Task 5) opens the panel, then lets the anchor scroll. In Bytes, Task 11 puts `EndOfPaper` on the final slide.
- [ ] **Step 4:** Run → PASS. Commit `feat(reader): end of paper and how this paper was made panel`; push.

### Task 11: Bytes view (15 min; last core build task; cut line: Front page only)

**Files:** Create `src/components/paper/BytesDeck.tsx`, `src/components/paper/bytes-keys.ts`, `src/components/paper/visible-timer.ts`; Modify `EditionReader.tsx` (render by `view`); Test `src/components/paper/bytes-keys.test.ts`, `src/components/paper/visible-timer.test.ts`.

**Interfaces:**
- Consumes: `useEdition()`, `PaperStory` (variant `standard`; `compact` for brief-tier items), `FadeSlot`, `StorySheet`, `EndOfPaper` (Task 10), Morrow `Button`.
- Produces: `type BytesAction = 'next'|'prev'|'skip'|'open'|'save'|'toggle'`, `keyToAction(e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; target: { tagName?: string; isContentEditable?: boolean } | null }): BytesAction | null`, `createVisibleTimer(ms: number, onDone: () => void): { start(): void; stop(): void; dispose(): void }`, `BytesDeck()`.

- [ ] **Step 1: Write failing tests:**
  - `keyToAction`: `j`→next, `k`→prev, `x`→skip, `o`→open, `s`→save, `b`→toggle; `J` (shift) works; `ctrlKey+s` → null; `metaKey+k` → null; target `INPUT`/`TEXTAREA`/`SELECT`/contenteditable → null; `q` → null.
  - `visible timer`: fires after 8000 visible ms; 3000 visible + 10000 hidden + 4999 visible → not fired; +1 ms → fired once; `stop()` before → never.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
  - **Container:** a single column `mx-auto max-w-(--measure) h-[100dvh] overflow-y-auto snap-y snap-mandatory px-5` (≥ 20 px edge margin for iOS back-swipe), `role="region" aria-roledescription="carousel"`. Under the compact masthead + `ReadingProgress`, there is no full masthead.
  - **Slides:** each is `snap-start min-h-[100dvh] border-b border-rule` with `aria-roledescription="slide"`, `aria-label="{i} of {n}"` and `data-slot={item.slot}`, and holds one `FadeSlot` + `PaperStory` with the same FeedbackBar.
  - **Motion:** native snap only. No slide transitions; `scroll-behavior: smooth` only without reduced motion.
  - **Active slide:** IO at threshold 0.6 sets the active index (`aria-current`). On active:
    - call `observeImpression` and `stop = startDwell(id, 'bytes')`, and start an 8 s visible timer;
    - when the timer fires, `markRead` and `track({ type:'open', articleId, meta:{ mode:'bytes' } })`, once per article;
    - leaving the slide calls `stop()`.
  - **Keys and buttons:** keys listen on `window` (`b` also works in the Front page view; `s` → `toggleSave`, `x` → `onSkip`, `o` → `openSheet`). Each slide shows Morrow ghost buttons `icon="arrow-left"` "Previous" and `iconRight="arrow-right"` "Next"; the footer carries "Read here" and the FeedbackBar.
  - **Final slide:** hosts `<EndOfPaper />`. In Bytes the masthead link scrolls the deck to that slide and opens the panel.
- [ ] **Step 4:** Run → PASS. Screenshots: `?view=bytes` at `390,844` → `L4-bytes-390.png`, at `1280,900` → `L4-bytes-1280.png` (centred measure column).
- [ ] **Step 5:** Commit `feat(reader): bytes stack with snap scroll, keys and read-on-dwell`; push.

### Task 12: Verification pass (10 min)

**Files:** Create `e2e/L4-reader.spec.ts` (runs under L0's `playwright.config.ts`; builds URLs from `process.env.L4_BASE_URL ?? 'http://localhost:3004'` if L0's `baseURL` is another port).

- [ ] **Step 1: Write the e2e spec.** Tasks 5, 8, 9 and 11 already wrote the screenshots; re-shoot only those whose view changed since.
  - **Keyboard in Bytes** (`?view=bytes`):
    - press `j` → slide 2 is `aria-current`;
    - `x` → "Undo" is visible; click it → the slide is restored;
    - `o` → `role=dialog` is visible; `Escape` → closed;
    - `b` → the heading "Three things to know" is visible.
  - **Front page:**
    - Tab from page start reaches the "View" radio group, the first headline link and its FeedbackBar buttons, each with a visible focus ring;
    - click "More like this" → the text "Got it. More" is visible;
    - scroll past the masthead → the compact masthead and the "0 of 20 read" style label are visible;
    - click "How this paper was made" → the panel is open and shows "LLM calls for you".
  - **Signals:** `page.waitForRequest(r => r.url().endsWith('/api/events') && r.method() === 'POST')` resolves. The status may be 401 in preview; the request is the evidence.
- [ ] **Step 2:** `npx playwright install chromium`, dev server on 3004 with `DEMO_MODE=1`, then `npx playwright test e2e/L4-reader.spec.ts` → all pass.
- [ ] **Step 3:** Write the manual a11y checklist in `docs/handoff/L4.md` (the automated axe run is stretch):
  - landmarks are present, and the heading order runs h1 nameplate → h2 sections → h3 stories;
  - every icon button (incl. the faithfulness line) has an accessible name;
  - contrast holds in Morning and Night (`data-theme="night"`), and pen appears only on personalization;
  - 200% zoom reflows at 1280;
  - `prefers-reduced-motion` (Playwright `reducedMotion: 'reduce'`) → no animation;
  - targets are ≥ 44 px at 390.
- [ ] **Step 4:** Gate: `npm run typecheck && npm run lint && npm test && npm run build` → all exit 0. Also `grep -rnE "sec-|font-headline|Fraunces|Bricolage|text-accent" src/components/paper src/components/story` → no matches. Commit `test(reader): e2e keyboard and a11y pass`; push; `gh pr ready` only after the handoff is written.

---

## Acceptance checks

| Command / action | Expected |
|---|---|
| `npm run typecheck && npm run lint && npm test && npm run build` | all exit 0 |
| `npx vitest run src/components src/hooks "src/app/r"` | the suites pass: edition-memory; format (incl. `matchPct`, `faithfulnessBadge`, `feedbackNote`, `takeawaysOf`); layout; edition-state (incl. `progressLabel`); view-pref; card-props; PaperStory; FrontPage; feedback-and-skip; WhyPopover; receipt; EndOfPaper; bytes-keys; visible-timer; useSignals; the `/r` route |
| `npx playwright test e2e/L4-reader.spec.ts` | passes; `docs/handoff/screens/L4-front-1280.png`, `L4-front-390.png`, `L4-bytes-390.png`, `L4-bytes-1280.png`, `L4-skip-1280.png`, `L4-sheet-390.png` exist (from Tasks 5, 8, 9, 11) |
| `curl -s -o /dev/null -w "%{http_code}" http://localhost:3004/r/not-a-uuid` | `404` |
| `curl -s -o /dev/null -w "%{http_code} %{redirect_url}" "http://localhost:3004/r/<real-article-id>?src=print&e=<edition-id>"` | `302 https://…`, and a `qr_scan` row in `events` for the edition owner (written by `processSignals`) |
| `/paper/2026-13-99` in the browser | 404 page |
| `/today` without a session, or with a session but no profile | redirects to `/start` |
| `/today/preview` at 390 px, DevTools Network | `POST /api/events` batches about every 2 s; a skip fades the card, the reserve story fades in, and Undo is offered for 5 s; the compact masthead's "N of 20 read" bar advances on read; after a reload, skipped stories stay hidden and read ones show the check |
| `/today/preview` at 1280 px | Morrow front page: full masthead "The Morrow" with "Edition No. N" and "Prepared for {name}"; 2fr/1fr fold with "Three things to know"; 3-column sections with rules and no section colours; "In brief" (+ "Long read" when present); every lead/standard card shows "AI summary · facts checked against source" or "Publisher's excerpt" in muted ink with a popover; the WhyTag popover shows "N% match" and 6 bars; More shows "Got it. More … tomorrow."; the end of paper reads "That's your paper for today." with the PDF and "Past editions" buttons and the "How this paper was made" panel (funnel, build ms, "LLM calls for you: N", AI vs extractive bar) |

## Handoff (`docs/handoff/L4.md`)

Write exactly these sections:
1. **Status:** tasks done / stubbed / cut (with the cut line applied, if any), which checkpoint (A/B/C) each merge landed in, and any stretch items done.
2. **Routes:** `/today`, `/paper/[date]`, `/today/preview` (DEMO_MODE only, fixture), `/r/[articleId]`.
3. **Exports others may use:** `EditionReader`, `PaperStory` (+ `toStoryCardProps`), `WhyChip`, `StorySheet`, `FaithfulnessBadge` (+ `faithfulnessBadge`), `EndOfPaper`, `HowThisPaperWasMade` (+ `editionFunnel`, `aiShareOf`), `matchPct`, `layoutFrontPage`, `takeawaysOf`, `formatEditionDate`, `timeAgo`, `useSignals` (+ `createSignalQueue`).
4. **Signals:** confirmation that L4 emits exactly the §9.7 fields (list per type), that `useSignals` calls `publishStreak(result.streak)` after every flush, and the optional `startDwell` `mode` argument.
5. **Contract notes:**
   - the reserve promotion rule (same root first, else `reserve[0]`);
   - the `localStorage` key `subah_edition_{editionId}`;
   - the `% match` normalisation (`clamp(total, 0, 1)`);
   - the shortlist fallback: `EditionReceipt` has no `shortlist`, so L4 shows 200 = `RankParams.shortlist` unless a receipt value appears. Ask the integrator for a `chore(contract)` adding it if L3 wants the real number shown;
   - Morrow facts:
     - `StoryCard` wraps `why` in its own `WhyTag`, so `WhyChip` renders the trigger only;
     - the headline link goes through `/r`, and `onOpen` marks the story read;
     - Morrow's `<img>` has no `onError`/`referrerPolicy`, so L4 uses a capture-phase fallback. Request an L0 contract commit adding `referrerPolicy="no-referrer"`;
     - no `PullQuote` is rendered because `ArticleCard` has no quote field;
   - any §9.6 stub mismatch found in Task 0.
6. **L0 facts recorded in Task 0** (stub import paths, Morrow paths and CSS imports, Toaster location, deps present, e2e config).
7. **Env:** `DEMO_MODE=1` for the preview route; nothing else new.
8. **Verify:** the acceptance-check commands above, and the screenshot list.
9. **A11y checklist results** (axe output or the manual list).

## Cut line (PLAN.md §5.3)

If L4 is late:
- **Front page only.** Bytes becomes wave 2: drop Task 11 and the bytes screenshots, and hide the "Bytes" option of the view toggle.
- **Skip without the fade.** Drop `FadeSlot` in Task 8; the promoted reserve item is still placed in the slot, it just appears without the fade.
- Then drop "Long read" (briefs only).

Never cut:
- the Morrow front page with the headline link through `/r`;
- FeedbackBar More/Less (with the note) and Skip with undo;
- WhyTags;
- the editor's note;
- the end of paper with the streak line and the PDF button.

## Polish backlog (stretch, only if green)

Only after Task 12 is green and the lane is merged at Checkpoint C. In value order; each item gets a test where logic exists, a browser check, a `feat(reader): …` commit and a push.

- [ ] Right-side sheet at ≥ 768 px (`side="right"` via a local `matchMedia` hook); core uses the centred bottom sheet everywhere.
- [ ] Automated axe run in `e2e/L4-reader.spec.ts` if `@axe-core/playwright` is installed: `new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag22aa']).analyze()` → zero `serious`/`critical` violations in both views and both themes; core uses the manual checklist (Task 12 Step 3).
- [ ] "Done reading? Mark as read" toast when the tab regains focus after Read original (`visibilitychange` → visible within 10 min).
- [ ] Hide a whole section from its `SectionHeader` `action` (a ghost "Less of this section" button → `less` for each of its items, with the same note).
- [ ] Text size control in the sheet (persisted in localStorage, try/catch), keeping `body-text` within the measure.
