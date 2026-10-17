# 12 - Hackathon-winning strategy, demo, timeline and collaboration

Research agent 12 · 2026-10-17 · NaSCon'26 "Personal Morning Paper" (problem setter: Eynvision)

## TL;DR
- **Build for the problem setter.** Eynvision is an Islamabad applied-AI studio whose tagline is "Shipped to production, not stuck in pilot." Its products stress human checks, a confidence score on every output, AI cost tracking and fitting into tools people already use. Show a product that works end to end, explains every pick ("why this story"), and prints a small cost and latency receipt for each edition.
- **Use the problem statement's own hook.** The PDF says readers "still can't name three things they learned." Open the Loom with that line and close each edition with "3 things you learned today." Judges remember a project they can describe in one line.
- **Completeness beats breadth.** One working path through all five requirements by the halfway point (T+4:30), then improve it. Feature freeze at T+7:00. Fit the Loom inside 4:45, because the free Loom plan cuts recordings off at 5:00.
- **Make collaboration visible on GitHub.** Each person commits under their own git identity, at least 2 small commits per hour. One branch per workstream, a pull request per feature that another member approves, issues labelled `req-1..req-5`, and a GitHub Projects board. Use merge commits rather than squash merges, so each person's commits stay in history.
- **Make the learning and the ranking easy to explain.** Embeddings plus a linear score plus an explore slot, with LLM calls made once per article (shared by every reader) rather than once per reader. That gives cheap, explainable numbers to quote when judges ask "explain your model."
- **Architecture diagram.** Keep a Mermaid source in the repo (GitHub renders it, it is versioned, and edits show up as collaboration) and export a polished FigJam version through the `figma:figma-generate-diagram` skill for the submission. Excalidraw is the offline fallback.

---

## 1. Findings

### 1.1 NaSCon and Eynvision
- **NaSCon.** This is the yearly national students' convention run by FAST-NUCES Islamabad. It covers computing, engineering and business competitions. NaSCon'26 runs **16-18 Oct 2026** at the Islamabad campus. These dates come from a LinkedIn post and are (unverified) against an official FAST page. NaSCon'25 ran 18-20 Apr 2025, and FAST Lahore alone sent 118 students. I found no public rubric, prize list or format for the 2026 AI hackathon, so treat the judging criteria in CLAUDE.md as the source of truth.
- **Eynvision** (eynvision.com) describes itself as an "Applied AI studio helping enterprises close the gap between AI adoption and AI at scale."
  - Taglines: "We build AI that ships, not decks that circulate."
  - Its own products include Business Case Guru (GovTech), Bezeen (helping hotels show up in AI search) and Ascent AI (a consumer AI journaling and coaching app).
  - Credentials it lists: an engineer from a YC-backed startup (Markaz), a Fortune 500 production AI client, a paper in IEEE Transactions on AI, a top-10 APAC finish in the Google Solution Challenge, and first place in the Huawei AI Championship.
- **Eynvision's solutions line up closely with our brief:**
  - **Digest:** "The report writes itself from work you already do." Daily, weekly and monthly reports drafted automatically, then "A person checks and sends." A daily paper is a natural fit for them.
  - **Relay:** "Fields, not paragraphs", with a "Confidence on every field." In our app this becomes a short, scannable byte format, plus a "why this story" chip that shows a match score.
  - **Watchtower:** "See what AI is costing you, as it happens", with an audit trail and spending caps. In our app this becomes an edition receipt (LLM calls, tokens, cost, build time).
  - **Dispatch:** "Check it's complete first", confirmed by a person before it runs. In our app this becomes the final confirmation step of onboarding.
  - **Leo:** "Ask a question. Get the answer from your files." In our app this becomes an optional "Ask today's paper" feature.
- **What Eynvision probably values** (my inference from the above): production readiness (deployed, works on a bad network), outputs you can explain and check, cost awareness, a consumer-grade UX (Ascent AI), and AI that saves real time.

