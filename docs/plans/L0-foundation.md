# L0 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In at most 1 h of core work, ship a compiling, deployable Next.js 16 skeleton on `main`. It has every contract, every dependency, every route and component stub, a migrated and seeded Supabase DB, CI and the `req-*` GitHub issues, so that lanes L1–L7 can start in parallel worktrees.

**Time budget (≈ 60 min):** Tasks 1–4 (scaffold + deps, contracts, server helpers, stubs) ≈ 40 min. **The Task 4 push unblocks the lanes.** Right after it: Task 5 issues ≈ 3 min, Task 6 migration + seed ≈ 8 min, Task 7 env/CI/vercel.json ≈ 5 min, Task 8 shell ≈ 4 min, Task 9 acceptance ≈ 2 min. Anything else is in the stretch section at the end.

**Architecture:** One Next.js 16 App Router app (`src/`). Binding contracts live in `src/contracts/` (TS types, plus zod schemas in `api.ts` and fixtures). Server helpers live in `src/server/{db,time,auth}` and `src/lib/supabase/browser.ts`. Every cross-lane module in ARCHITECTURE §9.3 and §9.6 exists as a stub with its exact signature that returns fixtures or neutral values. Each owner replaces only their own stubs.

**Tech Stack:** Next 16.4.2, React 19.3.1, Tailwind 4.3.3 + shadcn/ui (Radix), @supabase/ssr 0.12.7, supabase-js 2.118.0, zod 4.6.7, Vitest 5.0.5 (+ Testing Library, jsdom), tsx 4.23.15, Playwright 1.64.1 (screenshots + `e2e/`), Supabase CLI 2.121.0.

**Spec:** `docs/ARCHITECTURE.md` (§5 pins and env, §6 ownership, §7 schema, §9 contracts and §9.7 decisions are binding) · `docs/PLAN.md` (§3 checkpoints, §4 protocol, §5a scope decisions, §5 cut lines) · research `11`, `06`, `07`.

**Library APIs verified on 2026-10-17 via Context7:**
- `/vercel/next.js` (canary docs, 16.x): `src/proxy.ts` exporting `proxy()` + `config.matcher`; `serverExternalPackages`; `next typegen && tsc --noEmit`; the global `PageProps<'/paper/[date]'>`; `next lint` removed (use `eslint`).
- `/supabase/ssr` (main): `createServerClient(url, key, { cookies: { getAll, setAll(cookiesToSet, headers) } })`. The second `headers` argument carries cache headers that must be copied onto the response. `getClaims()` triggers the refresh.
- `/supabase/supabase`: the proxy matcher `/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)`.
- `/shadcn-ui/ui`: `npx shadcn@latest init -b radix -y --no-monorepo`, then `npx shadcn@latest add …`.
- `/vitest-dev/vitest` (v5): inline `test.projects` inherit the root config (no `extends: true` needed).

## Global Constraints

- Node **24.x** (`"engines": {"node": "24.x"}`). `.npmrc` contains `save-exact=true`. Install with the exact pins from ARCHITECTURE §5, and record the versions of unpinned packages in `docs/handoff/L0.md`.
- Next 16 rules: `src/proxy.ts` (never `middleware.ts`), `params` is a Promise (`const { date } = await params`), Server Components by default, `'use client'` only on interactive leaves.
- Supabase env names: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`. Use `getClaims()` on the server, never `getSession()`.
- Contracts in §9 are copied **verbatim**, including §9.6 component props and the §9.3 stub signatures. Never rename or reshape them, and add no local adapters. Everything imports them from `@/contracts/<file>`.
- No real Gemini calls from L0 (the free-tier quota is shared by every lane). The `callLLM` stub never touches the network.
- External news images use a plain `<img loading="lazy" referrerPolicy="no-referrer">`. Add no `next/image` remote config.
- UI uses only the semantic token classes (`bg-paper`, `text-ink`, `border-rule`, `text-accent`, `bg-sec-{root}`, `font-headline|body|ui`, `rounded-card`). Targets are ≥ 24 px (44 px on mobile). Respect `prefers-reduced-motion`.
- Brand copy comes only from `BRAND` in `src/lib/brand.ts`.
- Work directly on `main` in `D:\Documents\fast_Ai_Heckathon`. After every task, `git push origin main`. Stage paths explicitly: **never** commit `page.html` or the user's uncommitted `CLAUDE.md` edit, and never commit secrets.
- Commits use the form `feat|test|fix|chore(scope): …` and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Scripts stay cross-platform: npm scripts + `tsx`, with no bash-only tooling inside the app.
- Rolling integration: merge your first vertical slice (fixtures OK) at Checkpoint A 14:30, then again at B 15:30; end-to-end green by C 16:30.

## Review Focus

1. **Missing env** (CI, or a fresh worktree without `.env.local`): `next build` and every stub page must succeed, and `proxy()` must pass through without throwing. Only an explicit admin or server-client call may throw. Tested in Task 3 (`proxy passes through without env`).
2. **Unknown or garbage IANA tz on a profile** (`'Not/AZone'`): `localDate` falls back to `Asia/Karachi` instead of throwing a RangeError. Tested in Task 3.
3. **Bad `subah_now` demo cookie** (`'yesterday'`, or empty), or the cookie set while `DEMO_MODE` is unset: `requestNow()` returns the real clock. Tested in Task 3.
4. **Over-long or invalid event batches** (51 events, or `type:'like'`): `/api/events` returns 400 JSON, not 500. Tested in Task 2 (schema) and Task 4 (route).
5. **pgvector strings in odd shapes** (`'[1e-05, -0.5,2]'` with spaces or exponents, `'[]'`, `null`): `parseVector` returns the right Float32Array, or null for empty or null input. Tested in Task 3.

---

### Task 1: Scaffold Next 16 into the non-empty repo + every dependency

**Files:**
- Create (from the scaffold): `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `next-env.d.ts`, `src/app/{layout.tsx,page.tsx,globals.css,favicon.ico}`, `public/*`
- Create: `.npmrc`, `.gitattributes`, `vitest.config.ts`, `vitest.setup.ts`, `components.json`, `src/lib/utils.ts`, `src/components/ui/*.tsx` (shadcn)
- Modify: `.gitignore` (merge)

**Interfaces:**
- Produces: the npm scripts `dev, build, start, lint, typecheck, test, e2e, job:ingest, job:editions, seed, embed:topics, simulate, snapshot, db:types`; `cn()` from `@/lib/utils`; the shadcn primitives under `@/components/ui/*`.

