# CLAUDE.md: "Personal Morning Paper", NaSCon'26 AI Hackathon

We are building a web app in one ~9–10 hour hackathon day (2026-10-17, Islamabad, PKT = UTC+5). The goal is to get shortlisted and win. The app gives every reader **one personal morning paper**:
- stories gathered from across the web and chosen for that reader
- readable on the web
- downloadable as a PDF laid out like a newspaper
- getting smarter the more they read

- Problem statement (the source of truth): `NaSCon'26 Problem Statement.pdf`
- Research: `docs/research/`
- Architecture: `docs/ARCHITECTURE.md`
- Build plan: `docs/PLAN.md`

The architecture and build plan are written after the research. Once they exist, follow them.

## Required features (from the problem statement); each one must show in the demo
1. **Onboarding**: captures enough about the reader's interests to personalize the paper, with a great UX.
2. **Daily PDF**: generated fresh every day and laid out like a traditional newspaper. It is personalized in both *what* it includes and *how* it presents it.
3. **Web page**: the same edition as a complete reading experience. Readers can open any original article, skip stories, download the PDF, and browse **previous papers** (an archive).
4. **Learning**: reading behaviour (we choose which signals) must improve future papers, so the more someone reads, the better the paper fits them. Make the learning *visible* in the product.
5. **Room to explore**: go beyond traditional news, offer new ways to discover things, and use AI in unexpected ways.

## Team product decisions
- **General-purpose, covering all topics.** Inspired by DevBytes (devbytes.co.in, short tech-only "bytes"), but for everyone.
- **Daily Top 20.** Each day's edition holds the ~20 stories most relevant to *this* reader.
- **Reading streaks.** Reading every day grows a streak.
- **Hierarchical interest onboarding.** Readers pick broad areas first (e.g. Arts / Science / Technical …), then drill down only where they want depth (Technical → Computer Science → specific dev topics).
- **UX is the top priority.** Mobile-first, fast, delightful and accessible. The team is preparing a design system inspired by DevBytes and other sites. Once it lands, UI must use its tokens instead of hard-coded colors, fonts or spacing. Keep the product visually original, because judges score originality.

## Decisions made (2026-10-17)
- **Builder:** one developer orchestrating many parallel Claude Code agents, one git worktree per lane.
- **Stack:** Next.js and Supabase (Postgres, pgvector, Auth, Storage), deployed on Vercel. Details are in `docs/ARCHITECTURE.md`.
- **AI provider:** Google Gemini only, the one key we have. The demo must survive Gemini rate limits, so every AI step needs a fallback.
- **Repo:** https://github.com/munib123/personal-morning-paper. It is private now and becomes public at submission.

## How we are judged (optimize every decision for these)
Innovation & Originality · Technical Complexity · Practical Impact & Usability · Model/Algorithm Efficiency · Presentation Clarity · Team Collaboration · UI/UX.
Every team member must be able to explain the architecture, the models and the implementation. Prefer designs where each part can be explained in one sentence.

## Submission (hard deadline, no extensions)
1. A public GitHub repo, created at the start. **All commits are monitored**, so every team member should commit small changes often, with clear messages.
2. A Loom video of the product, **5 minutes max**.
3. An architecture design diagram.

## Engineering rules
- AI tools, APIs, open-source libraries and templates are allowed. Never copy another team's work.
- The live demo must never depend on a flaky external call. Keep a seeded or cached edition that still works when the network is bad, and degrade gracefully when an API fails or rate-limits.
- Never commit secrets. Use `.env.local` and keep `.env.example` up to date.
- Verify before saying "done": run the build, the typecheck, and the relevant tests or a real browser check.
- Time-box: if something is blocked for more than ~20 minutes, switch to the simpler fallback in `docs/PLAN.md` and note the switch.
- Dev machines run Windows (PowerShell and Git Bash). Keep scripts cross-platform: use npm scripts, and no bash-only tooling inside the app.

## Build conventions (read before writing code)
- **Contracts are binding.** The types, signatures and routes in `src/contracts/*` (`docs/ARCHITECTURE.md` §9) are fixed: import them, never redefine them. Your lane owns only its folders (§6); use the stubs for everything else.
- **Next.js 16:** use `src/proxy.ts`, not `middleware.ts`. `params` and `searchParams` are Promises. Use `after()` for work after the response. Default to Server Components.
- **AI SDK v7:** use `generateText({ model, instructions, prompt, output: Output.object({ schema }) })` and read `result.output`. Never use `generateObject` or `system:`. Gemini is the only provider; model ids come from env.
- **Gemini stays off the request path.** The only exception is `describe`, which has a timeout and a keyword fallback. Every AI step has a deterministic fallback.
- **Time:** never call `new Date()` in route logic. Use `requestNow()` (it respects the demo clock) and pass `now` down into pure functions.
- **Supabase:** use the publishable/secret keys and `getClaims()`. Vectors come back as strings, so parse them with `src/server/db/vector.ts`.
- **UI:** the **Morrow design system is binding** (`design/project/README.md`, ARCHITECTURE §3a).
  - Compose the components from `@/components/morrow` (Masthead, StoryCard, WhyTag, FeedbackBar, TakeawayBox, TopicChip, Segmented, OnboardingStep, EditionCard…). Never restyle them.
  - Use only Morrow tokens and classes: `bg-paper`, `text-ink`, `text-ink-soft`, `text-ink-muted`, `border-rule`, `text-press`, `text-pen`, `bg-pen-soft`, `font-news`, `font-ui`, `rounded-control`, and the type classes `headline-*`, `deck`, `kicker`, `dateline`, `ui-*`.
  - No section colours, no emoji, no confetti; motion stays quiet.
  - Check pages in a real browser at 390 px and 1280 px.
- **Tests:** write Vitest tests first for pure modules. Before saying "done", `npm run typecheck && npm run lint && npm test && npm run build` must all pass.

## Parallel agent workflow
Several Claude Code sessions build in parallel.
- Each workstream owns its folders (listed in `docs/PLAN.md`). Do not edit another workstream's files; leave a note in your lane's `docs/handoff/L<n>.md` instead.
- Shared contracts (DB schema, shared TypeScript types, API shapes) change only in a commit of their own, announced in your lane's `docs/handoff/L<n>.md`.
- Use one branch or git worktree per workstream. Rebase on `main` often and merge small.
- Commit format: `feat(scope): …`, `fix(scope): …`, `docs: …`, `chore: …`.

## Tools available to agents
- **Context7** gives current library docs. Check the current API before writing code against any library. Use the MCP server `context7` (in new sessions) or HTTP:
  - Search: `curl "https://context7.com/api/v1/search?query=<library>"`
  - Docs: `curl "https://context7.com/api/v1/<id>?type=txt&topic=<topic>&tokens=3000"`, where `<id>` looks like `vercel/next.js`
- **Firecrawl** MCP server `firecrawl` scrapes pages and searches the web. Without an API key it is rate-limited and may refuse scrapes; fall back to WebFetch.
- **Totalum** MCP server `totalum` is available if the team adds an API key.
- Plugins and skills: superpowers, feature-dev, frontend-design, design, engineering, product-management, and figma (use FigJam for the architecture diagram).
