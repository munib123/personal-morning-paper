# L7 Engagement (streaks, recall, learning UI, archive) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the streak engine (no freezes or repair in wave 1) plus its quiet UI, Morning Recall, "Three things you learned" with Done-for-today, the `/archive` grid of past editions (Morrow EditionCards by week) with the 7-day strip, the three-tab `/me` page (Your paper learned, Your interests, Streak & settings with demo controls) and the demo clock. Every visual follows the Morrow design system.

**Architecture:** One pure function, `computeStreak`, replays `daily_activity` (the source of truth) on every call. `recordActivity` and `getStreak` are thin I/O around it, behind a `StreakRepo` interface with a Supabase implementation and an in-memory one for tests. The UI is Server Component pages (`/archive`, `/me`) with `'use client'` leaves that **compose the Morrow components from `@/components/morrow`** (Button, Segmented, TextField, TakeawayBox, EditionCard, ReadingProgress, SectionHeader, Icon); the §9.6 components are thin wrappers over them. The leaves build against `@/contracts/fixtures` first and then use the L3 server functions and routes. Live streak updates on the client go through the §9.6 channel that L7 owns, `src/components/streak/live.ts` (`publishStreak` / `useLiveStreak`); L4's `useSignals` publishes after every flush.

**Tech Stack:** Next.js 16.4.2 (App Router), React 19.3.1, Tailwind 4.3.3 with the Morrow token utilities, `@/components/morrow` (L0), zod 4.6.7, @supabase/supabase-js 2.118.0 (admin client from L0), `sonner`, `next-themes` (L0's provider), Vitest 5.0.5, @playwright/test 1.64.1 (CLI screenshots).

**Spec:** `docs/ARCHITECTURE.md` §3 (routes `/archive`, `/me`), **§3a (Morrow, binding for visuals; it supersedes §3's fonts, colours, motion and the archive calendar)**, §7 (`daily_activity`, `streaks`), §9 (contracts, binding; §9.5 brand, §9.6 props and live channel, §9.7 decisions), §10.6–10.7, §12 (demo clock). Design: `design/project/README.md` (principles, Voice and copy, Learning, Archive, Motion), `design/project/components/index.d.ts` (component APIs), `design/project/tokens.json`. Research: `docs/research/04-streaks-gamification.md` (R1–R8), `06-reading-experience-design.md` (F5–F7, F10), `03-…` (Morning Recall), `08-…` (fast-forward chart). Lane rules: `docs/PLAN.md` §3 (checkpoints), §4–5, §5a (scope decisions).

**Estimate:** about 2 h 50 min of core work (Tasks 0–13, at most 3.25 h): T0 5 · T1 10 · T2 15 · T3 25 · T4 10 (Checkpoint A) · T5 15 · T6 12 · T7 8 · T8 12 (Checkpoint B) · T9 10 · T10 12 · T11 15 · T12 8 · T13 10 (Checkpoint C) minutes. Morrow's ready components (Button, Segmented, TextField, TakeawayBox, EditionCard, ReadingProgress) replace the bespoke radio groups, form controls, ring and list rows, and its quiet rules remove the flame variants, ignite animation, celebration dialog, wave-1 heatmap and month calendar. The stretch tasks (14–16, about 1 h) run only if every checkpoint is green.

## Global Constraints

- Rolling integration: merge your first vertical slice (fixtures OK) at Checkpoint A 14:30, then again at B 15:30; end-to-end green by C 16:30.
  - L7's slices: A = Tasks 0–4 (live channel, streak engine, routes); B = Tasks 5–8 (streak line, recall, done-for-today, `/me` shell with demo clock); C = Tasks 9–13 (archive grid, learning tabs, gates).
- Import every type from `@/contracts/*` (`StreakView`, `StreakState`, `DayStatus`, `HeatmapDay`, `SignalEvent`, `SignalType`, `RecallQuestion`, `ArticleCard`, `Edition`, `ArchiveEntry`, `LearningView`, `WeightDelta`, `InterestWeight`, `SimulationResult`, `Presentation`, `Profile`, `TopicNode`). Never redefine one. Zod schemas come from `@/contracts/api` (`StreakResponseSchema`, `DemoClockRequestSchema`, `DemoClockResponseSchema`, `ProfilePatchSchema`, `InterestEditSchema`, `FastForwardRequestSchema`, plus `ROUTES` for fetch paths). Fixtures come from `@/contracts/fixtures`: `FIXTURE_STREAK`, `FIXTURE_HEATMAP`, `FIXTURE_EDITION`, `FIXTURE_ARCHIVE`, `FIXTURE_LEARNING`, `FIXTURE_INTEREST_WEIGHTS`, `FIXTURE_SIMULATION`, `FIXTURE_PROFILE`, `FIXTURE_TAXONOMY`.
- Cross-lane server functions (§9.3), used as-is: `getProfile(userId)` (`@/server/profile`, L3), `getLearningView(userId, sinceDays, now)` (`@/server/learn`, L3), `listArchive(userId, limit)` (`@/server/edition`, L3), `getTaxonomy()` (`@/server/onboarding`, L5).
- Edit only: `src/server/streaks/**`, `src/app/(reader)/archive/**`, `src/app/(reader)/me/**`, `src/components/{streak,recall,learning,archive}/**` (including `streak/live.ts`), `src/app/api/me/streak/route.ts`, `src/app/api/demo/clock/route.ts`, `docs/handoff/L7.md`, `docs/handoff/screens/L7-*.png`. No `package.json` edits and no new dependencies.
- Component props are exactly §9.6 (no extra props): `StreakChip({ streak?: StreakView })`, `MorningRecallCard({ questions: RecallQuestion[]; editionId: string })`, `DoneForToday({ edition: Edition; readIds: string[]; streak: StreakView | null })`, `ArchiveCalendar({ entries: ArchiveEntry[]; month?: string })`. L7-internal components may have any props.
- Next 16: `params` and `searchParams` are Promises (`const { tab } = await searchParams`). Server Components by default; `'use client'` goes on interactive leaves only. Route cookies use `NextResponse.json(...).cookies.set/delete` (verified on Context7 `/vercel/next.js`, v16 docs, 2026-10-17). Server pages use `getSessionUser()` + `getProfile()` and `redirect('/start')`; route handlers use `requireUser()` (§9.7).
- Pure modules never read the clock. Routes and pages call `requestNow()` from `@/server/time` and pass `now` down. A reader's day = `localDate(at, tz)` (03:00 rollover); tz = `profile.tz`, default `'Asia/Karachi'`.
- Streak rules (§9.7 + §10.7): a QR is an `open` plus a `dwell` on the same article with `value ≥ 20000` (`meta.mode 'sheet'`) or `≥ 8000` (`meta.mode 'bytes'`), **or** `read_original`, **or** `qr_scan`, **or** `recall_answer`. A streak day is any day with ≥ 1 QR. **Wave 1 has no freezes or repair** (PLAN §5a): a missed day breaks the streak, `StreakView.freezesAvailable` is always `0`, and `frozen` / `repairable` are never emitted. The stretch rules for Task 15: freezes are earned 1 per 7 consecutive days, held at most 2, start at 1 and are applied automatically; repair covers exactly 1 missed day with no freeze left, within 48 h, by answering yesterday's recall, at most once per 14 days. `longest` and `total_days` only grow. `at_risk` = ≥ 20:00 local while pending. Milestones are 3, 7, 14, 30, 50, 100, each shown as one calm line (a one-line sonner note and a line in the streak sheet); there is no full-screen moment.
- Edition complete = ≥ 5 stories read **and** the recall answered (no recall that day counts as answered). It is exposed as `StreakView.editionComplete` (with `todayStoriesRead`), shown as a Morrow `ReadingProgress` in the streak sheet, and never affects the streak.
- Copy follows the design README "Voice and copy": calm, short, sentence case; "you" and "your paper", never "I" or "our AI"; buttons are verbs; no exclamation marks, no emoji; dates short in lists ("Sat 17 Oct"). No shame copy, no red "lost" state, no leaderboards, nothing paid. A broken streak leads with "{totalDays} reading days so far".
- **Design (Morrow, binding; ARCHITECTURE §3a):** read `design/project/README.md` and `design/project/components/index.d.ts` before the first UI task (they supersede the frontend-design skill's visual direction), and load the `dataviz` skill before the simulation chart (method only; the colours stay Morrow's).
  - **Compose, never restyle,** the Morrow components from `@/components/morrow`. Do not rebuild what it provides (buttons, segmented controls, text fields, takeaway boxes, edition cards, progress bars, section headers, icons). The one sanctioned state colour is the answered recall option (Task 6).
  - Tokens only, no hex: `bg-paper`, `bg-paper-raised`, `bg-paper-sunk`, `border-rule`, `border-rule-strong`, `text-ink`, `text-ink-soft`, `text-ink-muted`, `text-press`, `bg-press-soft`, `text-pen`, `bg-pen-soft`, `font-news`, `font-ui`, `rounded-control`, `rounded-card`, `shadow-floating` (floating panels only). Type classes: `headline-xl|lg|md|sm`, `deck`, `body-text`, `body-sm`, `kicker`, `dateline`, `ui-label`, `ui-text`, `ui-button`, `ui-meta`.
  - Colour: `press` is the one brand accent (at most one accent Button per screen). `pen` means "the paper learned this" (learned changes, movers, focus) and nothing else. No section colour-coding, no `sec-*` classes, no emoji, no flames, badges or confetti.
  - Kickers and datelines are uppercase through CSS; never type text in caps.
  - Fonts (Newsreader, Libre Franklin, UnifrakturMaguntia) are self-hosted at `src/app/fonts` and loaded by L0; L7 uses the classes only. The blackletter appears only in Morrow's own nameplate (the EditionCard title "The Morrow", `BRAND.nameplate`).
- A11y (WCAG 2.2 AA): buttons ≥ 44 px, chips ≥ 40 px, Morrow's `focus-ring` on every control, every gesture also has a button and a key, state is never shown by colour alone (icon or fill shape + text), and `aria-live="polite"` for result announcements.
- Motion is quiet (README "Motion and states"): CSS `transition-colors duration-150` on colour changes and `duration-300` on progress fills, `motion-reduce:transition-none`. No slide-in, no scale or ignite effects, no printing animations; L7 does not use the `motion` package.
- zod 4: `z.iso.datetime({ offset: true })` (verified on Context7 `/colinhacks/zod`). Supabase: `.upsert(rows, { onConflict: 'user_id,local_date', ignoreDuplicates })` (verified on Context7 `/websites/supabase`).
- `DEMO_MODE=1` gates `/api/demo/clock`, the Fast-forward button, the demo controls and `?fixtures=1`. In production `?fixtures=1` is honoured only when `DEMO_MODE=1`.
- Wrap every `localStorage` access in try/catch; the UI must work without it.
- Commits use `feat|test|fix|chore(streaks|recall|learning|archive|me): …` and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Run `git push` after every task.

## Review Focus

1. **Late-night reads (00:00–02:59 local)** count for the previous edition day, and they still show `at_risk`. Pinned in Task 2 (`localHour 1`) and Task 3 (event at `2026-10-17T21:30:00Z`).
2. **Replayed or duplicated event batches** (sendBeacon retries, refreshes, the recall card re-sending) must not inflate `qualifying_reads` or `stories_read`. Counts are distinct per article per day. Pinned in Task 3 (same batch sent twice).
3. **Supabase down inside `/api/events`:** `recordActivity` must never throw into L3's `processSignals`. It returns a fallback `StreakView`. Pinned in Task 3 (throwing repo).
4. **Demo clock moved backwards** ("Reset clock" after "Next morning"): `daily_activity` rows dated after `today` are ignored, not counted and not crashed on. Pinned in Task 2.
5. **Empty data:** day 1 has no recall, there are no reads today, an archive has no entries, and the learning view has no movers. Each must show a calm empty state, never a broken card. Pinned in Tasks 6, 7, 9 and 10 (`[]` inputs render the empty-state copy or `null`).
6. **Morrow compliance:** no bespoke control where a Morrow component exists, no `sec-*` / hex / `motion` imports in L7 files, `pen` only on learned or personalized things. Checked in Task 13 (grep).

---

### Task 0: Worktree setup, stub audit, draft PR

**Files:** Create: `docs/handoff/L7.md` (skeleton)

- [ ] **Step 1: Branch.** Run `git fetch origin && git rev-parse --abbrev-ref HEAD`. Expected: `lane/L7-engagement`. If not, run `git switch -c lane/L7-engagement origin/main`.
- [ ] **Step 2: Env and deps.** Run `cp /d/Documents/fast_Ai_Heckathon/.env.local ./.env.local && npm ci`. Expected: exit 0. Set the model cache with `export MODEL_CACHE_DIR="$USERPROFILE/.cache/subah-models"` (PowerShell: `$env:MODEL_CACHE_DIR="$env:USERPROFILE\.cache\subah-models"`). Make sure `.env.local` contains `DEMO_MODE=1`.
- [ ] **Step 3: Baseline.** Run `npm run typecheck`. Expected: exit 0 on the L0 stubs.
- [ ] **Step 4: Stub audit.** Run `grep -rnE "export (function|const) (StreakChip|MorningRecallCard|DoneForToday|ArchiveCalendar|publishStreak|useLiveStreak)" src` and `ls src/components/morrow src/app/fonts src/components/ui src/components/shell 2>/dev/null`. Confirm the stubs match the §9.6 props, that `src/components/streak/live.ts` exists, and that `@/components/morrow` exports the 15 components of `design/project/components/index.d.ts`; record any mismatch in `docs/handoff/L7.md` for the integrator (the §9.6 props win). Also record whether `dialog`/`tabs`, the Sonner `<Toaster>` and the next-themes provider (themes `morning` / `night`) exist. If a primitive is missing, use native `<dialog>` and a hand-built `role="tablist"`.
- [ ] **Step 5: Commit, push, draft PR.**
```bash
git add docs/handoff/L7.md && git commit -m "chore(streaks): start L7 handoff notes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -u origin lane/L7-engagement
gh pr create --draft --base main --title "L7: Engagement: streaks, recall, learning UI, archive" --body "Plan: docs/plans/L7-engagement.md · Handoff: docs/handoff/L7.md"
```
Expected: a draft PR URL is printed.

### Task 1: Live streak channel `src/components/streak/live.ts` (L4 depends on it, so ship it first)

**Files:** Modify (replace L0 stub): `src/components/streak/live.ts`. Create: `src/components/streak/live.test.ts`

**Interfaces:**
- Produces (§9.6, exact): `publishStreak(s: StreakView): void`; `useLiveStreak(initial?: StreakView | null): StreakView | null`. Plus L7-internal helpers `getLiveStreak(): StreakView | null` and `subscribeLiveStreak(fn: () => void): () => void`.

- [ ] **Step 1: Failing tests:**
  - `getLiveStreak()` is `null` before any publish.
  - `publishStreak(FIXTURE_STREAK)` calls a subscribed listener once, and `getLiveStreak()` returns it; after the unsubscribe the listener is not called again.
  - `renderToStaticMarkup` of a probe component calling `useLiveStreak(FIXTURE_STREAK)` renders `FIXTURE_STREAK.current` (server snapshot = `initial`).
- [ ] **Step 2:** Run `npx vitest run src/components/streak/live.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** a module-level store (a `Set` of listeners). `useLiveStreak` uses `useSyncExternalStore(subscribeLiveStreak, () => getLiveStreak() ?? initial ?? null, () => initial ?? null)`.
- [ ] **Step 4:** Run the same command and `npm run typecheck`. Expected: PASS, exit 0.
- [ ] **Step 5:** Commit `feat(streaks): live streak channel` and push.

### Task 2: Pure `computeStreak` (tests first)

**Files:** Create: `src/server/streaks/compute.ts`, `src/server/streaks/compute.test.ts`

**Interfaces:**
- Consumes: `addDays(date, n)` from `@/server/time`. If importing it pulls in `next/headers` and breaks vitest, copy a 3-line UTC date-add into `compute.ts`.
- Produces:
```ts
export const MILESTONES = [3, 7, 14, 30, 50, 100] as const;
export interface DayRecord { date: string; status: 'read' | 'frozen' | 'repaired'; qualifyingReads: number; storiesRead: number; editionComplete: boolean; } // wave 1 writes only 'read' rows
export interface StreakComputation { view: StreakView; lastStreakDate: string | null; }
export function computeStreak(days: DayRecord[], today: string, localHour?: number): StreakComputation; // localHour default 12
```
The function replays everything, so `streaks` stays a rebuildable cache. Task 15 (stretch) adds a 4th `freeze` parameter and the freeze fields to `StreakComputation` without changing these call sites.

- [ ] **Step 1: Write the failing tests.** Helper `reads(from, to)` builds `{status:'read', qualifyingReads:1, storiesRead:1, editionComplete:false}` rows. `today = '2026-10-17'`. Test names → assertions:
  - `new reader` → `computeStreak([], T)`: `state 'new'`, `current 0`, `freezesAvailable 0`, `todayStoriesRead 0`, `editionComplete false`, `last7.length 7`, `last7[6]` equals `{date:'2026-10-17', status:'today'}`.
  - `read today only` → `done_today`, `current 1`, `totalDays 1`, `milestone null`, `todayQualified true`, `todayStoriesRead 1`. With `editionComplete:true` on today's row → `editionComplete true`.
  - `pending before 20:00` → reads 10-15..16, hour 10 → `pending`, `current 2`.
  - `at_risk after 20:00 and before 03:00` → the same days at hour 21 → `at_risk`; at hour 1 → `at_risk`; at hour 19 → `pending`.
  - `row with zero QRs does not count` → `{date:T, status:'read', qualifyingReads:0, storiesRead:2, editionComplete:false}` → `new`, `todayStoriesRead 2`.
  - `milestone 3` → reads 10-15..17 → `milestone 3`. Reads 10-11..17 → `milestone 7`. Reads 10-10..17 → `null`. Reads 10-10..16 with today unread → `null`.
  - `a missed day breaks the streak` → reads 10-10..15, today unread, hour 9 → `broken`, `current 0`, `longest 6`, `totalDays 6`, `freezesAvailable 0`, `last7[5].status 'missed'`.
  - `broken keeps longest and totalDays` → reads 10-01..10 plus a today read → `done_today`, `current 1`, `longest 10`, `totalDays 11`, `freezesAvailable 0`.
  - `ignores future rows and input order` → reverse-sorted reads 10-15..16 plus rows 10-18 and 10-19 → equal to the result without them (`toEqual`).
- [ ] **Step 2:** Run `npx vitest run src/server/streaks/compute.test.ts`. Expected: FAIL (`computeStreak` is not exported).
- [ ] **Step 3: Implement.** The spec leaves the replay order open, so here it is fixed:
```
rows = dedupe by date (keep max qualifyingReads and storiesRead, OR editionComplete), drop date > today
counts(r) = r && r.status === 'read' && r.qualifyingReads >= 1          (frozen/repaired rows: Task 15)
todayStoriesRead = row(today)?.storiesRead ?? 0; editionComplete = row(today)?.editionComplete ?? false   (set in every state, incl. 'new')
if no counting row ≤ today → state 'new'
run=0 longest=0 total=0
for d = first counting date … today−1: counts(row(d)) ? (run++, total++) : run=0; longest=max(longest,run)
today counts → run++, total++; longest=max(longest,run)
state: new → done_today → (run>0: hour≥20||hour<3 ? at_risk : pending) → broken
current = run (0 when broken); freezesAvailable = 0; milestone = done_today && MILESTONES∋current ? current : null
last7[i] for today−6…today: today&&!todayQ→'today' · counts→'read' · else 'missed'
```
- [ ] **Step 4:** Run the same command. Expected: PASS (9 tests).
- [ ] **Step 5:** Commit `feat(streaks): pure computeStreak with states and milestones` and push.

### Task 3: QR rules, repo, `recordActivity` / `getStreak` / `getHeatmap`, clock helpers

**Files:** Create: `src/server/streaks/activity.ts`, `activity.test.ts`, `clock.ts`, `clock.test.ts`, `repo.ts`, `index.test.ts`. Modify (replace L0 stub): `src/server/streaks/index.ts`

**Interfaces:**
- Consumes: `computeStreak`, `DayRecord` (Task 2); `localDate`, `addDays` from `@/server/time`; `createSupabaseAdminClient()` from `@/server/db/admin`; `FIXTURE_STREAK`.
- Produces:
```ts
// activity.ts
export interface DayEvent { type: SignalType; articleId: string | null; value: number | null; meta: Record<string, unknown>; }
export interface DaySummary { qualifyingReads: number; storiesRead: number; recallCorrect: number; recallTotal: number; }
export function toDayEvent(e: SignalEvent): DayEvent;
export function summarizeDay(events: DayEvent[]): DaySummary;
export function heatmapLevel(storiesRead: number): 0 | 1 | 2 | 3 | 4;
export function buildHeatmap(rows: DayRecord[], today: string, days: number): HeatmapDay[];
// clock.ts
export function localHour(now: Date, tz: string): number;              // Intl hourCycle 'h23'
export function nextMorningIso(now: Date, tz: string): string;         // addDays(localDate(now,tz),1) at 07:00 in tz, as UTC ISO
// repo.ts
export interface StreakRepo {
  loadDays(userId: string): Promise<DayRecord[]>;                      // incl. edition_complete
  loadDayEvents(userId: string, date: string): Promise<DayEvent[]>;
  loadRecallCount(userId: string, date: string): Promise<number>;      // editions.recall length for that edition_date
  upsertDay(userId: string, date: string, s: DaySummary & { editionComplete: boolean }): Promise<void>;
  upsertStreakRow(userId: string, c: StreakComputation): Promise<void>;  // freezes 0, last_repair_at null in wave 1
}                                                                      // Task 15 adds upsertStatusDays and lastRepairAt
export function supabaseStreakRepo(): StreakRepo;
export function memoryStreakRepo(seed?: { days?: DayRecord[]; events?: Record<string, DayEvent[]>; recallCount?: number }): StreakRepo & { days: DayRecord[]; streakRow: unknown };
// index.ts (§9.3, exact)
export function recordActivity(userId: string, events: SignalEvent[], now: Date, tz: string): Promise<StreakView>;
export function getStreak(userId: string, now: Date, tz: string): Promise<StreakView>;
export function getHeatmap(userId: string, days: number, now: Date, tz: string): Promise<HeatmapDay[]>;
export function recordActivityWith(repo: StreakRepo, userId: string, events: SignalEvent[], now: Date, tz: string): Promise<StreakView>;
export function getStreakWith(repo: StreakRepo, userId: string, now: Date, tz: string): Promise<StreakView>;
```
Routes and pages get `tz` from `getProfile(userId)` (L3), not from this module.

- [ ] **Step 1: Write the failing tests.**
  - `activity.test.ts`:
    - `open + 25 s sheet dwell is one QR` → `summarizeDay([open a1 {mode:'sheet'}, dwell a1 25000 {mode:'sheet'}])` = `{qualifyingReads:1, storiesRead:1, recallCorrect:0, recallTotal:0}`.
    - `12 s sheet dwell is read but not qualifying` → `{qualifyingReads:0, storiesRead:1}`.
    - `bytes 9 s qualifies` → open a1 + dwell a1 9000, both `meta:{mode:'bytes'}` → `qualifyingReads 1`. A 9000 dwell with `mode 'sheet'` → `0`.
    - `dwell without an open does not qualify` → dwell a1 25000 alone → `qualifyingReads 0`.
    - `read_original, qr_scan and recall_answer qualify` → three different articles → `qualifyingReads 3`, `storiesRead 2`, `recallTotal 1`, `recallCorrect 1` (recall `articleId 'a9'`, value 1, `meta.chosen 0`).
    - `impression, skip and pdf_download never qualify` → `qualifyingReads 0`, `storiesRead 0`.
    - `duplicates are counted once` → the same 4 events twice → identical summary.
    - `heatmap levels` → 0→0, 1→1, 2→1, 3→2, 4→2, 5→3, 9→3, 10→4.
    - `buildHeatmap(rows, '2026-10-17', 84)` → length 84, `[0].date '2026-07-26'`, `[83].date '2026-10-17'`, missing days have `storiesRead 0`.
  - `clock.test.ts`:
    - `nextMorningIso(new Date('2026-10-17T05:00:00Z'),'Asia/Karachi')` → `'2026-10-18T02:00:00.000Z'`.
    - At `'2026-10-17T20:30:00Z'` (01:30 PKT on the 18th) → `'2026-10-18T02:00:00.000Z'`.
    - `localHour(new Date('2026-10-17T16:00:00Z'),'Asia/Karachi')` → `21`.
  - `index.test.ts` (all with `memoryStreakRepo`, `tz 'Asia/Karachi'`):
    - `first QR of the day lights the streak` → events `[open a1, dwell a1 25000]` (sheet) at `2026-10-17T05:00:00Z` → `state 'done_today'`, `current 1`, `todayStoriesRead 1`. The repo day `'2026-10-17'` has `qualifyingReads 1`.
    - `02:30 PKT counts for the previous day` → the same events at `2026-10-17T21:30:00Z` → the repo day is `'2026-10-17'`.
    - `same batch twice does not inflate` → two calls → `qualifyingReads 1`, `storiesRead 1`.
    - `milestone only on the transition` → seed reads 10-15..16; first call → `milestone 3`; second call the same day → `milestone null`.
    - `edition complete needs 5 reads and the recall` → recallCount 3, 5 opens plus 3 recall answers → the upserted day has `editionComplete true` and the view has `editionComplete true`, `todayStoriesRead 5`; with 2 recall answers → `false`. With recallCount 0, 5 opens → `true`.
    - `repo failure returns a fallback, never throws` → a repo whose `loadDays` rejects → it resolves to a `StreakView` with `state 'new'`, `freezesAvailable 0`, `todayStoriesRead 0`, `editionComplete false` (and `FIXTURE_STREAK` when `process.env.DEMO_FALLBACK='1'`).
- [ ] **Step 2:** Run `npx vitest run src/server/streaks`. Expected: FAIL (missing exports).
- [ ] **Step 3: Implement** `activity.ts` and `clock.ts`. The QR key set (keyed by `articleId`): an article with an `open` and a `dwell` with `value ≥ 20000` (`meta.mode` `'sheet'` or missing) or `value ≥ 8000` (`meta.mode 'bytes'`); or `read_original`; or `qr_scan`. `recall_answer` → key `recall:${articleId}`. `storiesRead` counts distinct articleIds over `open`, the qualifying dwells, `read_original` and `qr_scan`. The first answer per recall key decides `recallCorrect`. For `nextMorningIso`, get the tz offset with `Intl.DateTimeFormat('en-US',{timeZone:tz,timeZoneName:'longOffset'})`.
- [ ] **Step 4: Implement `repo.ts`** with the admin client (`daily_activity` ordered by `local_date` and limited to 400, selecting `edition_complete`; `events` filtered `eq('local_date', d)`; upserts use `onConflict: 'user_id,local_date'`; the `streaks` upsert uses `onConflict: 'user_id'`). Implement `memoryStreakRepo` with the same semantics.
- [ ] **Step 5: Implement `index.ts`.** `recordActivityWith`:
  1. Compute `date` and `hour`, then `prior = computeStreak(loadDays, date, hour)`.
  2. `summary = summarizeDay(loadDayEvents ∪ events.map(toDayEvent))` (a union works whichever order L3's `processSignals` inserts in), then `upsertDay` with `editionComplete = storiesRead≥5 && recallTotal≥loadRecallCount`.
  3. `next = computeStreak(loadDays, date, hour)` (its view carries `todayStoriesRead` and `editionComplete` from today's row), then `upsertStreakRow`.
  4. Return `{...next.view, milestone: !prior.view.todayQualified && next.view.todayQualified ? next.view.milestone : null}`.
  (Task 15 inserts the repair and auto-freeze persistence steps here.)
  Wrap the whole body in try/catch. On error: `console.error` and return the fallback. The public functions call the `*With` versions with `supabaseStreakRepo()`. `getStreak` always returns `milestone: null`.
- [ ] **Step 6:** Run `npx vitest run src/server/streaks && npm run typecheck`. Expected: PASS, exit 0.
- [ ] **Step 7:** Commit `feat(streaks): recordActivity, getStreak, getHeatmap with QR rules` and push.

### Task 4: Routes `GET /api/me/streak` and `POST /api/demo/clock`

**Files:** Modify/Create: `src/app/api/me/streak/route.ts`, `src/app/api/demo/clock/route.ts`, `src/app/api/demo/clock/route.test.ts`

**Interfaces:**
- Consumes: `requireUser()` (`@/server/auth/session`), `requestNow()`, `getProfile` (`@/server/profile`), `getStreak`, `getHeatmap`; `StreakResponseSchema`, `DemoClockRequestSchema`, `DemoClockResponseSchema` (`@/contracts/api`).
- Produces: `GET → { streak: StreakView; heatmap: HeatmapDay[] }` (84 days, `StreakResponseSchema`); `POST { now: string | null } → { now: string }` (`DemoClockRequestSchema` → `DemoClockResponseSchema`).

- [ ] **Step 1: Failing tests** (clock route; call `POST(new Request(url,{method:'POST',body}))` directly):
  - `404 unless DEMO_MODE=1` → `DEMO_MODE` unset → `res.status 404`.
  - `sets the cookie` → `DEMO_MODE='1'`, body `{now:'2026-10-18T02:00:00.000Z'}` → 200, JSON `{now:'2026-10-18T02:00:00.000Z'}` (passes `DemoClockResponseSchema`), `(res as NextResponse).cookies.get('subah_now')?.value === '2026-10-18T02:00:00.000Z'`, and `set-cookie` contains `Path=/`.
  - `stores UTC` → body `{now:'2026-10-18T07:00:00+05:00'}` → cookie value `'2026-10-18T02:00:00.000Z'`.
  - `null clears it` → `{now:null}` → `cookies.get('subah_now')?.value === ''` (an expired cookie), and `now` parses as a valid date.
  - `rejects junk` → `{now:'tomorrow'}` → 400.
- [ ] **Step 2:** Run `npx vitest run src/app/api/demo`. Expected: FAIL.
- [ ] **Step 3: Implement.** Clock: parse the body with `DemoClockRequestSchema` (400 `{ error, issues }` on failure; also 400 if `Date.parse(now)` is NaN), then `res.cookies.set('subah_now', new Date(now).toISOString(), { path:'/', httpOnly:true, sameSite:'lax', maxAge: 2592000 })` (ISO 8601 UTC, §9.7) or `res.cookies.delete('subah_now')`; respond with the effective time. Streak: `const { userId } = await requireUser()` (if a `Response` is thrown, return it), `now = await requestNow()`, `tz = (await getProfile(userId))?.tz ?? 'Asia/Karachi'`, `export const dynamic = 'force-dynamic'`.
- [ ] **Step 4:** Run `npx vitest run src/app/api/demo && npm run typecheck`. Expected: PASS. Then run `npx next dev -p 3007` in the background and `curl -s -X POST localhost:3007/api/demo/clock -H 'content-type: application/json' -d '{"now":null}'`. Expected: `{"now":"2026-…Z"}`.
- [ ] **Step 5:** Commit `feat(streaks): streak and demo clock routes` and push.

### Task 5: Quiet StreakChip, StreakSheet, StreakStrip, MilestoneToast, preview page

**Files:** Create: `src/components/streak/{StreakChip.tsx (replace stub),StreakPanel.tsx,StreakSheet.tsx,StreakStrip.tsx,MilestoneToast.tsx,copy.ts,copy.test.ts}`, `src/app/(reader)/me/preview/page.tsx`

**Interfaces:**
- Consumes: `useLiveStreak` (Task 1); `ROUTES.streak` → `StreakResponseSchema`; `Button`, `ReadingProgress` from `@/components/morrow`; `toast` from `sonner`.
- Produces: `StreakChip({ streak?: StreakView })` (§9.6; when `streak` is absent, e.g. in the L0 TopBar, it fetches `/api/me/streak` on mount); `StreakSheet({ open: boolean; onOpenChange: (o: boolean) => void; streak: StreakView })`; `StreakPanel({ streak: StreakView })` (reused by `/me`); `StreakStrip({ last7: StreakView['last7'] })` (reused by `/archive`, Task 9); `chipLabel(v: StreakView): string` (aria-label); `chipText(v: StreakView): string` (visible line); `sheetHeadline(v: StreakView): string`; `milestoneLine(n: number): string | null`.

- [ ] **Step 1: Failing tests** in `copy.test.ts`:
  - `chipLabel` for `{state:'done_today',current:12}` → `'Reading streak: 12 days, read today'`; for `new` → `'Read 1 story to start your streak'`.
  - `chipText` for `{state:'done_today',current:6}` → `'6-day streak'`; `at_risk` with current 6 → `'6-day streak · read 1 story today'`; `new` → `'Start a streak'`; `broken` with totalDays 42 → `'42 reading days'`.
  - `sheetHeadline` for `broken` with totalDays 42 → `'42 reading days so far'`.
  - `milestoneLine(3)` → `'Three mornings in a row.'`; `(7)` → `'A week of mornings.'`; `(30)` → `'A month of mornings.'`; `(2)` → `null`.
  - All three state functions switch over all 7 `StreakState` values (TS exhaustiveness); the `frozen` and `repairable` copy tests live in Task 15.
  - A render test: `renderToStaticMarkup(<StreakChip streak={FIXTURE_STREAK}/>)` contains `data-state="${FIXTURE_STREAK.state}"`, `class="dateline"` and `chipText(FIXTURE_STREAK)`.
- [ ] **Step 2:** Run `npx vitest run src/components/streak`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **Chip:** a Morrow `Button variant="ghost"` (default size, 44 px target) whose child is `<span className="dateline">{chipText(v)}</span>` (rendered uppercase by CSS: "6-DAY STREAK"), with `v = useLiveStreak(streak ?? fetched ?? null)`. No icon, flame, badge or animation. `aria-label = chipLabel(v)`, `aria-haspopup="dialog"`, `data-state={v.state}`. It renders nothing while `v` is `null`.
  - **Sheet:** a native `<dialog>` (or L0's dialog primitive) on `bg-paper-raised border border-rule rounded-card shadow-floating`: a bottom panel under 640 px, a right panel above. It appears with a 150 ms fade (instant with reduced motion), no slide. Esc and a ghost `Button` "Close" close it, and focus returns to the chip. Content: `sheetHeadline` in `headline-sm`, then `StreakPanel`.
  - **`StreakStrip`:** 7 small squares (12 px, `rounded-none`) for `last7`: `bg-ink` filled = read, `border border-rule-strong` outlined = missed, today unread = outlined with a dashed border. Weekday initials sit under them in `ui-meta`, and each square has visually hidden text ("Sat 17 Oct: read"), so the state is never colour alone.
  - **`StreakPanel`:** the `StreakStrip`; one `ui-meta` line "Current {current} · Longest {longest} · {totalDays} reading days"; the milestone line `milestoneLine(highest milestone ≤ current)` in `body-sm text-ink-soft` (omitted below 3); and today's paper as `ReadingProgress({ value: min(todayStoriesRead/5, 1), label: editionComplete ? "Today's paper is complete" : "{n} of 5 stories today" })`. (The freezes line is added in Task 15.)
  - **`MilestoneToast`** is mounted inside the chip. When the live streak's `milestone` is non-null and the localStorage key `subah:milestone:{n}` is unset, it calls `toast(milestoneLine(n))` once (one line, no title, no icon) and sets the key. Lines: 3 "Three mornings in a row.", 7 "A week of mornings.", 14 "Two weeks of mornings.", 30 "A month of mornings.", 50 "50 mornings in a row.", 100 "100 mornings in a row."
  - **Preview page:** `notFound()` unless `DEMO_MODE==='1'` or `NODE_ENV!=='production'`. It renders `<StreakChip streak={FIXTURE_STREAK} />` and, with `?open=sheet`, `<StreakSheet open streak={FIXTURE_STREAK} />`. Tasks 6 and 7 add their cards to it.
- [ ] **Step 4:** Run `npx vitest run src/components/streak && npm run typecheck`. Expected: PASS, exit 0.
- [ ] **Step 5: Browser check.** With the dev server on 3007, run `npx playwright install chromium`, then for each width W of 390 and 1280: `npx playwright screenshot --viewport-size=W,900 --full-page --wait-for-timeout=1500 "http://localhost:3007/me/preview?fixtures=1&open=sheet" docs/handoff/screens/L7-chip-sheet-W.png`. Expected: the chip reads as a dateline ("6-DAY STREAK"), and the sheet shows the strip, the stats line, the milestone line and the progress bar in ink on paper, with no horizontal scroll at 390.
- [ ] **Step 6:** Commit `feat(streaks): quiet streak line, sheet, 7-day strip and milestone note` and push.

### Task 6: MorningRecallCard

**Files:** Modify/Create: `src/components/recall/MorningRecallCard.tsx`, `src/components/recall/recall-state.ts`, `src/components/recall/recall-state.test.ts`

**Interfaces:**
- Consumes: `useSignals(editionId)` → `track` (§9.4; L4's hook already calls `publishStreak` after every flush, so the card does not); `Button`, `Icon` from `@/components/morrow`; the `mw-takeaway*` frame classes from Morrow's `bundle.css`.
- Produces: `MorningRecallCard({ questions: RecallQuestion[]; editionId: string })`; `answerEvent(q: RecallQuestion, chosen: 0|1|2, editionId: string): SignalEvent`; `recallScore(answers: Record<string, number>, qs: RecallQuestion[]): { correct: number; total: number }`.

- [ ] **Step 1: Failing tests:**
  - `answerEvent(q, q.answerIndex, 'e1')` → `{type:'recall_answer', articleId:q.articleId, editionId:'e1', value:1, meta:{chosen:q.answerIndex}}` (§9.7). A wrong choice gives `value 0`.
  - `recallScore` → 2 of 3 right gives `{correct:2,total:3}`.
  - `renderToStaticMarkup(<MorningRecallCard editionId="e1" questions={[]}/>)` → `''`.
  - With `FIXTURE_EDITION.recall` the markup contains `class="mw-takeaway"`, a `kicker` element with the text `Morning recall`, 3 `<fieldset`, 9 `mw-btn--secondary` buttons, and `Skip for today`.
- [ ] **Step 2:** Run `npx vitest run src/components/recall`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **Frame (styled like a TakeawayBox):** Morrow's `TakeawayBox` puts item text in a `<p>`, which cannot hold a fieldset, so the card reuses its frame classes: `<aside className="mw-takeaway" aria-label="Morning recall">`, `<h2 className="mw-takeaway__title kicker">Morning recall</h2>` (CSS shows "MORNING RECALL"), and an `<ol className="mw-takeaway__list">` of up to 3 questions (`questions.slice(0,3)`), all visible at once, each an `mw-takeaway__item` with its `mw-takeaway__num`.
  - **Question:** a `<fieldset>` with the question as `<legend className="headline-sm">` and its 3 options as full-width Morrow `Button variant="secondary"` (≥ 44 px). Keys 1/2/3 answer the first unanswered question.
  - **On tap:** `track(answerEvent(...))`, then lock that question. The chosen Button gets the one sanctioned state colour through `className`: `bg-pen-soft text-pen` when right, `bg-press-soft text-press` when wrong (150 ms colour transition). It also gets an `Icon` `check` or `x` plus the text "Right" or "Not quite" (never colour alone), and one line of `explanation` in `body-sm text-ink-soft` follows, announced via `aria-live="polite"`. Once all are answered, a `ui-meta` footer reads "You remembered {c} of {t}."
  - **Skip:** a ghost `Button` "Skip for today".
  - **Persistence:** keep answers and a dismissal in localStorage (`subah:recall:{editionId}`). Hide the card after Skip, or on the next visit once it is finished.
  - **Never block:** it is an inline card (no modal) that fits the 1fr column above the fold (§3a), does not trap focus, and does not delay the paper.
- [ ] **Step 4:** Run `npx vitest run src/components/recall`. Expected: PASS.
- [ ] **Step 5:** Add the card to the preview page, then take screenshots at 390 and 1280 of `/me/preview?fixtures=1` → `docs/handoff/screens/L7-recall-{390,1280}.png`. Tap an option in Chrome (or `node -e` with a Playwright click) and check that the chosen option turns pen or press, the explanation appears, and `/api/events` gets a POST in the network log.
- [ ] **Step 6:** Commit `feat(recall): morning recall card` and push.

### Task 7: DoneForToday ("Three things you learned")

**Files:** Create/Modify: `src/components/recall/{DoneForToday.tsx,three-things.ts,three-things.test.ts}`

**Interfaces:**
- Consumes: `MorningRecallCard` (Task 6, reused for "Quiz me now"), `useLiveStreak` (Task 1), `TakeawayBox`, `Button` from `@/components/morrow`.
- Produces: `pickThreeThings(edition: Edition, readIds: string[]): { articleId: string; section: string; headline: string; fact: string; recall: RecallQuestion | null }[]`; `doneStreakLine(v: StreakView): string`; `DoneForToday({ edition: Edition; readIds: string[]; streak: StreakView | null })` (§9.6). There is no separate ThreeThingsCard: Morrow's `TakeawayBox` is the card.

- [ ] **Step 1: Failing tests:**
  - `readIds ['a3','a1']` → 2 things in that order (readIds arrive most dwell first). `fact` = `keyFact ?? whyItMatters ?? summary.brief`. `section` = `edition.sectionNames[item.sectionSlug] ?? item.sectionSlug`. `recall` = `article.recall` (`ArticleCard.recall`, may be `null`).
  - 5 readIds → length 3. `[]` → `[]`. Ids not in `edition.items` are skipped.
  - `doneStreakLine` → `done_today` with current 4 gives `'Day 4 of your streak. See you tomorrow at 7.'`; `pending` with current 4 gives `'Read one story to keep your 4-day streak.'`; `broken` with totalDays 42 gives `'42 reading days so far.'`
  - Render with `readIds []` → contains `That&#x27;s your paper for today.` and `Read a story and its key fact lands here.`, and no `mw-takeaway` and no `Quiz me now`. Render with the ids of 3 `FIXTURE_EDITION` items whose `article.recall` is set → contains `Three things you learned`, 3 `mw-takeaway__item`, `Tomorrow&#x27;s Morning Recall will ask about these.` and `Quiz me now`.
- [ ] **Step 2:** Run `npx vitest run src/components/recall/three-things.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **Content, top to bottom:**
    - "That's your paper for today." in `headline-md`.
    - `TakeawayBox({ title: 'Three things you learned', items: things.map(t => ({ kicker: t.section, text: t.fact })), footnote: "Tomorrow's Morning Recall will ask about these." })`. With no reads, the box is replaced by "Read a story and its key fact lands here." in `ui-text text-ink-muted`.
    - The quiet streak line `doneStreakLine(live)` in `ui-meta` (omitted while the live streak is `null`), with `live = useLiveStreak(streak)`.
    - A secondary `Button` "Quiz me now", shown only when ≥ 1 thing has a `recall`. It opens an inline `MorningRecallCard` with those questions and `edition.id`.
  - No ring, badge or celebration.
- [ ] **Step 4:** Run `npx vitest run src/components/recall`. Expected: PASS.
- [ ] **Step 5:** Add the card to the preview page (with `readIds` = the first 3 fixture ids). Screenshots → `docs/handoff/screens/L7-done-{390,1280}.png`.
- [ ] **Step 6:** Commit `feat(recall): done-for-today with three things you learned` and push.

### Task 8: `/me` shell and the "Streak & settings" tab with demo controls

**Files:** Create: `src/app/(reader)/me/page.tsx` (replace stub), `src/app/(reader)/me/_data.ts`, `src/components/learning/MeTabs.tsx`, `src/components/streak/{SettingsPanel.tsx,DemoControls.tsx}`

**Interfaces:**
- Consumes: `getSessionUser`, `getProfile`, `requestNow`, `getStreak`, `getLearningView(userId, 7, now)`, `getTaxonomy()`, `nextMorningIso`, `StreakPanel`; `Segmented`, `TextField`, `Button`, `SectionHeader` from `@/components/morrow`; `useTheme` from `next-themes` (L0's provider writes `data-theme`); L3 routes `PATCH /api/me/profile` (`ProfilePatchSchema` → `Profile`), `POST /api/editions/rebuild` (`{date?}`); `POST /api/demo/clock`.
- Produces: `loadMeData(searchParams): Promise<MeData>` where `MeData = { profile: Profile; streak: StreakView; learning: LearningView | null; taxonomy: TopicNode[]; demoMode: boolean; nextMorning: string; clockIso: string | null; fixtures: boolean }`; `MeTabs({ initialTab: 'learned'|'interests'|'streak'; data: MeData })`; `budgetOptions: SegmentedOption[]` (`[{value:'5',label:'Quick',hint:'5 min'},{value:'15',label:'Standard',hint:'15 min'},{value:'30',label:'Deep',hint:'30 min'}]`).

- [ ] **Step 1: Implement the page.**
  - `const sp = await searchParams`. Without fixtures: no user, or `getProfile()` returns `null` → `redirect('/start')`. `tz = profile.tz`. `getLearningView` errors become `learning: null` (Task 10 shows Retry). `clockIso` = the `subah_now` cookie, or `null`. `?fixtures=1` uses `FIXTURE_PROFILE`, `FIXTURE_STREAK`, `FIXTURE_LEARNING`, `FIXTURE_TAXONOMY`.
  - **`MeTabs`:** tabs "Your paper learned" / "Your interests" / "Streak & settings" in `ui-button`, the active one underlined with a 2 px `border-ink` (no fill, no colour coding). They sync to `?tab=` with `router.replace(…, { scroll:false })` and support arrow-key navigation (L0's Radix Tabs, or `role="tablist"` by hand).
  - **"Streak & settings" tab:** `SectionHeader title="Your streak"` + `StreakPanel`, then `SectionHeader title="Settings"` + `SettingsPanel`, then `DemoControls`.
  - **`SettingsPanel`** (initial values from `profile.presentation` and `profile.city`):
    - `Segmented label="Paper length"` with `budgetOptions` (Quick 5 / Standard 15 / Deep 30; `Number(value)` as `TimeBudget`, default 15);
    - `Segmented label="Depth"` (New to it / Know the basics / Expert → `new|basics|expert`);
    - `TextField label="City" hint="For local news and weather"`;
    - a primary `Button` "Save" → PATCH `/api/me/profile`, then a `ui-meta` line "Saved. Tomorrow's paper will use this." and a secondary `Button` "Rebuild today's paper" (POST rebuild, then `router.refresh()`);
    - `Segmented label="Theme"` with Morning / Night edition → `setTheme('morning' | 'night')`.
  - **`DemoControls`** (only when `demoMode`): a `dateline` "Demo clock · {formatted clockIso or 'real time'}" and two ghost `Button`s. "Next morning" (`iconRight="arrow-right"`) does POST clock `{now: nextMorning}` → POST `/api/editions/rebuild` `{}` → `router.refresh()`. "Reset clock" does POST `{now:null}` → `router.refresh()`. Both are `disabled` with the label "Moving the clock…" while busy, and on error a sonner toast "Couldn't move the clock. Try again." The group is labelled "Demo controls" (research 03: be honest about time travel).
- [ ] **Step 2:** Run `npm run typecheck && npm run lint`. Expected: exit 0.
- [ ] **Step 3: Browser check.** Signed in via `/demo` (or with fixtures), open `/me?tab=streak`, click "Next morning" and check that the "Demo clock" dateline shows the next day at 07:00. Toggle Theme and check `<html data-theme="night">`. Then visit `/today` and expect the Morning Recall card when L3 is merged; until then, record "rebuild 404/stub" in the handoff. Screenshots `L7-me-streak-{390,1280}.png` from `?fixtures=1&tab=streak`.
- [ ] **Step 4:** Commit `feat(me): me tabs shell, settings and demo clock controls` and push.

### Task 9: `/archive` grid of Morrow EditionCards by week, with the 7-day strip

**Files:** Create: `src/app/(reader)/archive/page.tsx` (replace stub), `src/components/archive/{ArchiveCalendar.tsx (replace stub),ArchiveGrid.tsx,archive-weeks.ts,archive-weeks.test.ts}`

**Interfaces:**
- Consumes: `getSessionUser`, `getProfile`, `requestNow`, `localDate`, `addDays`, `listArchive(userId, 60)` (`@/server/edition`, L3), `getStreak`, `StreakStrip` (Task 5), `EditionCard`, `SectionHeader`, `Icon` from `@/components/morrow`, `FIXTURE_ARCHIVE`, `FIXTURE_STREAK`.
- Produces: `archiveWeeks(entries: ArchiveEntry[], today: string): ArchiveWeek[]` with `ArchiveWeek = { weekStart: string; label: string; cards: ArchiveCardData[] }` and `ArchiveCardData = { date: string; dateLabel: string; number: number; headline: string; storiesRead: number; qualified: boolean; href: string; pdfHref: string; today: boolean }`; `ArchiveGrid({ weeks: ArchiveWeek[] })`; `ArchiveCalendar({ entries: ArchiveEntry[]; month?: string })` (§9.6 export and props kept). It is an async Server Component that derives `today = localDate(await requestNow(), tz)` (tz from `getProfile`, default `'Asia/Karachi'`), keeps only `month`'s entries when `month` is given, and renders `<ArchiveGrid weeks={archiveWeeks(entries, today)} />`. The design's grid makes a month calendar unnecessary.

- [ ] **Step 1: Failing tests** (`today = '2026-10-17'`, a Saturday; weeks start on Monday):
  - `archiveWeeks` sorts newest first (shuffled input). The card for `'2026-10-16'` has `dateLabel 'Fri 16 Oct'`, `href '/paper/2026-10-16'` and `today false`; `pdfHref` = `entry.pdfUrl` when set, else `'/api/editions/2026-10-16/pdf'`. The card for `'2026-10-17'` has `today true`.
  - Entries on 10-17, 10-12 and 10-11 → 2 weeks with labels `['This week', 'Week of 5 Oct']`, `weekStart` `'2026-10-12'` and `'2026-10-05'`, and 2 cards in the first.
  - `archiveWeeks([], T)` → `[]`.
  - `renderToStaticMarkup(<ArchiveGrid weeks={[]}/>)` contains `Your first paper lands here tomorrow morning.`; with `archiveWeeks(FIXTURE_ARCHIVE, T)` it contains one `mw-edition` per entry, `No. ${FIXTURE_ARCHIVE[0].number}`, and a `dateline` week label.
- [ ] **Step 2:** Run `npx vitest run src/components/archive`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **Page:** no user or no profile → `redirect('/start')`. At the top, `SectionHeader title="Past editions"`, then `StreakStrip({ last7: streak.last7 })` from `getStreak(userId, now, tz)` with the caption "Your last 7 mornings" in `ui-meta`. Below it, `<ArchiveCalendar entries={entries} />`. `?fixtures=1` → `FIXTURE_ARCHIVE` + `FIXTURE_STREAK`.
  - **Grid:** for each week, an `<h3 className="dateline">` label ("This week" / "Week of 5 Oct", uppercase by CSS) and a grid of Morrow `EditionCard({ date: dateLabel, edition: number, headline, href, pdfHref, today })` (the card shows "Today", its own Read and PDF buttons and the nameplate title). The grid is 1 column under 640 px, 2 at ≥ 640 and 3 at ≥ 1024, with `gap-6`. Under each card a `ui-meta` line reads "{n} stories read", plus `Icon check` and "Streak day" when `qualified`.
  - **Empty state:** "Your first paper lands here tomorrow morning." in `ui-text text-ink-muted`.
  - Old papers are never regenerated: the cards link to `/paper/{date}` and the stored PDF.
- [ ] **Step 4:** Run `npx vitest run src/components/archive && npm run typecheck`. Expected: PASS. Screenshots `L7-archive-{390,1280}.png` from `/archive?fixtures=1`.
- [ ] **Step 5:** Commit `feat(archive): edition-card grid by week with the 7-day strip` and push.

### Task 10: "Your paper learned" tab: MoversList, ChangeSummary, SignalTimeline, plus the shared InterestBars

**Files:** Create: `src/components/learning/{LearnedTab.tsx,InterestBars.tsx,MoversList.tsx,ChangeSummary.tsx,SignalTimeline.tsx,learning-view.ts,learning-view.test.ts}`

**Interfaces:**
- Consumes: `MeData.learning` (server-side `getLearningView`, Task 8); `GET /api/me/learning?since=7` → `LearningView` for Retry; `FIXTURE_LEARNING`; `Button`, `Icon`, `SectionHeader` from `@/components/morrow`.
- Produces: `deltaLabel(before: number, after: number): string`; `barRows(weights: InterestWeight[], movers: WeightDelta[], override?: Record<TopicSlug, number>): BarRow[]` with `BarRow = { slug; name; level; theta; delta: number | null; children: BarRow[] }`; `timelineLabel(type: SignalType): string`; `InterestBars({ rows: BarRow[]; dayLabel?: string; renderControls?: (row: BarRow) => ReactNode })`; `LearnedTab({ initial: LearningView | null })`.

- [ ] **Step 1: Failing tests:**
  - `deltaLabel(0.42,0.54)` → `'+12 pts'`; `(0.5,0.47)` → `'−3 pts'`; `(0.5,0.5)` → `'no change'`.
  - `barRows` → level-1 rows sorted by theta desc, with each child nested under its `ancestorsOf()[0]` root. Muted rows are excluded. A mover's delta lands on its slug. `override {'sports': 0.9}` replaces that theta.
  - `timelineLabel` → `'open'` gives `'Opened'`, `'skip'` gives `'Skipped'`, `'recall_answer'` gives `'Answered recall'`, `'read_original'` gives `'Read the original'`.
  - Render `LearnedTab` with `initial {...FIXTURE_LEARNING, movers: [], timeline: []}` → contains `Read a few stories and your paper starts adjusting.`
- [ ] **Step 2:** Run `npx vitest run src/components/learning`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **Layout order:** ChangeSummary → Movers → Timeline → FastForward (Task 11). `InterestBars` is built here and used by the Interests tab (Task 12) and the day-1 vs day-7 map (Task 11).
  - **Change summary:** `changeSummary` as one sentence in `deck`, then "Since {sinceDate, short}" in `dateline`.
  - **Movers:** "Up" and "Down" lists in `ui-text`: the topic name, then `deltaLabel` in `text-pen` with `Icon plus` / `Icon minus` (pen = the paper learned this).
  - **Timeline:** the last 20 entries in an `<ol>`, each one `ui-meta` line "{time ago} · {label} · {headline} → {effect}".
  - **`InterestBars`:** each row shows the topic name in `ui-text`, then a thin ink bar (a 4 px `bg-ink` fill at theta % width on a `bg-paper-sunk` track; the width transitions over 300 ms, `motion-reduce:transition-none`), then the learned change when `delta` is set: "+12 pts" / "−3 pts" in `text-pen` with the matching `Icon`. Rows with children expand through a ghost `Button` disclosure (`aria-expanded`, `Icon chevron-right`). There is no per-topic or per-section colour.
  - **Data:** renders `initial` straight away. When it is `null`, show "Couldn't load your learning just now." with a secondary `Button` "Try again" (fetches `/api/me/learning?since=7`, with `bg-paper-sunk` skeleton lines while loading).
- [ ] **Step 4:** Run `npx vitest run src/components/learning`. Expected: PASS. Screenshots `L7-me-learned-{390,1280}.png` (`/me?fixtures=1&tab=learned`).
- [ ] **Step 5:** Commit `feat(learning): movers, change summary, signal timeline and ink interest bars` and push.

### Task 11: SimulationChart, day-1 vs day-7 interest map, and "Fast-forward 7 days"

**Files:** Create: `src/components/learning/{SimulationChart.tsx,InterestMapDiff.tsx,FastForward.tsx,sim-geometry.ts,sim-geometry.test.ts}`

**Interfaces:**
- Consumes: `POST /api/demo/fast-forward {days:7}` (`FastForwardRequestSchema`) → `SimulationResult` (L3); `barRows(…, override)` and `InterestBars` (Task 10).
- Produces: `simSeries(r: SimulationResult): { key: 'learning'|'onboardingOnly'|'popularity'; label: string; points: { day: number; value: number }[] }[]`; `linePath(points, box: { w: number; h: number; pad: number }, maxDay: number): string`; `simPrimaryView(r: SimulationResult): 'chart' | 'map'`; `editionDiff(r: SimulationResult, k?: number): { entered: TopicSlug[]; left: TopicSlug[]; kept: TopicSlug[] }` (k default 5); `SimulationChart({ result: SimulationResult | null; upToDay?: number })`; `InterestMapDiff({ weights: InterestWeight[]; result: SimulationResult })`; `FastForward({ weights: InterestWeight[]; demoMode: boolean; initial?: SimulationResult })`.

- [ ] **Step 1: Failing tests:**
  - `simSeries(FIXTURE_SIMULATION)` → 3 series labelled `'Learning'`, `'Onboarding only'`, `'Popularity'`, and `points[i].value === FIXTURE_SIMULATION.learning[i].precisionAt20`.
  - `linePath([{day:1,value:0},{day:2,value:1}], {w:100,h:100,pad:0}, 2)` → `'M0,100L100,0'`.
  - `simPrimaryView` compares the last day's `precisionAt20`: learning 0.62 vs onboarding-only 0.56 → `'chart'`; 0.58 vs 0.55 → `'map'`; learning below onboarding-only → `'map'`.
  - `editionDiff` with first snapshot `{a:.9,b:.8,c:.1}` and last `{a:.9,c:.85,b:.2}`, `k 2` → `{entered:['c'], left:['b'], kept:['a']}`.
- [ ] **Step 2:** Run `npx vitest run src/components/learning/sim-geometry.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **Chart:** an SVG with viewBox 640×280 on `paper`, gridlines in `stroke-rule`, axis text in `ui-meta`. One y-axis for precision@20 from 0–100 % (ticks 0/25/50/75/100) and an x-axis "Day 1…7".
  - **Series (Morrow colours only, no rainbow palette):** 2 px lines. Learning is `stroke-pen` solid (pen = the paper learned this). Onboarding only is `stroke-ink` dashed `6 4`. Popularity is `stroke-ink-muted` dotted `2 4`. Each has a direct label at its line end in `ui-meta`, plus a legend.
  - **Hover:** a crosshair and tooltip (`bg-paper-raised border-rule rounded-card shadow-floating`, `ui-meta`) on hover or focus (an invisible per-day hit rect, also reachable with the arrow keys). A ghost `Button` "Show table" reveals a `<table>`.
  - **Colours:** take the Morning and Night hex values of `pen`, `ink` and `ink-muted` from `design/project/tokens.json` and run `node <dataviz>/scripts/validate_palette.js "<hex,hex,hex>" --mode light` (then `--mode dark`). Expected: no FAIL against `paper`. If it flags `ink` vs `ink-muted` as too close, keep them (Morrow allows no other colours): the dash patterns and direct labels are the encoding. Record the output in the handoff.
  - **`InterestMapDiff`:** two `InterestBars` side by side (stacked under 640 px) under `dateline` labels "Day 1" = `barRows(weights, [], snapshots[0].weights)` and "Day 7" = `barRows(weights, [], snapshots.at(-1).weights)`, plus the edition diff from `editionDiff(result)` as one `deck` line, e.g. "Your paper now leads with Space and AI policy; Celebrity dropped out of the top 5." `SimulationResult` carries no article lists, so the diff is the top-5 topic mix from the snapshots (measured numbers only).
  - **Primary visual, decided at runtime:** once a result exists, `simPrimaryView(result)` picks the order. `'chart'` (learning beats onboarding-only by ≥ 0.05 precision@20 on the last day) → the chart first, `InterestMapDiff` below. `'map'` (a gap under 0.05) → `InterestMapDiff` first under the heading "Day 1 vs day 7: what your paper learned", and the chart second. Both stay on the page; only the order and the heading level change.
  - **FastForward:** rendered only when `demoMode`.
    - A secondary `Button` "Fast-forward 7 days" (`icon="play"`) POSTs, then steps through `snapshots` day 0→7 at 600 ms per frame. During playback it drives the "Day 7" side of `InterestMapDiff` via `override` (its label reads "Day {n}") and `SimulationChart upToDay`, shows a `dateline` "Day {n} of 7", and announces it through `aria-live`. The bars change width with the 300 ms progress transition only; nothing slides.
    - Reduced motion → jump straight to the last frame.
    - On error → toast "The simulator didn't answer. Try again." and show no numbers (only measured numbers are ever shown). `FIXTURE_SIMULATION` is used only with `?fixtures=1`.
- [ ] **Step 4:** Run `npx vitest run src/components/learning`. Expected: PASS. Run Chrome at 1280: click Fast-forward and confirm the bars move, 3 lines are drawn in pen, ink and ink-muted only, and the day-1 vs day-7 map appears in the order `simPrimaryView` gives for that result (record which one in the handoff). Screenshots `L7-me-sim-{390,1280}.png`.
- [ ] **Step 5:** Commit `feat(learning): simulation chart, day-1 vs day-7 map and fast-forward playback` and push.

### Task 12: "Your interests" tab: InterestEditor

**Files:** Create: `src/components/learning/{InterestEditor.tsx,interest-edit.ts,interest-edit.test.ts}`

**Interfaces:**
- Consumes: `MeData.learning.weights` and `.movers` (`FIXTURE_INTEREST_WEIGHTS` with fixtures); `PATCH /api/me/interests` (`InterestEditSchema`: `{ slug; action: 'pin'|'unpin'|'mute'|'unmute'|'set'; value?: number }`) → `InterestWeight[]` (L3, which logs `weight_edit` through `processSignals`); `barRows` and `InterestBars` (Task 10, tree shape); `Button`, `SectionHeader` from `@/components/morrow`. The tab keeps this list editor rather than L5's `InterestPicker`: the §9.6 picker value (`picks`/`blocked`) carries no pin or weight. Adding an "Add topics" section with `InterestPicker({ taxonomy: MeData.taxonomy, value, onChange, mode: 'edit' })` is optional.
- Produces: `effectCopy(action: 'pin'|'unpin'|'mute'|'unmute'|'set', name: string, value?: number, before?: number): string`; `InterestEditor({ weights: InterestWeight[] })`.

- [ ] **Step 1: Failing tests:**
  - `effectCopy('pin','Cricket')` → `"Tomorrow's paper will always include Cricket."`
  - `('mute','Celebrity')` → `"Tomorrow's paper will leave out Celebrity."`
  - `('set','AI',0.8,0.5)` → `"Tomorrow's paper will lean more on AI."`
  - `('set','AI',0.3,0.5)` → `"Tomorrow's paper will lean less on AI."`
  - Render `InterestEditor` with `FIXTURE_INTEREST_WEIGHTS` → contains `Your interests`, `data-slot="tell-your-editor"`, one `type="range"` per visible row and `aria-pressed`.
- [ ] **Step 2:** Run `npx vitest run src/components/learning/interest-edit.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `SectionHeader title="Your interests"`, an empty `<div data-slot="tell-your-editor" />` (reserved for wave 2, see "Wave 2 slot" after Task 13), then the `InterestBars` tree grouped by root (learned changes from `movers` marked in pen with "+" / "−"), with each row's edit controls beside its bar.
  - **Row controls:** "Pin" and "Mute" as Morrow `Button variant="secondary"` with `aria-pressed` (the pressed one reads "Pinned" / "Muted"), and a native `<input type="range" min=0 max=100 className="accent-ink">` labelled "{name} weight" that sends `set` with `value/100` on `change` (keyboard-friendly).
  - **Updates:** optimistic. Replace the state with the response, revert on error (with the toast "Couldn't save that change. Try again."), and show `effectCopy` in an `aria-live` `ui-meta` line.
  - Muted rows stay listed (name in `text-ink-muted` with a "Muted" label) so they can be unmuted.
- [ ] **Step 4:** Run `npx vitest run src/components/learning && npm run typecheck`. Expected: PASS. Screenshots `L7-me-interests-{390,1280}.png`.
- [ ] **Step 5:** Commit `feat(learning): your interests editor with pin, mute and weight` and push.

### Task 13: Gates, keyboard pass, handoff

- [ ] **Step 1:** Run `npm run typecheck && npm run lint && npm test && npm run build`. Expected: all exit 0.
- [ ] **Step 2: Morrow check.** Run `grep -rnE "sec-|#[0-9a-fA-F]{3,6}\b|from 'motion|font-headline|font-body|text-accent|Fraunces|Bricolage|Playfair|confetti|Flame" src/components/{streak,recall,learning,archive} "src/app/(reader)/archive" "src/app/(reader)/me"`. Expected: no matches. Also check that no file defines its own button, segmented control, text field or edition card (they come from `@/components/morrow`), and that no user-facing copy has an exclamation mark or speaks as "I" / "our AI".
- [ ] **Step 3: Keyboard pass** (Chrome at 1280, Tab and Shift+Tab only) on `/me/preview?fixtures=1`, `/archive?fixtures=1` and each `/me` tab.
  - The streak line opens the sheet with Enter, the sheet closes with Esc, and focus returns to the streak line.
  - Recall answers work with 1/2/3, and Skip is reachable.
  - Tabs and every Segmented switch with the arrow keys, and the weight slider moves with the arrows.
  - Every control shows Morrow's focus ring (2 px pen).
  - Record the result in the handoff.
- [ ] **Step 4:** Write `docs/handoff/L7.md` (see Handoff below). Commit `chore(streaks): L7 handoff and screenshots` and push. Mark the PR ready with `gh pr ready`.

### Wave 2 slot: "Tell your editor" on `/me` (no task in wave 1)

L7 builds this UI in wave 2 (PLAN §5a, L2 + L7). Wave 1 only reserves the `data-slot="tell-your-editor"` element in `InterestEditor` (Task 12), directly above the interest bars; nothing in wave 1 depends on it. The planned flow:
- A Morrow `TextField multiline label="Tell your editor what to change"` (e.g. "less cricket, more climate") → POST to a route that calls `mapTextToTopics(text)` (`@/server/enrich`, L2; the route name is agreed with L2 in wave 2) → `{ picks, blocked, provider }`.
- A proposed diff on the InterestBars, through `barRows(weights, [], override)` with the deltas shown in pen → primary `Button` **Confirm** (the human check; a ghost `Button` Cancel restores the bars).
- Confirm → `PATCH /api/me/interests` per change (L3 logs `weight_edit` through `processSignals`) → `POST /api/editions/rebuild` → `router.refresh()`, so the movers update live.

---

## Acceptance checks

| Command / action | Expected |
|---|---|
| `npx vitest run src/server/streaks` | All of compute (9), activity (9), clock (3) and index (6) pass |
| `npx vitest run src/components src/app/api/demo` | Live channel, copy (incl. `chipText`, `milestoneLine`), recall, three-things, archive-weeks, learning, sim (incl. `simPrimaryView`, `editionDiff`), interest-edit and clock-route tests pass |
| `npm run typecheck && npm run lint && npm test && npm run build` | exit 0 |
| `curl -s -X POST localhost:3007/api/demo/clock -H 'content-type: application/json' -d '{"now":"2026-10-18T02:00:00.000Z"}' -i` | 200, `set-cookie: subah_now=2026-10-18T02:00:00.000Z…`, body `{"now":"2026-10-18T02:00:00.000Z"}` (404 with `DEMO_MODE` unset) |
| `curl -s localhost:3007/api/me/streak` with a session cookie | JSON matching `StreakResponseSchema`, with `streak.todayStoriesRead`, `streak.editionComplete` and `heatmap.length === 84`; 401 without a session |
| `ls docs/handoff/screens/L7-*.png` | 16 files: chip-sheet, recall, done, archive, me-streak, me-learned, me-sim and me-interests, each at 390 and 1280, with no horizontal scroll at 390; every screen uses only Morrow paper, ink, pen and press (no section colours, no flame or emoji) |
| `/me?tab=streak` → "Next morning" | The demo clock dateline advances one day to 07:00 PKT, rebuild is called, and the page refreshes |
| Morrow check and keyboard pass (Task 13) | The grep has no matches; both recorded as passing in the handoff |

## Handoff (`docs/handoff/L7.md` contents)

1. **Done:** list `computeStreak` rules and its replay decisions:
   - wave 1 has no freezes or repair: a missed day breaks the streak and `freezesAvailable` is `0` (if Task 15 landed: frozen days hold +0, repaired days add +1 but do not count toward `totalDays`, and `repairable` shows the held run);
   - `at_risk` also covers 00:00–02:59;
   - a QR needs an `open` plus a mode-qualifying `dwell` on the same article (or read_original / qr_scan / recall_answer);
   - `editionComplete` treats a day with no recall questions as answered.
   Also list `recordActivity` / `getStreak` / `getHeatmap`, `live.ts`, both routes, every component with its exact props and the Morrow components it composes, `/archive` (EditionCard grid by week + 7-day strip), the `/me` tabs (with the reserved "Tell your editor" slot in Your interests), which primary view `simPrimaryView` chose on the real fast-forward result, the palette-validator output for pen/ink/ink-muted, `/me/preview` (dev or `DEMO_MODE` only), and which stretch tasks landed.
2. **Integration notes:**
   - L3's `processSignals` calls `recordActivity(userId, events, now, tz)` after inserting the events (either order works) and returns its view as `EventsResult.streak`.
   - L4 mounts `<StreakChip streak={...} />` in the Morrow `Masthead`'s `actions` slot (the L0 TopBar's bare `<StreakChip />` fetches on its own), `<MorningRecallCard questions={edition.recall} editionId={edition.id} />` at the top of the 1fr column above the fold (§3a), and `<DoneForToday edition={edition} readIds={readIds} streak={streak} />` in the end-of-paper block. `DoneForToday` already renders "That's your paper for today.", so L4 does not repeat that line. L4's `useSignals` calls `publishStreak(result.streak)` from `@/components/streak/live` after every flush.
   - `GET /api/me/streak` still returns the 84-day `heatmap` (contract); the wave-1 UI does not draw it (Task 14 stretch does).
3. **Stubbed or fallback:** the fixtures with `?fixtures=1`; `recordActivity` falls back to a neutral `StreakView` on any error.
4. **Env:** `DEMO_MODE=1`, plus optional `DEMO_FALLBACK=1` (the streak falls back to `FIXTURE_STREAK`).
5. **Verify:** the Acceptance checks table, the screenshot list, and the keyboard pass result.

## Cut line (PLAN.md §5.4: apply if L7 is late; never cut the streak chip, Morning Recall / 3 things, or the archive)

- Already applied at planning (PLAN §5a, §3a): streaks without freezes or repair (now in the stretch section below), and the archive as a Morrow EditionCard grid by week with no month calendar.
- The learning page is movers + the Your interests editor only (skip Task 10's timeline and Task 11's sim chart and interest map).

---

## Stretch tasks (stretch, only if green)

Start these only after Task 13 and only while every checkpoint is green, in this order (PLAN §5.6). Each one is additive: no core test or §9.6 prop changes, except where a task says so.

### Task 14 (stretch): 12-week reading heatmap in ink on `/me`

The month calendar is dropped: the Morrow archive is the EditionCard grid (Task 9).

**Files:** Create: `src/components/streak/{ReadingHeatmap.tsx,heatmap.test.ts}`. Modify: `src/components/streak/StreakPanel.tsx`, `src/app/(reader)/me/_data.ts`

**Interfaces:**
- Consumes: `getHeatmap(userId, 84, now, tz)`, `FIXTURE_HEATMAP`. `MeData` gains `heatmap: HeatmapDay[] | null`.
- Produces: `ReadingHeatmap({ days: HeatmapDay[] })`; `StreakPanel` gains an optional `heatmap?: HeatmapDay[] | null` and draws it below the stats when present.

- [ ] **Step 1: Failing test:** `renderToStaticMarkup(<ReadingHeatmap days={FIXTURE_HEATMAP}/>)` has 84 `<rect`, a `<title>` like `Sat 17 Oct · 4 stories`, and a visually hidden `<table>` with 84 body rows.
- [ ] **Step 2:** Run `npx vitest run src/components/streak`. Expected: FAIL.
- [ ] **Step 3: Implement** an SVG of 7 rows × 12 columns, 12 px square cells and a 2 px gap. Level 0 is an outlined `stroke-rule` cell; levels 1–4 are `fill-ink` at opacities .15/.35/.6/1 (one hue, ink only; load the `dataviz` skill). A `ui-meta` legend reads "Fewer · More".
- [ ] **Step 4:** Run `npx vitest run src/components/streak && npm run typecheck`. Expected: PASS. Re-take `L7-me-streak-{390,1280}.png`.
- [ ] **Step 5:** Commit `feat(streaks): ink reading heatmap on me` and push.

### Task 15 (stretch): Streak freezes and repair

**Files:** Modify: `src/server/streaks/{compute.ts,compute.test.ts,repo.ts,index.ts,index.test.ts}`, `src/components/streak/{StreakChip.tsx,StreakPanel.tsx,StreakStrip.tsx,copy.ts,copy.test.ts}`

**Interfaces:**
- Produces (added to Task 2; existing call sites keep working):
```ts
export const FREEZE_RULES = { start: 1, max: 2, earnEvery: 7, repairWindowDays: 2, repairCooldownDays: 14 } as const;
export interface FreezeState { available: number; progress: number; lastRepairDate: string | null; }
export const INITIAL_FREEZE: FreezeState; // { available: 1, progress: 0, lastRepairDate: null }
export interface StreakComputation { view: StreakView; lastStreakDate: string | null; freeze: FreezeState; autoFrozen: string[]; repairableDate: string | null; }
export function computeStreak(days: DayRecord[], today: string, localHour?: number, freeze?: FreezeState): StreakComputation; // freeze default INITIAL_FREEZE
// repo.ts, added to StreakRepo
upsertStatusDays(userId: string, dates: string[], status: 'frozen' | 'repaired'): Promise<void>;
upsertStreakRow(userId: string, c: StreakComputation, lastRepairAt?: string | null): Promise<void>;
```
`freeze` is the state at the **start** of the history.

- [ ] **Step 1: Failing tests.** In `compute.test.ts`, change Task 2's `new reader` to expect `freezesAvailable 1`, replace `a missed day breaks the streak` with `auto-applies a freeze`, and add the rest:
  - `earns a freeze every 7 days, capped at 2` → reads 10-11..17 from `{available:0,progress:0,lastRepairDate:null}` → `freezesAvailable 1`. Reads 10-04..17 with the default start → `2`.
  - `auto-applies a freeze` → reads 10-10..15, today unread, hour 9 → `frozen`, `current 6`, `freezesAvailable 0`, `autoFrozen ['2026-10-16']`, `last7[5].status 'frozen'`. Same days plus a persisted `{date:'2026-10-16', status:'frozen'}` row → same view, `autoFrozen []` (idempotent).
  - `repairable yesterday` → start `{available:0,…}`, reads 10-11..15 → `repairable`, `current 5`, `repairableDate '2026-10-16'`. Add a `repaired` row on 10-16 → `pending`, `current 6`. Add a today read as well → `done_today`, `current 7`, `milestone 7`, `totalDays 6`.
  - `repairable within 48 h` → start 0, reads 10-10..14 and 10-16 → `repairable`, `current 6`, `repairableDate '2026-10-15'`. After 48 h (start 0): reads 10-09..13 and 10-15..16 → `pending`, `current 2`, `longest 5`.
  - `repair cooldown 14 days` → start `{available:0,progress:0,lastRepairDate:'2026-10-08'}`, reads 10-11..15 → `broken`, `current 0`, `longest 5`. The same with `lastRepairDate '2026-10-02'` → `repairable`.
  - `two misses after the freeze runs out break the streak` → default start, reads 10-10..13 → `broken`, `longest 4`, `totalDays 4`, `autoFrozen ['2026-10-14']`.
  - In `index.test.ts`: `recall answer repairs yesterday` → seed reads 10-10..14 plus `{date:'2026-10-15', status:'frozen'}`; at 10-17 05:00Z send `recall_answer articleId 'a2' value 1 meta.chosen 0` → the repo has a `repaired` row on 10-16, and the view is `done_today` with `current 7` and `milestone 7`. `getStreak persists auto-frozen days` → seed reads 10-10..15, at 10-17 → `state 'frozen'`, and the repo now has a `frozen` row on 10-16.
  - In `copy.test.ts`: `chipLabel` for `frozen` with current 6 → `'Reading streak: 6 days. A freeze saved yesterday'`; `chipText` for `frozen` with current 6 → `'6-day streak · freeze used'`; `sheetHeadline` for `repairable` with current 12 → `"Catch up on yesterday's paper (3 questions) to keep your 12-day streak"`.
- [ ] **Step 2:** Run `npx vitest run src/server/streaks src/components/streak`. Expected: FAIL.
- [ ] **Step 3: Implement** `computeStreak` by replacing Task 2's loop with this replay:
```
rows dedupe: as Task 2, plus frozen|repaired wins over read
counts(r) = r && (r.status !== 'read' || r.qualifyingReads >= 1)
run=0 longest=0 total=0 f={...freeze} autoFrozen=[] repairable=null
for d = first counting date … today−1:
  r=row(d)
  repaired → run++, f.progress++, f.lastRepairDate=d
  read&counts → run++, total++, f.progress++
  frozen → f.available=max(0,f.available−1)                 (holds, +0)
  missed → if run==0: f.progress=0
           elif repairable: run=0, f.progress=0, repairable=null   (second miss)
           elif f.available>0: f.available−−, autoFrozen.push(d)    (holds, +0)
           elif diff(today,d)≤2 && (!f.lastRepairDate || diff(d,f.lastRepairDate)≥14): repairable=d (run held)
           else run=0, f.progress=0
  if f.progress==7 → f.progress=0, f.available=min(2,f.available+1)
  longest=max(longest,run)
today counts → run++, total++, f.progress++ (same earn check); longest=max(longest,run)
state: new → repairable → done_today → (run>0: hour≥20||hour<3 ? at_risk : yesterdayFrozen ? frozen : pending) → broken
current = run (the held run when repairable, 0 when broken); freezesAvailable = f.available
last7[i]: today&&!todayQ→'today' · repaired · frozen (row or autoFrozen) · read · else 'missed'
```
  - **`recordActivityWith`:** after step 1, if `prior.repairableDate` is set and the batch has a `recall_answer`, call `upsertStatusDays([d],'repaired')` and set `lastRepairAt = now`. After step 3, call `upsertStatusDays(next.autoFrozen,'frozen')` (frozen rows use `ignoreDuplicates: true`) and pass `lastRepairAt` to `upsertStreakRow`. `getStreakWith` also persists `autoFrozen`.
  - **UI (text only, no icons or badges):** the streak line reads "{n}-day streak · freeze used" for `frozen` and "{n}-day streak · catch up today" for `repairable`. `StreakStrip` draws a frozen or repaired day as a half-filled square with its hidden text. `StreakPanel` adds one `ui-meta` line "Freezes held: {n}. They cover a missed day automatically; you earn one every 7 days (max 2)."
- [ ] **Step 4:** Run `npx vitest run src/server/streaks src/components/streak && npm run typecheck`. Expected: PASS (compute 14, index 8).
- [ ] **Step 5:** Commit `feat(streaks): freezes and streak repair` and push. Update the handoff and the Acceptance counts.

### Task 16 (stretch): Hide-streak toggle, at-risk banner, "Still remember?"

- [ ] A `Segmented label="Streak"` (Show / Hide) in SettingsPanel (localStorage `subah:hide-streak`; the chip renders `null` when it is set). An at-risk note at most once per day (localStorage date key) as a one-line sonner note, with the copy "Your paper's still warm: 1 story keeps your {n}-day streak." A test for the once-per-day key logic. Commit `feat(streaks): hide toggle and gentle at-risk note`.