- [ ] **Step 1: Scaffold in a sibling temp folder** (Git Bash): `cd /d/Documents && npx create-next-app@16.4.2 subah-scaffold --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --yes --skip-install --disable-git`. Expected: `subah-scaffold/` contains `src/app/page.tsx`.
- [ ] **Step 2: Move the files in.** Copy everything except `node_modules`, `.git`, `README.md`, `CLAUDE.md` and `AGENTS.md` into `D:\Documents\fast_Ai_Heckathon` (`cp -rn`; never overwrite our `CLAUDE.md` or `docs/`). Merge the scaffold `.gitignore` with these extra lines: `.env*.local`, `!.env.example`, `supabase/.temp/`, `.cache/`, `page.html`, `test-results/`, `playwright-report/`. Write `.gitattributes` = `* text=auto eol=lf` and `.npmrc` = `save-exact=true`. Delete `../subah-scaffold`.
- [ ] **Step 3: Install the pins.** `npm i next@16.4.2 react@19.3.1 react-dom@19.3.1 @supabase/supabase-js@2.118.0 @supabase/ssr@0.12.7 ai@7.0.143 @ai-sdk/google@4.0.99 zod@4.6.7 puppeteer-core@25.11.0 @sparticuz/chromium@153.0.0 rss-parser @mozilla/readability linkedom p-limit qrcode motion sonner next-themes lucide-react clsx tailwind-merge class-variance-authority @fontsource/newsreader @fontsource/playfair-display @fontsource/libre-franklin @fontsource/unifrakturmaguntia @fontsource/noto-nastaliq-urdu`, then `npm i -D tailwindcss@4.3.3 @tailwindcss/postcss@4.3.3 supabase@2.121.0 tsx@4.23.15 vitest@5.0.5 @playwright/test@1.64.1 puppeteer@25.14.0 @huggingface/transformers@4.3.1 @types/qrcode @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom @vitejs/plugin-react`. On an ERESOLVE peer conflict, retry once with `--legacy-peer-deps` and note it in the handoff. Expected: `package.json` has no `^` or `~` ranges.
- [ ] **Step 4: Init shadcn and add the components.** `npx shadcn@latest init -b radix -y --no-monorepo`, then `npx shadcn@latest add button sheet dialog popover tabs toggle-group tooltip slider progress skeleton badge separator dropdown-menu sonner -y`. Expected: `src/components/ui/sonner.tsx` exists and `src/lib/utils.ts` exports `cn`.
- [ ] **Step 5: Configure `package.json`.** Add `"engines": {"node": "24.x"}` and these scripts: `typecheck` = `next typegen && tsc --noEmit`, `test` = `vitest run`, `e2e` = `playwright test`, `lint` = `eslint`, `job:ingest` = `tsx scripts/job-ingest.ts`, `job:editions` = `tsx scripts/job-editions.ts`, `seed` = `tsx scripts/seed.ts`, `embed:topics` = `tsx scripts/embed-topics.ts`, `simulate` = `tsx scripts/simulate.ts`, `snapshot` = `tsx scripts/snapshot.ts`, `db:types` = `supabase gen types typescript --linked --schema public > src/contracts/database.types.ts`. Keep `dev`, `build` and `start` from the scaffold.
- [ ] **Step 6: Set up `next.config.ts` and Vitest.** Set `serverExternalPackages: ['@sparticuz/chromium','puppeteer-core','puppeteer','@huggingface/transformers','onnxruntime-node']`, with no `images` config. In `vitest.config.ts`: `plugins: [react()]`, alias `'@'` → `src`, `setupFiles: ['vitest.setup.ts']` (imports `@testing-library/jest-dom/vitest`), and `test.projects` = `[{ test: { name: 'node', environment: 'node', include: ['src/**/*.test.ts','scripts/**/*.test.ts','tests/**/*.test.ts'] } }, { test: { name: 'dom', environment: 'jsdom', include: ['src/**/*.test.tsx','tests/**/*.test.tsx'] } }]` (Vitest never picks up `e2e/`). In `eslint.config.mjs`, add ignores for `src/contracts/database.types.ts` and `src/components/ui/**`.
- [ ] **Step 7: Verify.** Run `npm run lint && npm run typecheck && npm run build`. Expected: all three exit 0 and the build lists the route `/`.
- [ ] **Step 8: Commit and push.** `git add package.json package-lock.json .npmrc .gitattributes .gitignore tsconfig.json next.config.ts eslint.config.mjs postcss.config.mjs next-env.d.ts components.json vitest.config.ts vitest.setup.ts src public`, then `git commit -m "chore(scaffold): next 16.4.2 app, all lane dependencies, shadcn ui, vitest"` (with the trailer), then `git push origin main`.

### Task 2: Contracts, zod API schemas, fixtures, brand

**Files:**
- Create: `src/contracts/{taxonomy,profile,article,edition,signals,streak,learning,engine}.ts` (verbatim from §9.1), `src/contracts/index.ts` (re-exports all of them), `src/contracts/api.ts`, `src/contracts/fixtures.ts`, `src/contracts/database.types.ts` (placeholder), `src/lib/brand.ts`, `seed/taxonomy.json` (byte copy of `docs/research/taxonomy.json`), `seed/topic-extras.json`
- Test: `src/contracts/contracts.test.ts`

**Interfaces:**
- Produces: every §9.1 type exactly as written. Cross-file imports are explicit (e.g. `signals.ts` imports `StreakView` from `./streak`; `engine.ts` imports `SignalType`, `Slot`, `Tier`, `Reason`, `ScoreBreakdown`, `Presentation`). This includes `RankParams`, `Candidate` (with `sourceCount`, `sourceQuality`, `headline`), `EngagedItem` + `UserModel.engaged`, `ArticleCard.recall`, `Edition.sectionNames` and `StreakView.todayStoriesRead` / `editionComplete`.
  - `api.ts` exports exactly the §9.1 schema names. Each schema is annotated `z.ZodType<T>` against its contract type so the two can't drift: `TopicSlugSchema, PresentationSchema, InterestPickSchema, OnboardingInputSchema, OnboardingResponseSchema, DescribeRequestSchema, DescribeResponseSchema, TasteQuerySchema, TasteCardSchema, ArticleCardSchema, RecallQuestionSchema, ReasonSchema, ScoreBreakdownSchema, EditionItemSchema, EditionReceiptSchema, EditionSchema, ArchiveEntrySchema, ArchiveQuerySchema, RebuildRequestSchema, RebuildResponseSchema, PdfFallbackSchema, SignalEventSchema, SignalBatchSchema, WeightDeltaSchema, StreakViewSchema, HeatmapDaySchema, StreakResponseSchema, EventsResultSchema, LearningQuerySchema, InterestWeightSchema, LearningViewSchema, InterestEditSchema, ProfilePatchSchema, ProfileSchema, DemoClockRequestSchema, DemoClockResponseSchema, FastForwardRequestSchema, SimulationResultSchema, HealthSchema, ErrorSchema`.
  - `ROUTES` (as const): `onboarding, describe, taste, editionsToday, editions, edition(date), rebuild, pdf(date), events, learning, interests, profile, streak, demoClock, fastForward, cronIngest, cronEditions, health, outbound(articleId, src, editionId?)`, plus pages `today, archive, me, start, demo, paper(date), print(date)`.
  - `fixtures.ts` exports exactly `FIXTURE_USER_ID, FIXTURE_TAXONOMY (all 67 TopicNodes), FIXTURE_ARTICLES (28), FIXTURE_EDITION (20 items + 8 reserve + 3 recall), FIXTURE_ARCHIVE (10), FIXTURE_STREAK, FIXTURE_HEATMAP, FIXTURE_LEARNING, FIXTURE_INTEREST_WEIGHTS, FIXTURE_TASTE_CARDS (8, 2 wildcards), FIXTURE_SIMULATION, FIXTURE_PROFILE, FIXTURE_EVENTS_RESULT`. `FIXTURE_TAXONOMY` is built from `seed/taxonomy.json` + `seed/topic-extras.json` (JSON imports), so it is the same tree the seed loads.
  - `database.types.ts` exports a placeholder `Database` (a `public` schema with `Tables: Record<string, any>` etc., marked `// TEMP: replaced by npm run db:types in Task 6`).
  - `BRAND` exactly as in §9.5.

