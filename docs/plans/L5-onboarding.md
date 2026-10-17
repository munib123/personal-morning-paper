# L5 Onboarding, Landing & Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A first-time visitor goes from the landing page to their first personal paper in 60–90 s without signing up. The flow is 4 Morrow `OnboardingStep` frames (Welcome → Topics → In your words → Your routine), then a live preview of their first front page with "Build my paper". Around it: guest auth, a `/demo` persona sign-in, and a landing page that is one Masthead hero.

**Estimate:** core ≈ **2.75 h** (165 min, Tasks 0–10). Morrow ships the step frame, chips, segmented controls, text fields, masthead, story cards and buttons, so L5 builds no tiles, step frame, reveal animation or cycling masthead. Stretch ≈ 1 h (Tasks 11–13), started only if every checkpoint is green.

**Checkpoint map (PLAN.md §3, wave 1 starts 13:20):**
- **A 14:30:** Tasks 0–3 merged: `/start` with Welcome and the Topics drill-down on the real or fallback taxonomy. Steps 3–4 are placeholders.
- **B 15:30:** Tasks 4–7 merged: routine, in your words, the preview, guest save.
- **C 16:30:** Tasks 8–10 merged: `/demo`, the landing page, and the timed Playwright flow green end to end.

**Scope (ARCHITECTURE §2 Req 1 as superseded by §3a "Onboarding", PLAN.md §5a):**
- **Core:** "In your words", via `POST /api/onboarding/describe`. The Morrow design moved the cut describe-yourself idea into step 3.
- **Stretch:** the taste test (dropped by §3a; `OnboardingInput.taste` is sent as `[]`) and search-to-add.

**Architecture:**
- **State:** pure modules (`src/components/onboarding/lib/*`) hold every decision: the picker reducer, the draft/localStorage layer, the `OnboardingInput` builder, the describe keyword fallback and the finish orchestration.
- **UI:** thin client components compose the Morrow components from `@/components/morrow`.
- **Server queries** in `src/server/onboarding/*` (`getTaxonomy`, `getTasteCards`, §9.3) read Postgres. They fall back to `seed/taxonomy.json` / `@/contracts/fixtures` when the DB is empty or down.
  - `getTasteCards` now feeds the front-page preview, not a taste test.
  - `getLandingHeadlines` stays the L0 stub in core (stretch Task 13).
- **Writes:** L5 never writes user tables. It calls L3's `POST /api/onboarding`.

**Tech Stack:** Next.js 16.4.2 App Router (async `params`/`searchParams`, `src/proxy.ts` owned by L0), React 19.3, Tailwind 4.3 with the Morrow tokens (§3a), Morrow components (`@/components/morrow`, L0), `@supabase/ssr` 0.12.7 (`createSupabaseBrowserClient` from `@/lib/supabase/browser`, `createSupabaseServerClient` / `createSupabaseAdminClient` from `@/server/db/*`, all L0), zod 4.6.7, Vitest 5.0.5, @playwright/test 1.64.1. No animation library.

**Spec:**
- `design/project/README.md`: "Onboarding", "Voice and copy", "Color", "Motion and states", "Accessibility". Read it before the first UI task.
- `design/project/components/index.d.ts`: the 15 component APIs.
- `docs/ARCHITECTURE.md`:
  - §3a (binding for visuals), §2 Req 1, §3 routes, §5 env, §12 auth;
  - §9.1 contracts with `TimeBudget = 5 | 15 | 30`, plus the api.ts/fixtures names;
  - §9.3 `src/server/onboarding`, §9.5 `BRAND`, §9.6 `InterestPicker` props, §9.7 binding decisions.
- `docs/PLAN.md` (§3 checkpoints, §4 protocol, §5 cut line, §5a scope), `docs/research/05-onboarding-ux.md` (flow), `07-sources-taxonomy.md` (9 roots).

**APIs verified via Context7 on 2026-10-17:**
- `/supabase/ssr`: createServerClient `cookies: { getAll, setAll }`; `auth.getClaims()`.
- `/supabase/supabase`: `auth.signInAnonymously()`, `auth.signInWithPassword({ email, password })`.
- `/vercel/next.js` (canary docs, v16.2+): `redirect()` from `next/navigation` inside a GET route handler; `await cookies()`.
- `/microsoft/playwright`: `page.screenshot({ path, fullPage })`, `page.waitForRequest`, `request.postDataJSON()`, `webServer`, `use.viewport`.

## Global Constraints

**Contracts and props**
- Contracts are imported from `@/contracts/*` and never redefined:
  - types: `TopicNode`, `TopicSlug`, `rootOf`, `ancestorsOf`, `InterestPick` (`via: 'tile'|'chip'|'search'|'describe'`), `TasteCard`, `OnboardingInput`, `Presentation`, `TimeBudget` (`5 | 15 | 30`), `Depth`, `BRAND`;
  - zod (from `@/contracts/api`): `OnboardingInputSchema`, `OnboardingResponseSchema`, `DescribeRequestSchema`, `DescribeResponseSchema`, `TasteQuerySchema`, `TasteCardSchema`;
  - fixtures (from `@/contracts/fixtures`): `FIXTURE_TAXONOMY` (all 67 nodes), `FIXTURE_TASTE_CARDS` (8, 2 of them wildcards), `FIXTURE_ARTICLES` (28);
  - clients and server functions: `createSupabaseBrowserClient()`, and `mapTextToTopics` from `@/server/enrich` (L2).
- `InterestPicker` props are exactly §9.6: `{ taxonomy: TopicNode[]; value: { picks: InterestPick[]; blocked: TopicSlug[] }; onChange: (v: { picks: InterestPick[]; blocked: TopicSlug[] }) => void; mode: 'onboarding' | 'edit' }`.
  - It is a thin wrapper built from Morrow `TopicChip`. L7 `/me` reuses it.
- `OnboardingInput.taste` is always `[]` in core. L5 posts no `/api/events` during onboarding.
- **Contract gaps (do not redefine):** the routine's delivery time and step 3's "Sources to avoid" have no field in `OnboardingInput`.
  - Both are kept in the draft only and are not sent.
  - Record both in the handoff as a proposed L0 contract commit (`deliveryHour`, which maps to `profiles.delivery_hour`, default 7).

**Files**
- Edit only:
  - routes: `src/app/page.tsx`, `src/app/start/**`, `src/app/demo/route.ts`, `src/app/api/taste/route.ts`, `src/app/api/onboarding/describe/route.ts`;
  - modules: `src/components/onboarding/**`, `src/server/onboarding/**`;
  - tests and handoff: `e2e/L5-onboarding.spec.ts`, `docs/handoff/L5.md`, `docs/handoff/screens/L5-*.png`.
- No `package.json`, `playwright.config.ts`, `src/components/morrow/**`, `globals.css` or font edits. L0 owns the tokens and self-hosts the fonts at `src/app/fonts` (Newsreader, Libre Franklin, UnifrakturMaguntia).

**Flow rules**
- No sign-up wall. 4 steps, each `OnboardingStep` with `step={n} total={4}`, so it shows "Step N of 4".
- Skip ("Skip for now") on Topics (uses the defaults) and on In your words. Welcome and Routine are pre-filled.
- Minimum **3** picks. The disabled next button reads `Pick N more`.
- Defaults:
  - `presentation`: `timeBudget` **15** (Quick 5 / Standard 15 / Deep 30), depth **'basics'** (no control in onboarding; `/me` owns it), lang **'en'**;
  - city **'Islamabad'**, delivery **7:00**, tz from `Intl` else **'Asia/Karachi'**;
  - Skip-step-2 picks: `news`, `technical`, `sports`, `business` (via `'tile'`).
