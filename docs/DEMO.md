# Subah: Demo script, live talk track & Q&A cheat sheet

> **Quote measured numbers only.** Fill in the blanks in §5 from the live build before recording; leave out any number you haven't measured.
> The Loom free plan cuts at **5:00**, so aim for **4:40**. Record each beat as soon as it passes QA (from ~17:30). The final take at 18:00 is then a re-record, not a first attempt.

## 1. One-liner (everyone memorizes it)
> **"Subah is your personal morning paper: 20 stories picked for you from about a thousand a day, readable as a newspaper or as 60-word bytes, and downloadable as a real newspaper PDF. It's also the only news app that helps you *remember* what you read."**

The problem statement's own line is our hook: *"…they still can't name three things they learned."*

## 2. Loom: 4 beats (target 4:40)

**Setup:**
- The frozen build is running. The demo persona **"Ayesha"** has 7 days of seeded history.
- Use a clean Chrome profile with no bookmarks bar and no extensions.
- Window at 1280 px. For the mobile segment, use the device toolbar at 390 px.
- Zoom 110%. Do-Not-Disturb on. Caches warmed: open every page once first.
- Never show a spinner longer than 2 s; cut it.
- Never show code or the terminal.

| Time | Beat | On screen | Say (gist) |
|---|---|---|---|
| 0:00–0:20 | **Hook** | Landing page with the cycling masthead | "News is scattered. People click through link after link and still can't name three things they learned. Subah gives you one paper a day, and helps you remember it." |
| 0:20–1:35 | **1. The payoff: Ayesha's paper** (Req 3, 5, 4) | 1. `/today` on desktop, masthead "The Ayesha Times · No. 8 · 🔥 7".<br>2. **Morning Recall**: answer one question about yesterday, and the flame lights.<br>3. Hover a **why-chip** ("You follow AI policy · 82% match"), then open the popover's contribution bars.<br>4. **Skip** a celebrity story with the reason "Not interested". The card leaves, the reserve story slides in, and a toast says "Got it, less Celebrity".<br>5. Open a story: the sheet shows the **source-faithfulness badge**, then **Read original ↗**.<br>6. Switch to **Bytes** at 390 px and swipe two cards. | "Every story says why it's here. Skip what you don't want and the paper re-edits itself. Each morning starts by asking what you remember from yesterday. That's retrieval practice, the most reliable way people remember what they read." |
| 1:35–2:20 | **2. A paper you can hold** (Req 2) | Click **PDF**: a 4-page A4 newspaper with the masthead and edition number, a lead story sized by her top interest, sections in her order, QR codes, and a back page with **"3 things you learned"** and **"Why these stories"**. Then put **a second persona's PDF side by side**. | "Same edition, laid out like a real newspaper, and personalized in *what* it includes and *how* it looks. Scan any QR code and the paper learns from that too." |
| 2:20–3:30 | **3. It learns, and shows it** (Req 4) | 1. `/me` → **Your paper learned**: bars, the movers "+AI policy, −Celebrity", and the change sentence.<br>2. **Tell your editor**: type "less cricket, more climate", see the proposed diff, confirm, and the paper rebuilds live.<br>3. **Fast-forward 7 days**: precision@20 for learning vs onboarding-only vs popularity (or the day-1 vs day-7 interest map).<br>4. **Next morning →**: a new edition opens with a Morning Recall. | "Opens, reading time, skips and recall answers update a Beta distribution per topic, and tomorrow's paper re-ranks. You can see what it learned, and correct it in plain words." |
| 3:30–4:40 | **4. A fresh reader in 30 s, and how it's built** (Req 1, efficiency) | 1. An incognito `/start`: Technical → Computer Science → AI/ML, then Science → Space, 3 taste-test swipes, 10 min, then **"Printing your first paper…"** reveals the edition.<br>2. The **"How this paper was made"** panel.<br>3. The architecture diagram, about 5 s.<br>4. Close on the repo URL and the PR list. | "Broad first, deep only where you want it. Each article is read and summarized **once**, for everyone. Your ranking is milliseconds of math, with zero AI calls per reader. One developer orchestrated 8 parallel agent lanes; every PR is reviewed and every commit is public." |

## 3. Live evaluation (≤ 3 min, then Q&A)
1. Open with the one-liner. Start on Ayesha's paper, so the judges see the payoff first.
2. Follow the Loom order, compressed: recall → why-chip → skip re-layout → PDF → learning bars → Tell your editor → a fresh 30 s onboarding.
3. Keep a **60-second screen capture** of the core flow ready in case the Wi-Fi fails. `DEMO_FALLBACK=1` serves the snapshot offline.
4. Say one known weakness before they ask, e.g. "The learning curve is shown on a simulated reader; real readers need a few days." Naming a limit scores well.