- [ ] **Step 1: Write the failing tests** (`contracts.test.ts`):
```ts
it('ancestorsOf/rootOf', () => { expect(ancestorsOf('technical.cs.web-dev')).toEqual(['technical','technical.cs']); expect(rootOf('sports.cricket.pakistan')).toBe('sports'); expect(ancestorsOf('news')).toEqual([]); });
it('SignalBatchSchema caps at 50 and rejects unknown types', () => {
  const ev = { type: 'open', articleId: FIXTURE_ARTICLES[0].id };
  expect(SignalBatchSchema.safeParse({ events: Array(50).fill(ev) }).success).toBe(true);
  expect(SignalBatchSchema.safeParse({ events: Array(51).fill(ev) }).success).toBe(false);
  expect(SignalBatchSchema.safeParse({ events: [{ type: 'like' }] }).success).toBe(false); });
it('every fixture passes its schema', () => { EditionSchema.parse(FIXTURE_EDITION); FIXTURE_ARTICLES.forEach(a => ArticleCardSchema.parse(a)); StreakViewSchema.parse(FIXTURE_STREAK); FIXTURE_HEATMAP.forEach(d => HeatmapDaySchema.parse(d)); /* …archive, learning, interest weights, taste, simulation, profile, events result */ });
it('fixture shape matches §9.1 counts', () => {
  expect(FIXTURE_TAXONOMY).toHaveLength(67);
  expect(FIXTURE_ARTICLES).toHaveLength(28);
  expect(new Set(FIXTURE_ARTICLES.map(a => rootOf(a.labels[0].slug))).size).toBeGreaterThanOrEqual(6);
  expect(FIXTURE_EDITION.items.map(i => i.rank)).toEqual(range(1, 20));
  expect(FIXTURE_EDITION.reserve.map(i => i.rank)).toEqual(range(21, 28));
  expect(FIXTURE_EDITION.items.filter(i => i.slot === 'explore')).toHaveLength(2);
  expect(FIXTURE_EDITION.items.filter(i => i.slot === 'serendipity')).toHaveLength(1);
  expect(FIXTURE_EDITION.leadArticleId).toBe(FIXTURE_EDITION.items[0].article.id);
  expect(FIXTURE_EDITION.recall).toHaveLength(3);
  expect(FIXTURE_TASTE_CARDS.filter(c => c.wildcard)).toHaveLength(2);
  expect(FIXTURE_ARCHIVE).toHaveLength(10); });
it('fixtures are internally consistent', () => {
  const slugs = new Set(FIXTURE_TAXONOMY.map(t => t.slug));
  const all = [...FIXTURE_EDITION.items, ...FIXTURE_EDITION.reserve];
  all.forEach(i => { expect(FIXTURE_EDITION.sectionNames[i.sectionSlug]).toBeTruthy(); i.article.labels.forEach(l => { expect(slugs.has(l.slug)).toBe(true); expect(FIXTURE_EDITION.sectionNames[l.slug]).toBeTruthy(); }); });
  expect(FIXTURE_ARTICLES.filter(a => a.recall).length).toBeGreaterThanOrEqual(20);
  FIXTURE_EDITION.recall.forEach(q => expect(FIXTURE_ARTICLES.find(a => a.id === q.articleId)?.recall).toEqual(q)); });
it('brand', () => { expect(BRAND.defaultPaperName('Ayesha')).toBe('The Ayesha Times'); expect(BRAND.defaultPaperName(null)).toBe('Your Morning Paper'); });
```
- [ ] **Step 2: Run the tests and confirm they fail.** `npx vitest run src/contracts`. Expected: FAIL (modules not found).
- [ ] **Step 3: Implement.** Paste §9.1 verbatim. `SignalBatchSchema` = `z.object({ events: z.array(SignalEventSchema).min(1).max(50) })`. `meta` = `z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))`. Recall `options` = `z.tuple([z.string(), z.string(), z.string()])`; `ArticleCardSchema.recall` = `RecallQuestionSchema.nullable()`; `EditionSchema.sectionNames` = `z.record(TopicSlugSchema, z.string())`. Fixture rules:
  - **IDs:** `00000000-0000-4000-8000-0000000000NN`.
  - **Taxonomy:** copy `docs/research/taxonomy.json` to `seed/taxonomy.json`. Write `seed/topic-extras.json` = `{ [slug]: { emoji, synonyms[2..4] } }` for the 53 level-1 and level-2 nodes. `FIXTURE_TAXONOMY` flattens the tree parents first (`emoji: null`, `synonyms: []` for level 3).
  - **Edition:** date `'2026-10-17'`, number 14, paperName `'The Ayesha Times'`. `items` use articles 0–19 with slots lead(1) · top(2–4) · core · bigstory(1) · explore(2) · serendipity(1). `reserve` uses articles 20–27. `sectionNames` maps every `sectionSlug` and label slug used to its taxonomy `name`. `recall` = the `recall` of 3 item articles.
  - **Articles:** spread over all 9 roots; labels use real taxonomy slugs. Images are `https://picsum.photos/seed/subah-NN/1200/675` on about 20 of them and `null` on the rest. About 24 are `aiProvider: 'gemini'` with a `recall` MCQ and `keyFact`; the rest are `'extractive'` with `recall: null`. Summaries are plausible but generic (no invented quotes from real people). Every item has 1–2 `reasons` using the §10.4 chip copy.
  - **Streak:** `FIXTURE_STREAK` = `done_today`, current 6, `todayStoriesRead: 3`, `editionComplete: false`, 7 `last7` days. `FIXTURE_HEATMAP` = 84 days ending `2026-10-17`.
- [ ] **Step 4: Run the tests and confirm they pass.** `npx vitest run src/contracts && npm run typecheck`. Expected: PASS, and tsc exits 0.
- [ ] **Step 5: Commit and push.** `git add src/contracts src/lib/brand.ts seed/taxonomy.json seed/topic-extras.json`, then `git commit -m "feat(contracts): §9 types, zod api schemas, ROUTES, fixtures, brand"`, then `git push origin main`.

### Task 3: Server helpers (vector, time, db, auth), browser client, proxy

**Files:**
- Create: `src/server/db/{vector,server,admin}.ts`, `src/server/time/index.ts`, `src/server/auth/session.ts`, `src/lib/supabase/browser.ts`, `src/proxy.ts`
- Test: `src/server/db/vector.test.ts`, `src/server/time/index.test.ts`, `src/server/auth/session.test.ts`, `tests/l0/proxy.test.ts`

**Interfaces:**
- Consumes: `Database` from `@/contracts/database.types`.
- Produces (exact §9.3):
  - `requestNow(): Promise<Date>`; `localDate(at: Date, tz: string): string`; `addDays(date: string, n: number): string`.
  - `getSessionUser(): Promise<{ userId: string; isAnonymous: boolean } | null>`; `requireUser(): Promise<{ userId: string; isAnonymous: boolean }>`, which throws a 401 `Response`.
  - `createSupabaseServerClient(): Promise<SupabaseClient<Database>>`; `createSupabaseAdminClient(): SupabaseClient<Database>`; `createSupabaseBrowserClient(): SupabaseClient<Database>` (in `src/lib/supabase/browser.ts`, a singleton).
  - `parseVector(v: string | null): Float32Array | null`; `toPgVector(v: Float32Array): string`.
  - `proxy(request: NextRequest): Promise<NextResponse>` + `config`.

