# W2 perspectives ("Other angles"): handoff

Status: ready for merge (branch `lane/W2-perspectives`); the one mount into L4's story sheet is a patch below, not applied.

For a story that several outlets covered, the paper shows what the sources agree on, each outlet's own angle, and where they differ. Gemini writes it once per cluster (FAST tier, through `callLLM`) and the result lives in `clusters.perspectives` (ARCHITECTURE §7, reserved for this). The request path never calls Gemini: it reads the stored text or answers the deterministic fallback built from the sources' own words.

## Done

- **`src/server/perspectives/build.ts`** (pure, 24 tests in `tests/w2/perspectives-build.test.ts`):
  - `PerspectivesSchema` = `{ summary ≤ 60 words, angles: [{ source, angle ≤ 25 words, headline }], disagreements: ≤ 3 × ≤ 30 words, confidence: high | medium | low }`. Flat and lenient for the model (L2's lesson); the word bounds are applied by clipping, so a long answer never fails the request. `StoredPerspectivesSchema` adds `{ provider, model, computedAt }`; `PerspectivesResponseSchema` is the route body.
  - `buildPerspectivesPrompt(cluster, articles)`: one plain-text block per outlet (name, headline, published, summary ≤ 700 chars), one article per outlet (its newest), at most 10 outlets, HTML stripped and angle brackets bent, so the prompt carries no markup. Instructions: untrusted data, facts only, Morrow voice ("you", never "I"/"we"/"our AI", no "!"), thin or boilerplate source text → angle from the headline alone.
  - `fallbackPerspectives(cluster, articles)`: summary = the cluster headline, else the newest article's first sentence; one angle per outlet = its own headline plus the first sentence of its summary; `disagreements: []`; `confidence: 'low'`.
  - `acceptPerspectives(candidate, fallback)`: the model's answer only when it has a summary and named angles and passes the voice check (no "!", no emoji, no first person, no "our AI"; quoted headlines are exempt), else the fallback.
- **`src/server/perspectives/index.ts`**: `getClusterSources(clusterId)` (cluster + articles newest first, `sources(name)` joined + whatever is stored), `computePerspectives(clusterId, { now, force?, offline? })` → `callLLM('perspectives', …, PerspectivesSchema, { fallback, model: 'fast', timeoutMs: 45 s })` then `update clusters set perspectives = { …answer, provider, model, computedAt }` through the admin client. A stored Gemini answer is kept unless `force`; a stored fallback is always retried; `offline` stores the fallback without a request. `readPerspectives(clusterId)` → stored value or null, never Gemini.
- **`scripts/perspectives.ts`** + `npm run demo:perspectives [-- --limit=20 --max-calls=20 --force]`: demo persona (`profiles.is_demo`) → her editions → `edition_items` (rank ≤ 20) → `articles.cluster_id` → clusters with `source_count ≥ 2`, importance desc, cap 20; prints a table (cluster, sources, importance, provider, model, cached, headline) and the split. Once `--max-calls` live requests are spent, the remaining clusters get the fallback offline.
- **`GET /api/perspectives/[clusterId]`** (`src/app/api/perspectives/[clusterId]/route.ts`, 5 tests in `tests/w2/perspectives-route.test.ts`): `params` is a Promise; non-uuid → 400; unknown cluster → 404; DB failure → 503 (never a 500); 200 `{ perspectives, sources: [{ articleId, name, url, headline, publishedAt }] }` with `Cache-Control: private, max-age=300`. Nothing stored → the deterministic fallback with `provider: 'fallback'` and `computedAt` from `requestNow()`.
- **`src/components/perspectives/PerspectivesPanel.tsx`** (+ `copy.ts`, 9 dom tests): props `{ clusterId, sourceCount, editionId? }`. Renders nothing below 2 sources. Collapsed: one `ui-meta text-ink-soft` line ("4 sources", then "10 sources · 2 points of difference" once loaded) and a ghost Morrow `Button` "Other angles" with `aria-expanded` / `aria-controls`. Expanded: kicker "Other angles" (`text-press`), the summary in `deck`, one row per outlet (name `ui-label`, headline `headline-sm`, angle `body-sm text-ink-soft`) linking to the original through `/r/{articleId}?src=web&e={editionId}` (so the click is a `read_original` signal) with `target="_blank" rel="noopener noreferrer"`, "Where they differ" bullets, and the footer "Written from N sources · with Gemini" or "· from the sources' own words". Lazy fetch on first expand (one request per mount), a still skeleton in `bg-paper-sunk` (no pulse: Morrow motion stays quiet), `aria-busy` while loading, a quiet "Try again" on failure. Only Morrow tokens and type classes; no new colours.

### Real run (2026-10-17, 15:19 PKT)

`npm run demo:perspectives -- --limit=20 --max-calls=20` on Ayesha's 8 editions: 57 multi-source clusters found, the top 20 by importance computed.

| provider | clusters | model | live requests | retries / 429s |
|---|---|---|---|---|
| gemini | 20 | `gemini-3.5-flash-lite` (FAST; SMART never used) | 20 | 0 |
| fallback | 0 | | | |

2–4 s per cluster. Sample (10 sources, `confidence: high`): *"Police in New Delhi detained Abhijeet Dipke, founder of the youth-led Cockroach movement, alongside protesters ahead of a demonstration demanding the resignation of the election chief."* Differences: *"France 24 reports thousands of Gen Z protesters were rounded up, while other sources mention hundreds…"*, *"Geo News states over 130m voters were deleted, a figure not mentioned by the other outlets."*

**Gemini requests spent by this lane: 20 of the 25 allowed** (all FAST). The other 37 multi-source clusters in her editions answer with the fallback until the script runs again with a higher `--limit`.

## Stubbed

- Nothing in this lane returns fixtures. The panel is **not mounted yet**: L4 applies the patch below.
- No job writes perspectives for new clusters. Until a cron step calls `computePerspectives`, only the script does, so tomorrow's clusters answer with the fallback (still a complete, honest panel).

## Env needed

`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY` (admin reads and the one `clusters` update); `GEMINI_API_KEY`, `GEMINI_MODEL_FAST`, `GEMINI_MODEL_FALLBACK`, `GEMINI_RPD_*`, `GEMINI_RPM_*` (through `callLLM`). Nothing new.

## Verify commands

| Command | Expected |
|---|---|
| `npx vitest run tests/w2/perspectives-build.test.ts tests/w2/perspectives-route.test.ts src/components/perspectives` | 3 files, 35 tests passed |
| `npm run demo:perspectives -- --limit=20 --max-calls=20` | a 20-row table with provider `gemini (kept)`, then `split: gemini 0 · fallback 0 · kept 20 · live Gemini requests this run: 0` (stored Gemini answers are kept; `--force` recomputes) |
| `curl -s http://localhost:3000/api/perspectives/84b4576e-fc1f-4224-895c-661a5fb097c3` | 200, `perspectives.provider: "gemini"`, 10 `sources`, header `cache-control: private, max-age=300` |
| `curl -s -o NUL -w "%{http_code}" http://localhost:3000/api/perspectives/nope` | `400` |
| `curl -s -o NUL -w "%{http_code}" http://localhost:3000/api/perspectives/00000000-0000-4000-8000-000000000000` | `404` |
| `npm run typecheck && npm run lint && npm test && npm run build` | all pass (see "Known issues" for two timing tests in other lanes) |

## Contract requests

None. `ArticleCard` already carries what the panel needs: `clusterId: string | null` and `alsoCoveredBy: string[]` (other outlets' names, capped at 5 in `src/server/edition/hydrate.ts`), so `sourceCount = alsoCoveredBy.length + 1`. The panel switches to the fetched source count once loaded, so a 10-source story reads "10 sources" after one click. `/api/perspectives/[clusterId]` is a new route outside the §9.2 list; its body schema lives in `src/server/perspectives/build.ts` (`PerspectivesResponseSchema`). If L0 wants it in `src/contracts/api.ts`, move `PerspectivesResponseSchema` and add `perspectives: (clusterId: string) => \`/api/perspectives/${seg(clusterId)}\`` to `ROUTES` in a `chore(contract)` commit; the panel then imports `ROUTES.perspectives`.

## Integration patch for L4 (`src/components/story/StorySheet.tsx`)

Place the panel after the key fact and before the primary "Read on {domain}" button, so collapsed it is one quiet line above the call to action and expanded it keeps the originals one click away.

```diff
 import { Button, FeedbackBar, WhyTag } from '@/components/morrow';
 import { useEditionOptional } from '@/components/paper/EditionContext';
+import { PerspectivesPanel } from '@/components/perspectives/PerspectivesPanel';
 import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
@@
           {a.keyFact ? (
             <p className="body-text text-ink">
               <span className="ui-label mr-2 text-ink-muted">Key fact</span>
               <mark className="bg-highlight text-ink">{a.keyFact}</mark>
             </p>
           ) : null}
+          <PerspectivesPanel clusterId={a.clusterId} sourceCount={a.alsoCoveredBy.length + 1} editionId={editionId} />
           <Button variant="primary" full href={outboundHref(a.id, editionId)} iconRight="external" {...NEW_TAB}>
             Read on {a.sourceDomain}
           </Button>
```

Optional second mount (same props) in the Bytes view's story body for mobile, where the sheet is not used. `PaperStory` cards should stay as they are: the collapsed line belongs in the reading view, not the front page.

## Known issues and risks

- Two timing tests in other lanes failed once while this lane's Gemini run and `next build` were running at the same time: `src/server/rank/build.test.ts` ("1000 candidates × 384-d rank in under 50 ms") and `src/server/learn/sim/run.test.ts` (the 7-day learning trace). Neither touches W2 files; both are time budgets, not logic.
- Thin source text: two angles in cluster `33e89ffb` (France 24, ARY) describe a cookie-notice summary and a headline-only source rather than the story. The prompt rule "angle from the headline alone" was added after the run; `npm run demo:perspectives -- --force --limit=3` would rewrite the top three for 3 requests.
- Budget: §11 reserves ~30 requests/day for perspectives. A cron step (`job-editions` or `/api/cron/editions`) calling `computePerspectives` for the day's multi-source clusters with `importance ≥ 0.6`, newest first, `--max-calls`-style capped at 30, would keep the panel fresh without touching the request path.
- The route needs no session (clusters and articles are public-read under RLS) and is `private` cached for 5 minutes; a stored answer updated by the script shows within that window.
- The worktree's `node_modules` junction broke `next build` (Turbopack refuses modules outside the workspace root); a local `npm ci` with `PUPPETEER_SKIP_DOWNLOAD=1 ONNXRUNTIME_NODE_INSTALL=skip` fixed it. Nothing in the repo changed for this.