- Paper name is `BRAND.defaultPaperName(name)`, which returns **'The Morrow'** (§9.5). The first name appears only in the Masthead ear, "Prepared for {name}", via `reader`.
- Draft lives in localStorage key `subah:onboarding-draft:v2`. It moves to v2 because the shape changed, so v1 drafts are ignored. Every read and write is in try/catch.

**Morrow visuals (binding, §3a)**
- **Compose** from `@/components/morrow`, never restyle.
  - Use `OnboardingStep`, `TopicChip`, `TextField`, `Segmented`, `Button`, `Masthead`, `StoryCard`, `Icon`.
  - Never pass custom classes into them, and never override `mw-*` classes.
  - Layout around them uses Tailwind with the §3a names only:
    - colours: `bg-paper`, `bg-paper-sunk`, `border-rule`, `text-ink`, `text-ink-soft`, `text-ink-muted`, `text-pen`, `text-press`, `bg-press-soft`;
    - fonts: `font-news`, `font-ui`;
    - shape: `rounded-control`, `rounded-chip`;
    - type classes: `headline-*`, `deck`, `kicker`, `dateline`, `ui-label`, `ui-text`, `ui-meta`.
- **Colour:**
  - `press` is the one brand accent. At most one accent button per screen, and onboarding uses none (every main CTA is `primary`).
  - `pen` is for learned or personalized things only (links, focus, the describe result note).
- **No** section or topic colour-coding, no emoji (ignore `TopicNode.emoji`), no other fonts or palettes, no printing or typesetting animation, no confetti, no slide-in.
- **Motion:** only the components' own 150 ms colour and 300 ms progress transitions. Panels and steps appear without animation. Honour `prefers-reduced-motion`.

**Copy (Morrow "Voice and copy", sentence case, verbatim)**
- Speak to "you" and about "your paper", never "I" or "our AI". No exclamation marks.
- Buttons are verbs, and a disabled button says what is missing.
- Landing:
  - Masthead `title` default "The Morrow";
  - promise "One paper, every morning, about what you care about.";
  - sub "Takes about a minute to set up. No account needed.";
  - primary "Build my paper", links "Try the demo reader" and "See a sample PDF".
- Step 1:
  - title "Welcome to your paper"
  - description "One paper, every morning, about what you care about."
  - TextField label "First name", hint "It goes on your masthead. Optional."
  - next "Continue"
- Step 2:
  - title "What do you want to read about?"
  - description "Pick at least three. Tap › to get more specific. You can change this anytime."
  - next `Pick N more` (disabled), then "Continue"
- Step 3:
  - title "In your words"
  - description "Anything we missed? Describe it the way you would to a friend."
  - TextField label "Anything else you want in your paper?" (multiline), placeholder "More climate tech and Pakistani startups, less celebrity news"
  - secondary button "Add to my topics"
  - result note "Added to your paper. Remove anything that's wrong."
  - TextField "Sources to avoid", hint "Optional."
  - next "Continue"
- Step 4:
  - title "Your routine"
  - description "This changes how much you get, not what's in it."
  - Segmented "Paper length": Quick · 5 min / Standard · 15 min / Deep · 30 min
  - Segmented "Delivery time": 6:00 / 7:00 / 8:00
  - TextField "City", hint "For local news and weather."
  - next "Preview my paper"
- Preview:
  - dateline "A preview of your first front page", primary "Build my paper"
  - status "Setting today's paper · {k} of 20 stories"
  - error "Your paper couldn't be set. Check your connection and try again." with button "Try again"

**A11y**
- `TopicChip` exposes `aria-pressed`. The disclosure `›` is a separate Morrow `Button variant="ghost" size="sm" icon="chevron-right"` with `aria-expanded`, `aria-controls="panel-{slug}"` and `aria-label="Show {name} topics"`.
- Chips are ≥ 40 px and buttons ≥ 44 px (Morrow sizes), with ≥ 8 px gaps.
- An `aria-live="polite"` pick counter and an `aria-live` build status.
- `Segmented` is a radio group, and every field is a labelled `TextField`.
- On a step change, focus moves to the step's `h2`.