- [ ] **Step 1: Write the failing tests.**
```ts
// vector.test.ts
expect(Array.from(parseVector('[0.5,-1,2]')!)).toEqual([0.5,-1,2]);
expect(parseVector('[1e-05, -0.5,2]')![0]).toBeCloseTo(0.00001);
expect(parseVector(null)).toBeNull(); expect(parseVector('[]')).toBeNull();
expect(toPgVector(new Float32Array([0.5, 1]))).toBe('[0.5,1]');
// time/index.test.ts  (03:00 rollover; PKT = UTC+5)
expect(localDate(new Date('2026-10-17T21:30:00Z'), 'Asia/Karachi')).toBe('2026-10-17'); // 02:30 PKT 18th
expect(localDate(new Date('2026-10-17T22:00:00Z'), 'Asia/Karachi')).toBe('2026-10-18'); // 03:00 PKT
expect(localDate(new Date('2026-10-17T05:00:00Z'), 'Asia/Karachi')).toBe('2026-10-17');
expect(localDate(new Date('2026-10-18T02:59:59Z'), 'UTC')).toBe('2026-10-17');
expect(localDate(new Date('2026-10-17T22:00:00Z'), 'Not/AZone')).toBe('2026-10-18');      // falls back to Asia/Karachi
expect(addDays('2026-10-31', 1)).toBe('2026-11-01'); expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
// requestNow (vi.mock('next/headers') → cookies().get('subah_now'))
//  DEMO_MODE=1 + cookie '2026-10-18T02:00:00.000Z' → toISOString() === '2026-10-18T02:00:00.000Z'
//  DEMO_MODE unset + same cookie → equals the faked system time (vi.setSystemTime)
//  DEMO_MODE=1 + cookie 'yesterday' or '' → equals the faked system time
// session.test.ts (vi.mock('@/server/db/server') → auth.getClaims)
//  claims { sub: 'u1', is_anonymous: true } → { userId: 'u1', isAnonymous: true }
//  data.claims null → getSessionUser() === null; requireUser() rejects with a Response whose status is 401
// tests/l0/proxy.test.ts: with NEXT_PUBLIC_SUPABASE_URL deleted, proxy(new NextRequest('http://localhost/today')) resolves to a response with status 200 and does not throw
```
- [ ] **Step 2: Run the tests and confirm they fail.** `npx vitest run src/server tests/l0/proxy.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **`localDate`:** format `new Date(at.getTime() - 3*3600_000)` with `Intl.DateTimeFormat('en-CA', { timeZone, year:'numeric', month:'2-digit', day:'2-digit' })`. Catch a `RangeError` and retry with `'Asia/Karachi'`.
  - **`addDays`:** UTC arithmetic on `${date}T00:00:00Z`.
  - **`requestNow`:** `await cookies()`. Use the cookie (an ISO 8601 UTC string, §9.7) only when `process.env.DEMO_MODE === '1'` and the parsed date is valid; empty or absent means the real clock.
  - **`db/server.ts`:** `createServerClient<Database>` with `getAll: () => store.getAll()`, and a `setAll` that tries `store.set` and swallows the error from Server Components.
  - **`db/admin.ts`:** `createClient<Database>(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } })`, memoized. It throws `Error('SUPABASE_SECRET_KEY missing')` only when called. Do **not** import `server-only` (§9.3), because tsx scripts import this file.
  - **`lib/supabase/browser.ts`:** `createBrowserClient<Database>(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)`, memoized.
  - **`session.ts`:** `getClaims()` → `claims.sub` and `claims.is_anonymous === true`.
  - **`proxy.ts`:** if either public env var is missing, return `NextResponse.next()`. Otherwise use the Supabase pattern (re-create `NextResponse.next({ request })` inside `setAll`, copy the cookies **and** the `headers` argument), `await supabase.auth.getClaims()`, and use the matcher above.
- [ ] **Step 4: Run the tests and confirm they pass.** `npx vitest run src/server tests/l0 && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit and push.** `git add src/server/db src/server/time src/server/auth src/lib/supabase src/proxy.ts tests/l0`, then `git commit -m "feat(server): time (03:00 rollover), vector, supabase clients, session, proxy refresh"`, then push.

### Task 4: Cross-lane stubs (server modules, components, hook, routes, pages)

**Files:**
- Create server stubs:
  - `src/server/ingest/index.ts` (L1)
  - `src/server/ai/index.ts`, `src/server/nlp/index.ts`, `src/server/enrich/index.ts` (L2)
  - `src/server/rank/index.ts`, `src/server/learn/index.ts`, `src/server/edition/index.ts`, `src/server/profile/index.ts` (L3)
  - `src/server/onboarding/index.ts` (L5)
  - `src/server/pdf/index.ts` (L6)
  - `src/server/streaks/index.ts` (L7)
- Create component stubs:
  - `src/components/streak/{StreakChip.tsx,live.ts}`
  - `src/components/recall/{MorningRecallCard,DoneForToday}.tsx`
  - `src/components/pdf/PdfButton.tsx`
  - `src/components/story/{WhyChip,StorySheet}.tsx`
  - `src/components/archive/ArchiveCalendar.tsx`
  - `src/components/onboarding/InterestPicker.tsx`
- Create the hook: `src/hooks/useSignals.ts`
- Create every route in §9.2 under `src/app/api/**/route.ts` (18 handlers), plus `src/app/r/[articleId]/route.ts` and `src/app/demo/route.ts`.
- Create pages: `src/app/page.tsx` (replace the scaffold), `src/app/start/page.tsx`, `src/app/(reader)/{today,archive,me}/page.tsx`, `src/app/(reader)/paper/[date]/page.tsx`, `src/app/paper/[date]/print/page.tsx`.
- Create script stubs: `scripts/{job-editions,embed-topics,simulate,snapshot}.ts`. Each logs `not implemented (owner Lx)` and exits 0.
- Test: `tests/l0/routes.test.ts`, `src/hooks/useSignals.test.tsx`

**Interfaces:**
- Consumes: Task 2 (`fixtures`, `api.ts`, `ROUTES`, `RankParams` and the engine types from `@/contracts/engine`) and Task 3 (`requestNow`).
- Produces every §9.3 signature, verbatim, with these neutral values:
  - **ingest / nlp / enrich (L1, L2):** `runIngest`, `runNlp`, `runEnrich` return zeroed `IngestStats` / `NlpStats` / `EnrichStats` and write no `job_runs`. `embedTexts` returns one zero `Float32Array(384)` per text. `writeEditorNote` returns the §9.7 template text with `source: 'template'`; its `EditorNoteInput` type includes `preferSmart?: boolean` (§9.3; the stub ignores it). `mapTextToTopics` (exported from `@/server/enrich`) returns `{ picks: [], blocked: [], provider: 'keyword' }`.
  - **ai (L2):** `callLLM` returns `{ output: opts.fallback(), provider: 'fallback', model: null, cached: false }` and never calls Gemini. `geminiStatus` returns `'missing'` when `GEMINI_API_KEY` is unset, else `'ok'`.
  - **rank (L3):** `RANK_VERSION = 'rank-v1'`. `DEFAULT_PARAMS: RankParams` is complete, with the values in the §9.1 comments and the §10.4 rewards (impression −0.05, open .30, dwell .70, read_original .60, qr_scan .60, save/share 1, more 1.5, less −1.5, skip −0.5, recall_answer .40, pdf_download .05, taste_more 1.5, taste_less −1.5, every other type 0). `buildRanking` returns `{ items: [], reserve: [], sectionOrder: [], leadId: '' }`.
  - **learn (L3):** `priorsFromOnboarding` → `{}`; `applySignal` → `{ model, deltas: [] }`; `thetaOf` → 0.5; `loadUserModel(userId, opts?: { targetDate?: string })` → an empty `UserModel` (`engaged: []`, `pos`/`neg` null, presentation from `FIXTURE_PROFILE`); `saveUserModel` → no-op; `getLearningView` → `FIXTURE_LEARNING`; `processSignals(userId, events, now)` → `{ ...FIXTURE_EVENTS_RESULT, accepted: events.length }`.
  - **profile (L3):** `getProfile(userId)` → `FIXTURE_PROFILE`.
  - **edition (L3):** `buildEdition(userId, now, opts?: { force?: boolean; awaitNote?: boolean })` → `FIXTURE_EDITION`; `getEdition(userId, date)` → `FIXTURE_EDITION` for `'2026-10-17'`, else `null`; `listArchive` → `FIXTURE_ARCHIVE`; `loadCandidatePool` → `[]`.
  - **onboarding (L5):** `getTaxonomy()` → `FIXTURE_TAXONOMY`; `getTasteCards(picks)` → `FIXTURE_TASTE_CARDS`; `getLandingHeadlines(limit)` → the first `limit` fixture articles as `{ headline, sourceName, sectionSlug }`.
  - **streaks (L7):** `recordActivity` and `getStreak` → `FIXTURE_STREAK`; `getHeatmap` → `FIXTURE_HEATMAP`.
  - **pdf (L6):** `getEditionPdfUrl` → `null`; `renderAndStoreEditionPdf` rejects with `Error('not implemented (L6)')`.