### 1.2 How judges assess each criterion in a short evaluation
Judges see many teams in a few minutes each. They are trying to settle their doubts quickly. Rubric scores tend to bunch in the middle, so the teams that pull ahead have a working demo, a clear first sentence and a scope that fits the time available. Things that did *not* move scores in the dev.to judge's notes: the choice of tech stack, team credentials, slides, and polish beyond readability. Context-first openings and a project with "three features and no center" both lost points. Projects that named a known weakness when asked scored *higher*.

| Criterion | What a judge checks in 3-5 min | Our feature / artifact that scores it | What loses |
|---|---|---|---|
| Innovation & Originality | Something they haven't seen 10 times today | Visible "Your paper learned" panel; "3 things you learned" recap; explore slot; original visual identity | A generic news feed with an LLM summary bolted on |
| Technical Complexity | Real pipeline, not one prompt | Ingest, dedupe, embed, rank (score + explore), PDF render, daily job, event-driven learning loop | Hard-coded JSON pretending to be personalized |
| Practical Impact & Usability | Would I use it tomorrow? | Onboarding under 30 s, mobile-first reader, skip, open original, PDF that prints well | Long forms, dead buttons, PDF that breaks the layout |
| Model/Algorithm Efficiency | "Why this approach, what does it cost, how fast?" | One LLM call per *article* shared across all readers, cached; cheap vector scoring per reader; edition receipt with real numbers | An LLM call per user per article; no numbers; "the AI decides" |
| Presentation Clarity | First 30 s, a story they can repeat | One-line identity, minute-by-minute Loom, a diagram you can read in 10 s | Starting with context or the tech stack; running over time |
| Team Collaboration | Commits from everyone, all day | Per-member commit graph, PRs with reviews, issue board, HANDOFF.md | One person pushing everything at hour 9; giant commits |
| UI/UX | Delight, consistency, mobile, accessibility | Design tokens, motion on save/skip, streak animation, dark mode, keyboard and screen-reader basics | Default-looking Tailwind pages; layout breaking on a phone |

### 1.3 What wins vs. what loses (general hackathon evidence)
- **Wins:** a working core flow; a fast payoff (show something working within about 90 s); a hard-coded or cached demo path; reading the rubric early and coming back to it; being honest about which parts were built during the event versus reused; naming known limits.
- **Loses:** unfinished core flows; a live demo that depends on Wi-Fi or an API ("Wifi fails at most events I judged"); overscoping ("a platform built in 36 hours reads as poor judgment"); running over time.

### 1.4 Tools
- **Loom free (Starter) plan:** 5-minute recording cap, 25 videos per person, up to 720p. Several 2026 pricing guides agree on this, but I have not checked it on loom.com (unverified). Business plans lift the cap. Assume the recording **stops at 5:00**.
- **Mermaid** renders natively inside GitHub Markdown, so a diagram in `docs/ARCHITECTURE.md` stays viewable in the repo and changes show up in diffs.
- The **figma** plugin ships a `figma:figma-generate-diagram` skill, and FigJam boards can be shared publicly and exported as PNG or PDF.

---

## 2. Recommendations for our build (ranked; effort in Claude Code agent-hours)

1. **Get the core path working end to end first (~4 h of parallel work, done by T+4:30).**
   - The path: onboarding, then today's Top 20 on the web, then open an original or skip, then download the PDF, then the archive list.
   - Start from a **seeded edition plus cached articles** so the demo never depends on the network.
   - Live ingestion is an upgrade added on top of this, not a precondition.
2. **Make the learning visible (2.5 h).**
   - Record these events: `open`, `dwell`, `skip`, `save`, `pdf_download`.
   - Turn them into weight updates on the interest tree (the same hierarchy as onboarding) plus an EMA (exponential moving average) of the user's embedding.
   - Show a "Your paper learned" card: "+ Space exploration ↑, Cricket ↓ (you skipped 4)."
   - Add a "Regenerate tomorrow's paper" button so the change shows up in the demo.
   - This covers requirement 4, Innovation and Algorithm Efficiency in one feature.