**Process**
- Rolling integration: merge your first vertical slice (fixtures OK) at Checkpoint A 14:30, again at B 15:30, end-to-end green by C 16:30.
- Dev server on port **3005**. Commit after every task (conventional message + trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`), then `git push`.

## Review Focus

1. **localStorage missing, full or corrupt** (Safari private mode, a JSON from an older shape): `loadDraft` returns `DEFAULT_DRAFT`, `saveDraft` returns `false`, and the flow never throws. Test in Task 1.
2. **Describe input** (`""`, 5 000 characters, `mapTextToTopics` throwing or returning slugs not in the taxonomy, the L0 stub returning nothing):
   - an invalid body gets a 400;
   - a throw falls back to `keywordTopics`;
   - unknown slugs are filtered out;
   - the button cannot double-submit.
   Test in Task 5.
3. **Hostile or empty `?picks=`** (`""`, `"../x"`, 500 slugs, unknown slugs): `/api/taste` still answers 200 with exactly 8 cards, so the preview never breaks. Test in Task 6.
4. **Finish fails** (anonymous sign-in rate-limited at the venue, `/api/onboarding` 500, or a body that fails `OnboardingResponseSchema`): the preview shows "Try again", the draft survives, and a second click does not double-submit. Test in Task 7.
5. **Odd names** (`"  ayesha  "`, 60 characters, an emoji only): `displayName` is trimmed and capped at 24 characters, whitespace-only becomes `null`, and the Masthead then omits the "Prepared for" ear. `paperName` is always `'The Morrow'`. Test in Task 1.

---

## File structure

| File | Responsibility |
|---|---|
| `src/components/onboarding/lib/draft.ts` | `OnboardingDraft`, defaults, localStorage I/O, `buildOnboardingInput` |
| `src/components/onboarding/lib/picker-state.ts` | `InterestPickerValue`/`InterestPickerProps` (§9.6), tree helpers, picker reducer, counter and CTA copy |
| `src/components/onboarding/lib/keywords.ts` | `keywordTopics`, the describe fallback over names and synonyms |
| `src/components/onboarding/lib/finish.ts` | `runFinish` (session → POST → editionDate), `buildStatus` |
| `src/components/onboarding/{InterestPicker,OnboardingFlow,WelcomeStep,InYourWordsStep,RoutineStep,FirstPagePreview}.tsx` | UI composed from `@/components/morrow` |
| `src/server/onboarding/{taxonomy,taste,index}.ts` | `getTaxonomy`, `getTasteCards` (§9.3) + pure selectors |
| `src/app/start/page.tsx`, `src/app/page.tsx`, `src/app/demo/route.ts`, `src/app/api/taste/route.ts`, `src/app/api/onboarding/describe/route.ts` | Routes |
| `e2e/L5-onboarding.spec.ts` | Real-browser verification, run with L0's root `playwright.config.ts` |

---

### Task 0: Worktree setup and draft PR (10 min)

**Files:** Create `docs/handoff/L5.md` (skeleton: "Status: in progress").

- [ ] **Step 1:** `git rev-parse --abbrev-ref HEAD`. Expected `lane/L5-onboarding`. Otherwise `git fetch origin; git switch -c lane/L5-onboarding origin/main`.
- [ ] **Step 2:** PowerShell: `Copy-Item D:\Documents\fast_Ai_Heckathon\.env.local .\.env.local; $env:MODEL_CACHE_DIR="$env:USERPROFILE\.cache\subah-models"; npm ci`. Expected: exit 0. Then `npx playwright install chromium`.
- [ ] **Step 3:** `npm run typecheck`. Expected: 0 errors on the L0 stubs.
- [ ] **Step 4: Confirm the L0 names this plan depends on.**
  - Run `Select-String -Path src/contracts/fixtures.ts,src/contracts/api.ts,src/contracts/profile.ts,src/lib/brand.ts,src/lib/supabase/browser.ts,src/components/morrow/index.ts*,src/components/onboarding/InterestPicker.tsx,src/server/onboarding/index.ts,src/server/enrich/index.ts -Pattern '^export'`.
  - Expected: the fixtures and the six schemas from the Global Constraints, and `TimeBudget = 5 | 15 | 30`. Also `BRAND.defaultPaperName` returning `'The Morrow'`, `createSupabaseBrowserClient`, and the 15 Morrow components (at least `OnboardingStep`, `TopicChip`, `TextField`, `Segmented`, `Button`, `Masthead`, `StoryCard`, `Icon`). Then the `InterestPicker` stub with the §9.6 props, the `getTaxonomy`/`getTasteCards` stubs and `mapTextToTopics`.
  - A missing or differently-shaped name is an L0 bug: note it in `docs/handoff/L5.md` and tell the integrator. Do not redefine it.
  - Read `design/project/README.md` and `design/project/components/index.d.ts`.
  - Check `package.json` for `@testing-library/react` and `jsdom`. If they are absent, component behaviour is covered by the pure reducers plus Playwright (no new deps).
- [ ] **Step 5:** Commit `chore(onboarding): start L5 lane handoff` → `git push -u origin lane/L5-onboarding` → `gh pr create --draft --base main --title "L5: Onboarding, landing & auth" --body "Plan: docs/plans/L5-onboarding.md"`. Expected: a PR URL is printed.

### Task 1: Draft store and OnboardingInput builder (15 min)

**Files:** Create `src/components/onboarding/lib/draft.ts`, test `src/components/onboarding/lib/draft.test.ts`.

**Interfaces:**
- Consumes: `OnboardingInput`, `OnboardingInputSchema`, `Presentation`, `InterestPick`, `BRAND`.
- Produces:
  - `type OnboardingDraft = { step: 1|2|3|4|5; name: string; picks: InterestPick[]; blocked: TopicSlug[]; words: string; avoidSources: string; presentation: Presentation; deliveryHour: 6|7|8; city: string; skipped: { picks: boolean; words: boolean } }` (step 5 = preview);
  - `DRAFT_KEY = 'subah:onboarding-draft:v2'`, `DEFAULT_PICKS: InterestPick[]`, `DEFAULT_DRAFT: OnboardingDraft`;
  - `loadDraft(storage?: Storage | null): OnboardingDraft`;
  - `saveDraft(d: OnboardingDraft, storage?: Storage | null): boolean`;
  - `clearDraft(storage?: Storage | null): void`;
  - `cleanName(raw: string): string | null`;
  - `buildOnboardingInput(d: OnboardingDraft, tz?: string): OnboardingInput`.

- [ ] **Step 1: Write failing tests.**

```ts
test('defaults', () => { expect(DEFAULT_DRAFT.presentation).toEqual({ timeBudget: 15, depth: 'basics', lang: 'en' }); expect(DEFAULT_DRAFT.city).toBe('Islamabad'); expect(DEFAULT_DRAFT.deliveryHour).toBe(7); expect(DEFAULT_PICKS.map(p => p.slug)).toEqual(['news','technical','sports','business']); });
test('loadDraft survives throwing / corrupt / old-shape storage', () => {
  const throwing = { getItem: () => { throw new Error('denied'); } } as unknown as Storage;
  expect(loadDraft(throwing)).toEqual(DEFAULT_DRAFT);
  expect(loadDraft(fakeStorage({ [DRAFT_KEY]: '{not json' }))).toEqual(DEFAULT_DRAFT);
  expect(loadDraft(fakeStorage({ [DRAFT_KEY]: JSON.stringify({ step: 9 }) }))).toEqual(DEFAULT_DRAFT);
  expect(loadDraft(fakeStorage({ [DRAFT_KEY]: JSON.stringify({ ...DEFAULT_DRAFT, presentation: { timeBudget: 10, depth: 'basics', lang: 'en' } }) }))).toEqual(DEFAULT_DRAFT);
  expect(loadDraft(null)).toEqual(DEFAULT_DRAFT); });
test('saveDraft returns false on quota error', () => { expect(saveDraft(DEFAULT_DRAFT, { setItem: () => { throw new DOMException('q','QuotaExceededError'); } } as unknown as Storage)).toBe(false); });
test('round-trips', () => { const s = fakeStorage({}); const d = { ...DEFAULT_DRAFT, step: 3 as const, name: 'Ayesha' }; saveDraft(d, s); expect(loadDraft(s)).toEqual(d); });
test('cleanName', () => { expect(cleanName('  ayesha  ')).toBe('Ayesha'); expect(cleanName('   ')).toBeNull(); expect(cleanName('x'.repeat(60))!.length).toBe(24); });
test('buildOnboardingInput validates, names the paper The Morrow, sends no taste', () => {
  const input = buildOnboardingInput({ ...DEFAULT_DRAFT, name: 'Bilal', picks: [{ slug: 'technical.cs.ai-ml', via: 'chip' }] }, 'Asia/Karachi');
  expect(OnboardingInputSchema.parse(input)).toEqual(input);
  expect(input.paperName).toBe('The Morrow'); expect(input.displayName).toBe('Bilal'); expect(input.tz).toBe('Asia/Karachi');
  expect(input.taste).toEqual([]); expect(input.presentation.timeBudget).toBe(15); });
test('skipped picks fall back to DEFAULT_PICKS', () => { expect(buildOnboardingInput({ ...DEFAULT_DRAFT, picks: [], skipped: { ...DEFAULT_DRAFT.skipped, picks: true } }).picks).toEqual(DEFAULT_PICKS); });
test('empty name → null displayName, blank city → Islamabad', () => { const i = buildOnboardingInput({ ...DEFAULT_DRAFT, city: '  ' }); expect(i.displayName).toBeNull(); expect(i.paperName).toBe('The Morrow'); expect(i.city).toBe('Islamabad'); });
```
`fakeStorage(obj)` is a 6-line in-file `Storage` backed by a Map.

- [ ] **Step 2:** `npx vitest run src/components/onboarding/lib/draft.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement.**
  - Validate the loaded JSON with a local zod `DraftSchema` built from `InterestPickSchema` and `PresentationSchema` (`safeParse`, falling back to `DEFAULT_DRAFT`). A `timeBudget` of 10 or 20 from an old shape fails and resets.
  - `storage` defaults to `globalThis.localStorage`, read inside try/catch.
  - `cleanName` capitalizes the first letter, collapses whitespace, slices to 24, and returns null when empty.
  - `buildOnboardingInput`:
    - `paperName = BRAND.defaultPaperName(cleanName(d.name))` and `taste: []`;
    - `picks` falls back to `DEFAULT_PICKS` when empty;
    - `city` is trimmed, else `'Islamabad'`; `deliveryHour` and `avoidSources` are not sent (contract gap);
    - `tz` defaults to `Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Karachi'`.
- [ ] **Step 4:** Run the test again. Expected: PASS (8 tests).
- [ ] **Step 5:** Commit `feat(onboarding): draft store and OnboardingInput builder` and push.

### Task 2: Picker state reducer (15 min)

**Files:** Create `src/components/onboarding/lib/picker-state.ts`, test `src/components/onboarding/lib/picker-state.test.ts` (taxonomy = `FIXTURE_TAXONOMY`).

**Interfaces:**
- Consumes: `TopicNode`, `FIXTURE_TAXONOMY` (tests).
- Produces:
  - `type InterestPickerValue = { picks: InterestPick[]; blocked: TopicSlug[] }` and `type InterestPickerProps = { taxonomy: TopicNode[]; value: InterestPickerValue; onChange: (v: InterestPickerValue) => void; mode: 'onboarding' | 'edit' }` (exactly §9.6);
  - `childrenOf(tax: TopicNode[], parent: TopicSlug | null): TopicNode[]`;
  - `pickedDescendantCount(slug: TopicSlug, picks: InterestPick[]): number`;
  - `chipHint(slug: TopicSlug, picks: InterestPick[]): string | undefined` (`'2 picked'`);
  - `type PickerState = InterestPickerValue & { open: TopicSlug[] }`;
  - `type PickerAction = { type: 'toggle' | 'toggleDisclosure' | 'block' | 'unblock'; slug: TopicSlug } | { type: 'merge'; picks: TopicSlug[]; blocked: TopicSlug[] } | { type: 'set'; value: InterestPickerValue }`;
  - `pickerReducer(s: PickerState, a: PickerAction, tax: TopicNode[]): PickerState`;
  - `pickCounterText(n: number): string`, `ctaLabel(n: number): string`, `MIN_PICKS = 3`.

Layout model (from the Morrow README, decided here):
- **Groups:** 9 groups, one per root. Each has a small root label, then a root chip "All of {Root}" (via `'tile'`), then that root's level-2 chips (via `'chip'`).
- **Disclosure:** a level-2 chip with children (`technical.cs`, `sports.cricket`, `news.pakistan`) has a `›` that opens its level-3 chips in place. Technical → Computer Science → AI & ML is the mandatory drill-down.
- **One panel per root:** `toggleDisclosure` opens one panel per root. Opening a sibling in the same root closes the other, and panels in other roots stay open.
- **`toggle`:** toggles the pick (`via` = `'tile'` at level 1, else `'chip'`). Parent and child picks can coexist, and the parent chip's `hint` shows `"N picked"`.
- **`block`:** removes the slug and its descendants from `picks` and adds it to `blocked`. Toggling a blocked slug on unblocks it.
- **`merge`:** step 3's describe result. It adds unknown picks as `via: 'describe'` (no duplicates, never re-adding a blocked slug), then applies `block` for each blocked slug.

- [ ] **Step 1: Write failing tests:**
  - `toggle('technical')` → `picks=[{slug:'technical',via:'tile'}]`; `toggle('technical.cs.ai-ml')` adds `via:'chip'`; `pickedDescendantCount('technical', picks) === 1` and `chipHint('technical.cs', picks) === '1 picked'`.
  - `toggleDisclosure('technical.cs')` → `open` contains it; a second call removes it.
  - `block('technical')` drops `technical.cs.ai-ml` and sets `blocked=['technical']`; `toggle` on a blocked slug unblocks and picks it.
  - `merge({ picks: ['sports.cricket','sports.cricket'], blocked: ['entertainment'] })` adds one `via:'describe'` pick and blocks `entertainment`.
  - Copy: `ctaLabel(0)='Pick 3 more'`, `ctaLabel(2)='Pick 1 more'`, `ctaLabel(3)='Continue'`, `pickCounterText(1)='1 topic picked'`, `pickCounterText(4)='4 topics picked'`.
  - `childrenOf(FIXTURE_TAXONOMY, null).length === 9`.
- [ ] **Step 2:** `npx vitest run src/components/onboarding/lib/picker-state.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the signatures above (descendant test: `s.startsWith(slug + '.')`).
- [ ] **Step 4:** Run again. Expected: PASS.
- [ ] **Step 5:** Commit `feat(onboarding): picker reducer with in-place drill-down` and push.

### Task 3: InterestPicker, taxonomy loader, /start shell and Welcome (25 min, demo-critical; merge at Checkpoint A)

**Files:**
- Create `src/server/onboarding/taxonomy.ts` + `taxonomy.test.ts`, `OnboardingFlow.tsx`, `WelcomeStep.tsx`, `src/app/start/page.tsx`.
- Modify `src/server/onboarding/index.ts` and `src/components/onboarding/InterestPicker.tsx` (replacing the L0 stubs).

**Interfaces:**
- Consumes:
  - from L3 and L0: `createSupabaseAdminClient()`, `getSessionUser()`, `getProfile()` (`@/server/profile`, L3);
  - from this lane: `pickerReducer`, `InterestPickerProps`, the `draft.ts` exports;
  - Morrow: `OnboardingStep`, `TopicChip`, `Button`, `TextField`, `Masthead`.
- Produces:
  - `flattenTaxonomy(json: { roots: RawNode[] }): TopicNode[]`;
  - `getTaxonomy(): Promise<TopicNode[]>` (§9.3: the `topics` table ordered by slug, else `seed/taxonomy.json` flattened, cached per process), exported from `src/server/onboarding/index.ts`;
  - `InterestPicker(props: InterestPickerProps)` (default + named export, `'use client'`, re-exports `InterestPickerProps`);
  - `WelcomeStep({ name, onChange })`;
  - `OnboardingFlow({ taxonomy: TopicNode[]; demoUnavailable?: boolean })`.

- [ ] **Step 1: Failing test** in `taxonomy.test.ts` (`import raw from '../../../seed/taxonomy.json'`):
  - `flattenTaxonomy(raw)` has length 67, 9 nodes at level 1, and the same slug set as `FIXTURE_TAXONOMY`;
  - `find(n => n.slug==='technical.cs.ai-ml')` has `parentSlug: 'technical.cs'` and `level: 3`, and `synonyms` is `[]` when absent;
  - with the admin client mocked to throw, `getTaxonomy()` resolves to the flattened JSON (67).
  Run it (FAIL), implement, run it (PASS).
- [ ] **Step 2: Build the picker from Morrow `TopicChip`.** Render the 9 groups in taxonomy order.
  - **Group label:** each group is a `<section aria-labelledby>` with an `h3` label in `ui-label text-ink-muted`. No colour, no emoji.
  - **Chip row:** a `flex flex-wrap gap-2` row of `TopicChip`s (`label`, `selected`, `onToggle`, `hint={chipHint(...)}`).
  - **Disclosure:** a chip with children is followed by the ghost `Button` disclosure (`icon="chevron-right"`, `aria-expanded`, `aria-controls`, `aria-label`). When it is open, a `<div id="panel-{slug}" class="basis-full border-l border-rule pl-3">` with the level-3 chips is inserted right after that chip, so the line breaks there and the children appear in place. No height or opacity animation.
  - **Counter:** in `mode='onboarding'`, show the `aria-live="polite"` line `pickCounterText(n)` in `ui-meta`. `mode='edit'` hides it.
  - **Changes:** in both modes, `onChange({ picks, blocked })` fires on every reducer change that alters picks or blocked.
  - Never restyle `TopicChip`. Block or unblock has no picker control in core (step 3 and `/me` handle it; "Not for me" is stretch Task 13).
- [ ] **Step 3: Build the shell and step 1.**
  - **Draft state:** `OnboardingFlow` keeps `useReducer`-style draft state seeded from `loadDraft()` in a mount effect (to avoid a hydration mismatch) and saves on every change.
  - **Frame and focus:** it renders each step inside `OnboardingStep` (`step`, `total={4}`, `title`, `description`, `nextLabel`, `nextDisabled`, `onNext`, `onBack` from step 2, `onSkip` on steps 2–3). After a step change it focuses `#mw-ob-title` (setting `tabindex="-1"` once).
  - **Step 1:** `WelcomeStep` shows the full `Masthead` (`date` from `Intl` in `Asia/Karachi`, "Saturday, 17 October 2026"; `reader={cleanName(name) ?? undefined}`, so the ear reads "Prepared for Ayesha" as they type). Under it, the `TextField` "First name".
  - **Steps 2–4:** a compact `Masthead` sits above the frame.
  - **Step 2:** `InterestPicker mode="onboarding"` with `nextLabel={ctaLabel(n)}` and `nextDisabled={n < 3}`. Skip sets `skipped.picks=true`.
  - **Steps 3 and 4:** placeholders for now that show the frame with "Continue".
  - **Page:** `src/app/start/page.tsx` is a Server Component.
    - If `getSessionUser()` and `getProfile(userId)` return an onboarded reader, `redirect('/today')` (§9.7).
    - Otherwise `return <OnboardingFlow taxonomy={await getTaxonomy()} demoUnavailable={(await searchParams).demo === 'unavailable'} />`.
    - It sets `export const metadata = { title: 'Build your paper · The Morrow' }`.
- [ ] **Step 4: Real-browser check.**
  - `npm run dev -- --port 3005`. Screenshot `http://localhost:3005/start` at 390×844 and 1280×800 (`npx playwright screenshot --viewport-size=390,844 http://localhost:3005/start docs/handoff/screens/L5-step1-390.png`; step 2 at 390 and 1280 via the flow).
  - Expected on step 1: "Step 1 of 4", the blackletter "The Morrow", and typing "ayesha" shows "Prepared for Ayesha".
  - Expected on step 2: 9 labelled groups. `›` beside Computer Science opens Web dev, AI & ML, DevOps & Cloud… in place. After 2 picks the button reads "Pick 1 more" (disabled), then "Continue" after 3.
  - Reload keeps the picks. Tab/Enter/Space reach and toggle every chip and `›`, and the pen focus ring is visible.
  - Set `data-theme="night"` on `<html>` in DevTools: everything is still readable.
- [ ] **Step 5:** `npm run typecheck`. Expected: 0 errors. Commit `feat(onboarding): Morrow topic drill-down, welcome and /start shell` and push. Mark the PR ready for the Checkpoint A merge (first vertical slice).

### Task 4: Your routine step (10 min)

**Files:** Create `src/components/onboarding/RoutineStep.tsx`. Modify `OnboardingFlow.tsx`.

**Interfaces:** Produces `RoutineStep({ value: { presentation: Presentation; deliveryHour: 6|7|8; city: string }; onChange: (v) => void })`. Composes Morrow `Segmented` and `TextField`.

- [ ] **Step 1: Build the step.**
  - `Segmented label="Paper length" name="length"` with options `{ value: '5', label: 'Quick', hint: '5 min' }`, `{ '15', 'Standard', '15 min' }`, `{ '30', 'Deep', '30 min' }`, mapped with `Number(v) as TimeBudget`.
  - `Segmented label="Delivery time" name="delivery"` with `6:00` / `7:00` / `8:00`.
  - `TextField label="City" hint="For local news and weather."`.
  - Next is "Preview my paper" → step 5.
- [ ] **Step 2: Real-browser check** at 390 px → `docs/handoff/screens/L5-step4-390.png`. Expected: Standard, 7:00 and Islamabad are pre-selected; the arrow keys move within each radio group; Tab reaches the city field.
- [ ] **Step 3:** `npm run typecheck`. Commit `feat(onboarding): your routine step` and push.

### Task 5: In your words: describe route, keyword fallback and step (20 min)

**Files:** Create `src/components/onboarding/lib/keywords.ts` + `keywords.test.ts`, `src/app/api/onboarding/describe/route.ts` + `route.test.ts`, `src/components/onboarding/InYourWordsStep.tsx`. Modify `OnboardingFlow.tsx`.

**Interfaces:**
- Consumes: `mapTextToTopics(text)` from `@/server/enrich` (L2; L2 owns its Gemini path, and until L2 lands the L0 stub returns nothing), `DescribeRequestSchema`, `DescribeResponseSchema`, `getTaxonomy()`, the picker `merge` action.
- Produces:
  - `keywordTopics(text: string, tax: TopicNode[]): { picks: TopicSlug[]; blocked: TopicSlug[] }`: case- and diacritic-insensitive whole-word matches of names and synonyms, deepest node first, max 6. A match preceded within 3 words by `less|no|not|without|avoid|hate|skip` goes to `blocked`.
  - `POST(req: Request): Promise<Response>` → `DescribeResponseSchema`;
  - `InYourWordsStep({ words, avoidSources, value: InterestPickerValue, taxonomy, onChange })`.

- [ ] **Step 1: Failing tests:**
  - `keywordTopics('more cricket, less celebrity gossip', FIXTURE_TAXONOMY)` → `picks` contains the slug whose name is "Cricket", and `blocked` holds the celebrity node; `''` → empty.
  - Route, with `vi.mock('@/server/enrich')`:
    - `{ text: 'CS student into cricket, hates politics' }` → 200, and the body passes `DescribeResponseSchema` with only slugs present in `getTaxonomy()`;
    - `{ text: '' }` or a body over the schema's max → 400;
    - `mapTextToTopics` throwing, or returning `{ picks: [], blocked: [] }` → 200 with `keywordTopics(text)` and `provider: 'keyword'`.
- [ ] **Step 2:** `npx vitest run src/components/onboarding/lib/keywords.test.ts src/app/api/onboarding/describe/route.test.ts` → FAIL. Implement (`export const dynamic = 'force-dynamic'`). Run again → PASS.
- [ ] **Step 3: UI.**
  - The multiline `TextField` "Anything else you want in your paper?" (`rows={3}`) and a `Button variant="secondary"` "Add to my topics". It is disabled while the request is in flight or the text is empty.
  - On success, dispatch `merge` and show the result note in `aria-live` `ui-meta text-pen` ("Added to your paper. Remove anything that's wrong.").
  - Show the added picks (`via: 'describe'`) as selected `TopicChip`s; toggling one off removes it. Blocked slugs appear under a small label "Less of", and toggling one off unblocks it.
  - On a non-200, show `TextField error="That didn't go through. Your picks are saved; try again or continue."`.
  - Then the optional `TextField` "Sources to avoid" (draft only). Skip sets `skipped.words=true`.
- [ ] **Step 4: Real-browser check** at 390 px → `docs/handoff/screens/L5-step3-390.png`. `curl.exe -s -X POST -H "content-type: application/json" -d "{\"text\":\"more cricket, less celebrity gossip\"}" http://localhost:3005/api/onboarding/describe` → JSON with `"provider"` and at least one pick.
- [ ] **Step 5:** Commit `feat(onboarding): in your words via /api/onboarding/describe` and push.

### Task 6: Preview headlines: card query and GET /api/taste (15 min)

**Files:** Create `src/server/onboarding/taste.ts` + `taste.test.ts`, `src/app/api/taste/route.ts` + `route.test.ts`. Modify `src/server/onboarding/index.ts`.

**Interfaces:**
- Consumes: `createSupabaseAdminClient()`, `rootOf`, `TasteCard`, `FIXTURE_TASTE_CARDS`, `getTaxonomy()`, `TasteQuerySchema`, `TasteCardSchema`.
- Produces:
  - `type TasteCandidate = { articleId: string; headline: string; sourceName: string; labels: { slug: TopicSlug; conf: number }[]; imageUrl: string | null; clusterId: string | null; importance: number; publishedAt: string }`;
  - `parsePicks(raw: string | null): TopicSlug[]` (regex `^[a-z0-9-]+(\.[a-z0-9-]+){0,2}$`, de-duplicated, max 20);
  - `pickTasteCards(pool: TasteCandidate[], picks: TopicSlug[], tax: TopicNode[], fallback: TasteCard[]): TasteCard[]`;
  - `getTasteCards(picks: TopicSlug[]): Promise<TasteCard[]>` (§9.3, exported from `src/server/onboarding/index.ts`);
  - route `GET(req: Request): Promise<Response>`.

The §9.2 contract is unchanged: 6 matched + 2 wildcards. The preview shows the matched cards. Stretch Task 11 reuses all 8.
```
match(label, pick) = label === pick || label.startsWith(pick+'.') || pick.startsWith(label+'.')
picks' = picks.length ? picks : DEFAULT_PICKS slugs;  sort pool by importance desc, publishedAt desc
matched: round-robin over picks', each turn takes the best unused candidate whose labels[0] matches the pick
         (skip used articleId/clusterId) until 6 or a full round adds nothing; then any-label matches
wild:    best candidates with rootOf(labels[0]) ∉ roots(picks'), distinct roots, 2 of them, wildcard: true
order:   [m0, m1, w0, m2, m3, w1, m4, m5]; top up to 8 from fallback cards (recomputing wildcard against picks')
topicName = tax name of labels[0].slug (else the slug)
```

- [ ] **Step 1: Failing tests:**
  - A 20-candidate pool across 5 roots with picks `['technical.cs.ai-ml','sports.cricket']` → 8 cards. Exactly 2 are wildcards, at indexes 2 and 5, with roots outside `technical`/`sports`. The matched cards alternate between the picks, and no two share a `clusterId`.
  - An empty pool → 8 cards, all from `FIXTURE_TASTE_CARDS`.
  - `parsePicks('a,../x,,technical.cs.ai-ml,a')` → `['a','technical.cs.ai-ml']`, and 500 slugs → length 20.
  - Route: with `getTasteCards` mocked to throw → still 200 with 8 fallback cards. With no picks → 200 and 8 cards. Every response passes `z.array(TasteCardSchema)`.
- [ ] **Step 2:** `npx vitest run src/server/onboarding/taste.test.ts src/app/api/taste/route.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
  - Query: `from('articles').select('id, headline, title, labels, image_url, cluster_id, published_at, sources(name), clusters(importance)').in('status', ['enriched']).gte('published_at', now − 72 h).order('published_at', { ascending: false }).limit(300)`, mapping `headline ?? title`. Any error or throw → an empty pool (so the fallback).
  - The route reads the query with `TasteQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))` (a failed parse counts as no picks), then sanitizes with `parsePicks`.
  - It returns `Response.json(cards, { headers: { 'Cache-Control': 'private, max-age=300' } })` and sets `export const dynamic = 'force-dynamic'`.
- [ ] **Step 4:** Tests → PASS. `curl.exe -s "http://localhost:3005/api/taste?picks=technical.cs.ai-ml,sports.cricket"` → a JSON array of length 8 with 2 `"wildcard":true`.
- [ ] **Step 5:** Commit `feat(onboarding): preview card selection and /api/taste` and push.

### Task 7: Live preview, Build my paper and guest save (20 min, demo-critical; merge at Checkpoint B)

**Files:** Create `src/components/onboarding/lib/finish.ts` + `finish.test.ts`, `src/components/onboarding/FirstPagePreview.tsx`. Modify `OnboardingFlow.tsx`.

**Interfaces:**
- Consumes: `buildOnboardingInput`, `OnboardingInputSchema`, `OnboardingResponseSchema`, `createSupabaseBrowserClient()` (`@/lib/supabase/browser`), `POST /api/onboarding` → `{ editionDate: string }`, Morrow `Masthead`, `StoryCard`, `Button`.
- Produces:
  - `type FinishDeps = { hasSession: () => Promise<boolean>; signInAnonymously: () => Promise<void>; post: (input: OnboardingInput) => Promise<Response> }`;
  - `class FinishError extends Error { stage: 'auth' | 'save' }`;
  - `runFinish(input: OnboardingInput, deps: FinishDeps): Promise<{ editionDate: string }>`;
  - `buildStatus(k: number, n: number): string`;
  - `FirstPagePreview({ name: string | null; city: string; cards: TasteCard[]; status: 'idle' | 'building' | 'error'; built: number; onBuild: () => void; onBack: () => void })`.

- [ ] **Step 1: Failing tests** (all with mocked deps):
  - No session → `signInAnonymously` is called once, then `post` is called with the input deep-equal to `OnboardingInputSchema.parse(input)`, with `taste` `[]`.
  - With a session → `signInAnonymously` is not called.
  - A sign-in rejection → `FinishError` with `stage === 'auth'`, and `post` is not called.
  - `post` resolving `new Response('x', { status: 500 })` → `FinishError` with `stage === 'save'`.
  - A 200 whose body fails `OnboardingResponseSchema` → `FinishError` with `stage === 'save'`.
  - A 200 `{ editionDate: '2026-10-17' }` → resolves to `{ editionDate: '2026-10-17' }`.
  - `buildStatus(8, 20) === "Setting today's paper · 8 of 20 stories"`.
- [ ] **Step 2:** `npx vitest run src/components/onboarding/lib/finish.test.ts` → FAIL. Implement. Run again → PASS. The real deps in `OnboardingFlow`:
  - `const sb = createSupabaseBrowserClient()`;
  - `hasSession = async () => !!(await sb.auth.getSession()).data.session`;
  - `signInAnonymously` throws on `{ error }`;
  - `post = (i) => fetch('/api/onboarding', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(i) })`.
- [ ] **Step 3: Preview (step 5, outside the 4-step frame).**
  - **Data:** on entering, fetch `/api/taste?picks=` once (keyed by the picks string) and use `cards.filter(c => !c.wildcard).slice(0, 5)`.
  - **Masthead:** the full `Masthead` with `date`, `reader={name ?? undefined}`, `location={city}`, `edition={1}`, `storyCount={20}`.
  - **Stories:** a `dateline` "A preview of your first front page". Then one `StoryCard variant="standard"` (`kicker={topicName}`, `headline`, `source={sourceName}`, `imageUrl`) and up to 4 `StoryCard variant="brief"` in a 2fr/1fr grid (one column below 640 px). No FeedbackBar and no WhyTag in the preview.
  - **Actions:** `Button variant="primary" size="lg"` "Build my paper" and a ghost "Back".
  - **Empty or failed fetch:** show the masthead and the `ui-text` line "Your first stories are chosen when you build your paper."
- [ ] **Step 4: Building and errors.**
  - **Building:** while `status === 'building'`, replace the cards with skeleton blocks in `bg-paper-sunk` (1 headline-height bar and 3 text lines per card, square corners, no shimmer animation). Add a `role="status" aria-live="polite"` `dateline` with `buildStatus(k, 20)`; `k` ticks by one every 150 ms up to 19 while the POST is in flight, and reaches 20 on success.
  - **Double submit:** a `useRef` guard plus `status` prevent it.
  - **Success:** `clearDraft()` → `router.push('/today')`.
  - **Error:** a `bg-press-soft text-press` `ui-text` line "Your paper couldn't be set. Check your connection and try again." and the button relabelled "Try again". The draft stays.
- [ ] **Step 5: Real-browser check.**
  - On `/start`, go through to the preview. Expected: "Prepared for {Name}", up to 5 real (or fixture) headlines, and "Build my paper" showing the skeletons and the status, then `/today` (the L3/L4 stub is fine).
  - DevTools → Application → Cookies has an `sb-…-auth-token`.
  - Network: the POST body has `"taste":[]` and `"paperName":"The Morrow"`.
  - Offline → "Try again", and the picks survive a reload.
  - Save `docs/handoff/screens/L5-preview-390.png` and `L5-building-390.png`.
- [ ] **Step 6:** Commit `feat(onboarding): first front-page preview, guest sign-in and save` and push. Ready for the Checkpoint B merge.

### Task 8: /demo persona sign-in (10 min)

**Files:** Create `src/app/demo/route.ts` + `src/app/demo/route.test.ts`.

**Interfaces:** Consumes `createSupabaseServerClient()` (`@/server/db/server`, L0, @supabase/ssr cookies `getAll`/`setAll`). Produces `GET(): Promise<never>`.

- [ ] **Step 1: Failing test.**
  - Mocks: `vi.mock('@/server/db/server')` returns `{ createSupabaseServerClient: async () => ({ auth: { signInWithPassword: vi.fn().mockResolvedValue({ error: null }) } }) }`, and `vi.mock('next/navigation', () => ({ redirect: vi.fn(() => { throw new Error('REDIRECT') }) }))`.
  - With env `DEMO_USER_EMAIL='demo@subah.app'` and `DEMO_USER_PASSWORD='pw'`: `signInWithPassword` is called with `{ email: 'demo@subah.app', password: 'pw' }`, then `redirect('/today')`.
  - With `{ error: { message: 'x' } }` or an unset env → `redirect('/start?demo=unavailable')`.
- [ ] **Step 2:** `npx vitest run src/app/demo/route.test.ts` → FAIL. Implement with `export const dynamic = 'force-dynamic'`. Run again → PASS.
- [ ] **Step 3: Real check.**
  - `curl.exe -s -i http://localhost:3005/demo`. Expected: `307` with `location: /today` **and** a `set-cookie: sb-` header.
  - If the cookies are missing on the redirect, switch to `NextResponse.redirect(new URL('/today', req.url))`. Build the client with `createServerClient(url, key, { cookies: { getAll: () => req.cookies.getAll(), setAll: (cs) => cs.forEach(c => res.cookies.set(c.name, c.value, c.options)) } })` (env `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`), and note it in the handoff.
  - When `demoUnavailable`, `OnboardingFlow` shows the `ui-meta` line "The demo reader isn't available right now. You can build your own paper instead."