- Produces the binding §9.6 component props (owners may only add optional props):
  - `StreakChip({ streak?: StreakView })`: shows `useLiveStreak(streak ?? null) ?? FIXTURE_STREAK` (L7 adds the fetch).
  - `MorningRecallCard({ questions: RecallQuestion[]; editionId: string })`
  - `DoneForToday({ edition: Edition; readIds: string[]; streak: StreakView | null })`
  - `PdfButton({ date: string; editionId: string | null })`
  - `WhyChip({ reasons: Reason[]; breakdown?: ScoreBreakdown; onAction?: (a: 'more' | 'less' | 'hide_source') => void })`
  - `StorySheet({ item: EditionItem | null; editionId: string; open: boolean; onOpenChange: (open: boolean) => void })`
  - `ArchiveCalendar({ entries: ArchiveEntry[]; month?: string })` (`'YYYY-MM'`)
  - `InterestPicker({ taxonomy: TopicNode[]; value: { picks: InterestPick[]; blocked: TopicSlug[] }; onChange: (v: { picks: InterestPick[]; blocked: TopicSlug[] }) => void; mode: 'onboarding' | 'edit' })`
- Produces the live streak channel `src/components/streak/live.ts`: `publishStreak(s: StreakView): void` and `useLiveStreak(initial?: StreakView | null): StreakView | null` (a module-level store read with `useSyncExternalStore`).
- Produces `useSignals(editionId: string | null)`, exactly as in §9.4. It calls `publishStreak(result.streak)` after every successful flush.

- [ ] **Step 1: Write the failing tests.**
```ts
// tests/l0/routes.test.ts — import the handlers directly
expect(EditionSchema.parse(await (await getToday()).json()).items).toHaveLength(20);
expect((await postEvents(jsonReq({ events: Array(51).fill({ type: 'open' }) }))).status).toBe(400);
expect(EventsResultSchema.parse(await (await postEvents(jsonReq({ events: [{ type: 'open' }] }))).json()).accepted).toBe(1);
expect((await getEditionByDate(req, { params: Promise.resolve({ date: '1999-01-01' }) })).status).toBe(404);
expect((await getPdf(req, { params: Promise.resolve({ date: '2026-10-17' }) })).status).toBe(503);   // { fallback: '/paper/2026-10-17/print' }
for (const h of [getCronIngest, postCronIngest, getCronEditions, postCronEditions]) expect((await h(req)).status).toBe(501);
expect(HealthSchema.safeParse(await (await getHealth()).json()).success).toBe(true);
// src/hooks/useSignals.test.tsx (fake timers, fetch mocked to return FIXTURE_EVENTS_RESULT)
// track({type:'open',articleId:'a'}) ×2, advance 2000 ms → fetch called once with ROUTES.events, body { events: [2 items] }
// after that flush: lastResult equals the JSON, and a useLiveStreak() probe renders FIXTURE_EVENTS_RESULT.streak
// no track calls → advance 2000 ms → fetch not called
```
- [ ] **Step 2: Run the tests and confirm they fail.** `npx vitest run tests/l0/routes.test.ts src/hooks`. Expected: FAIL.
- [ ] **Step 3: Implement the stubs.** Every stub file starts with `// STUB (L0) — owner: Lx. Replace freely; keep the signature.`
  - **Route handlers** validate with the `api.ts` schemas (400 `{ error, issues }` on failure) and call the server stubs above with `FIXTURE_USER_ID` and `await requestNow()`. Stubs skip auth so they work without env; owners add `requireUser()` (§9.7). `/api/events` calls `processSignals`. `/api/onboarding` → `{ editionDate: '2026-10-17' }`. `/api/me/learning` → `getLearningView`. `/api/me/streak` → `{ streak: getStreak, heatmap: getHeatmap }`. `/api/taste` → `getTasteCards`.
  - **Cron:** `/api/cron/ingest` and `/api/cron/editions` each export **both GET and POST** (Vercel cron sends GET) and return 501 `{ error: 'not implemented', owner }`.
  - **`/api/health`:** real but defensive. `db` is true if `topics` returns a head count via the admin client (inside try/catch). `gemini` is `geminiStatus()`. `lastIngest` is the newest `job_runs.finished_at`. `fallback` is `DEMO_FALLBACK === '1'`.
  - **`/r/[id]`:** 302 to the fixture article URL, or 404.
  - **`/demo`:** redirects to `/today`.
  - **Pages** render a heading, an owner badge, and enough fixture content to be visibly real. `/today` shows the masthead text, a `PdfButton`, and the 20 headlines, each with a `WhyChip`. `/archive` renders `ArchiveCalendar`. `/me` renders tabs. `/start` renders `InterestPicker` (`mode="onboarding"`, `FIXTURE_TAXONOMY`) from a `'use client'` page holding the value in state. `/` shows `BRAND` and the "Make my paper" CTA.
  - **`paper/[date]`** pages use `PageProps<'/paper/[date]'>` and `await params`.
  - **`useSignals`** queues events and flushes every 2 s with `fetch(ROUTES.events, { method:'POST', keepalive:true })`. It also flushes on `visibilitychange`, uses `navigator.sendBeacon` on `pagehide`, and emits an impression after ≥ 1 s at threshold 0.5 (once per article id). `startDwell` returns `stop()`, which emits `dwell` with the ms, excluding hidden time.
- [ ] **Step 4: Run the tests and confirm they pass.** `npx vitest run && npm run typecheck && npm run lint && npm run build`. Expected: PASS. The build lists every route in §9.2, plus `/today`, `/archive`, `/me`, `/paper/[date]`, `/paper/[date]/print`, `/start` and `/`.
- [ ] **Step 5: Commit and push.** `git add src scripts tests`, then `git commit -m "feat(stubs): §9.3 server stubs, §9.6 components, useSignals, all routes and pages on fixtures"`, then push. **This push unblocks the lanes: they start from this commit.** Tell the orchestrator. Tasks 5–8 land on `main` right afterwards and reach the lanes when they rebase (at the latest before Checkpoint A).

### Task 5: GitHub issues (req-1..req-5 + one per lane)

Run this right after the Task 4 push. It only needs the repo on origin; `munib123`'s `gh` token has `repo` scope. Lanes link these issues from their draft PRs (PLAN §4).

- [ ] **Step 1: Create the labels and issues** (Git Bash, in the repo):
```bash
for l in req-1-onboarding req-2-pdf req-3-web req-4-learning req-5-explore lane; do gh label create "$l" --force; done
gh issue create --label req-1-onboarding --title "Req 1: Onboarding" --body "ARCHITECTURE §2 row 1. Owner: L5 (+ L3 priors)."
gh issue create --label req-2-pdf        --title "Req 2: PDF newspaper" --body "ARCHITECTURE §2 row 2. Owner: L6."
gh issue create --label req-3-web        --title "Req 3: Webpage (today, archive, paper/[date])" --body "ARCHITECTURE §2 row 3. Owners: L4, L7."
gh issue create --label req-4-learning   --title "Req 4: Learning loop" --body "ARCHITECTURE §2 row 4. Owners: L3, L7, L2."
gh issue create --label req-5-explore    --title "Req 5: Room to explore" --body "ARCHITECTURE §2 row 5. Owners: L3, L4, L7."
for n in "L1 Ingest:L1-ingest" "L2 AI & NLP:L2-ai-nlp" "L3 Engine:L3-engine" "L4 Reader UI:L4-reader" "L5 Onboarding:L5-onboarding" "L6 PDF:L6-pdf" "L7 Engagement:L7-engagement"; do
  gh issue create --label lane --title "${n%%:*}" --body "Plan: docs/plans/${n#*:}.md · handoff: docs/handoff/${n%% *}.md · merge at Checkpoints A 14:30 / B 15:30 / C 16:30"
done
```
  - **Projects board:** skip it. Only if `gh auth refresh -s project` succeeds (it needs a browser, so ask the user to run `! gh auth refresh -s project`) do stretch item S4.
