# Subah: Master Build Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to carry out **your lane's plan** in `docs/plans/`, task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Subah, a personal morning paper (onboarding → Daily Top 20 on the web → newspaper PDF → archive → visible learning → Morning Recall + streaks), within the hackathon window. Every requirement must be demoable, with a fallback that cannot break.

**Architecture:** Next.js 16 + Supabase on Vercel. A Node worker (local, or GitHub Actions) ingests ~115 verified feeds, embeds them locally and enriches each article once with Gemini. Per-reader ranking is pure TypeScript (Beta weights + profile embedding + MMR + Thompson-sampling explore slots), and reading signals update it on the spot.

**Tech Stack:** Next.js 16.4.2, React 19.3, Tailwind 4.3, shadcn/ui, Supabase (Postgres + pgvector, Auth, Storage), AI SDK 7 + `@ai-sdk/google`, transformers.js (MiniLM), Puppeteer / @sparticuz/chromium, Vitest, Playwright.

**Spec:** `docs/ARCHITECTURE.md`. Read it first; §9 (contracts) is binding. The research behind it is in `docs/research/`.

---

## 1. How the work is split

There is one developer (you), with many Claude Code agents running in parallel. Each agent owns one **lane**: a set of folders, a plan file, a git branch and a worktree. Lanes talk only through the contracts in `docs/ARCHITECTURE.md` §9 and the stubs L0 creates.

| Lane | Plan | Owns (folders, from ARCHITECTURE §6) | Delivers | Wave | Est. agent-h |
|---|---|---|---|---|---|
| **L0 Foundation** | `plans/L0-foundation.md` | contracts, migration, db/time/auth helpers, app shell, tokens, stubs, CI, seed | A compiling skeleton where every route and component exists (stubbed), the DB is migrated and the taxonomy and sources are seeded | 0 (blocks all) | 0.75 |
| **L1 Ingest** | `plans/L1-ingest.md` | `server/ingest`, `api/cron/ingest`, `ingest.yml` | `runIngest()`: 116 feeds + HN, Dev.to and arXiv → `articles` (raw), with images and text | 1 | 2.5 |
| **L2 AI & NLP** | `plans/L2-ai-nlp.md` | `server/ai`, `server/nlp`, `server/enrich`, `scripts/embed-topics.ts` | Local embeddings, zero-shot labels, clusters and importance. Gemini enrichment (summaries ×3, recall MCQ, key fact) with guardrails, extractive fallback and cache. `writeEditorNote`, `mapTextToTopics` | 1 | 3 |
| **L3 Engine** | `plans/L3-engine.md` | `server/rank`, `server/learn`, `server/edition`, the editions/events/me/onboarding/demo API routes, `job-editions`, `simulate` | Pure ranking + learning (tested), `buildEdition`, events → instant learning, the learning view, the fast-forward simulator with metrics | 1 | 3.5 |
| **L4 Reader UI** | `plans/L4-reader.md` | `(reader)/today`, `(reader)/paper/[date]`, `components/paper`, `components/story`, `hooks/useSignals`, `/r/[id]` | Front page + Bytes views, story sheet, skip/undo/live re-layout, why-chip, progress, receipt, signal tracking | 1 | 3.5 |
| **L5 Onboarding** | `plans/L5-onboarding.md` | `/` landing, `/start`, `/demo`, `components/onboarding`, `api/taste`, `api/onboarding/describe` | 4-step onboarding (picker drill-down, taste test, how-you-read, printing reveal), guest auth, demo sign-in, landing | 1 | 3 |
| **L6 PDF** | `plans/L6-pdf.md` | `server/pdf`, `paper/[date]/print`, `components/print`, `components/pdf`, `api/editions/[date]/pdf`, `public/demo` | 4-page newspaper PDF with QR codes, storage cache, on-demand render, print fallback, sample PDF | 1 | 3 |
| **L7 Engagement** | `plans/L7-engagement.md` | `server/streaks`, `(reader)/archive`, `(reader)/me`, `components/{streak,recall,learning,archive}`, `api/me/streak`, `api/demo/clock` | Streak engine + UI, Morning Recall + "3 things you learned" + Done-for-today, the learning page (bars, movers, timeline, sim chart), interest editor, archive calendar, demo controls | 1 | 3.5 |
| **W2 lanes** | planned at T+6:15 from what actually shipped | audio + Urdu · perspectives + describe + tell-your-editor · ship (snapshot/personas/fallback/PWA/status) · docs (README, diagram, Loom) · QA · design-system pass | the extras and polish | 2 | — |