- [ ] **Step 4:** Commit `feat(auth): /demo signs in the seeded persona` and push.

### Task 9: Landing page: the Masthead hero (10 min)

**Files:** Modify `src/app/page.tsx`.

**Interfaces:** Consumes Morrow `Masthead`, `Button`.

- [ ] **Step 1: Build.** `page.tsx` is a Server Component with `export const revalidate = 600` (so the date stays current). The page is **one hero and nothing else**:
  - the full `Masthead` (default title "The Morrow" as the `h1`, `date` = "Saturday, 17 October 2026" via `Intl` in `Asia/Karachi`, `tagline="Every morning"`);
  - the promise `<p className="deck">One paper, every morning, about what you care about.</p>`;
  - the `ui-text text-ink-muted` sub;
  - `Button variant="primary" size="lg" href="/start"` "Build my paper";
  - two quieter `next/link` text links in `ui-text text-pen` (pen = link): "Try the demo reader" → `/demo` (`prefetch={false}`, since it signs in) and "See a sample PDF" → `/demo/sample.pdf` (`target="_blank" rel="noopener noreferrer"`).
  - Centered column, `max-w-[var(--page-max)]` with a 16 px gutter, on `bg-paper`.
  - No feature strip, icon grid, cycling masthead or footer marketing.
