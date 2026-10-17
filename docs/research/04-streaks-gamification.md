# 04 · Reading streaks, habit loops and recall (gamification spec)

Researched 2026-10-17. Primary sources where possible; anything not verified is marked **(unverified)**.

## TL;DR
- **Make the bar low: one "qualifying read" a day extends the streak.** When Duolingo let a single lesson extend a streak, instead of the full daily goal, Day-14 retention rose 3.3% and learners on a streak rose 10.5%. Finishing the Top 20 becomes a separate "Edition complete" ring, not a condition for the streak.
- **Forgiveness is built in, and it is never sold.** Readers earn 1 auto-freeze for every 7 streak days and can hold at most 2 (Duolingo's cap; it lifted DAU 0.38%). A missed day can be repaired within 48 h by doing "Catch-up": yesterday's 3-question recall quiz. Research shows that a repairable break hurts motivation less (Silverman & Barasch, JCR 2023).
- **The day is the reader's local day with a 03:00 rollover.** A read at 01:30 counts for the edition the reader is finishing. We store an IANA timezone, default `Asia/Karachi` (UTC+5, no DST), and compute `local_date` on the server.
- **The streak feeds the learning loop.** The "Morning Recall" quiz is built from yesterday's reads. It applies the testing effect, it gives a strong interest signal for personalization, and it powers both the repair path and a visible "Knowledge score".
- **Ethical guardrails show up in the UI.** No shame copy. Longest streak and total reading days are never lost. Readers can hide the streak, and get at most one gentle at-risk nudge a day. There are no streak leaderboards and no paid repair. A finite paper with a "You're done for today" end state is our anti-doomscroll story for the judges.
- **Effort:** ~5.5 h for the core spec (engine, tables, widget, celebrations, recall quiz). Extras: heatmap 1 h, weekly recap 1.5 h. Demo needs: a `?now=` time-travel flag and a seeded 12-day streak that includes one used freeze.

---

## Findings

### Duolingo (the reference implementation)
| Mechanic | What is known | Source |
|---|---|---|
| Streak = consecutive days with ≥1 lesson | Originally the streak required the daily goal. After the two were separated: **D14 retention +3.3%, DAU +1%, learners on a streak +10.5% (+19% among new learners)** (all relative). A year later, learners on a 7+ day streak were up >40%, and the share of DAU with a 7+ day streak went from ~1/3 to just over 1/2. | blog.duolingo.com/improving-the-streak |
| Value of 7 days | Learners who reach a 7-day streak are 2.4× more likely to come back the next day and 3.6× more likely to finish their course. | same; how-duolingo-streak-builds-habit |
| Streak freeze | Covers one missed day. Up to **2 equipped** at once. Raising the cap to 2 gave **+0.38% DAU**. Freezes are bought with gems ("Refill" shown at 400 gems). Their rationale is to give "slack" so that one miss does not demotivate. | how-duolingo-streak-builds-habit |
| Extension animation | The celebratory streak-extension animation gave **+1.7%** in 7-day activity for new learners. Selected milestone days get a special animation. | same |
| Milestones | Celebrations at 1 week, 1 month, 100 days, 1 year and beyond. A "Streak Society" exists for long streaks; the 365-day tier and its perks are **(unverified)**. | blog.duolingo.com/streak-milestone-design-animation |
| Streak Wager | Bet in-game currency on 7 more days. **D7 retention +14%**, with significant lifts at D1/D7/D14. | blog.duolingo.com/how-streaks-keep-... |
| Weekend Amulet | Protects the weekend; weekend DAU dips 5–10%. Learners offered it were **4% more likely to return a week later** and **5% less likely to lose their streak**. | same |
| Streak repair | Pay to repair after a miss. The window and price are **(unverified)**. Critics on deceptive.design call it a dark pattern. | deceptive.design |
| Outage protection | The "Big Red Button" logs attempts made during an outage, and afterwards auto-freezes the missed day for each affected learner. It has protected >2M streaks. | blog.duolingo.com/protecting-streaks-from-site-issues |
| Notifications | A "sleeping, recovering" bandit (Recovering Difference Softmax) chooses reminder templates: **+0.5% DAU, +2% new-user retention** (KDD 2020). Over 600 streak experiments in 4 years, per a podcast summary **(unverified)**. | research.duolingo.com/papers/yancey.kdd20.pdf |
| Loss aversion | A day is +50% of a 2-day streak but only +0.5% of a 200-day one. Early on the reward drives the habit; later, fear of loss does. | how-duolingo-streak-builds-habit |

### daily.dev (closest analogue: a reading product)
- **Qualifying read:** opening a post in the feed is not enough. The reader must click "Read post" and consume the original. For a video, opening it counts. Simply logging in does not count.
- **Weekends:** greyed out and skipped without breaking the streak, and readers can **configure which days are their weekend**. Reading on a weekend day still earns a flame.
- **Icon:** a dotted outline until the first read of the day, then a flame. Clicking it shows the last 7 days, the longest streak and total reading days.
- **Milestones:** follow the Fibonacci sequence, and readers can opt out of the pop-ups.
- **Reminder:** 20:00 local time, only when the streak is about to break. It can be turned off.
- **Restore:** paid with "Cores" (in-app currency); **the first restore is free**.
- **Display:** longest streak and total days appear on the profile and DevCard, and there is a public leaderboard. Day boundary: **not documented**.

### Other products
- **NYT Wordle:** the puzzle resets at local midnight on the device's clock (secondary reports). Winning extends the streak and a loss resets it to 0. There is no official freeze **(no NYT doc found)**. Lesson: a finite daily ritual plus a shareable result is the hook.
- **Snapchat:** both people must send a photo or video Snap every day. An ⌛ hourglass warns that the streak is about to expire, and a restore option exists for a limited time. Widely cited as a coercive pattern (social obligation). **We avoid any social-obligation streaks.**
- **GitHub contribution graph:** a calendar heatmap that is timestamped in **UTC, not local time**, so activity near midnight can land on an "unexpected" day. Lesson: copy the heatmap, not the UTC choice.
- **Apple Fitness (watchOS 11):** "Pause Rings" for today, a week, a month or a custom range. While paused you neither earn credit nor lose your streak (third-party docs; the maximum length is disputed: 1 month vs 90 days). Rings model separate daily goals that sit beside the streak.
- **Headspace:** the run streak resets after 24+ h without a meditation. Only some content counts (sleepcasts and music do not). Readers can **hide** the streak with an eye toggle.
- **Calm:** readers can **manually add a missed session** to repair a broken streak. That is the most forgiving model.

### Habit research
- **Fogg (B=MAP):** a behaviour happens when Motivation, Ability and a Prompt are present at the same moment. For us: Ability means a 30-second first read, and the Prompt is the morning moment, a PWA icon or an optional email.
- **Hooked (Eyal):** Trigger → Action → Variable reward → Investment. Our variable reward is the surprise "Wildcard" story and the next day's quiz result. Our investment is that ratings and reads visibly retune tomorrow's paper. Eyal's own ethics test is "Would you use it? Does it improve users' lives?"
- **Silverman & Barasch, "On or Off Track: How (Broken) Streaks Affect Consumer Decisions", JCR 49(6) 2023:** across 7 studies, highlighting an intact streak raised later engagement, and highlighting a broken one lowered it. The effect depends only on how the log *represents* behaviour, not on the behaviour itself. It is weaker when the streak is **repairable** and stronger when people blame themselves. Their advice: don't put a broken streak front and centre, and offer alternate ways to keep it going.
- **Kuo, Zhao & Scott (ACM IDC 2026), on families using Duolingo:** they define "exit dark patterns" (raising the cost of quitting), "goal drift" (maintaining the metric instead of learning) and "gamified obligation" (guilt).
- **Testing effect (Roediger & Karpicke 2006, Psych. Science 17(3)):** on tests 2 days and 1 week later, retrieval practice beat restudying. The often-quoted 61% vs 40% one-week figures come from secondary sources **(unverified)**. This is the science behind Morning Recall.
- **Overjustification / "streak creep"** (The Decision Lab): too much extrinsic reward can erode intrinsic enjoyment. Keep the streak small in the UI; the paper is the hero.

---

## Recommendations for our build (the spec)

### R1. Rules (ranked by importance)
1. **Qualifying read (QR)** is any one of:
   - (a) the reader opens a story in the reader view **and** either stays ≥ 20 s or scrolls ≥ 60%;
   - (b) the reader clicks out to the original article;
   - (c) the reader answers a Morning Recall question.
   Opening the app or downloading the PDF does **not** count. Downloading the PDF counts only through the QR quiz link (see the innovation ideas).
2. **Streak day** = a local edition day with ≥ 1 QR. One QR is enough; finishing the edition is never required.
3. **Edition complete ring (separate daily goal):** read 5 stories and finish the recall quiz. It shows as a ring that fills. It gives a confetti moment but has **no** effect on the streak.
4. **Day boundary:** `local_date = date(occurred_at AT TIME ZONE user.tz − 3 h)`. The 03:00 rollover means a reader finishing at 01:30 still counts for "today's" paper. The timezone defaults to `Asia/Karachi` and is detected with `Intl.DateTimeFormat().resolvedOptions().timeZone` during onboarding. Compute the date on the **server** and never trust the client's date.
5. **Freezes:** earn 1 for every 7 consecutive streak days, hold at most 2, start new users with 1, and **apply them automatically** on a missed day. There is nothing to buy.
6. **Rest days (optional, daily.dev-style):** readers can mark up to 2 weekdays as rest days, for example Friday or Sunday. Missing a rest day never breaks the streak; reading on one still counts and earns a flame. The default is none.
7. **Repair ("Catch-up"):** if the streak broke because of exactly one missed day and no freeze was left, the reader can repair it **within 48 h of the missed day's end** by finishing yesterday's 3-question recall quiz. Allowed once every 14 days. Free.
8. **Never lost:** `longest_streak` and `total_reading_days` only ever go up. When a streak breaks, the copy leads with the total: "42 reading days so far".
9. **Outage rule (Duolingo BRB idea):** if the edition build failed for a day (`editions.status = failed`), auto-freeze that day for everyone, without using up anyone's freezes.
10. **Time-zone change:** use the timezone at the moment of the event. If a timezone change makes a gap look like 1 missed day while the gap in UTC is under 36 h, treat it as continuous.

### R2. States (computed by one pure function `getStreakState(days, now, tz)`)
| State | Condition | UI |
|---|---|---|
| `new` | no QR ever | dotted flame, "Read 1 story to start your streak" |
| `pending` | streak > 0 and no QR yet today | dotted flame with the number in a muted colour |
| `done_today` | QR today | lit flame and the number, plus a celebration the first time each day |
| `at_risk` | `pending` and local time ≥ 20:00 | amber flame and one gentle in-app banner |
| `frozen` | yesterday was covered by a freeze | ice flame, "A freeze saved your streak yesterday" (snowflake SVG icon) |
| `repairable` | 1 missed day, no freeze, within 48 h, repair allowed | card: "Catch up on yesterday's paper (3 questions) to keep your 12-day streak" |
| `broken` | otherwise | streak shows 0. Lead with "Total reading days: 42 · Best: 12". No red, no sad mascot. |

### R3. Data model (Postgres or SQLite; names are suggestions for the shared-schema owner)
```
users            + tz TEXT DEFAULT 'Asia/Karachi', rest_days SMALLINT[] DEFAULT '{}',
                   streak_visible BOOL DEFAULT true, nudges_enabled BOOL DEFAULT true,
                   nudge_hour SMALLINT DEFAULT 20
reading_events   id, user_id, story_id NULL, edition_id, kind ENUM(open,dwell,scroll,outbound,
                   quiz_answer,pdf_download,skip,save), value_num (ms or %), occurred_at TIMESTAMPTZ,
                   local_date DATE   -- shared with the learning workstream (same table = signals)
daily_activity   PK(user_id, local_date), qualifying_reads INT, stories_read INT,
                   quiz_correct INT, quiz_total INT, edition_complete BOOL,
                   status ENUM(read, frozen, repaired, rest, outage), updated_at
streaks          PK user_id, current INT, longest INT, total_days INT, last_streak_date DATE,
                   freezes_available SMALLINT (0..2), freeze_progress SMALLINT (0..6),
                   last_repair_at TIMESTAMPTZ NULL, updated_at
badges           PK(user_id, code), awarded_at, meta JSONB   -- code e.g. 'streak_7', 'polymath'
recall_questions id, edition_id, story_id, prompt, options JSONB(3–4), answer_idx, explain
recall_answers   PK(user_id, question_id), chosen_idx, correct BOOL, answered_at
```
- **Source of truth:** `daily_activity`. Treat `streaks` as a cache that can be fully rebuilt from it, so a bug never permanently corrupts anyone's streak.
- **Update flow:** a QR event comes in → upsert `daily_activity` → run `recomputeStreak(userId)` inside the same transaction → return `{state, current, milestone?}` so the client can celebrate right away.

### R4. Milestones and badges
- **Streak milestones:** 3, 7, 14, 30, 50, 100, 365 days. Show a full-screen celebration at 7, 30, 100 and 365, and a toast for the rest.
- **Learning badges, tied to the learning loop:**
  - **Explorer:** read in 5 or more interest areas in one week.
  - **Sharp:** 5 perfect recall quizzes.
  - **Deep diver:** 10 originals opened in one sub-topic.
  - **Wildcard:** read a story outside your interests.
- Keep 6–8 badges in total. Each one is a row in `badges`, earned by checks that run inside `recomputeStreak`.

### R5. UI moments
1. **Header flame chip.** Tapping it opens a sheet with: the 7-day strip, current/longest/total, freezes (❄ ×2), the edition ring and the heatmap.
2. **First read of the day.** The chip flame ignites with a scale and particle burst of ≤ 600 ms, plus a haptic (`navigator.vibrate(10)`). Respect `prefers-reduced-motion`.
3. **Milestone takeover.** A big number, one line of copy ("A week of mornings."), the reader's top topics this week, and a "Share card" button.
4. **At-risk.** One in-app banner after 20:00 local, at most once a day, with friendly copy: "Your paper's still warm: 1 story keeps your 6-day streak." It is optional, the hour can be changed, and there are no fake-urgency countdowns.
5. **Done for today.** At the end of the edition: "That's today's paper. See you tomorrow at 7." This is the deliberate anti-infinite-feed moment.
6. **Daily PDF.** The masthead strip reads "Edition #43 · 🔥 12-day streak". The back page holds a 5-week mini heatmap and a QR code to tomorrow's Morning Recall.

### R6. How the streak connects to learning
- **Morning Recall.** At the top of today's edition we show 3 multiple-choice questions about stories the reader read yesterday. They are LLM-generated once per edition at build time, with a cached fallback for the demo.
- **Recall answers feed personalization:**
  - correct and engaged → +interest weight for that sub-topic;
  - "I don't care about this" → −weight.
- **The learning becomes visible** on the milestone screen: "Day 7: your paper learned you prefer AI policy over gadgets."

### R7. Ethical guardrails (put these in the pitch)
- No paid or loot-box mechanics, no wagers and no social-obligation streaks.
- No shame copy, mascot guilt or red "you lost" screens (following Silverman & Barasch).
- The streak can be hidden in settings (Headspace pattern). Nudges are opt-out, there is at most one a day, and we respect quiet hours.
- The paper is finite (~20 stories) and has an explicit end state, so there is no endless feed.
- No public leaderboard for streaks.

### Effort (Claude Code agent hours)
| Item | Hours |
|---|---|
| Schema additions + `recomputeStreak` + `getStreakState` with unit tests (freeze, rest day, repair, 03:00 rollover, TZ) | 2.0 |
| QR event endpoint + client tracking (dwell, scroll, outbound) | 1.0 (shared with the learning workstream) |
| Flame chip, streak sheet, at-risk banner, done-for-today | 1.0 |
| Celebrations (ignite animation, milestone takeover) | 0.75 |
| Morning Recall quiz (generation at edition build, UI, repair path) | 1.5–2.0 |
| PDF masthead streak and mini heatmap | 0.5 |
| Seed data + `?now=` time-travel for the demo | 0.5 |
| **Core total** | **~5.5–6** |

---

## Extra gamification ranked by value per effort
1. **Reading-calendar heatmap (GitHub-style, local days, 5 levels by stories read)**, ~1 h. Built from `daily_activity`. Pure SVG; reuse it in the PDF. It visually proves "the more you read" to the judges.
2. **Knowledge score per topic (recall accuracy × reads, shown as a radar or bar)**, ~1.5 h on top of Recall. It makes the learning visible and fits the "AI in unexpected ways" criterion.
3. **Weekly recap card ("Your week in the paper": top topics, stories read, best quiz, streak, one AI-written line about how your taste shifted)**, ~1.5 h. A shareable PNG/OG image, rendered on Sunday or on demand.

## Innovation ideas
- **The printed paper counts too.** A QR code on the PDF opens a 3-question recall quiz, and answering it counts as a QR. Readers of the offline or printed paper keep their streak, and their answers feed back into learning. (wow 4, ~1.5 h)
- **Milestones that reveal what the paper learned.** Each milestone shows a before/after of the reader's interest weights: "Day 1 vs Day 7". (wow 4, ~1 h)
- **Spaced resurfacing.** One recall question per day comes from a story 3 or 7 days old (1-3-7 spacing), labelled "Still remember?". (wow 3, ~1 h)

## Risks
- **Over-gamifying hides the core paper.** Keep the streak to one chip and one sheet.
- **Time-zone and day-boundary bugs during the demo.** Keep a pure function, unit tests and `?now=`, and never trust the client's date.
- **Event tracking inflates QRs.** For example, opening a story and closing it straight away. Require dwell or scroll, and dedupe per story per day.
- **Recall quiz generation fails or is slow.** Generate at edition build time, cache it, fall back to seeded questions, and hide the card if none exist.
- **Web push is costly to build for a web app** (service worker, VAPID, permissions). Use in-app banners plus an optional email. Push is a stretch goal only.
- **Schema contention.** `reading_events` is shared with the learning workstream. Agree on it once, in its own commit (CLAUDE.md rule).

## Sources
- https://blog.duolingo.com/improving-the-streak
- https://blog.duolingo.com/how-duolingo-streak-builds-habit
- https://blog.duolingo.com/how-streaks-keep-duolingo-learners-committed-to-their-language-goals
- https://blog.duolingo.com/streak-milestone-design-animation
- https://blog.duolingo.com/protecting-streaks-from-site-issues
- https://research.duolingo.com/papers/yancey.kdd20.pdf
- https://www.deceptive.design/articles/when-a-user-uses-duolingo-on-a-series-of-consecutive-days-this-is-called-a-streak-if-users-miss-a-day-they-can-pay-to-repair-it
- https://www.recall.it/summary/lennys-podcast/behind-the-product-duolingo-streaks-or-jackson-shuttleworth-group-pm-retention-team (secondary)
- https://docs.daily.dev/weekly-goal/
- https://github.com/dailydotdev/daily/issues/1165
- https://help.snapchat.com/hc/en-us/articles/7012394193684-What-are-Snapstreaks-and-how-do-I-keep-them-going
- https://docs.github.com/en/account-and-profile/concepts/contributions-on-your-profile
- https://www.macworld.com/article/2446605/how-to-pause-apple-watch-activity-rings.html (secondary)
- https://help.headspace.com/hc/en-us/articles/215730567-How-does-the-run-streak-feature-work
- https://support.calm.com/hc/en-us/articles/360008704893
- https://beebom.com/puzzle/when-does-wordle-reset/ (secondary)
- https://behaviormodel.org/
- https://udspace.udel.edu/handle/19716/34160 (Silverman & Barasch, JCR 2023, DOI 10.1093/jcr/ucac029)
- https://deceptive.design/articles/the-evil-bird-and-the-right-to-disconnect-children-s-vulnerability-to-exit-dark-patterns-in-gamified-educational-apps (Kuo, Zhao & Scott)
- https://thedecisionlab.com/insights/consumer-insights/streak-creep-the-perils-of-too-much-gamification
- https://psychology.ecu.edu/wp-content/pv-uploads/sites/216/2019/03/Roediger-Karpicke-2006.pdf
- https://methods.remarkable.com/resources/hooked-model (secondary summary of Eyal's Hooked)