**Design system:** when your DevBytes-inspired system lands, drop it in `design/` and tell the session. One agent then maps it onto `src/styles/tokens.css`, the token names fixed in L0. UI lanes only ever use the semantic token classes (`bg-paper`, `text-ink`, `border-rule`, `text-accent`, `bg-sec-{root}`, `font-headline`, `font-body`, `font-ui`), so the reskin is one file. **Keep the brand visually original** (name, logo, accent colour). Judges score originality.

## 2. Your setup actions (do them now, ~10 min, while L0 starts)

1. **Supabase** (supabase.com → New project; region **Mumbai (ap-south-1)** or Singapore; free plan):
   - Settings → API: copy the **Project URL**, the **publishable key** (`sb_publishable_…`) and the **secret key** (`sb_secret_…`).
   - Settings → General: copy the **project ref**.
   - Account → Access Tokens: create a **personal access token** (lets the agent run `npx supabase db push`).
   - Keep the **DB password** you set.
   - Authentication → Sign In / Providers: **enable Anonymous sign-ins**. Rate limits: raise "anonymous sign-ins per hour" (e.g. 1000).
2. **Gemini:** in AI Studio, create an API key. On the AI Studio rate-limits page, **note the free-tier RPM/RPD for `gemini-3.1-flash-lite` and the flash model** and tell the session.
3. **Vercel** (vercel.com → Add New → Project → import `munib123/personal-morning-paper`):
   - Skip the env vars for now; L0 will give you the list. Alternatively, run `! vercel login` here and the agent links it.
4. **Paste the keys into this session.** The agent writes `.env.local` (git-ignored) and sets the GitHub Actions secrets with `gh secret set`.
5. **Design system:** drop it into `design/` when it's ready.

## 3. Timeline

> T0 = hackathon start (about 10:30 PKT). Times assume a **20:00 PKT deadline**; if yours differs, shift every row. Rows marked ⛳ are checkpoints.

| Clock (PKT) | T+ | Phase | Exit criteria |
|---|---|---|---|
| 11:05–12:10 | 0:35–1:40 | Research → spec → plans *(done)* | `docs/ARCHITECTURE.md`, `docs/PLAN.md` and `docs/plans/*` committed |
| 12:10–12:55 | 1:40–2:25 | **L0 Foundation** (one agent: the main session), plus your setup actions | `npm run build` passes · migration applied · taxonomy and sources seeded · every page renders its stub · CI green · L0 pushed to `main` |
| 12:55–16:15 | 2:25–5:45 | **Wave 1: 7 lanes in parallel** (L1–L7 in worktrees) | Each lane's plan is done, with its tests green, pushed and a PR open |
| ⛳ 14:15 | 3:45 | **Checkpoint A** (5 min) | L1 has a real ingest in the DB (≥ 500 articles), L2 has a first enrichment run (≥ 100 enriched), every UI lane renders fixtures. Red lanes apply their cut line. |
| 16:15–17:00 | 5:45–6:30 | ⛳ **Integration** (integrator agent + you) | Merge order L1 → L2 → L3 → L7 → L6 → L5 → L4 (merge commits, CI after each). Real-data end-to-end: onboarding → today → open, skip → PDF → archive → me. **Deploy to Vercel.** |
| 17:00–18:20 | 6:30–7:50 | **Wave 2** (4–6 lanes, planned at 16:45 from what shipped) | Extras (audio, Urdu, perspectives, describe), ship kit (snapshot, personas, fallback), design-system pass, diagram, README |
| ⛳ 18:20 | 7:50 | **FEATURE FREEZE** | Only fixes, copy, polish and performance after this |
| 18:20–19:00 | 7:50–8:30 | QA: Playwright smoke + Chrome check at 390 and 1280 px, a11y and LCP pass, offline/fallback test, final deploy | Demo persona + a fresh-user flow both work on the deployed URL **and** locally with the network off (snapshot) |
| 19:00–19:40 | 8:30–9:10 | **Record the Loom** (target 4:40; script in `docs/DEMO.md`, written in wave 2) + FigJam diagram export | Loom link works in incognito |
| 19:40–19:50 | 9:10–9:20 | **Submit**: make the repo public, fill in the form (repo, Loom, diagram) | Screenshot of the confirmation |
| 19:50–20:00 | — | Buffer | — |