- [ ] **Step 2: Real-browser check** at 390 and 1280 px → `docs/handoff/screens/L5-landing-390.png` and `L5-landing-1280.png`. Expected: the nameplate in blackletter, the CTA visible without scrolling at 390×844, and both themes readable. `curl.exe -s -o NUL -w "%{http_code}" http://localhost:3005/demo/sample.pdf` → 200 once L6 commits it (a 404 before that is acceptable and noted).
- [ ] **Step 3:** Commit `feat(landing): Morrow masthead hero` and push.

### Task 10: Timed 390 px Playwright flow (15 min; end-to-end green at Checkpoint C)

**Files:** Create `e2e/L5-onboarding.spec.ts`. Use L0's root `playwright.config.ts` unchanged (no lane config).

- [ ] **Step 1: Tests** (relative `page.goto` paths, `test.use({ viewport: { width: 390, height: 844 } })`).
  - `'full flow under 90 s at 390px'`:
    1. Start a timer. Go to `/`, click "Build my paper".
    2. Type "Ayesha", and expect the text "Prepared for Ayesha". Click "Continue".
    3. Click `›` on Computer Science, then AI & ML, Cricket and "All of Science". Expect the button to read "Pick 1 more" (disabled) after 2 picks and "Continue" after 3. Continue.
    4. Type "more climate tech, less celebrity gossip", click "Add to my topics", expect ≥ 1 added chip. Continue.
    5. Choose "Quick", then "Preview my paper". Expect ≥ 1 `h3` story headline.
    6. Click "Build my paper", captured with `page.waitForRequest('**/api/onboarding')`. Expect `postDataJSON()` to have `taste: []`, `paperName: 'The Morrow'`, `displayName: 'Ayesha'` and `presentation.timeBudget: 5`.
    7. Expect the status `/Setting today's paper/`, then wait for the URL `**/today` (`timeout: 90_000`), and `expect(elapsed).toBeLessThan(90_000)`.
    Take a screenshot per step into `docs/handoff/screens/L5-flow-{n}.png`.
  - `'skip what you can'`: Continue (no name) → "Skip for now" → "Skip for now" → "Preview my paper" → "Build my paper" → `/today`. The body's picks are the 4 default slugs and `displayName` is `null`.
  - `'draft survives reload'`: on step 2 pick 2, `page.reload()`, then expect 2 `[aria-pressed="true"]` and the button "Pick 1 more".
  - (The automated keyboard-only test is stretch Task 13. Keyboard reach is still checked by hand in Tasks 3–5.)
