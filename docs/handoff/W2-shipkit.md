# W2-shipkit: handoff (DEMO_FALLBACK snapshot)

Status: ready for merge (branch `lane/W2-shipkit`, PR #48). PLAN §6 infra line: "`DEMO_FALLBACK=1` serves the snapshot with the network off" (ARCHITECTURE §12).

The lane ships the snapshot and the read functions. It does **not** edit the owners' files: each owner (or the integrator) adds the two-line guards under "Integration patches" below. Until those land, `DEMO_FALLBACK=1` only changes `/api/health` and L7's storage-error fallbacks, as before.

## What shipped

| Path | What |
|---|---|
| `scripts/snapshot-demo.ts` · `npm run demo:snapshot` | Exports the demo persona (`profiles.is_demo = true`, secret key) to `public/demo/snapshot.json`: profile, `user_interests`, `interest_snapshots`, every edition hydrated by L3's own `getEdition` (contract `Edition`s: no embeddings, no `content_text`, `pdfUrl` null), the archive (`listArchive`), the referenced clusters (headline, importance, counts), `daily_activity`, the `streaks` row, the last 200 events and a `LearningView`. Deterministic: sorted keys, 2-space indent, stable row order. Flags: `--user=<uuid>`, `--out=<path>`. Fails loudly (exit 1) when the file would not parse or exceeds 3 MB (it then sheds events first). |
| `public/demo/snapshot.json` | Committed export of **Ayesha** (`5d9967f0-a20e-4298-8e5a-69322679956a`): editions No. 1–8 for 2026-10-10 … 2026-10-17 (20 items + 8 reserve each; recall on 4 of them), 220 articles, 164 clusters, 67 interests, 8 interest snapshots, 7 activity days, streak 7, 200 events, learning view (5 movers, 20-row timeline). 951 KB. |
| `src/server/demo/snapshot.ts` (+ `index.ts` barrel) | `isDemoFallback()`, `loadSnapshot()` (memoized `fs` read, zod-validated), `snapshotPersonaId()`, and the mirrors below. Any `userId` maps to the persona. |
| `src/server/demo/schema.ts` | `SnapshotSchema` (zod), built from the contract schemas `EditionSchema`, `ArchiveEntrySchema`, `ProfileSchema`, `LearningViewSchema`. |
| `src/server/demo/format.ts` | `stableStringify`, `pickLocalPdf(date, files)` (a `public/demo/*.pdf` whose name holds the edition date → `/demo/<file>`; `sample.pdf` never matches). |
| `src/server/demo/derive.ts` | `deriveLearningView` (snapshot time only): thetas via L3's `thetaOf`, movers via `moversBetween` (baseline = the interest snapshot on or before `sinceDate`), summary via `moversSentence`, timeline effects via `applySignal` on her current model ("AI & Machine Learning +3.2%"). Used while `getLearningView` is still the L0 stub; the script prefers the real function as soon as it stops returning `FIXTURE_LEARNING`. |
| `tests/w2/derive.test.ts` · `tests/w2/snapshot.test.ts` | 21 tests: deterministic JSON, PDF lookup, the derived view, and every read function parsed with its contract schema against the committed JSON; today's edition exists for `persona.latestEditionDate`. |

### Read functions (exact mirrors of the owners' signatures, §9.3)

| Owner function | Snapshot mirror | Notes |
|---|---|---|
| `getProfile(userId)` (L3) | `snapshotGetProfile(userId)` | the persona's `Profile` |
| `getEdition(userId, date)` (L3) | `snapshotGetEdition(userId, date)` | `null` for a date without a paper |
| `buildEdition(userId, now, opts?)` (L3, what `/today` calls) | `snapshotBuildEdition(userId, now, opts?)` | the paper of `localDate(now, tz)`; when the demo clock points at a day without one, the latest paper (never throws) |
| `listArchive(userId, limit = 60)` (L3) | `snapshotListArchive(userId, limit)` (alias `snapshotListEditions`) | newest first |
| `getStreak(userId, now, tz)` (L7) | `snapshotGetStreak(userId, now, tz)` (alias `snapshotGetStreakView`) | recomputed from the snapshot's `daily_activity` with L7's pure `computeStreak`, so the demo clock works offline |
| `getHeatmap(userId, days, now, tz)` (L7) | `snapshotGetHeatmap(userId, days, now, tz)` | `buildHeatmap` on the same rows |
| `getLearningView(userId, sinceDays, now)` (L3) | `snapshotGetLearningView(userId, sinceDays, now)` | the exported view |
| `processSignals(userId, events, now)` (L3) | `snapshotProcessSignals(userId, events, now)` | accepts the batch, stores nothing, answers the streak (`deltas: []`, `toast: null`) |
| `/r/[articleId]` lookup (L4) | `snapshotGetArticle(articleId)` → `ArticleCard \| null` | every story of every snapshot edition, by id |

`Edition.pdfUrl` / `ArchiveEntry.pdfUrl` come back as `/demo/<file>.pdf` when L6's persona PDFs sit in `public/demo` with the edition date in the file name, else `null` (the PDF button then takes the print route).

## How to verify

| Command | Expected |
|---|---|
| `npx vitest run tests/w2` | 2 files, 21 tests pass |
| `npm run demo:snapshot` | prints a JSON summary (`editions` 8, `articles` 220, `learning.source` `derived` until L3's real view lands) and rewrites `public/demo/snapshot.json`; `git diff --stat` shows only value changes (key order is stable) |
| `npm run typecheck && npm run lint && npm test && npm run build` | exit 0 (lint: L0's one `<img>` warning) |
| `node -e "const s=require('./public/demo/snapshot.json');console.log(s.persona, s.editions.length)"` | Ayesha, `latestEditionDate` 2026-10-17, 8 |

**Offline run (after the integration patches are applied):**
1. `.env.local`: `DEMO_FALLBACK=1` and `DEMO_MODE=1`.
2. Cut the network, or point `NEXT_PUBLIC_SUPABASE_URL=https://127.0.0.1:9` (an unreachable host) and leave the keys as they are.
3. `npm run dev`, then open `/` → "Try the demo reader" (`/demo`) → `/today` (Ayesha's No. 8), `/paper/2026-10-16`, `/archive` (8 editions, the 7-day strip), `/me` (bars, movers "More Global Affairs and Pakistan Economy…", the streak panel with 7 days). Open a story, skip one, "Read original" (`/r/…` → the publisher), `Download PDF` (the print route when no persona PDF is in `public/demo`), "Next morning →" (the clock moves; the latest paper is served again, see "Still needs the network").
4. `curl -s localhost:3000/api/health` → `"fallback":true` (`db` is `false` after a 3 s budget).

## Integration patches (exact; apply in this order)

Every snippet is the current first lines of the function followed by the two lines to add. One import per file:

```ts
import { isDemoFallback, snapshotGetEdition, snapshotListArchive } from '@/server/demo';
```

### 1. `src/server/edition/read.ts` (L3): `getEdition`, `listArchive`

```ts
export async function getEdition(userId: string, date: string): Promise<Edition | null> {
  if (isDemoFallback()) return snapshotGetEdition(userId, date);
  if (isFixtureUser(userId)) return date === FIXTURE_EDITION.date ? FIXTURE_EDITION : null;
```

```ts
export async function listArchive(userId: string, limit = 60): Promise<ArchiveEntry[]> {
  if (isDemoFallback()) return snapshotListArchive(userId, limit);
  if (isFixtureUser(userId)) return FIXTURE_ARCHIVE.slice(0, limit);
```

### 2. `src/server/edition/build.ts` (L3): `buildEdition` (the function `/today`, `/api/editions/today`, `/api/editions/rebuild` and `/api/onboarding` call)

Import: `import { isDemoFallback, snapshotBuildEdition } from '@/server/demo';`

```ts
export async function buildEdition(userId: string, now: Date, opts: { force?: boolean; awaitNote?: boolean } = {}): Promise<Edition> {
  if (isDemoFallback()) return snapshotBuildEdition(userId, now, opts);
  if (isFixtureUser(userId)) return FIXTURE_EDITION;
```

### 3. `src/server/profile/index.ts` (L3): `getProfile`

Import: `import { isDemoFallback, snapshotGetProfile } from '@/server/demo';`

```ts
export async function getProfile(userId: string): Promise<Profile | null> {
  if (isDemoFallback()) return snapshotGetProfile(userId);
  if (isFixtureUser(userId)) return FIXTURE_PROFILE;
```

### 4. `src/server/streaks/index.ts` (L7): `recordActivity`, `getStreak`, `getHeatmap`

Import: `import { isDemoFallback, snapshotGetHeatmap, snapshotGetStreak } from '@/server/demo';`

```ts
export function recordActivity(userId: string, events: SignalEvent[], now: Date, tz: string): Promise<StreakView> {
  if (isDemoFallback()) return snapshotGetStreak(userId, now, tz);
  return recordActivityWith(supabaseStreakRepo(), userId, events, now, tz);
}

export function getStreak(userId: string, now: Date, tz: string): Promise<StreakView> {
  if (isDemoFallback()) return snapshotGetStreak(userId, now, tz);
  return getStreakWith(supabaseStreakRepo(), userId, now, tz);
}

export function getHeatmap(userId: string, days: number, now: Date, tz: string): Promise<HeatmapDay[]> {
  if (isDemoFallback()) return snapshotGetHeatmap(userId, days, now, tz);
  return getHeatmapWith(supabaseStreakRepo(), userId, days, now, tz);
}
```

### 5. `src/server/learn/index.ts` (L3): `getLearningView`, `processSignals`

Import: `import { isDemoFallback, snapshotGetLearningView, snapshotProcessSignals } from '@/server/demo';`

```ts
export async function getLearningView(userId: string, sinceDays: number, now: Date): Promise<LearningView> {
  if (isDemoFallback()) return snapshotGetLearningView(userId, sinceDays, now);
  return FIXTURE_LEARNING;   // or the real body once Task 12 lands; the guard stays first
}

export async function processSignals(userId: string, events: SignalEvent[], now: Date): Promise<EventsResult> {
  if (isDemoFallback()) return snapshotProcessSignals(userId, events, now);
  return { ...FIXTURE_EVENTS_RESULT, accepted: events.length };
}
```

### 6. `src/server/auth/session.ts` (L0): `getSessionUser` **must** short-circuit

Why: with the network off, `supabase.auth.getClaims()` cannot verify a token (JWKS fetch, or `getUser()` for HS256 tokens) and returns no claims, so every page calls `redirect('/start')`; `/demo`'s password sign-in fails too. In fallback mode the persona is the only reader, so the session *is* the persona. `requireUser()` inherits the guard, which covers every route handler.

Import: `import { isDemoFallback, snapshotPersonaId } from '@/server/demo';`

```ts
export async function getSessionUser(): Promise<SessionUser | null> {
  if (isDemoFallback()) return { userId: snapshotPersonaId(), isAnonymous: false };
  try {
    const supabase = await createSupabaseServerClient();
```

### 7. `src/proxy.ts` (L0): skip the session refresh

`proxy()` calls `supabase.auth.getClaims()` on every page request; with a stale auth cookie and an unreachable host that call waits for the TCP timeout before the page renders.

```ts
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || process.env.DEMO_FALLBACK === '1') return NextResponse.next();
```
(`process.env` directly: the proxy runs on the edge-style runtime and should not import `node:fs` through `@/server/demo`.)

### 8. `src/app/demo/route.ts` (L5): `/demo`

Import: `import { isDemoFallback } from '@/server/demo';`

```ts
export async function GET(request: Request): Promise<Response> {
  const req = request instanceof NextRequest ? request : new NextRequest(request);
  const res = NextResponse.redirect(new URL(ROUTES.today, req.url));
  if (isDemoFallback()) return res; // the persona is the session (patch 6); no sign-in needed
  if (await signInDemo(req, res)) return res;
```

### 9. `src/app/r/[articleId]/route.ts` (L4): the article lookup

Import: `import { isDemoFallback, snapshotGetArticle, snapshotPersonaId } from '@/server/demo';`

```ts
async function articleUrl(articleId: string): Promise<string | null> {
  if (isDemoFallback()) return snapshotGetArticle(articleId)?.url ?? null;
  try {
```

```ts
async function editionOwner(editionId: string): Promise<string | null> {
  if (isDemoFallback()) return snapshotPersonaId();
  try {
```
(`processSignals` in the `after()` is already covered by patch 5.)

### 10. `src/app/api/editions/[date]/pdf/route.ts` (L6): serve the local PDF or the print route, never render

Rename `_request` to `request` in the signature, import `import { isDemoFallback } from '@/server/demo';`, then after the edition lookup:

```ts
  const edition = await getEdition(userId, date);
  if (!edition) return Response.json({ error: 'no_edition' }, { status: 404 });
  if (isDemoFallback()) return edition.pdfUrl ? Response.redirect(new URL(edition.pdfUrl, request.url), 302) : printFallback(date);
```

### 11. `src/server/onboarding/taxonomy.ts` (L5): `getTaxonomy`

Without it every first hydration and `/me` wait out the 2.5 s topics timeout before the seed tree is used.

```ts
export async function getTaxonomy(): Promise<TopicNode[]> {
  if (process.env.DEMO_FALLBACK === '1') return seedTaxonomy();
  if (dbTree) return dbTree;
```

### 12. Optional, Vercel only: `next.config.ts` (L0)

The reader opens the JSON with `fs` from `path.join(process.cwd(), 'public', 'demo', 'snapshot.json')`. Next's file tracing normally picks that up; if a deployed fallback 500s with ENOENT, add:

```ts
  outputFileTracingIncludes: { '/**': ['./public/demo/snapshot.json'] },
```

## Still needs the network in fallback mode (documented, not fixed here)

- **Article images** are publisher URLs: with the cable out they do not load (cards keep their layout; the headline, summary and chips are all local). Fonts are bundled (`@fontsource`), so typography is unaffected.
- **"Next morning →" / Rebuild** answer the latest snapshot paper again (there is no pool to build from), so the learned shift between two papers is shown by the archive (No. 7 → No. 8), not by a live rebuild. The streak panel, the 7-day strip and Morning Recall still follow the demo clock.
- **Writes** (`PATCH /api/me/interests`, `PATCH /api/me/profile`, `POST /api/demo/fast-forward`) still hit Supabase or the pool: L7's UI reverts with a toast, fast-forward shows "Couldn't load". If wanted, L3 can answer `FIXTURE_SIMULATION` from `/api/demo/fast-forward` and the interests PATCH can return `snapshotGetLearningView(...).weights` under the same `isDemoFallback()` guard.
- **`/api/health`** reports `db: false` after its 3 s budget; `gemini` depends on `geminiStatus()`.
- **`describe`** (onboarding) keeps its keyword fallback; onboarding itself is not a fallback-mode flow (the persona is the only reader).

## Missing / cut

- The guards above are not applied (ownership). The offline browser run in "How to verify" was not performed in this lane for that reason; the read functions are verified against the committed JSON by `tests/w2/snapshot.test.ts`.
- `scripts/snapshot.ts` (`npm run snapshot`, the L0 stub for a `seed/snapshot/*.json` corpus dump that `npm run seed` would reload) is a different, larger export and stays a stub.
- Persona PDFs: L6 is producing them; `pickLocalPdf` finds any `public/demo/*.pdf` whose file name contains the edition date (`2026-10-17.pdf` preferred). A different naming scheme needs a one-line change in `src/server/demo/format.ts`.

## Risks

- The snapshot is a point in time (generated 2026-10-17 15:17 PKT). Re-run `npm run demo:snapshot` after `seed-demo-persona` or L2 enrichment changes her papers, and commit the JSON (sorted keys keep the diff readable).
- `getLearningView` on main is the L0 stub, so `learning` in the JSON is the derived view; once L3's real view merges, re-run the script and the file switches to it automatically (`learning.source: "server"` in the summary).
- With `DEMO_FALLBACK=1` **every** visitor is Ayesha (patch 6). Keep it off on the public deployment; turn it on only for the offline demo machine.
- `public/demo/snapshot.json` (951 KB) is served as a static asset too; it holds only published-paper data (no emails, no keys).