- [ ] **Step 2: Verify.** `gh issue list --label lane --json number --jq length` → `7`, and `gh issue list --search "label:req-1-onboarding,req-2-pdf,req-3-web,req-4-learning,req-5-explore" --json number --jq length` → `5`. Note the issue numbers for `docs/handoff/L0.md` (written in Task 9). This task has nothing to commit.

### Task 6: Migration, RLS, storage bucket, generated types, seed

**Files:**
- Create: `supabase/config.toml` (`npx supabase init`), `supabase/migrations/0001_init.sql`, `seed/feeds.json` (byte copy from `docs/research/`), `scripts/lib/env.ts`, `scripts/lib/seed-data.ts`, `scripts/seed.ts`
- Modify: `src/contracts/database.types.ts` (generated)
- Test: `tests/l0/migration.test.ts`, `scripts/lib/seed-data.test.ts`

**Interfaces:**
- Consumes: `createSupabaseAdminClient()` (Task 3) and `FIXTURE_TAXONOMY` (Task 2, built from `seed/taxonomy.json` + `seed/topic-extras.json`).
- Produces:
  - `topicRows(nodes: TopicNode[]): TopicRow[]` (snake_case, parents before children)
  - `slugify(name: string): string`
  - `mapKind(e: FeedEntry): 'rss'|'hn'|'devto'|'arxiv'`
  - `mapRegion(r: string): 'pk'|'global'`
  - `selectSources(feeds: FeedEntry[]): SourceRow[]`
  - `scripts/lib/env.ts` calls `process.loadEnvFile('.env.local')` inside try/catch. Every script imports it first.
  - In the DB (§7): the `articles.embed_model text` column and the SQL function `increment_llm_usage(p_day date, p_model text, p_requests int, p_limited int, p_in int, p_out int) returns int` (atomic upsert into `llm_usage`; L2's `callLLM` calls it through `rpc`).

- [ ] **Step 1: Write the failing tests.**
```ts
// seed-data.test.ts
const rows = topicRows(FIXTURE_TAXONOMY); expect(rows).toHaveLength(67);
expect(rows.filter(r => r.level === 1)).toHaveLength(9); expect(rows.filter(r => r.level === 2)).toHaveLength(44); expect(rows.filter(r => r.level === 3)).toHaveLength(14);
expect(rows.find(r => r.slug === 'technical.cs.web-dev')!.parent_slug).toBe('technical.cs');
rows.filter(r => r.level < 3).forEach(r => { expect(r.emoji).toBeTruthy(); expect(r.synonyms.length).toBeGreaterThanOrEqual(2); expect(r.synonyms.length).toBeLessThanOrEqual(4); });
expect(slugify('BBC News - Science & Environment')).toBe('bbc-news-science-environment');
const src = selectSources(feeds); expect(src).toHaveLength(117);            // 114 core rss + hacker-news + dev-to + arxiv (§9.7)
expect(new Set(src.map(s => s.id)).size).toBe(117);
expect(countBy(src, 'kind')).toEqual({ rss: 114, hn: 1, devto: 1, arxiv: 1 });
expect(src.filter(s => s.kind !== 'rss').map(s => s.id).sort()).toEqual(['arxiv','dev-to','hacker-news']);
expect(src.filter(s => s.region === 'pk')).toHaveLength(29);
// migration.test.ts — read supabase/migrations/0001_init.sql
// all 15 §7 tables exist (incl. llm_usage) and every `create table X` has `alter table X enable row level security`;
// the articles table body contains /embed_model\s+text/;
// /create (or replace )?function increment_llm_usage\(p_day date, p_model text, p_requests int, p_limited int, p_in int, p_out int\)/ matches,
//   and the function body has `on conflict (usage_day, model) do update` and `returning requests`;
// 'papers' bucket inserted with public false;
// policies exist on profiles, user_interests, interest_snapshots, editions, edition_items, events, daily_activity, streaks; llm_cache and llm_usage have none
```
- [ ] **Step 2: Run the tests and confirm they fail.** `npx vitest run scripts tests/l0/migration.test.ts`. Expected: FAIL.
- [ ] **Step 3: Write `0001_init.sql`.**
  - Copy §7 verbatim, including `llm_usage`, the `articles.embed_model text` column and the `increment_llm_usage(...)` function, and extend its RLS block. Every one of the 15 tables gets `enable row level security`.
  - Catalogue tables: `read_all` select on `topics`, `sources`, `clusters`, `articles` and `job_runs`.
  - Owner policies (`to authenticated`, `(select auth.uid()) = user_id`; select/insert/update, with `with check` on insert and update) on `profiles`, `user_interests`, `interest_snapshots`, `editions`, `events`, `daily_activity` and `streaks`.
  - `edition_items` uses `exists (select 1 from editions e where e.id = edition_id and e.user_id = (select auth.uid()))`.
  - `llm_cache` and `llm_usage` get no policies (service role only). `increment_llm_usage` is `language sql` without `security definer`, so callers without the secret key are still blocked by RLS on `llm_usage`.
  - Explicit `grant select` on the catalogue tables to `anon, authenticated`, and `grant select, insert, update` on the per-user tables to `authenticated`.
  - Storage: `insert into storage.buckets (id, name, public) values ('papers','papers',false) on conflict (id) do nothing`, plus policy `papers_owner_read` on `storage.objects` for select to authenticated, using `bucket_id = 'papers' and (storage.foldername(name))[1] = (select auth.uid())::text` (keys are `{userId}/{date}-{hash}.pdf`, §9.7).
- [ ] **Step 4: Implement the seed.** `seed-data.ts` provides the pure functions.
  - `selectSources` (§9.7) = `verified && /tier=core/` plus the verified `arXiv API` entry. The three API entries get fixed ids and kinds by URL: `hacker-news.firebaseio.com` → `hacker-news` (`hn`), `dev.to/api` → `dev-to` (`devto`), `export.arxiv.org/api` → `arxiv` (`arxiv`). Every `rss` entry gets `id = slugify(name)`.
  - `mapRegion`: `'pakistan'` → `'pk'`, anything else → `'global'`.
  - `topics` = `taxonomy`, and `homepage` = the URL origin.
  - `seed.ts` upserts topics (onConflict `slug`, in level order, **never sending `embedding`**), then sources (onConflict `id`). It prints `topics=<n> sources=<n>` from `count: 'exact', head: true` queries.
- [ ] **Step 5: Run the tests and confirm they pass.** `npx vitest run scripts tests/l0`. Expected: PASS.
- [ ] **Step 6: Apply to the hosted project.** This needs `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF` and `SUPABASE_DB_PASSWORD` in `.env.local` (the user pastes them). In Git Bash: `npx supabase init` (answer N to the IDE prompts), then `npx supabase link --project-ref "$SUPABASE_PROJECT_REF" --password "$SUPABASE_DB_PASSWORD"`, then `npx supabase db push --password "$SUPABASE_DB_PASSWORD"`. Expected: `Applying migration 0001_init.sql... Finished`.
  - **Fallback:** if the CLI fails for more than 5 min, tell the user: "Paste `supabase/migrations/0001_init.sql` into Dashboard → SQL Editor → Run." Then continue.
  - **If the keys haven't arrived yet:** keep the placeholder types, finish Task 7 first, and come back here.
- [ ] **Step 7: Generate the types and seed.** Run `npm run db:types` (an npm script, so cmd writes UTF-8; never PowerShell `>`), then `npm run typecheck`, then `npm run seed`. Expected: tsc exits 0, the generated types include `embed_model` on `articles` and `increment_llm_usage` under `Functions`, and the script prints `topics=67 sources=117`.
- [ ] **Step 8: Commit and push.** `git add supabase/config.toml supabase/migrations seed scripts/lib scripts/seed.ts src/contracts/database.types.ts tests/l0/migration.test.ts`, then `git commit -m "feat(db): 0001_init with full RLS, llm_usage + increment_llm_usage, embed_model, papers bucket, generated types, seed"`, then push.

### Task 7: Job skeleton, env, CI, Vercel cron, Playwright config, handoff folder

**Files:**
- Create: `scripts/job-ingest.ts`, `.env.example`, `.github/workflows/ci.yml`, `vercel.json`, `playwright.config.ts`, `e2e/L0-smoke.spec.ts`, `docs/handoff/README.md`, `docs/handoff/L1.md` … `L7.md` (empty), `docs/handoff/L0.md`

**Interfaces:**
- Consumes: `runIngest`, `runNlp`, `runEnrich` (stubs from Task 4) and `createSupabaseAdminClient`.
- Produces: `npm run job:ingest`, which inserts **one** `job_runs` row `{ job: 'ingest' }` (§9.7; the stages never write `job_runs`). It runs the three stages in order, collecting `{ ingest, nlp, enrich }` stats. It then updates `finished_at`, `status: 'ok' | 'error'` and `stats`, exits 1 on error, and logs one summary line.
- Produces: `playwright.config.ts` (`testDir: 'e2e'`, `baseURL: 'http://localhost:3000'`, `webServer: { command: 'npm run dev', port: 3000, reuseExistingServer: true }`, chromium only). Lanes add only `e2e/L<n>-*.spec.ts`.

- [ ] **Step 1: Write `job-ingest.ts`.** Parse the CLI flags `--limit=N` and `--sources=a,b` into the stage `opts`. The job needs no test, because the orchestration has no logic beyond sequencing. Run `npm run job:ingest`. Expected: `ingest ok {"ingest":{"sources":0,...}}` and a new `job_runs` row with `status='ok'` (skip the DB part if Task 6 is pending).
- [ ] **Step 2: Write `.env.example`** with every §5 and §9.7 name:
  - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`
  - `GEMINI_API_KEY`, `GEMINI_MODEL_FAST=gemini-3.5-flash-lite`, `GEMINI_MODEL_FALLBACK=gemini-3.1-flash-lite`, `GEMINI_MODEL_SMART=gemini-3.8-flash`, `GEMINI_MODEL_TTS=gemini-3.8-flash-tts`, `GEMINI_RPD_FAST=450`, `GEMINI_RPD_FALLBACK=450`, `GEMINI_RPD_SMART=18`, `GEMINI_RPM_FAST=12`, `GEMINI_RPM_FALLBACK=12`, `GEMINI_RPM_SMART=4`, `GEMINI_EMBED_MODEL=gemini-embedding-2`
  - `EMBEDDINGS_PROVIDER=local`, `MODEL_CACHE_DIR=` (PLAN §4: `%USERPROFILE%\.cache\subah-models`)
  - `CRON_SECRET`, `NEXT_PUBLIC_APP_URL=http://localhost:3000`
  - `DEMO_MODE=1`, `DEMO_FALLBACK=1`, `DEMO_USER_EMAIL`, `DEMO_USER_PASSWORD`
  - A commented CLI-only block: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`.
- [ ] **Step 3: Write `ci.yml`.** Trigger on push and pull_request, with ubuntu-latest and `actions/setup-node` at `node-version: 24`, `cache: npm`. Set env `PUPPETEER_SKIP_DOWNLOAD=true`, `NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_placeholder` and `SUPABASE_SECRET_KEY=sb_secret_placeholder` (no `GEMINI_API_KEY`: CI never spends quota). Steps: `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. (Lane workflows map `secrets.SUPABASE_URL` → `NEXT_PUBLIC_SUPABASE_URL`, §9.7.)
- [ ] **Step 4: Write `vercel.json`.** `{ "crons": [{ "path": "/api/cron/editions", "schedule": "0 0 * * *" }] }`.
- [ ] **Step 5: Write the Playwright config and the e2e smoke spec** (do not run it; the run is stretch item S2). `e2e/L0-smoke.spec.ts`: each of `/`, `/start`, `/today`, `/archive`, `/me`, `/paper/2026-10-17`, `/paper/2026-10-17/print` returns 200 and shows an `<h1>`. (Not in CI; it needs a dev server.)
- [ ] **Step 6: Create the handoff folder.** `docs/handoff/README.md` covers:
  - one file per lane (`docs/handoff/L<n>.md`), and only the owner writes it; there is no shared HANDOFF.md
  - the sections: Done / Stubbed / Env needed / Verify commands / Contract requests
  - the screens folder
  - `e2e/L<n>-*.spec.ts` naming
- [ ] **Step 7: Verify.** `npm run typecheck && npm run lint && npm test && npm run build`. Expected: all exit 0.
- [ ] **Step 8: Commit and push.** `git add scripts/job-ingest.ts .env.example .github vercel.json playwright.config.ts e2e docs/handoff`, then `git commit -m "chore(ci): ingest job skeleton, env example, CI, vercel cron, playwright config, handoff folder"`, then push. Do not wait on CI: continue with Task 8 and check the run in Task 9.

### Task 8: App shell, tokens, theme

**Files:**
- Create: `src/styles/tokens.css`, `src/components/shell/{TopBar,BottomNav,NavLinks,ThemeToggle,Providers}.tsx`, `src/app/(reader)/layout.tsx`
- Modify: `src/app/layout.tsx`, `src/app/globals.css`
- Test: `src/components/shell/shell.test.tsx`

**Interfaces:**
- Consumes: `BRAND` and `StreakChip` (Task 4).
- Produces:
  - `TopBar({ right?: ReactNode })`
  - `BottomNav()`
  - `ThemeToggle()`
  - `Providers({ children })` (next-themes `ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem` plus `<Toaster />`)
  - Tailwind utilities: `bg-paper bg-paper-2 text-ink text-ink-2 border-rule text-accent bg-accent text-accent-ink text-positive text-warning text-danger ring-focus bg-sec-{news,business,technical,science,health,sports,entertainment,arts,lifestyle} font-headline font-body font-ui rounded-card`

- [ ] **Step 1: Write the failing test** (`shell.test.tsx`, mocking `next/navigation` with `usePathname` → `'/archive'`):
```ts
render(<TopBar />); expect(screen.getByText('Subah')).toBeInTheDocument();
['/today','/archive','/me'].forEach(h => expect(screen.getAllByRole('link').map(a => a.getAttribute('href'))).toContain(h));
render(<BottomNav />); expect(screen.getAllByRole('link', { name: /archive/i }).some(a => a.getAttribute('aria-current') === 'page')).toBe(true);
```
- [ ] **Step 2: Run the test and confirm it fails.** `npx vitest run src/components/shell`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **`tokens.css`** holds raw custom properties on `:root` (light): `--paper --paper-2 --ink --ink-2 --rule --accent --accent-ink --positive --warning --danger --focus --sec-*`, plus `--type-headline: var(--font-fraunces), Georgia, serif`, `--type-body: var(--font-newsreader), Georgia, serif`, `--type-ui: var(--font-bricolage), system-ui, sans-serif` and `--card-radius: 14px`. Raw names avoid self-reference with the Tailwind keys.
  - **Dark ("Night edition")** values repeat under `[data-theme=dark]` and under `@media (prefers-color-scheme: dark) { :root:not([data-theme=light]) { … } }`. Use a warm dark paper, not #000. All text and accent pairs need ≥ 4.5:1 contrast, and section colours ≥ 3:1 against `--paper`.
  - **Pick an original accent.** Avoid DevBytes' colours, cream + hairline broadsheet clichés, and ALL-CAPS eyebrows.
  - **`globals.css`:** `@import "tailwindcss"; @import "../styles/tokens.css";`, then `@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));`, then `@theme inline { --color-paper: var(--paper); … --font-headline: var(--type-headline); --font-body: var(--type-body); --font-ui: var(--type-ui); --radius-card: var(--card-radius); }`. Re-point shadcn's `--background/--foreground/--primary/--border/--ring/--popover/--muted` at our tokens so the primitives follow the theme. Add a `prefers-reduced-motion` reset.
  - **`layout.tsx`:** `next/font/google` `Fraunces`, `Newsreader` and `Bricolage_Grotesque` with `variable: '--font-fraunces' | '--font-newsreader' | '--font-bricolage'`, `display: 'swap'` and `subsets: ['latin']`. Put the variables on `<html suppressHydrationWarning>` and `body className="bg-paper text-ink font-body"`. Metadata comes from `BRAND`.
  - **`(reader)/layout.tsx`:** `<TopBar right={<StreakChip />} />`, then `<main className="pb-20 md:pb-0">`, then `<BottomNav />` (`md:hidden`, fixed, 44 px targets, `aria-current`). TopBar nav shows from `md` up.
- [ ] **Step 4: Run the tests and confirm they pass.** `npx vitest run && npm run build`. Expected: PASS. (Real-browser screenshots are stretch item S1.)
- [ ] **Step 5: Commit and push.** `git add src/styles src/components/shell "src/app/(reader)/layout.tsx" src/app/layout.tsx src/app/globals.css`, then `git commit -m "feat(shell): tokens light/dark, fonts, TopBar, BottomNav, theme provider, toaster"`, then push.

### Task 9: Acceptance and tag

- [ ] **Step 1: Run the gates.** Run the acceptance checks below (including `gh run list --limit 1` for the Task 7/8 CI runs), write `docs/handoff/L0.md`, commit it (`docs(handoff): L0`), push, then `git tag l0-foundation && git push origin l0-foundation`.

---

## Acceptance checks

| Command | Expected |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0, no errors |
| `npm test` | all node and dom projects pass (contracts, vector, time, session, proxy, routes, useSignals, shell, seed-data, migration incl. `embed_model` + `increment_llm_usage`) |
| `npm run build` | exit 0. The route list includes `/`, `/start`, `/today`, `/archive`, `/me`, `/paper/[date]`, `/paper/[date]/print`, `/r/[articleId]`, `/demo` and all 18 `/api/*` handlers |
| `curl -s localhost:3000/api/editions/today \| node -e "…EditionSchema.parse"` | 20 items, 8 reserve, `sectionNames` present |
| `curl -s -o /dev/null -w "%{http_code}" -X POST localhost:3000/api/events -d '{"events":[]}'` | `400` |
| `curl -s localhost:3000/api/health` | `{"db":true,"gemini":"missing"\|"ok","lastIngest":"…","fallback":true}` |
| `curl -s -o /dev/null -w "%{http_code}" localhost:3000/api/cron/editions` (GET) | `501` |
| visit `/`, `/start`, `/today`, `/archive`, `/me`, `/paper/2026-10-17`, `/paper/2026-10-17/print` on :3000 | each renders its stub heading |
| `npm run seed` | `topics=67 sources=117` |
| `grep -c GEMINI_RPM_ .env.example` | `3` (FAST, FALLBACK, SMART) |
| `gh issue list --label lane --json number --jq length` | `7`, plus 5 `req-*` issues |
| `git ls-files page.html .env.local` | empty |
| `gh run list --limit 1` | `completed success` for the last push; tag `l0-foundation` is on origin |

## Handoff (`docs/handoff/L0.md`)

Write these sections:
- **Done:** the scaffold, the contracts, the fixtures, the server helpers, the migration (how it was applied: CLI or dashboard), the seed counts, the issues (numbers for `req-1..req-5` and each lane), CI, the Vercel cron, the Playwright config and the shell and tokens.
- **Exact versions** of every unpinned package, copied from `package.json`.
- **Stub inventory:** one table with file → owner → what the stub returns (Task 4 list, including `live.ts`, `@/server/profile`, the `@/server/onboarding` trio, `EditorNoteInput.preferSmart` and `loadUserModel`'s `opts.targetDate`).
- **Fixtures guide:** the export names, and the fact that edition `2026-10-17` No. 14 is the only one `getEdition` returns.
- **Token names and classes** (the Task 8 list). The reskin edits `src/styles/tokens.css` only.
- **Env:** the names, and which ones are set in `.env.local`, Vercel and GitHub.
- **Lane start recipe:** `git worktree add ..\subah-Ln -b lane/Ln-name`, copy `.env.local`, `npm ci`, `npm run dev -- -p <port>`. Merge rounds at Checkpoints A 14:30 / B 15:30 / C 16:30.
- **Verify commands:** the acceptance table.
- **Contract requests:** none at hand-off (ARCHITECTURE §9 resolved them); record any new gap here.
- **Known issues:** any `--legacy-peer-deps`, whether the migration was applied through the dashboard, and which stretch items were skipped.

## Cut line

L0 has no cut line of its own in PLAN.md §5, because it blocks every lane. The blocking part is Tasks 1–4 (about 40 minutes): lanes start from the Task 4 push and build on fixtures. Tasks 5–8 follow on `main` right after, and lanes pick them up when they rebase. If the Supabase keys are not ready by the end of Task 5, do Task 7 and Task 8 first and come back to Task 6. If L0 runs over 1 h, defer in this order:
1. Task 8 (lanes still compile; the token classes simply render unstyled until it lands)
2. the DB push (paste the SQL into the dashboard instead, and keep the placeholder `Database` type until the push is done)

**Never cut:** the verbatim contracts, the fixtures passing their schemas, every stub signature and §9.6 prop, a green `npm run build`, the `req-*` issues, and the push to `main`.

## Stretch (stretch, only if green)

Do these only when Tasks 1–9 are done and CI is green. Each is independent.

- [ ] **S1: Shell screenshots** (was the shell task's browser step). Run `npx playwright install chromium` (once) and `npm run dev` (port 3000). Then `npx playwright screenshot --viewport-size "390,844" --full-page http://localhost:3000/today docs/handoff/screens/L0-today-390.png`, the same at `"1280,800"` → `L0-today-1280.png`, and `--color-scheme dark` at 390 → `L0-today-dark-390.png`. Open each PNG with the Read tool. Expected: brand + nav at 1280, bottom nav and no horizontal scroll at 390, the dark paper surface in the dark shot, and the 20 fixture headlines in Fraunces. Commit `docs/handoff/screens` and push.
- [ ] **S2: Run the e2e smoke.** `npm run e2e`. Expected: `e2e/L0-smoke.spec.ts` 7 passed.
- [ ] **S3: Ship the env.** `vercel link`, `vercel env add` for each `.env.example` key, and `gh secret set SUPABASE_URL SUPABASE_SECRET_KEY GEMINI_API_KEY CRON_SECRET` from `.env.local`.
- [ ] **S4: GitHub Projects board** (only if `gh auth refresh -s project` succeeded). `gh project create --owner munib123 --title "Subah"`, then `gh project item-add <n> --owner munib123 --url <issue-url>` for each Task 5 issue.