3. **Add an explainable ranking with an edition receipt (1.5 h).**
   - Score: `score = w_interest·sim(user, article) + w_tree·topicWeight + w_fresh·recency + w_src·quality − w_seen·dup`.
   - Fill the Top 20 as 16 exploit slots plus 4 explore slots, using epsilon-greedy or Thompson sampling, and label the explore slots ("Outside your usual").
   - Give each card a "Why this story" chip with its top two reasons.
   - Footer receipt: "Built in 1.8 s · 0 per-user LLM calls · 22 cached article summaries · est. $0.00x." Use real measured values only.
4. **Personalize how the PDF looks, not only what it holds (1.5 h).** The reader's top interest gets the lead story and the broadsheet front page. Sections are ordered by learned weight. The masthead shows the reader's name, date, edition number and streak. Density adapts (more briefs for skimmers, longer pieces for deep readers). Have a second persona's PDF ready to show side by side.
5. **Add a "3 things you learned today" recap and streak (1.5 h).** End each edition with three one-line takeaways drawn from the stories the reader actually opened, plus an optional one-tap quiz. Finishing it extends the streak. This answers the problem statement's opening line directly.
6. **Set up the collaboration scaffolding at T+0 (0.5 h, then ongoing).** See section 3.
7. **Write the architecture diagram as Mermaid in the repo early (0.5 h), then export the FigJam version at T+7:30 (0.75 h).** See section 5.
8. **Script, rehearse and record the Loom (1.25 h, starting by T+8:15).** See section 4.
9. **Prepare the live-evaluation pack (0.5 h).** A one-page cheat sheet with the one-liner, each member's one-sentence explanation of each component, the numbers, and the Q&A answers in section 7.
10. **Stretch goals, only if green at T+6:00 (1-2 h each):** an "Ask today's paper" grounded Q&A; an audio "morning brief" through the browser's `speechSynthesis` (free, works offline); a PWA install.

---

## 3. Team-collaboration evidence ("all commits are monitored")

- **Identity**
  - Before the first commit, each member runs `git config user.name/user.email` on their machine with the email of their GitHub account. Otherwise their commits do not count toward their profile.
  - Claude Code agents commit as whoever runs them. Keep the `Co-Authored-By: Claude` trailer: it is honest and allowed under the rules.
- **Repo setup at T+0**
  - Make the repo public right away (the rules say "at the start").
  - Add a README stub, `.env.example` and a `docs/` folder.
  - Turn on light protection for `main`: changes go through pull requests, and no force pushes.
- **Branches:** `feat/<stream>-<thing>` (e.g. `feat/pdf-masthead`), one per workstream or worktree. Rebase on `main` at least hourly.
- **Pull requests**
  - Keep each PR small (under ~300 lines changed where possible), with a title in the same `feat(scope): …` form.
  - Write `Closes #12` in the body and add a screenshot or GIF for UI work.
  - Another member approves it; a review can take 2 minutes.
  - Use **merge commits or rebase-merge**, not squash. Squashing collapses each person's commits into one and shrinks the visible history.
- **Issues and board**
  - At T+0, create ~20 issues from PLAN.md, labelled `req-1-onboarding` … `req-5-explore`, `ux`, `infra`, `bug`.
  - Assign each issue to a person.
  - Use a **GitHub Projects** board (Todo, In progress, Review, Done) and two milestones (`MVP T+4:30`, `Demo T+7:00`).
  - Move cards as work happens. The board's activity carries timestamps.
- **Commit cadence:** each member makes at least 2 commits per hour, every hour, with meaningful messages (`feat(rank): add explore slots with epsilon 0.2`). Avoid "wip" and "fix". Avoid a single 5,000-line template commit. Avoid one person bulk-pushing everyone's work at the end.
- **Shared contracts:** changes to the types and DB schema go in their own `chore(contract): …` commit, announced in `docs/HANDOFF.md`, which then doubles as a log of coordination.
- **Shown in the Loom:** 5-10 seconds of the commit graph (Insights → Contributors) and the board, and each member narrates their own segment.

---

## 4. The 5-minute Loom: script (target 4:40, hard cap 5:00)

