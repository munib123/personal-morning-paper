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
| **W2 lanes** | planned at Checkpoint C (16:30) from what actually shipped | tell-your-editor (L2 + L7 code) · audio (browser TTS) · design-system pass · ship kit hardening (snapshot, `DEMO_FALLBACK`, persona PDFs) · docs (README "How this was built", FigJam diagram) · QA | the extras and polish | 2 | — |

**Design system:** when your DevBytes-inspired system lands, drop it in `design/` and tell the session. One agent then maps it onto `src/styles/tokens.css`, the token names fixed in L0. UI lanes only ever use the semantic token classes (`bg-paper`, `text-ink`, `border-rule`, `text-accent`, `bg-sec-{root}`, `font-headline`, `font-body`, `font-ui`), so the reskin is one file. **Keep the brand visually original** (name, logo, accent colour). Judges score originality.

## 2. Your setup actions (do them now, ~10 min, while L0 starts)

1. **Supabase** (supabase.com → New project; region **Mumbai (ap-south-1)** or Singapore; free plan):
   - Settings → API: copy the **Project URL**, the **publishable key** (`sb_publishable_…`) and the **secret key** (`sb_secret_…`).
   - Settings → General: copy the **project ref**.
   - Account → Access Tokens: create a **personal access token** (lets the agent run `npx supabase db push`).
   - Keep the **DB password** you set.
   - Authentication → Sign In / Providers: **enable Anonymous sign-ins**. Rate limits: raise "anonymous sign-ins per hour" (e.g. 1000).
2. **Gemini:** in AI Studio, create an API key.
   - Open **aistudio.google.com/rate-limit** and tell the session your real RPM/RPD for `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`, `gemini-3.8-flash` and `gemini-3.8-flash-tts`. These numbers set the `GEMINI_RPD_*` budget guards.
   - *Optional:* Tier-1 billing ($5 prepay, about $1–2/day) lifts the Flash 20-requests/day limit and makes the podcast audio reliable. The plan works without it.
   - The free quota resets at **12:00 PKT**, so the big enrichment run happens after noon.
3. **Vercel** (vercel.com → Add New → Project → import `munib123/personal-morning-paper`):
   - Skip the env vars for now; L0 will give you the list. Alternatively, run `! vercel login` here and the agent links it.
4. **Paste the keys into this session.** The agent writes `.env.local` (git-ignored) and sets the GitHub Actions secrets with `gh secret set`.
5. **Design system:** drop it into `design/` when it's ready.

## 3. Timeline

> T0 = hackathon start (about 10:30 PKT). Times assume a **20:00 PKT deadline**; if yours differs, shift every row. Rows marked ⛳ are checkpoints.

| Clock (PKT) | Phase | Exit criteria |
|---|---|---|
| 11:05–12:20 | Research → spec → plans → review *(done)* | `docs/ARCHITECTURE.md`, `docs/PLAN.md`, `docs/DEMO.md` and `docs/plans/*` committed |
| 12:20–13:20 | **L0 Foundation** (the main session; plan for ~1 h, not 45 min), plus your setup actions | Tasks 1–4 pushed first (scaffold, deps, contracts, stubs). That push unblocks the lanes; migration, seed and CI land right after. |
| 13:20–16:30 | **Wave 1: 7 lanes in parallel** (L1–L7 in worktrees) | Each lane's plan done, tests green, pushed, PR open |
| ⛳ 14:30 | **Checkpoint A: first merge round** | Every lane merges its **first vertical slice** (fixtures are fine). L1 has a real ingest (≥ 500 articles) and L2 has embeddings plus the first enrichment. **Deploy to Vercel**, stubbed is fine. |
| ⛳ 15:30 | **Checkpoint B: second merge round** | L3 has seeded the **demo persona with 7 days of real history**, and the archive, streak, recall and movers show real data. The design system is mapped, if it has landed. |
| ⛳ 16:30 | **Checkpoint C: end-to-end green** | Real-data path on the deployed URL: onboard → today → open/skip → PDF → archive → me. Whatever is red gets its cut line. |
| 16:30–18:00 | **Wave 2** (§5a list) + start recording | "Tell your editor", browser audio, design-system pass, ship kit hardening, README, diagram. **Record each Loom segment as soon as it passes QA (from ~17:30).** |
| ⛳ 18:00 | **FEATURE FREEZE** | Only fixes, copy, polish and performance after this |
| 18:00–18:45 | QA (Playwright smoke, Chrome at 390 and 1280 px, a11y/LCP, offline fallback) + **final Loom take** (a re-record, not a first attempt) | Demo persona and fresh-user flows work deployed **and** locally with the network off |
| 18:45–19:15 | **Submit**: final deploy, FigJam diagram export, make the repo public, fill in the form | Screenshot of the confirmation |
| 19:15–20:00 | Buffer | — |

**Rolling integration (not big-bang).** The integrator merges at every checkpoint, in the order L1 → L2 → L3 → L7 → L6 → L5 → L4, with merge commits and CI after each merge. It leaves a **short human-written review comment on each PR**, so the process is visible to the judges.

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

## 5a. Scope decisions applied at planning (from the simulated judge-panel review)
The panel scored the plan about 8–9 on technical depth and efficiency, but warned it was **about 25% overscoped** for one human in about 7 h. These changes are already applied:

**Trimmed** (moved to "stretch, only if green"):
- archive month calendar (wave 1 ships a list plus a 7-day strip)
- streak freezes and repair
- Vercel on-demand Chromium (PDFs are pre-rendered by the local/Actions job and served from Storage; on a miss, the print route)
- the describe-yourself onboarding step and search-to-add
- Urdu, perspectives, the 2-host podcast, PWA and `/status`

**Kept:** the Bytes card view, since it is the DevBytes-style mobile experience. It is L4's last core task, with its own cut line.

**Added** (high value per hour):
- **Seeded 7-day demo persona** (L3, by Checkpoint B): real past editions, events, snapshots, streak days and recall answers, generated by the simulator's learning arm against the real pool.
- **"How this paper was made"** panel replaces the plain receipt footer (L4): a funnel of fetched → stories → shortlist → 20 + 8, build ms, LLM calls per reader = 0, and the AI vs extractive share.
- **Source-faithfulness badge** on every story (L4), from `aiProvider`: "AI summary · facts checked against source" or "Publisher's excerpt".
- **"Tell your editor"** (wave 2, L2 + L7). The reader types free text, sees a proposed diff on the interest bars, confirms it, and the paper rebuilds live. This is the best 20-second Loom moment.
- **`docs/DEMO.md`** is written now: a 4-beat Loom plus the Q&A cheat sheet.
- **Collaboration legibility:**
  - GitHub issues `req-1..req-5` are created at L0.
  - Each PR gets a human-written review comment.
  - The README gets a "How this was built" section: one human orchestrating N agent lanes, with links to the PRs and handoff files.

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
   1. ship kit hardening (snapshot export, `DEMO_FALLBACK`, persona PDFs in `public/demo`)
   2. "Tell your editor"
   3. design-system pass
   4. audio (Web Speech)
   5. README + diagram
   6. Only then the stretch list: archive calendar, streak freezes, Urdu, perspectives, podcast, PWA, `/status`

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