## 4. Integration protocol (applies to every lane)

- **Worktree and branch.** One per lane: `lane/L<n>-<name>`, e.g. `lane/L3-engine`. When the workflow creates the worktree, copy `.env.local` from `D:\Documents\fast_Ai_Heckathon\.env.local` and run `npm ci`. Set `MODEL_CACHE_DIR` to `%USERPROFILE%\.cache\subah-models` so the embedding model downloads once.
- **Dev-server ports, so lanes don't collide:**

  | Lane | Port |
  |---|---|
  | L4 | 3004 |
  | L5 | 3005 |
  | L6 | 3006 |
  | L7 | 3007 |
  | L3 | 3003 (API tests) |
  | integration | 3000 |

- **Commits:** small, every ~15–20 min, in `feat(scope): …` / `test(scope): …` / `fix(scope): …` form, ending with the `Co-Authored-By` trailer. **Push the branch after every task** (`git push -u origin lane/…`); judges watch commit timestamps all day. Open a **draft PR** after the first task (`gh pr create --draft --base main`, title `L<n>: <lane name>`, body linking the plan and the `req-*` issues).
- **Ownership:** edit only the folders your lane owns (ARCHITECTURE §6). To change a contract, make a `chore(contract): …` commit on `main` through the integrator (ask in your handoff file).
- **Handoff notes:** write to `docs/handoff/L<n>.md` (your own file, so there are no merge conflicts). Record what's done, what's stubbed, the env vars you need, and the commands to verify your lane.
- **Gates before a lane says "done":** `npm run typecheck && npm run lint && npm test && npm run build` all pass. Real-browser evidence (screenshots at 390 and 1280 px) for UI lanes. The lane's own acceptance checks pass.
- **Merging:** the integrator merges PRs with **merge commits, never squash** (this keeps every commit visible), in the order above, and runs CI and a smoke test after each merge.
- **No secrets in git.** No `package.json` edits outside L0 and the integrator.

## 5. Cut lines (apply when a checkpoint is red; never cut the "never cut" list)

1. **Checkpoint A red on L1/L2:**
   - The pipeline runs locally only (no Actions).
   - Enrichment is capped at 150 articles, and the rest stay extractive.
   - If Gemini is blocked, the whole corpus goes extractive (the demo still works).
2. **L6 PDF late:**
   - A single 2-page template (front page plus briefs/back page).
   - If Chromium fails on Vercel, PDFs are only pre-rendered locally, plus the `window.print()` route.
3. **L4 late:** ship the Front page view only (Bytes becomes wave 2). Skip without live re-layout (the reserve just appends).
4. **L7 late:**
   - Streaks without freezes or repair.
   - The learning page is bars + movers only (no timeline or sim chart).
   - The archive is a list instead of a calendar.
5. **L5 late:** the onboarding drops the taste test (picker → preferences → reveal).
6. **Wave 2:** take the extras in this order of value per hour, and stop at the freeze:
   1. ship kit (snapshot, personas, fallback)
   2. audio (Web Speech)
   3. describe-yourself
   4. perspectives
   5. Urdu web toggle
   6. tell-your-editor
   7. PWA
   8. `/status`