| Time | Segment | On screen | Talk track (gist) |
|---|---|---|---|
| 0:00-0:20 | Hook and identity | Title card, then the product's landing page | "News is scattered. People read 40 tabs and can't name three things they learned. *<Name>* is one personal morning paper: the Top 20 stories for you, on the web and as a newspaper PDF, that gets smarter every day." |
| 0:20-1:00 | **Req 1 Onboarding** | Fresh account, mobile viewport: pick broad areas, drill Technical → CS → AI, choose depth or reading time, confirm | "Pick broad areas, go deep only where you want. Under 30 seconds." Show the timer. |
| 1:00-1:55 | **Req 3 Web edition** | Today's Top 20: "why this story" chip, open the original (new tab), skip with animation, streak, archive of previous papers | "Every pick explains itself. Skip what you don't want. Yesterday's papers are one tap away." |
| 1:55-2:35 | **Req 2 PDF** | Download, show the broadsheet front page, masthead with name, edition number and streak; side by side with a second persona's PDF | "Same edition, laid out like a real newspaper, personalized in what it includes *and* how it looks: lead story, section order and density." |
| 2:35-3:25 | **Req 4 Learning** | Seeded persona with 7 days of history: the "Your paper learned" card, interest-weight bars before and after, then regenerate and show the Top 20 change | "We record opens, dwell time and skips. Weights update and the next paper changes. You can see exactly what it learned." |
| 3:25-4:05 | **Req 5 Explore and innovations** | Explore slots ("Outside your usual"), the "3 things you learned" recap plus streak, one stretch feature if built | "Room to explore, by design: 4 of 20 slots for discovery. The day ends with three things you learned." |
| 4:05-4:35 | Architecture and efficiency | The diagram (5 s per zone) and the edition receipt | "One LLM pass per article, shared by all readers. Per-reader ranking is vector math. Edition built in X s for Y cost. Works offline from cache." |
| 4:35-4:50 | Team and close | Contributors graph and board, then the repo URL | "Four of us, N commits, M PRs. Repo and diagram are linked." |

**Recording tips**
- **Prepare the machine**
  - Record the **finished, frozen build** from a seeded demo account, with caches warmed.
  - Turn on Do-Not-Disturb, clean the browser profile (no bookmarks bar, no extensions), set zoom to 110-125%, and use 1080p if the plan allows it.
  - Use device-toolbar mobile frames for the onboarding segment.
- **Practise and record**
  - Do one dry run against a timer. Record 2-3 takes and keep the best.
  - Don't re-record for small stumbles. Don't speed up playback.
  - Keep the script on a second screen and switch narrators per segment (Team Collaboration).
- **Never show:** loading spinners longer than 2 s (cut them or pre-load), a terminal, or code (judges see code in the repo).
- **Safeguards**
  - Keep a fallback 60-second screen capture of the core flow for the live evaluation, in case Wi-Fi fails.
  - Check the Loom link works in an **incognito window** before submitting the form.

---

## 5. Architecture diagram

- **Source of truth:** Mermaid `flowchart LR` in `docs/ARCHITECTURE.md`. It is generated quickly by an agent, renders on GitHub, and its diffs count as collaboration.
- **Submission version:** FigJam through `figma:figma-generate-diagram` (requires Figma authentication via the plugin), exported as PNG/PDF and linked publicly. It looks the most polished.
- **Fallbacks:** Excalidraw (excalidraw.com, works offline, hand-drawn look, exports PNG) if Figma auth or rate limits block us.
- **What to include**
  1. Swimlanes: *Client* (Next.js web app / mobile) · *API* · *Daily pipeline (cron)* · *AI layer* · *Storage* · *External sources*.
  2. A numbered data flow: ① sources (RSS/APIs) → ② ingest and normalize → ③ dedupe/cluster → ④ embed and summarize (once per article, cached) → ⑤ per-reader rank (score + explore slots) → ⑥ edition stored → ⑦ web reader and ⑧ PDF renderer → ⑨ reading events → ⑩ learner updates the profile (feeds back into ⑤).
  3. Name each model or library on its box (embedding model, LLM, PDF engine), with latency and cost notes.
  4. Fallback paths drawn dashed (seeded edition, cached summaries, rate-limit backoff).
  5. Colour boxes by requirement (req 1-5) so judges can map features to the brief at a glance.
  6. A legend and a one-line caption under each zone. Fit the whole diagram on a single screen.