## 4. Q&A cheat sheet (each answer ≤ 30 s)

- **"Explain your algorithm."**
  1. Every article is embedded locally (gte-small, 384-d) and summarized once by Gemini Flash-Lite. The result is shared by all readers and cached.
  2. A reader is a Beta(α,β) per topic in our 67-node tree, plus a profile vector: a moving average of what they actually read.
  3. The score is 40% topic affinity, 25% similarity to the reader's profile, 15% cross-outlet importance and 15% freshness, minus a "less like this" term.
  4. We pick 20 with MMR for diversity: one story per cluster, at most 5 per area and 3 per source. Two slots are explore slots chosen by **Thompson sampling**, plus one serendipity slot.
  5. Reads raise α, skips raise β, with a 14-day decay back to the onboarding prior.
  6. The whole build takes about 10 ms of math per reader.
- **"Cold start?"** The hierarchical onboarding sets Beta priors: a picked leaf starts at (4,1) and an unpicked topic at (1,3). The taste test adds 8 real signals before the first paper exists, and the explore slots gather signal from day 1.
- **"Filter bubble?"** 2 explore slots plus 1 serendipity slot are guaranteed and labelled. Each area is capped at 5 stories. A "big story everyone should know" slot is ranked by how many outlets covered it.
- **"Why not let the LLM rank?"** Cost, latency, determinism and explainability. The LLM does what it's good at: summaries, recall questions and the editor's note, **once per article**. Ranking is transparent math; every chip comes from the score breakdown.
- **"Hallucinations?"** Prompts allow only facts stated in the source. Deterministic guardrails check that every number appears in the source, word counts, entity substrings and grounded quiz answers. If a check fails we fall back to the publisher's excerpt, and the badge says which one you're reading. The original link is always one tap away.
- **"Cost per reader?"** Read it off the receipt: LLM calls per reader = 0 on the critical path, plus one editor's note per day. Gemini requests today: __ of the __/day free quota.
- **"How do you know it improves?"** A 7-day simulated reader with hidden tastes: precision@20 from __ to __, against onboarding-only __ and popularity __. Also the real movers on Ayesha's paper. Be honest: it's a simulation, the method is standard (MIND-style offline evaluation), and real data would replace the persona.
- **"What breaks first at scale?"** Ingestion fan-out and PDF rendering. Both are already batch jobs (cron) and pre-rendered; next we'd add a queue and per-region workers. The LLM cost stays flat per article, not per reader.
- **"Built today vs reused?"** Everything in `src/` was written today; see the git history and PRs. Libraries: Next.js, Supabase, AI SDK, transformers.js, Puppeteer, shadcn/ui. Feeds are public RSS plus the HN, Dev.to and arXiv APIs.
- **"Copyright and privacy?"** We show only our own short summaries, with attribution and a link out. We never republish full text; images are hotlinked with a fallback. Reading events are per user and protected by row-level security. There's no social layer.
- **"Team collaboration?"**
  - One human ran 8 parallel agent lanes, each with its own plan, branch, PR and handoff notes, coordinated through binding contracts (`docs/ARCHITECTURE.md` §9).
  - Every merge was reviewed and every contract change is its own commit.
  - The README has "How this was built".

## 5. Numbers to fill in before recording (measured only)
| Metric | Value | Where it comes from |
|---|---|---|
| Sources active / articles ingested today | __ / __ | `job_runs` / `/api/health` |
| Stories (clusters) today | __ | edition receipt |
| Enriched by Gemini vs extractive | __ / __ | `articles.enrich_provider` |
| Edition build time (p50) | __ ms | receipt `buildMs` |
| Gemini requests today / daily quota | __ / __ | `llm_usage` |
| Simulator precision@20, day 1 → day 7 (learning / onboarding-only / popularity) | __ → __ / __ / __ | `/api/demo/fast-forward` |
| Fresh onboarding time | __ s | Playwright L5 timing |

## 6. Recording checklist
- [ ] `DEMO_MODE=1`, and the demo clock is reset before the take.
- [ ] Ayesha's 7-day history is seeded, and today's edition is built with Morning Recall present.
- [ ] Both persona PDFs are pre-rendered (in Storage and in `public/demo/`).
- [ ] The Gemini editor's note is present for Ayesha, not the template.
- [ ] An incognito window is ready for the fresh onboarding, and the anonymous rate limit is raised.
- [ ] The diagram is exported (FigJam PNG) and open in a tab.
- [ ] Take 2–3 times and keep the best. The link works in incognito. The video is ≤ 4:45.