- [ ] **Step 2:** `npx playwright test e2e/L5-onboarding.spec.ts`. Expected: 3 passed. The config's `baseURL`/`webServer` decide the port; if it is not 3005, stop the lane dev server first so the config's own server starts. Record the elapsed time of the full flow in the handoff.
- [ ] **Step 3:** Commit `test(onboarding): timed playwright flow and skip paths` and push. Ready for the Checkpoint C merge.

---

## Stretch (only if green)

Start these only after Task 10 is merged and Checkpoint C is green, and stop at the 18:00 freeze. None of them is needed for the demo.

### Task 11 (stretch): Taste test (25 min)

The taste test was dropped from core by §3a. If it comes back, it is an optional step between Topics and In your words, and the frame becomes `total={5}`.

**Files:** Create `src/components/onboarding/lib/taste-state.ts` + `taste-state.test.ts`, `src/components/onboarding/TasteTest.tsx`. Modify `draft.ts` (add `taste` to the draft; the builder sends it instead of `[]`) and `OnboardingFlow.tsx`.

- [ ] **Step 1: Failing tests:**
  - `tasteReducer`: 10 `verdict` actions on 8 cards → `verdicts.length === 8` and `index === 8`; `undo` → index 7.
  - `previewHeadlines` puts 'more' cards first and never includes 'less'.
  Run (FAIL), implement, run (PASS).