---

## 6. Timeline: 9-10 h, 2-4 people, each running 2-3 Claude Code agents

Roles for 4 people (with 3, merge B and D; with 2, A takes infra, pipeline and learning, and B takes all UI and the PDF):
- **A:** lead, contracts, pipeline and ranking
- **B:** onboarding and web reader UI
- **C:** PDF and archive
- **D:** learning, explore features, diagram and Loom

| Clock | Phase | Output / checkpoint |
|---|---|---|
| T+0:00-0:30 | **Contract-first kickoff** | Public repo, board and issues, branch rules. A writes the shared types, DB schema, API shapes and seed data; design tokens imported. **Everyone makes their first commit.** |
| T+0:30-1:00 | Walking skeleton | App boots and deploys (preview URL); each stream has a stub page or route on mock data. |
| T+1:00-2:30 | Parallel workstreams | Agents build in their own folders and worktrees; PRs merged every 30-45 min. |
| **T+2:30** | **Checkpoint 1** (10 min standup) | Every stream renders on the shared mock or seed data. Scope review: drop or shrink anything red. |
| T+2:30-4:30 | Integrate the core path | Onboarding writes the profile, the ranker builds the edition, the web page shows it, the PDF downloads, the archive lists. |
| **T+4:30** | **Checkpoint 2: MVP milestone** | Full path works on the deployed URL **with the network off** (seeded). If not, apply cut lines A and B. |
| T+4:30-6:00 | Learning loop and differentiators | Events, weight updates, "learned" panel, explore slots, recap and streak, edition receipt. |
| **T+6:00** | **Checkpoint 3** | Demo personas seeded (new user plus a 7-day user). Decide on one stretch feature or none. |
| T+6:00-7:00 | Finish features | Stretch feature only if everything else is green. |
| **T+7:00** | **FEATURE FREEZE** | Bug fixes, copy, UX polish and performance only from here. |
| T+7:00-8:15 | Polish and hardening | Mobile pass, accessibility basics, empty and error states, offline fallback test, README, FigJam diagram export. |
| T+8:15-9:00 | Record the Loom | Rehearse, 2-3 takes, upload, check incognito. |
| T+9:00-9:15 | **Submit** | Form submitted with the repo (public), Loom and diagram links. Screenshot the confirmation. |
| T+9:15-end | Buffer | Live-evaluation rehearsal; small fixes merged only if they can't break the demo. |

**Cut lines (in order, when a checkpoint is missed)**
- **A (T+4:30 not green):** drop live ingestion and use seeded and cached articles only (say so honestly). Make the archive a plain list.
- **B:** make the PDF a single template, personalized by section order and masthead only.
- **C (T+6:00 not green):** keep one explore feature (explore slots), and turn the recap into static takeaways from opened stories, with no quiz.
- **D:** run learning as an in-session recompute plus the "learned" card only (no background job).
- **Never cut:** onboarding, web edition with open/skip, PDF download, the visible learning card, one explore feature, the diagram, and the Loom.
- **The 20-minute rule (CLAUDE.md):** anything blocked for longer than that switches to its fallback.

---

## 7. Live evaluation: talk track and Q&A prep
- **Opening (10 s, everyone knows it):** "<Name> is your personal morning paper: the 20 stories that matter to you, on web and as a newspaper PDF, learning from how you read."
- **Demo order:** the same as the Loom, but start on the **7-day persona** (payoff first), then show the onboarding of a new user.
- **Each member can explain every box in one sentence.** Rotate who answers.
- **"Explain your model/algorithm" (≤45 s):**
  1. "Each article is embedded and summarized **once** and cached, so cost does not grow with the number of readers."
  2. "A reader is an interest tree plus an embedding."
  3. "The score is a weighted sum of similarity, topic weight, recency and source quality."
  4. "16 slots exploit, 4 explore."
  5. "Opens and dwell time push weights up, skips push them down, with an exponential moving average so it adapts without overreacting."
  6. "Ranking is milliseconds of vector math; the edition builds in X s."
