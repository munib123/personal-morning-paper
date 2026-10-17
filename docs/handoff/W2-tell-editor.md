# W2 "Tell your editor": handoff

Status: ready for merge (branch `lane/W2-tell-editor`, PR [#57](https://github.com/munib123/personal-morning-paper/pull/57)). The two mounts (L7's /me interest editor, optionally L4's end of paper) are patches below, not applied.

The reader types what should change ("more on cricket and AI policy, less showbiz, and I'm curious about astronomy"), sees a proposed diff on their interests (topic, before → after, one line quoting their words), confirms, and today's paper is rebuilt with the change. PLAN §5a calls it the best 20-second Loom moment.

**How it works, in one sentence:** the verb in front of each topic decides the change (more raises it 15 points, less lowers it 15, always pins, never mutes), while L2's `mapTextToTopics` alone decides which topics there are, and the confirmed changes go through the same `editInterest` path as the /me sliders before `buildEdition(force)`.

## Done

- **`src/server/editor/propose.ts`** is pure and has 42 tests in `tests/w2/editor-propose.test.ts`.
  - **`proposeChanges({ text, picks, interests, topics? })`** returns `{ changes ≤ 6, unmatched ≤ 3 }`. Each change is `{ slug, name, before, after, action: raise|lower|pin|mute|add, reason }`.
    - **Clauses.** The text is cut into clauses by cue verbs, matching the longest cue first:
      - raise: more / love / interested in / curious about / want …
      - lower: less / fewer / stop / no more / not …
      - pin: only / always / never miss …
      - mute: never / hide / no / don't want …

      A clause ends at the next cue, at `. ; ! ?`, or at "but". Chained cues read as one: "only want" pins, "I'd like less" lowers.
    - **Topics come only from `picks`** (the `mapTextToTopics` output). The text is searched only for those topics' own names and synonyms, to find which verb governs each one. It never discovers a new topic.
      - A pick the text never names (Gemini mapped "the stars" to Space) takes the first "more" clause.
      - A blocked topic the text never names takes the first "less" or "never" clause.
      - With verbs present but none that fits, the topic is left out.
    - **The reader's verb wins over the mapper.** The keyword fallback files "less showbiz" as a *pick*, because "less" is not one of its negations. The editor still lowers it.
    - **add** means the topic is new territory: never picked, no picked ancestor, not pinned, and θ̂ below 0.5. It joins at max(0.5, θ̂ + 0.15).
    - **Dropped edits.** An edit that changes nothing is dropped (already pinned, already muted). One slug appears once, at its first mention.
    - **unmatched** holds the words of clauses that named no topic (for example "quilting").
  - **`setValueFor(weight, targetθ̂)`** inverts the 0.6 / 0.3 / 0.1 blend: own mean += Δθ̂ × (Σ blend / 0.6). As a result:
    - the proposal's `after` is the θ̂ the paper will really use;
    - the value sent to `editInterest('set')` is the own mean that gets it there.

    The real-DB test confirms θ̂ lands within 0.02 of `after`.
  - **`editsFor(change, freshWeight)`** turns one change into the /me edits (`set`, `pin`, `unpin`, `mute`, `unmute`), read against the weights *as they are now*:
    - a raise on a muted topic unmutes it first;
    - a mute on a pinned topic unpins it;
    - the `set` value is recomputed from the fresh θ̂.
- **`src/server/editor/index.ts`**
  - **`tellEditor(userId, text, now)`** runs `getProfile`, then the current weights (`loadUserModel` + `toInterestWeights`, the list /me shows) in parallel with `mapTextToTopics(text)`, then `proposeChanges`.
    - If the mapper throws, `picks = []` and it still answers (`provider: 'none'`).
    - Not onboarded gives 409.
  - **`applyEditorChanges(userId, changes, now)`**:
    1. Loads the fresh weights.
    2. Ignores slugs outside the taxonomy.
    3. Runs `editsFor` and then **`editInterest`**, the function behind `PATCH /api/me/interests`. Each edit is one `weight_edit` signal through `processSignals`. Nothing writes `user_interests` directly.
       - Edits on one slug run in order. Different slugs run in parallel: a `weight_edit` has reward 0 and touches only its own row.
    4. Calls `buildEdition(userId, now, { force: true })`.
    5. Returns `{ date, number, leadHeadline, changed }`.
- **Routes.** Both are POST and both run in this order:
  1. `requireUser()` (401);
  2. zod validation (400);
  3. `now = await requestNow()`;
  4. a calm **503** `{ error: 'unavailable' }` instead of a 500 when the DB is down. A thrown Response (409) passes through.

  | Route | Request | Response | Notes |
  |---|---|---|---|
  | `/api/editor/tell` | `{ text }`, 1–500 chars after trim | 200 `{ changes, unmatched, provider: 'gemini'\|'keyword'\|'none' }` | |
  | `/api/editor/apply` | `{ changes }`, 1–6, each validated | 200 `{ edition: { date, number, leadHeadline, changed } }` | No Gemini call on the request path. `buildEdition` defers its editor note with `after()`, exactly like `/api/editions/rebuild`. |

  Schemas and paths are in `src/server/editor/schema.ts` (`EDITOR_ROUTES`). The 18 route tests are in `tests/w2/editor-routes.test.ts`: 401 signed out; 400 for no / empty / whitespace / 501-char / non-string text, malformed JSON, 0 or 7 changes, weights outside [0, 1], an unknown action and a bad slug; 200 bodies; 409 passthrough; 503 with a dead DB. The 6 server tests in `tests/w2/editor-server.test.ts` check that apply never calls `mapTextToTopics` or `callLLM` and that it rebuilds only after the last edit.
- **`src/components/editor/TellYourEditor.tsx`** has 10 dom tests. It uses only Morrow components (`Button`, `TextField`, `Icon`) and Morrow tokens.
  - **The card:**
    - kicker "Tell your editor" in `text-pen`;
    - a labelled text box ("What should change in your paper?", placeholder "More of, less of, or something new. Your editor is listening.", a character hint, and a field error over 500);
    - **Propose changes**.
  - **The proposal** sits under "Your editor proposes", which receives focus. Each row shows the topic, a pen label (More / Less / New in your paper / Always in your paper / Leaves your paper) and "60 → 75". Screen readers hear "60 to 75". Below that are the reason in `text-ink-soft` and a thin bar:
    - what stays is `bg-pen-soft`;
    - what is added is `bg-pen`;
    - what is taken away is outlined `border-pen`.
  - **Actions:** **Make these changes** and **Not now** (keeps the words, returns focus to the box).
  - **States:**
    - Applying: "Rebuilding today's paper…" with a small pen square (`motion-safe:animate-pulse`) and rows dimmed (`transition-opacity`, `motion-reduce:transition-none`).
    - Done: "Done. Today's paper now leads with "<headline>"." plus **Read today's paper** (`ROUTES.today`) and "Tell your editor something else".
    - Errors: one calm `aria-live` line; the words (and, on a failed rebuild, the proposal) stay.
    - Nothing matched: "Nothing to change yet. Name a topic, like "more cricket" or "less showbiz"." plus "Your editor couldn't place "quilting" yet."
  - **Accessibility:** every status line is `role="status" aria-live="polite"`. Ctrl/Cmd + Enter proposes, and the whole flow works from the keyboard (tested with user-event Tab / Enter).
  - **`<TellYourEditorEntry onApplied? />`** is one quiet line ("Want something different tomorrow? Tell your editor in your own words.") and a secondary button. The button opens the card with the text box focused; **Close** folds it back and returns focus.
  - **Props:**
    - `TellYourEditor({ onApplied?, onClose?, autoFocus? })`
    - `TellYourEditorEntry({ onApplied? })`

    `onApplied(edition)` lets a mount refresh its own data.

### Real runs (2026-10-17, ~16:10 PKT, shared Supabase)

**Live tell, read-only, on the demo persona** (`5d9967f0-…`, 1 Gemini request).

Input: "more on cricket and AI policy, less showbiz, and I'm curious about astronomy". Result: `provider: gemini` (describe 1.9 s, 4.1 s total cold), `unmatched: []`, and these changes:

| Topic | Action | θ̂ before → after | Reason |
|---|---|---|---|
| Cricket | raise | 0.631 → 0.781 | "more on cricket" |
| Tech Industry & Policy | raise | 0.566 → 0.716 | "more on cricket and AI policy" |
| Pakistani Showbiz | lower | 0.287 → 0.137 | "less showbiz" |
| Entertainment | lower | 0.293 → 0.143 | "less showbiz" |
| Space & Astronomy | add | 0.370 → 0.520 | "curious about astronomy", so it joins your paper |

Her weights were **not** changed: no apply was run on the shared demo persona.

**`RUN_DB_TESTS=1 npx vitest run tests/w2/editor-apply.int.test.ts`** uses a throwaway onboarded reader (Sports + Entertainment), the keyword path and the template note, so it spends no Gemini quota. The reader is deleted afterwards.
- Input: "more cricket, less football, never gaming, and I am curious about astronomy".
- Proposal: Cricket raise 0.444 → 0.594, Football lower 0.444 → 0.294, Gaming mute, Space & Astronomy add 0.25 → 0.50.
- After the apply:
  - every θ̂ is within 0.02 of `after`;
  - Gaming is muted;
  - today's paper has 20 items and no Gaming story.
- Timings: **tell 1308 ms, apply + rebuild 6081 ms** (4 changes, cold process: the pool load is most of it; a warm instance has the pool cached for 10 min).

**Gemini requests spent by this lane: 1** (the live tell above). The limit was 10.

## Stubbed

- Nothing returns fixtures. The UI is **not mounted yet**; apply the patches below.
- No browser screenshots: `next dev` / `next build` cannot run in this worktree (the `node_modules` junction sits outside the Turbopack root). The component is covered by the dom tests. The integrator should check `/me?tab=interests` at 390 and 1280 px after mounting.

## Env needed

Nothing new:
- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY` (through L3's functions);
- `GEMINI_*` (through `mapTextToTopics` → `callLLM('describe', …)`, FAST tier, 6 s deadline, keyword fallback);
- `DEMO_MODE` for the demo clock (`requestNow`).

## Verify commands

| Command | Expected |
|---|---|
| `npx vitest run tests/w2/editor-propose.test.ts tests/w2/editor-routes.test.ts tests/w2/editor-server.test.ts src/components/editor` | 4 files, 76 tests passed |
| `RUN_DB_TESTS=1 npx vitest run tests/w2/editor-apply.int.test.ts` | 1 passed, plus the `[W2 int] tell … ms, apply+rebuild … ms` line (no Gemini quota) |
| `curl -s -o /dev/null -w "%{http_code}" -X POST localhost:3000/api/editor/tell -H 'content-type: application/json' -d '{"text":"more cricket"}'` | `401` (signed out). Same for `/api/editor/apply` |
| Signed in (open `/demo`, copy the `sb-…-auth-token` cookie into `$C`): `curl -s -X POST localhost:3000/api/editor/tell -H 'content-type: application/json' -H "cookie: $C" -d '{"text":"more on cricket and AI policy, less showbiz, and I'"'"'m curious about astronomy"}'` | 200 `{"changes":[…5 rows like the table above…],"unmatched":[],"provider":"gemini"}` |
| `curl -s -X POST localhost:3000/api/editor/tell -H "cookie: $C" -H 'content-type: application/json' -d '{"text":"   "}'` | 400 `{"error":"invalid",…}` |
| `curl -s -X POST localhost:3000/api/editor/apply -H "cookie: $C" -H 'content-type: application/json' -d '{"changes":[<one row from tell>]}'` | 200 `{"edition":{"date":"2026-10-17","number":…,"leadHeadline":"…","changed":1}}`. This **changes that reader's interests**, so use a throwaway reader or reset the persona with `npx tsx scripts/seed-demo-persona.ts` after |
| `npm run typecheck && npm run lint && npx vitest run` | exit 0 (see the PR for the run) |

## Contract requests

None needed:
- The two routes are outside the §9.2 list, so their paths are `EDITOR_ROUTES` in `src/server/editor/schema.ts`, next to their zod schemas. This follows the W2-perspectives precedent.
- If L0 wants them in `src/contracts/api.ts`, add `editorTell: '/api/editor/tell'` and `editorApply: '/api/editor/apply'` to `ROUTES` in a `chore(contract)` commit. The card then imports those instead.
- `LlmStep` already lists `'tell_editor'`. The editor reuses L2's `describe` step through `mapTextToTopics` instead of a second prompt, so that step is unused.

## Integration patch 1 (L7, required): `src/components/learning/InterestEditor.tsx`

The slot L7 reserved for wave 2 sits directly above the bars on `/me?tab=interests`. After a successful apply, the bars below update in place from `/api/me/learning`, so the reader sees the diff land.

```diff
@@ imports
-import { InterestWeightSchema, ROUTES } from '@/contracts/api';
+import { TellYourEditorEntry } from '@/components/editor/TellYourEditor';
+import { InterestWeightSchema, LearningViewSchema, ROUTES } from '@/contracts/api';
@@ inside InterestEditor, after `const [effect, setEffect] = useState('');`
+  // After "Tell your editor" rebuilds the paper, show the reader's new weights in the bars below.
+  const refreshWeights = async () => {
+    try {
+      const res = await fetch(`${ROUTES.learning}?since=7`);
+      const parsed = LearningViewSchema.safeParse(res.ok ? await res.json() : null);
+      if (parsed.success) setWeights(parsed.data.weights);
+    } catch {
+      // the bars catch up on the next visit
+    }
+  };
@@ render
-      {/* Reserved for wave 2 "Tell your editor" (L2 + L7), directly above the bars. */}
-      <div data-slot="tell-your-editor" />
+      <TellYourEditorEntry onApplied={() => void refreshWeights()} />
```

## Integration patch 2 (L4, optional): `src/components/paper/EndOfPaper.tsx`

The end of the paper is where "what tomorrow will change" already lives. The card's success link goes to `/today` with a full page load, so the rebuilt paper shows without extra wiring.

```diff
+import { TellYourEditorEntry } from '@/components/editor/TellYourEditor';
@@
       <div className="flex flex-wrap items-center gap-3">
         <PdfButton date={edition.date} editionId={edition.id} />
         <Button variant="secondary" icon="archive" href={ROUTES.archive}>
           Past editions
         </Button>
       </div>
+      <TellYourEditorEntry />
       <HowThisPaperWasMade edition={edition} />
```

## Loom line (20 s)

"I tell my editor, in my own words, 'more on cricket and AI policy, less showbiz, and I'm curious about astronomy'. Gemini reads the topics, my own verbs set the direction, I see exactly what will change and why, and one click rebuilds today's paper with the new lead story."

## Risks

- **Apply is several writes, not one transaction.** Each change is 1–2 `editInterest` calls, each a full `weight_edit` pass through `processSignals`. A DB failure halfway leaves the earlier edits applied and answers 503. The card keeps the proposal, so "Make these changes" can simply be pressed again: `editsFor` reads the fresh weights, so a retry neither repeats a pin nor double-raises past the target.
- **Rebuild latency** was 6.1 s cold for 4 changes on the real DB. The card shows "Rebuilding today's paper…" the whole time. On Vercel a warm instance is faster (pool cached), and `maxDuration` is 60 s for apply and 30 s for tell.
- **The rebuild may spend one Gemini request after the response.** Every forced rebuild schedules L3's editor note through `after()` (FAST, or SMART for demo personas), exactly like the existing Rebuild button.
- **The cue list is English and hand-written** (about 90 cues). Unusual phrasing can land a topic in the wrong clause; the reader sees every row and its quoted reason before anything changes. Topic matching itself is entirely L2's.
- **"AI policy" maps where the mapper says.** Gemini sent it to Tech Industry & Policy; the keyword path sends it to both AI & ML and Tech Industry & Policy, because "ai" is a term of AI & ML.
- **Two lowers for one phrase.** "less showbiz" can lower both Entertainment (its synonym) and Pakistani Showbiz when the mapper returns both. Both are honest, and both are listed.
- **Bars on /me stay stale without patch 1.** The InterestEditor keeps its own state from the first render. Patch 1's `refreshWeights` fixes that; without it, the bars update on the next visit.