- [ ] **Step 2: UI.**
  - The 8 cards from `/api/taste`, one at a time: a `StoryCard variant="standard"` (`kicker={topicName}`, `source`) with three `Button variant="secondary"` "Less like this" · "Skip" · "More like this", and the keys ←/↓/→.
  - A `dateline` counter "{i} of 8". Cards swap with no slide (at most the 150 ms colour change).
  - After the last card: "Got it. We'll learn the rest as you read."
  - If the fetch fails, auto-skip. Verdicts go in `OnboardingInput.taste` only.
- [ ] **Step 3:** Commit `feat(onboarding): optional taste test` and push.

### Task 12 (stretch): Search-to-add (15 min)

**Files:** Create `src/components/onboarding/lib/search.ts` + `search.test.ts`. Modify `InterestPicker.tsx`.

**Interfaces:** Produces `searchTopics(tax: TopicNode[], q: string, limit?: number): TopicNode[]`. The default limit is 6. Matching is case- and diacritic-insensitive. Rank order is name prefix, then synonym prefix, then name substring, then synonym substring; ties go to the deeper level.

- [ ] **Step 1: Failing tests** (over `FIXTURE_TAXONOMY`): `searchTopics(tax, 'ai')[0].slug === 'technical.cs.ai-ml'`; `''` → `[]`; and a synonym hit (for example 'psl' → `sports.cricket.leagues` when the synonyms contain it). Run (FAIL), implement, run (PASS).
- [ ] **Step 2: UI:**
  - A `TextField label="Find a topic"`, placeholder "Cricket, AI, Urdu poetry…", above the groups.
  - Results render as `TopicChip`s (picking one sets `via: 'search'` and opens its parent panel).
  - No match shows the `ui-meta` line "No topic matches '{q}'. Try a broader word."
  - Commit `feat(onboarding): search-to-add` and push.