- **Likely questions, and prepared answers:**
  - **Cold start?** Hierarchical onboarding sets the prior weights, and explore slots gather signal from day one.
  - **Filter bubble?** Explore slots are guaranteed and labelled, and diversity is capped per topic.
  - **Why not let the LLM pick stories?** Cost, latency and non-determinism. We use the LLM where it adds value (summaries, "why this", recap), not for ranking.
  - **Cost per user per day?** Quote the receipt number.
  - **What breaks first at scale?** Ingestion fan-out and PDF rendering; queue them and pre-render at off-peak. Naming a weakness scores well.
  - **How do you know it improves?** Show the click-through on top-ranked items or the hit rate before and after for the seeded persona. Only quote real numbers.
  - **What did you build today vs. reuse?** Answer honestly: the libraries are named in the README.
  - **Copyright and privacy?** We show headlines and our own short summaries and link to the original. Reading events stay per user.

---

## Innovation ideas (beyond the core)
1. **"Your paper learned" diff card.** Interest bars before and after, with reasons. Wow 5 · 2 h · Innovation, Learning, UX.
2. **"3 things you learned today" recap and quiz feeding the streak.** Wow 4 · 1.5 h · Innovation, Impact.
3. **Edition receipt** (build time, LLM calls, cost; Watchtower-style). Wow 4 · 0.75 h · Efficiency, Eynvision fit.
4. **"Why this story" chips with a match score** (Relay-style confidence). Wow 4 · 1 h · Usability, Explainability.
5. **Labelled explore slots** ("Outside your usual"). Wow 3 · 1 h · Room to Explore.
6. **Audio morning brief** via the browser's speechSynthesis. Wow 3 · 1 h · Innovation, Accessibility.
7. **"Ask today's paper"** grounded Q&A (Leo-style). Wow 4 · 2.5 h · AI in unexpected ways (stretch only).

## Risks
- **Demo dependence on the network or APIs.** Mitigate with a seeded edition, cached summaries and an offline test at T+4:30.
- **Overscoping.** The explore features could eat into core completeness; the cut lines and the T+7:00 freeze are binding.
- **Merge hell from parallel agents editing shared files.** Mitigate with contract-first types, folder ownership, hourly rebases and small PRs.
- **Commits attributed to the wrong person or account,** or one member's commits invisible, because of git identity misconfiguration or squash merges.
- **Recording overruns the 5:00 Loom cap,** or the link is private. Target 4:40 and check in incognito.
- **Figma authentication or rate limits blocking the FigJam diagram.** The Mermaid or Excalidraw fallback is ready.
- **Unverifiable claims in the Q&A.** Only quote numbers measured from our own build.

## Sources
- Problem statement: `NaSCon'26 Problem Statement.pdf` (local; Eynvision branding, submission form https://forms.gle/4i4Gf8vNv3Vu8ZLJ7)
- https://www.eynvision.com (home: taglines, products, credentials)
- https://www.eynvision.com/solutions (Leo, Watchtower, Digest, Relay, Dispatch, Clearance)
- https://www.eynvision.com/solutions/digest
- https://pk.linkedin.com/in/muhammad-owais-idrees (NaSCon'26 dates; unverified secondary source)
- https://lhr.nu.edu.pk/newsDetails/547 (NaSCon'25 participation; via search snippet)
- https://dev.to/kurbaitaev/what-judges-actually-score-notes-from-a-year-of-hackathon-judging-3p4l
- https://www.hackerearth.com/blog/10-tips-win-hackathon (via search snippet)
- https://blogs.reskilll.com/what-hackathon-judges-look-for-complete-judging-criteria-breakdown-2026/ (via search snippet)
- https://blog.jetbrains.com/ai/2026/06/how-to-win-a-hackathon-notes-from-the-judging-table/ (returned 403; not read)
- https://www.costbench.com/software/communication/loom/free-plan/ and https://trainn.co/blog/loom-pricing/ (Loom 5-min free cap; unverified on loom.com)
