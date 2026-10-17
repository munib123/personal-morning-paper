# The Morrow: a personal morning paper

Built in one day for the NaSCon'26 AI Hackathon (17 October 2026, Islamabad). Working name in the code: Subah.

Every morning, each reader gets one finite edition: twenty stories chosen for them from the roughly 1,700 articles that 117 verified sources publish in a day, laid out as a newspaper front page on the web and as an A4 newspaper PDF with their name on the masthead. Every story carries a short summary, its source, a link to the original, and a tag that says why it is in the paper. The morning opens with three recall questions about yesterday's stories and closes with "three things you learned" and a reading streak. Opening, reading time, skipping, asking for more or less, downloading the PDF and answering recall questions all update the reader's model at once, so the next edition is different, and the learning page shows exactly what moved and why.

<table>
  <tr>
    <td width="46%"><img src="docs/handoff/screens/L6-page-1.png" alt="Page 1 of the PDF edition: nameplate, lead story with drop cap and QR code, three things to know, inside index"></td>
    <td width="54%"><img src="docs/handoff/screens/L7-me-learned-1280.png" alt="The learning page: change summary, what moved this week, and the signal timeline with each effect"></td>
  </tr>
  <tr>
    <td>The PDF edition, page 1 of 5 (<code>public/demo/sample.pdf</code>).</td>
    <td>The learning page at <code>/me</code>: what moved, and what each action changed.</td>
  </tr>
</table>

More screenshots (390 px and 1280 px, Morning and Night): [`docs/handoff/screens/`](docs/handoff/screens/).

## Demo flow

The five-minute walkthrough in [`docs/DEMO.md`](docs/DEMO.md), in six steps:

1. `/demo` signs in the seeded persona Ayesha, who has seven days of real reading history, and opens today's paper, Edition No. 8.
2. On `/today`: answer a Morning Recall question, read a why-tag, open the "Why this story?" breakdown, skip a story and watch a reserve story take its place, open a story sheet and follow "Read original".
3. Download the PDF: a five-page A4 newspaper with the lead sized by her top interest, sections in her order, a QR code per story, and a back page with "three things you learned".
4. On `/me`: the change summary, the movers, the signal timeline, the interest editor, and "Fast-forward 7 days" against two baselines; then "Next morning" moves the demo clock and builds a new edition with recall questions about today's reads.
5. In a private window, `/start`: pick broad areas, drill into Technical, then Computer Science, then AI, describe yourself in a sentence, choose a paper length, and see the first front page before any sign-up.
6. Close on the "How this paper was made" panel (articles considered, build time, zero per-reader LLM calls, AI versus extractive share), this diagram, and the pull-request list.

## Architecture

![Architecture diagram: sources, worker, Supabase, Next.js app and the learning loop](docs/architecture-diagram.svg)