**Never cut:**
- onboarding (picker + reveal)
- today's paper with open original and skip
- the PDF download
- the archive
- visible learning (why-chips + learning bars + editor's note)
- Morning Recall / 3 things you learned
- streak chip
- seeded fallback
- the diagram, README and Loom

## 6. Definition of done for the MVP (Checkpoint at 17:00)

**Req 1:**
- [ ] A fresh visitor finishes onboarding in ≤ 90 s on a 390 px viewport.
- [ ] Drill-down Technical → Computer Science → AI/ML works.
- [ ] The taste test's swipes change the first paper.

**Req 3:**
- [ ] `/today` shows 20 stories in Front page and Bytes views.
- [ ] Every card has a why-chip and Read original (via `/r`).
- [ ] Skip removes the card and promotes a reserve item, with undo.
- [ ] Progress counts reads.
- [ ] `/archive` lists past editions.
- [ ] `/paper/[date]` renders one.

**Req 2:**
- [ ] The PDF downloads in ≤ 10 s (pre-rendered: instant).
- [ ] It has 4 A4 pages with the masthead (name, No., date, streak).
- [ ] Sections follow the reader's order.
- [ ] Its QR codes resolve through `/r`.
- [ ] The back page has "3 things you learned" and "Why these stories".

**Req 4:**
- [ ] Opening, skipping, more/less and recall answers update the weights instantly, with a toast and deltas.
- [ ] "Rebuild" or "Next morning" shows a different, explainable paper.
- [ ] `/me` shows bars, movers and a change summary.
- [ ] Fast-forward 7 days plots precision@20 vs the baselines with real numbers.

**Req 5:**
- [ ] Morning Recall appears on day 2 (via the demo clock).
- [ ] "3 things you learned" closes each edition.
- [ ] "Beyond your usual" has 2 explore stories + 1 serendipity story, each labelled.

**Infra:**
- [ ] `npm run job:ingest` fills the DB (≥ 500 articles, ≥ 150 Gemini-enriched).
- [ ] `/api/health` is green.
- [ ] The deployed URL works.
- [ ] `DEMO_FALLBACK=1` serves the snapshot with the network off.

## 7. Execution method

- **Recommended: orchestrated parallel lanes.**
  - The main session runs **L0 itself**.
  - It then launches **two Workflows** (this machine allows 6 concurrent agents per workflow) that run the 7 wave-1 lanes. Each lane is one agent with `isolation: 'worktree'`, following its plan with TDD (superpowers:test-driven-development) and verifying (superpowers:verification-before-completion).
  - When a lane finishes, a reviewer agent checks it against the plan and the spec (feature-dev `code-reviewer` lens), and the integrator merges.
  - You watch `/workflows`, answer questions and hand over keys and the design system.
- **Alternative: manual terminals.** Open one Claude Code session per lane in its worktree (`git worktree add ..\subah-L3 -b lane/L3-engine`) and say: *"Execute docs/plans/L3-engine.md using superpowers:executing-plans."* This gives you more control, but you have to supervise each session yourself.

## 8. Submission checklist

- [ ] The repo is **public**, and the README has: a one-liner, screenshots, how to run, the architecture diagram, the algorithm in 6 sentences, the edition-receipt numbers, a list of what was built today vs. libraries used, and the team.
- [ ] Architecture diagram: Mermaid in `ARCHITECTURE.md` **and** a FigJam/PNG export linked in the README (from the `figma:figma-generate-diagram` skill; Excalidraw as fallback).
- [ ] Loom ≤ 4:45 (the free plan cuts at 5:00), following `docs/DEMO.md`, with the link checked in incognito.
- [ ] Form: https://forms.gle/4i4Gf8vNv3Vu8ZLJ7, submitted with a screenshot of the confirmation.