### Task 13 (stretch): Polish trimmed from core (20 min, any order, each item its own commit)

- [ ] **Landing front-page strip (Task 9):**
  - Implement `getLandingHeadlines(limit)` (§9.3) in `src/server/onboarding/landing.ts`: the last 36 h, at most 2 per root, no duplicate clusters, with a `FIXTURE_ARTICLES` fallback, plus a test.
  - Render 3 `StoryCard variant="brief"` under a `SectionHeader title="This morning"` below the hero.
- [ ] **"Not for me" (Task 3):** in `mode='edit'`, a ghost `Button icon="minus"` beside each chip dispatches `block`. Blocked chips list under "Less of" with a remove control.
- [ ] **Shorter groups (Task 3):** on mobile, each group shows its root chip plus the first 4 level-2 chips, and a ghost "Show all {n}" button reveals the rest. This brings the first view near the README's 15–24 chips.
- [ ] **Keyboard-only Playwright test (Task 10):** `'keyboard only'` runs the full flow with only `Tab`/`Enter`/`Space`/arrow keys. It asserts `aria-pressed="true"` on 3 chips and the counter text `'3 topics picked'`. The spec then expects 4 passed.

---

## Acceptance checks

| Command | Expected |
|---|---|
| `npm run typecheck && npm run lint` | 0 errors |
| `npx vitest run src/components/onboarding src/server/onboarding src/app/api/taste src/app/api/onboarding src/app/demo` | all pass (≥ 30 tests) |
| `npm run build` | succeeds; `/` is static/ISR; `/start`, `/api/taste` and `/api/onboarding/describe` are dynamic |
| `npx playwright test e2e/L5-onboarding.spec.ts` | 3 passed (4 with stretch Task 13); full flow < 90 s at 390 px |
| `curl.exe -s "http://localhost:3005/api/taste?picks=technical.cs.ai-ml"` | JSON array of 8, exactly 2 `"wildcard":true` |
| `curl.exe -s -i http://localhost:3005/demo` | 307 → `/today` with an `sb-` set-cookie |
| `Select-String -Path src/components/onboarding/**/*.tsx,src/app/page.tsx,src/app/start/**/*.tsx -Pattern 'motion/react\|sec-\|Fraunces\|Bricolage\|confetti\|#[0-9a-fA-F]{6}'` | no matches: no animation library, section colours, other fonts or literal colours |
| `docs/handoff/screens/` | `L5-landing-{390,1280}.png`, `L5-step1-390.png`, `L5-step2-{390,1280}.png`, `L5-step3-390.png`, `L5-step4-390.png`, `L5-preview-390.png`, `L5-building-390.png`, `L5-flow-*.png` |
| Manual: `data-theme="night"` and reduced motion emulated | every step readable, the pen focus ring visible, nothing animates beyond colour |

## Handoff (`docs/handoff/L5.md`)

Write these sections:
1. **Done:** the routes (`/`, `/start`, `/demo`, `/api/taste`, `/api/onboarding/describe`) and components, with the screenshots linked.
2. **Stubbed or fallback:**
   - The preview falls back to `FIXTURE_TASTE_CARDS` when the DB has no `enriched` articles, and `getTaxonomy` falls back to `seed/taxonomy.json`.
   - Describe uses L5's `keywordTopics` whenever L2's `mapTextToTopics` throws or returns nothing (provider `'keyword'`).
   - `getLandingHeadlines` is still the L0 stub unless Task 13 shipped.
   - Which stretch tasks (11–13) were done or skipped, and any L0 name mismatch found in Task 0.
3. **For L0/L3 (contract gap):** delivery time (`draft.deliveryHour`, 6/7/8) and "Sources to avoid" are collected but have no `OnboardingInput` field, so they are not sent. Proposed contract commit: `deliveryHour?: number` → `profiles.delivery_hour`, and `avoidSources?: string[]` → `hide_source` rows. Until then the profile default is 7:00.
4. **For L7:**
   - `import InterestPicker from '@/components/onboarding/InterestPicker'` with the §9.6 props `{ taxonomy, value: { picks, blocked }, onChange, mode: 'edit' }`. The taxonomy comes from `getTaxonomy()` in `@/server/onboarding`.
   - It renders Morrow `TopicChip`s grouped by root, with the `›` drill-down.
   - Block or unblock goes through `onChange`.
5. **For L3:**
   - The body is exactly `OnboardingInput`, with `taste: []` and `paperName: 'The Morrow'`; the response is read with `OnboardingResponseSchema`.
   - A skipped step 2 sends `DEFAULT_PICKS`. Step 3 picks arrive as `via: 'describe'`.
6. **Env:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `DEMO_USER_EMAIL`, `DEMO_USER_PASSWORD` (`GEMINI_API_KEY` only via L2). In the dashboard, Anonymous sign-ins are enabled and the rate limit is raised.
7. **Verify:** the acceptance commands above, and the measured full-flow time.
8. **Demo fast path (Loom, about 40 s):** Build my paper → "Ayesha" → Continue → › Computer Science, AI & ML, Cricket, All of Science → Continue → "more climate tech, less celebrity gossip" → Add to my topics → Continue → Quick → Preview my paper → Build my paper.

## Cut line (PLAN.md §5, item 5)

**Never cut:** the Topics drill-down and the preview + Build (Tasks 1–3 and 7).

If L5 is late, cut in this order:
1. **Simplify step 3:** keep the TextField, and run `keywordTopics` client-side over the taxonomy (no route; skip the Task 5 route tests).
2. **Then the routine step's delivery time:** it is draft-only anyway.
3. **Then the per-step 1280 px screenshots.**

The stretch tasks (11–13) are not started unless green. If `/api/taste` is late, the preview renders its empty state, because the L0 `getTasteCards` stub returns nothing.