Source: [`docs/architecture-diagram.mmd`](docs/architecture-diagram.mmd) (PNG: [`docs/architecture-diagram.png`](docs/architecture-diagram.png)). The full specification is [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

- **Sources** (`seed/feeds.json`, `seed/taxonomy.json`): 114 RSS feeds plus Hacker News, Dev.to and arXiv, seeded as 117 `sources` rows; a 67-node topic tree (9 roots, 44 second-level, 14 third-level) that onboarding, labelling and ranking all share.
- **Ingest** (`src/server/ingest`): fetches each feed with conditional requests and a 15 s timeout, decodes charsets, canonicalises URLs into a `url_hash`, keeps the last 48 hours, and bulk-inserts with `on conflict do nothing`; the first run stored 1,676 new articles from 3,412 items in 30 s.
- **NLP** (`src/server/nlp`): embeds `title + first sentences` with `Supabase/gte-small` (384 dimensions, transformers.js on the CPU, no API quota), labels each article by cosine against the topic embeddings, joins same-story clusters by leader clustering at cosine 0.90, and scores importance by how many distinct outlets cover a cluster.
- **Enrichment** (`src/server/enrich`): Gemini reads each cluster representative once, ten articles per request, and returns a headline, three summary tiers, why it matters, a key fact and a recall question; deterministic guardrails check every number against the source, word bands, entity substrings and the grounding of the quiz answer, and anything that fails twice gets an extractive summary that always ends on a sentence boundary.
- **callLLM** (`src/server/ai`): the one wrapper around Gemini, with a cache keyed by `sha256(step|model|input)`, a per-day budget in `llm_usage` incremented through an atomic RPC, per-model request pacing, and a ladder from the smart model to the fast one to the fallback one to a deterministic result, so it never throws and never blocks on a rate limit.
- **Supabase**: Postgres with pgvector for articles, clusters, topics, editions, events, interests and streaks; anonymous Auth for readers plus one seeded demo persona; a private Storage bucket for PDFs behind signed URLs; row-level security with reads for the owner and writes only through the server.
- **buildEdition** (`src/server/edition`, `src/server/rank`): loads a 36-hour candidate pool (cached ten minutes per process) and the reader's model, runs the pure `rank-v1` ranker, writes the edition, its 20 stories plus 8 reserve stories, a receipt and an interest snapshot, and hands the editor's note to Gemini only after the response has been sent.
- **Reader** (`src/app/(reader)`, `src/components/paper`, `src/components/story`): `/today`, `/paper/[date]`, `/archive`, the story sheet, skip with undo, Morning Recall, the streak, and `/r/[articleId]`, which logs the read and redirects to the publisher.
- **PDF** (`src/server/pdf`, `/paper/[date]/print`): the same edition rendered as A4 pages through Puppeteer, stored in the bucket; when no browser is available the API answers with the print route, which prints from the browser.
- **Learning** (`src/server/learn`, `/api/events`, `/me`): every signal becomes a reward on the topics of that story and a nudge to the reader's profile vectors; the learning page reads the snapshots back as movers, a change summary and a timeline.
- **Demo clock** (`src/server/time`): with `DEMO_MODE=1` every route reads `requestNow()`, which honours the `subah_now` cookie set by `POST /api/demo/clock`, so "Next morning" works without waiting a day.

## How the paper learns

**The reader model.** One Beta(α, β) distribution per topic node, plus two 384-d profile vectors: `pos` (what they read) and `neg` (what they asked for less of). Onboarding sets the priors: a picked root starts at (2, 1), a picked second-level topic at (3, 1), a picked leaf at (4, 1), everything else at the pessimistic (1, 3); blocked topics are muted. A topic's affinity is the blend θ̂ = 0.6·m(topic) + 0.3·m(parent) + 0.1·m(grandparent), with m = α / (α + β).

**The signals** (`src/contracts/signals.ts`, emitted by `useSignals`, flushed every 2 s and with `sendBeacon` on page hide): impression −0.05, open +0.30, dwell up to +0.70 scaled by expected reading time (under 3 s counts −0.10), read original or QR scan +0.60, save or share +1.00, more +1.50, less −1.50, skip −0.50 (zero when the reason is "already seen" or "not today"), recall answer +0.40 right or +0.10 wrong, PDF download +0.05 on every story in the edition. A positive reward adds to α of each label on the story (weighted by label confidence, 0.3 to the parent and 0.1 to the grandparent), a negative one adds to β. The profile vectors move by an exponential moving average, η = 0.10 for `pos` and 0.15 for `neg`. A nightly refold weights history with a 14-day half-life toward the prior, never toward zero.

**The score.** `0.40·topic + 0.25·cos(pos, e)·min(1, nEngaged/10) − 0.15·max(0, cos(neg, e)) + 0.15·importance + 0.15·freshness + 0.05·sourceQuality`, with `freshness = exp(−ageHours / 24)`. Stories seen in the last seven editions and dismissed clusters are excluded.

**The selection.** One story per cluster, a shortlist of 200, then: one big story (highest importance, at least 0.5); two explore slots chosen by Thompson sampling, drawing from the Beta posterior of every topic outside the reader's top five, so uncertain topics get tried; one serendipity story from an unseen root with cosine between 0.25 and 0.45 to the profile; and the rest filled by maximal marginal relevance (λ = 0.7) with caps of five per root and three per source. The random generator is seeded with `hash(userId | date)`, so an edition is reproducible, and every parameter lives in `DEFAULT_PARAMS`, which is stored on the edition row.

**Making it visible.** Every story carries a why-tag ("Because you follow Cricket", "You read 3 stories on AI this week", "Covered by 6 outlets today", "Trying something new", "A step outside your usual") and a "Why this story?" popover with the score breakdown. More and Less answer with a one-line note about tomorrow. The editor's note names the movers. `/me` shows the interest bars, the week's movers in points, a templated change summary built from real counts, the signal timeline with the effect of each action, an editor to pin, mute or set any topic, and a seven-day fast-forward of a simulated reader against onboarding-only and popularity baselines. The end of every paper shows "How this paper was made".

## Model and algorithm efficiency

- **Gemini is never on the request path.** Ranking, reasons, tiers, recall selection and the template note are deterministic TypeScript. The one exception is the onboarding "in your words" mapping, which has a timeout and a keyword fallback; the editor's note runs in `after()`.
- **Each article is read once, for everyone.** Enrichment happens in the worker in batches of ten articles per request, cluster representatives first, and the output is shared by every reader and cached in `llm_cache`.
- **Budget guard.** `callLLM` counts requests per model per Pacific day in `llm_usage` and skips a model that has reached `GEMINI_RPD_*` before Google would return a 429; a 429 waits the body's `retryDelay` once, then steps down the ladder; the extractive summary and the template note are always available, and the receipt and `/api/health` report which one was used. The whole pipeline is designed to stay under about 250 requests a day on the free tier.
- **Embeddings cost nothing.** gte-small runs on the CPU (about 34 MB, downloaded once into `MODEL_CACHE_DIR`), and the topic embeddings are computed once by `npm run embed:topics`.
- **Ranking is small.** Scoring is N × 384 multiply-adds and MMR is 20 × 200 × 384; the unit test ranks 1,000 candidates in under 50 ms. A full `buildEdition` against the real database measured 3,567 ms cold and 1,219 ms warm, almost all of it database round trips; the pool is cached for ten minutes.
- **Demo safety.** With `DEMO_MODE=1`, `/today/preview`, `/me/preview` and `?fixtures=1` render the contract fixtures without a database; `public/demo/sample.pdf` is committed; the entire corpus always has an extractive fallback, so the paper builds when Gemini is out of quota; `DEMO_FALLBACK=1` returns neutral fixtures for streaks when storage fails.

## How this was built

One developer orchestrated parallel Claude Code agents, one git worktree and branch per lane. The spec came first: thirteen research notes in [`docs/research/`](docs/research/), then [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/PLAN.md`](docs/PLAN.md) with one plan per lane in [`docs/plans/`](docs/plans/).

- **Contracts first.** Lane L0 wrote `src/contracts/*` (types, zod schemas for every request and response, the `ROUTES` constants, fixtures that pass their schemas), the 15-table migration, and a stub for every cross-lane function, component and route, so every lane compiled from minute one and replaced only its own stubs.
- **Eight lanes in parallel.** L0 Foundation, L1 Ingest, L2 AI and NLP, L3 Engine, L4 Reader UI, L5 Onboarding, L6 PDF, L7 Engagement, each with its own folders, dev-server port, plan and handoff file in [`docs/handoff/`](docs/handoff/); the wave-2 lanes (ship kit, tell your editor, audio, design pass, docs, QA) were planned from what shipped.
- **Tests first for pure modules.** The ranker, learner, streak machine, guardrails, extractive builder, URL canonicaliser and time helpers all have Vitest suites written before the code; `tests/l0/routes.test.ts` pins every API route to its contract schema and to sanctioned status codes.
- **Rolling integration.** The integrator merged at three checkpoints in dependency order with merge commits, never squashes, opening integration PRs for the later slices, and CI (`.github/workflows/ci.yml`: typecheck, lint, Vitest, `next build`) runs on every push and pull request without a Gemini key.

Measured from the repository at the 14:45 PKT merge (`e4bfb24`): 143 commits between 11:12 and 14:45, 22 pull requests (21 merged, one superseded by its integration PR), 122 test files, 2 migrations, 8 lane plans, 53 screenshots. Two more numbers from the data: the first ingest stored 1,676 articles, which the NLP pass turned into 1,338 story clusters, 137 of them covered by two or more outlets.

## Run it locally

Requirements: Node 24, a Supabase project (free tier, with anonymous sign-ins enabled), a Gemini API key. Windows, macOS and Linux all work; every script is an npm script.

```bash
npm ci
cp .env.example .env.local                # then fill in the values below
npx supabase link --project-ref <ref>     # once; or paste supabase/migrations/*.sql into the SQL editor
npx supabase db push
npm run seed                              # topics=67 sources=117
npm run embed:topics                      # 67 topic vectors with local gte-small (first run downloads the model)
npm run job:ingest -- --limit=200         # ingest, then NLP, then Gemini enrichment; --limit caps the Gemini work
npx tsx scripts/seed-demo-persona.ts      # Ayesha: seven days of real history, then today's paper
npm run dev                               # http://localhost:3000; /demo signs in the persona, /start builds your own
npm run typecheck && npm run lint && npm test && npm run build
```

| Variable | Meaning |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | The project URL and the publishable key the browser may see. |
| `SUPABASE_SECRET_KEY` | The secret key for server routes and jobs; every write goes through it after the user is authenticated. |
| `GEMINI_API_KEY` | AI Studio key. Without it every AI step takes its deterministic fallback. |
| `GEMINI_MODEL_FAST`, `GEMINI_MODEL_FALLBACK`, `GEMINI_MODEL_SMART`, `GEMINI_MODEL_TTS` | Model ids per tier (defaults `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`, `gemini-3.8-flash`, `gemini-3.8-flash-tts`). |
| `GEMINI_RPD_*`, `GEMINI_RPM_*` | Per-model daily budgets and per-minute pacing for the guard (defaults 450/450/18 and 12/12/4). |
| `GEMINI_EMBED_MODEL`, `EMBEDDINGS_PROVIDER`, `MODEL_CACHE_DIR` | `local` (default, gte-small on the CPU) or `gemini` (gemini-embedding-2 at 384 dims); where the local model is cached. |
| `CRON_SECRET`, `NEXT_PUBLIC_APP_URL` | Bearer token for `/api/cron/*`; the public origin used in QR codes. |
| `DEMO_MODE`, `DEMO_FALLBACK`, `DEMO_USER_EMAIL`, `DEMO_USER_PASSWORD` | Demo clock and controls; fixture fallbacks on storage errors; the seeded persona's credentials. |
| `PUPPETEER_EXECUTABLE_PATH` | A local Chrome for PDF rendering and Playwright. |

The demo clock: `POST /api/demo/clock` with `{"now":"2026-10-18T02:00:00.000Z"}` sets the cookie (`{"now":null}` clears it); `/me`, tab "Streak & settings", has "Next morning" and "Reset clock". The reader's day rolls over at 03:00 local time.

## Design system: Morrow

The UI is composed only from the Morrow components and tokens in [`design/project/README.md`](design/project/README.md): warm paper and near-black ink, one red accent for kickers and the single accent button, and one blue, the editor's pen, that means "the paper learned this" and nothing else. Importance is shown by headline size and position rather than colour, sections are never colour-coded, and the same tokens drive the web paper, the Night edition and the PDF.

## Judging criteria map

| Criterion | Where to look |
|---|---|
| Innovation and originality | Morning Recall and "three things you learned" (`src/components/recall`); a finite, dated edition rather than a feed; why-tags and the "How this paper was made" receipt; explore and serendipity slots. |
| Technical complexity | The pipeline from 117 feeds to embeddings, clusters, guarded enrichment and a budgeted LLM ladder (`src/server/{ingest,nlp,enrich,ai}`); the pure ranker and learner (`src/server/{rank,learn}`); the A4 PDF renderer (`src/server/pdf`). |
| Practical impact and usability | Onboarding in four steps with no sign-up form; the first front page shown at the end of it; "Read original" on every story; the PDF; the archive; the print fallback. |
| Model and algorithm efficiency | One Gemini pass per article shared by all readers; zero per-reader LLM calls on the request path; local 384-d embeddings; the `llm_usage` budget guard; the receipt on every edition. |
| Presentation clarity | This README, the diagram, [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) with one sentence per box, [`docs/DEMO.md`](docs/DEMO.md). |
| Team collaboration | The pull-request list and commit history, the contracts in `src/contracts`, the per-lane plans and handoff notes, CI on every push. |
| UI and UX | The Morrow design system; 390 px and 1280 px screenshots in `docs/handoff/screens`; keyboard pass and reduced motion noted in `docs/handoff/L7.md`. |

## Limits and next steps

- **Gemini free tier.** The quota is shared by every lane and dev run and resets at 12:00 PKT, so at any moment most of the corpus is extractive and only Gemini-enriched stories carry recall questions; the receipt shows the share. Tier-1 billing or a nightly batch would fill the rest.
- **PDF on Vercel.** `@sparticuz/chromium` is installed but not wired; on Vercel the PDF route answers with the print page, and the pre-rendering job (`npm run job:editions`) and the snapshot export (`npm run snapshot`) were still stubs at the time of writing.
- **Routes still on stubs when this was written.** At `e4bfb24` the L3 route handlers (`/api/events`, `/api/onboarding`, `/api/editions/*`, `/api/me/*`, the cron routes) and `processSignals` / `getLearningView` were the L0 stubs that answer for the fixture reader, while the pages call the real server functions directly. `grep -rl "STUB (L0)" src scripts` lists what is still stubbed at any commit.
- **The simulation is a simulation.** On the real pool the seven-day run did not separate the learning arm from onboarding-only (both 0.10 precision@20 on day 7, popularity 0.05) because only about 7% of the pool matches the persona's hidden tastes; the numbers shown are the measured ones. Real readers over real days are the next test.
- **Cut for the day** (see `docs/PLAN.md` §5a): the taste test (replaced by the "in your words" step), streak freezes and repair, the archive month calendar, GitHub Actions cron for ingest and editions, Urdu, perspectives, the podcast and PWA offline.
- **Next:** "Tell your editor" (free text to a proposed change on the interest bars, confirmed by the reader), a spoken edition with browser speech, per-reader pre-rendered PDFs, and a queue in front of ingestion and rendering.

## Documents

[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) (specification and contracts) · [`docs/PLAN.md`](docs/PLAN.md) (lanes, timeline, cut lines) · [`docs/DEMO.md`](docs/DEMO.md) (demo script and Q&A) · [`docs/research/`](docs/research/) (13 research notes) · [`docs/plans/`](docs/plans/) (one plan per lane) · [`docs/handoff/`](docs/handoff/) (what each lane shipped and how to verify it) · [`design/project/README.md`](design/project/README.md) (the Morrow design system).
