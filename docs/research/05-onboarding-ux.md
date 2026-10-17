# 05: Interest onboarding UX (hierarchical drill-down)

Research agent 5 of 12 · 2026-10-17 · Scope: the UX for moving through the interest taxonomy, the flow, the copy, and what each step feeds into personalization. The canonical taxonomy belongs to another agent; a sketch of the top two levels is in §4.

## TL;DR
- **One expanding screen, not one screen per level.** Show about 12 broad tiles. Tapping one opens its subtopics as chips right below it, and a `›` on a chip opens a third level the same way. A search box ("Add anything: *cricket*, *Rust*, *Urdu poetry*") covers everything else. Flipboard's "personalization card" (follow Health, then get offered mindfulness and sleep) is the closest precedent.
- **Build in 4 steps, about 75 seconds, with no sign-up wall:** Areas plus drill-down, then a taste test of 8 real headlines, then "How you read" (time, depth, city), then a live "printing your first edition" preview. Ask for an account last, framed as "Save your paper and start your streak" (the gradual-engagement / lazy-registration pattern).
- **Set a low minimum and suggest defaults.** Require at least 3 picks; Medium and Pinterest also require a few. Choice-overload research is mixed (Scheibehenne et al. 2010 found an average effect near zero), but it does show up when options are complex and preferences are uncertain. Our layering keeps each view to about 12 options.
- **The taste test is our cold-start trick.** Show 8 real cached headlines with "More like this / Less / Skip" buttons, swipeable but never swipe-only. It turns topic picks into weighted, item-level signals and shows the judges learning on day 0. Google News uses the same "More / Fewer stories like this" verbs inside its feed.
- **Non-topic preferences change presentation, not selection.** Reading time sets summary length, depth sets jargon level and explainers, city sets the local strip, and delivery time sets when the paper arrives. Ask 3 of them on one screen and default everything else.
- **Every step is skippable and editable later.** Skippers get a "Popular today" paper, the fallback both TikTok and Netflix use. The same chip component works as the "Edit interests" sheet and as the "Your interests" map that makes learning visible.

## 1. Findings

### 1.1 What the reference apps do
| App | Pattern | Takeaway for us | Confidence |
|---|---|---|---|
| **Flipboard** | Topic picking on first launch, from broad ("Technology") down to granular ("iPad apps") (v3.0, 2014). Later versions show a "personalization card" when you follow a topic, e.g. Health offers mindfulness and sleep. | This is in-place drill-down. **Copy this mechanic.** | Press coverage (TechCrunch, BGR, MacStories) |
| **Medium** | Sign-up requires picking a minimum number of topics. Topics, writers and publications can be followed or muted later in settings. | Use a minimum, and offer mute or hide too. | Help center verified. The blog's claim of "+35% reading time" is **(unverified)** because the page returned 403 |
| **Pinterest** | Interest picker early in sign-up so the first feed is relevant. The growth team ran "hundreds of experiments" on activation. Skipping the browser-button step opens a modal explaining what you lose. | Get to a relevant first feed quickly. Explain the value of the step you're asking for. | Secondary (Appcues interview write-up, Chameleon teardown). No lift numbers published |
| **TikTok** | "Choose your interests" with a **Skip** link. Skippers get a general feed of popular videos. | Skip must exist and must land on a good default. | 2021 guidebook and 2020 court filing (dated) |
| **Netflix** | Optional "pick titles you like" at profile setup. Skippers get a diverse, popular home screen, and recent viewing outweighs the survey. | Treat onboarding as a weak prior that behaviour overrides. | Secondary |
| **Spotify / Deezer / YouTube Music** | Artist picks at onboarding. A Deezer cold-start paper reports that users who liked at least 3 artists at onboarding got better recommendations. Google Research treats onboarding as *preference elicitation* under a "tight query budget" and picks the next items adaptively. | Supports min = 3 and adaptive next options ("because you picked AI…"). | arXiv. The ≥3 claim comes from a search snippet; I couldn't extract the exact passage from the PDF **(partly verified)** |
| **Google News** | "Follow" topics, places and sources through search. Each story offers "More / Fewer stories like this", "Fewer about this topic" and "Hide this source". | Search-to-add plus per-story feedback verbs. Reuse the same verbs in the taste test and the paper. | Google Help (pages several years old) |
| **daily.dev** (closest DevBytes analogue) | Onboarding asks for tag categories. Tags can be edited anytime from "My Feed", and tags or sources can be blocked. Content-type filters cover memes, newsletters and similar. | Editable tags from the feed itself, plus blocking. | Official docs |
| **Reddit** | Dropped the 50 default subscriptions (2017) and moved discovery into sign-up. Later added a Discover tab (2022). | Defaults that nobody chose create noise. Make picks explicit. | Dated, secondary |
| **Apple News / Substack** | Apple News recommended channels and topics on first launch (2015). Substack (per a third-party flow library) asks for topic tags, then shows a list of suggested publications. | A "suggested for you" confirmation after topics is common. Our live preview plays that role. | **(unverified)** current flows |

### 1.2 Choice overload and completion
- **The evidence is mixed.** Scheibehenne, Greifeneder and Todd (2010) meta-analysed 50 experiments (63 conditions, N = 5,036) and found an average effect of **about zero**, with high variance. Secondary coverage cites D = 0.02. Chernev, Böckenholt and Goodman (2015) name four moderators that make overload *likely*: **choice-set complexity, decision difficulty, preference uncertainty, and decision goal**. A cold-start interest picker has the high-uncertainty profile, so keeping each view small is worth it.
- **What to build from that:** keep each view to about 12 options; pre-suggest a few; show choices as plain labels instead of options to compare on many attributes; let people pick without committing (picks are reversible, with no confirmation dialogs).
- **Completion benchmarks** are weak (vendor glossaries quote 40–75% for SaaS onboarding). An often-quoted "CMU study, −60% completion" has **no primary source; do not cite it.**
- **Asking for sign-up later:** Luke Wroblewski's "gradual engagement" (delay registration until the user needs an account) is well established. His slides cite "+29% completions" **(unverified context)**. Duolingo runs a full lesson before asking for an account.

### 1.3 Patterns for showing a large hierarchy simply
| Pattern | Use? | Notes |
|---|---|---|
| **Chips that expand in place** (accordion under a selected tile) | **Yes, primary.** | Keeps the context visible. One level at a time. Selecting a parent selects "all of it" at low weight. |
| Separate screen per level (wizard) | No | Uses many back-and-forth taps, people lose their place, and it takes longer than 90 seconds. |
| Tree view with checkboxes | No | Looks like a settings panel, which is a poor fit on mobile. |
| **Search-to-add** (typeahead over every node and its synonyms) | **Yes.** | Covers the long tail ("Formula 1", "PSL", "Kubernetes"). For a query that matches nothing, fall back to an AI mapping (§5). |
| **"More like this" expansion** (picking a chip suggests 2–3 siblings) | **Yes, lightweight.** | This is the Flipboard card and the adaptive elicitation idea from Google Research. |
| Bottom-sheet drill-down | For the later "Edit interests" sheet | Shares the same component. |
| Free-text "Tell us about you" | **Yes, as an optional shortcut** | Becomes the AI innovation hook. |

### 1.4 Preferences beyond topics (they change *how* the paper looks)
| Preference | Ask during onboarding? | Default | Where it applies |
|---|---|---|---|
| Reading-time budget (5 / 10 / 20 min) | **Yes** | 10 min | Summary length per story, how many stories get full summaries versus headline only, PDF density (Top 20 stays fixed) |
| Depth (New to it / Know the basics / Expert) | **Yes**, one global setting with optional per-area overrides later | Know the basics | LLM summary prompt (jargon, explainer boxes) |
| City or region | **Yes**, one optional field pre-filled from the time zone (Islamabad) | Islamabad | Local-news strip, weather box in the masthead |
| Delivery time | No; shown on the final screen as an editable default | 07:00 PKT | Edition schedule, reminder that protects the streak |
| Language (EN / Urdu) | No; in settings if built | English | Summary language, PDF font |
| Tone (Straight / Light / Witty) | No; in settings | Straight | Summary style prompt |
| Blocked topics | Optional "Not for me" long-press on chips | none | Hard filter |

### 1.5 Accessibility and mobile ergonomics
- **Tap targets:** WCAG 2.2 SC 2.5.8 (AA) sets a minimum of **24×24 CSS px**. Aim for 44 px chip height to match Apple HIG, with at least 8 px gaps. Put the primary CTA in a sticky bottom bar within thumb reach.
- **Chips are toggle buttons:** `<button aria-pressed>`. Mark the selected state with a check icon *and* a fill, never colour alone. The control that expands a chip is a separate `›` button with `aria-expanded` (WAI-ARIA disclosure pattern: Enter or Space toggles).
- **Live count:** an `aria-live="polite"` line announces things like "4 picked. 1 more to go".
- **The taste test has visible buttons as well as swipe.** Swipe-only would fail people using keyboards or switch access. Support the keys ← / → / ↓.
- `prefers-reduced-motion` turns off the "printing" animation and the card-throw motion. Text must reflow at 200% zoom. Emoji are decorative (`aria-hidden`) and every chip has a real text label.
- **Keep state through Back and refresh** (store the draft in localStorage, wrapped in try/catch). Nobody should lose their picks.

## 2. Recommended flow (target 60–90 s)

```
[0 Welcome] -> [1 Areas + drill-down] -> [2 Taste test] -> [3 How you read] -> [4 First edition + save]
   ~5s              ~30s                    ~20s              ~10s                 ~10s
```
A progress indicator with 4 dots shows from step 1 onward. A "Skip" link sits top-right on steps 1–3. All of it runs **before** account creation.

### Step 0: Welcome (5 s)
- Show a hero with a mini newspaper front page that has a blank masthead labelled "The ____ Times".
- **Copy:** H1 "Your own morning paper." Sub: "20 stories picked for you, every morning. Takes a minute to set up." CTA **"Make my paper"** · secondary "I already have one → Sign in".
- **Feeds:** nothing (we may log the referrer).

### Step 1: Areas and drill-down (30 s), the core screen
- **Layout:** a search bar at the top, then a 2-column grid of about 12 area tiles (icon plus label). Tapping a tile selects it and opens an inline panel of 5–8 subtopic chips right below its row. A chip with children shows `›`, and tapping `›` opens level 3 inside that panel. Popular subtopics come pre-highlighted as *suggestions* (outlined), never pre-selected.
- **"More like this":** after you pick a chip, 2–3 related chips fade in beside it ("+ Startups", "+ Product design").
- **Minimum:** 3 picks at any level. The sticky CTA shows "Pick 3 to continue", then "Pick 1 more", then **"Next: taste test"**.
- **Copy:**
  - H1 "What do you want to read about?" Sub: "Start broad, tap › to get specific. You can change this anytime."
  - Search placeholder "Add anything: cricket, AI, Urdu poetry…". When nothing matches: "We'll find stories about '{q}'" (the AI mapping in §5).
  - Long-press or `⋯` on a chip offers "Not for me" (blocks it).
- **Feeds:** `interest_weights{node_id: w}`, where picking a **level 1 node = 0.5** (spread across its children), **level 2 = 1.0**, **level 3 = 1.5**, searched/free-text = 1.2, and blocked = −∞ (hard filter). We also store `depth_hint`: having level 3 picks in an area raises that area's default depth by one.

### Step 2: Taste test (20 s)
- **Layout:** a stack of 8 real headlines from today's cached seed edition. About 6 come from the user's picks and **2 are deliberate "wildcards"** from areas they didn't choose. Each card shows the source, its topic tag and the headline. Buttons: **"Less like this" (←) · "Skip" (↓) · "More like this" (→)**. Swiping does the same. A counter reads "3 of 8".
- **Copy:** H1 "Quick taste test." Sub: "Tap what you'd actually read. This calibrates your first paper." After the last card: "Got it. You like {top tag} more than you said, and less {low tag}."
- **Feeds:** item-level signals: More = +0.3 to that node's weight (and positive embedding exemplars), Less = −0.3, Skip = 0. A wildcard "More" **adds a new interest** and is shown as "New: Space". The swipe log also becomes the first rows of the learning history, which feeds "Why this story?".

### Step 3: How you read (10 s)
- **Layout:** three compact segmented controls, all pre-set to defaults, so one tap on Next is enough.
  - "Morning reading time": 5 min · **10 min** · 20 min
  - "How deep?": New to it · **Know the basics** · Expert ("Expert skips the explainers")
  - "Your city": [Islamabad ▾] (optional, shows local headlines and weather)
- **Copy:** H1 "How do you like to read?" Sub: "This changes how your paper looks, not what's in it."
- **Feeds:** the presentation config `{time_budget, depth_level, city}`, which goes to the summary-length / jargon prompt, the PDF layout density, and the local strip.

### Step 4: First edition and save (10 s)
- Show a "Printing your first edition…" animation in which the masthead fills with the user's name ("The Ayesha Times", or "Your Morning Paper" when there's no name) and the top 3 headlines drop into the front page. It comes from the **cached seed edition re-ranked on the client** with the new weights, so it is instant and works offline.
- **Copy:** H1 "Your first paper is ready." Sub: "Next one lands tomorrow at **7:00** (change). Read daily to grow your 🔥 streak." CTA **"Save my paper & start streak"** (Google / email magic link) · secondary **"Read now, save later"** (guest mode with a local profile; ask again after the first read).
- **Feeds:** `delivery_time`, `streak_start`, account linking (merges the guest profile).

### Skip paths
| Skipped | What happens |
|---|---|
| Step 1 | Default weights spread evenly across "Popular today" (top news, tech, sport, business). A banner in the paper reads "Tell us 3 things you like for a better paper". |
| Step 2 | Topic weights only. The taste-test cards come back later as inline "More / Less" on stories. |
| Step 3 | Defaults (10 min, basics, Islamabad, 07:00). |

### Editing later (it must be one tap from the paper)
- The paper header shows "**Your interests**", which opens a bottom sheet with the same chip tree plus learned weights shown as chip fill strength. Learned (not picked) chips carry a small "learned" sparkle that the reader can remove. This sheet is where learning becomes visible.
- Each story has a `⋯` menu with "More like this · Less like this · Hide {source} · Why this story?" (Google News verbs).

## 3. Metrics (instrument with a simple `events` table)
| Metric | Definition | Target for the demo narrative |
|---|---|---|
| Onboarding completion | Share of welcome views that reach step 4 | Show the funnel on an admin/stats page |
| Median time to paper | From the welcome view to the first edition render | 60–90 s |
| Picks per user and depth ratio | Count of picks; share of picks at level 2 or deeper | 5–8 picks; at least 50% level 2+ |
| Step skip rate | Per step | Below 20% on step 1 |
| Taste-test agreement | Share of "More" on in-interest cards versus wildcard cards | Shows calibration |
| Day-0 read rate | Share of users who open at least 1 story from the first edition | |
| Interest edits in week 1 | A proxy for onboarding accuracy; edits shouldn't be zero, and mass edits mean a bad start | |
| D1 return / streak at 2 or more | The retention hook | |

## 4. Taxonomy sketch: top two levels I'd want (the taxonomy agent owns the final version)
About 12 level-1 nodes, each with 5–8 level-2 children. Level 3 only where depth matters (Tech, Science, Sports, Business).

| Level 1 (tile) | Level 2 (chips) |
|---|---|
| 🌍 World & Pakistan | Pakistan politics, South Asia, Middle East, Geopolitics, Elections, Human rights |
| 💼 Business & Money | Markets & stocks, Startups, Economy, Personal finance, Crypto, Real estate |
| 💻 Technology | Computer Science (› Web dev, AI/ML, DevOps & Cloud, Security, Mobile, Data), Gadgets, Big Tech, Gaming tech, Telecom |
| 🔬 Science | Space, Physics, Biology, Climate & environment, Chemistry, Maths |
| 🩺 Health & Wellness | Fitness, Nutrition, Mental health, Medicine, Sleep |
| 🎨 Arts & Culture | Books & literature, Urdu poetry, Visual art, Design & architecture, History, Philosophy |
| 🎬 Entertainment | Movies, TV & streaming, Music, Celebrities, Drama serials |
| 🏏 Sports | Cricket (› PSL, International), Football, Tennis, F1 & motorsport, Hockey, Esports |
| 🧭 Lifestyle | Travel, Food, Fashion, Parenting, Home |
| 🎓 Education & Careers | Higher ed, Scholarships, Jobs & hiring, Productivity, Skills |
| 🏙️ Local | My city (from step 3), Weather, Transport, Events |
| ✨ Curious & Offbeat | Ideas & essays, Explainers, Good news, Weird & wonderful |

The interaction design needs these node fields: `id`, `parentId`, `label`, `emoji`, `synonyms[]` (for search), `popular: bool` (for suggestions), `related[]` (for "More like this").

## 5. Recommendations for our build (ranked, in agent-hours)
1. **`InterestPicker` component**: a tile grid, in-place chip expansion down to level 3, toggle chips (`aria-pressed`), a sticky CTA with a live min-3 counter, and draft state in localStorage. The same component also powers the "Your interests" sheet. **3.0 h**
2. **Taste-test card stack**: 8 cached headlines (6 matched plus 2 wildcards), three buttons plus swipe plus arrow keys, and weight updates. **1.5 h**
3. **Weight-mapping function** `onboardingToProfile(picks, swipes, prefs) → {weights, blocked, presentation}`. It is pure and unit-tested, so we can explain it in one sentence. **1.0 h**
4. **Step 3 "How you read"**: three segmented controls with defaults, wired into the summary prompt and PDF density config. **0.75 h**
5. **Step 4 "first edition" preview**: re-ranks the seed edition on the client, fills the masthead with the user's name, shows the printing animation (reduced-motion safe), then the guest-first save CTA. **1.5 h**
6. **Search-to-add**: typeahead over labels and synonyms (in-memory fuzzy match; no library needed, or a ~5 kB one). **1.0 h**
7. **Skip paths and the "Popular today" fallback profile**. **0.5 h**
8. **Story `⋯` feedback menu** (More / Less / Hide source / Why), which shares weight-update code with item 2. **1.0 h** (may belong to the paper workstream)
9. **Onboarding funnel events** (`onboarding_step_viewed/completed/skipped`, `pick`, `swipe`). **0.5 h**

Core total (items 1–5 and 7): **about 8.25 agent-hours**, which can be split across 2 agents in parallel (picker and preview, taste test and mapping and prefs).

## 6. Innovation ideas
| Idea | Wow (1–5) | Effort | Criteria it scores on |
|---|---|---|---|
| **"Describe yourself in one line"**: free text ("Final-year CS student, into cricket and startups, hates politics") goes to an LLM, which maps it to taxonomy nodes and blocks and pre-selects the chips with a visible "AI picked these, tweak them" | 5 | 2 h | Innovation, AI used in an unexpected way, UX |
| **Live front-page preview while picking**: a mini newspaper thumbnail at the top of step 1 re-ranks headlines as each chip is tapped | 5 | 2.5 h | UI/UX, Presentation clarity |
| **Taste test with wildcards** that can discover a new interest ("New: Space") | 4 | included in item 2 | Learning made visible, Room to explore |
| **"Interest constellation"**: the edit sheet draws interests as bubbles sized by learned weight, with learned ones sparkling | 4 | 2 h | Learning visibility, UI/UX |
| **Search for anything**: an unmatched query becomes a custom "keyword interest" through embeddings, so the taxonomy has no dead ends | 3 | 1.5 h | Technical complexity, Usability |
| **Serendipity dial** on step 3 ("Stick to my picks ↔ Surprise me"), which sets the share of exploration stories | 3 | 0.5 h (UI) | Room to explore |

## 7. Risks and pitfalls
- **A 12×8×N chip wall on a phone.** Mitigation: only one panel open at a time (opening a new one collapses the previous), and cap a panel at 8 chips plus "See all".
- **Parent versus child selection is ambiguous** ("I picked Technology; do I get everything?"). Mitigation: show the sub-label "All of Technology · tap › to focus", and when the user picks a child, the parent shows a "2 picked" state instead of a full selection.
- **Requiring too many picks causes drop-off.** Keep the minimum at 3 and allow skip.
- **A sign-up wall before value.** Use guest-first, and ask at step 4 or after the first read.
- **Swipe-only interactions**, **colour-only selected states**, and **emoji used as labels** all fail accessibility. See §1.5.
- **The taste test needs real headlines offline.** It depends on the seeded or cached edition (which CLAUDE.md requires anyway). If the cache is empty, skip step 2 automatically.
- **Onboarding signals should fade.** Behaviour should outweigh onboarding picks over time (Netflix weights recent viewing more heavily), so let picks decay or cap their weight.
- **Taxonomy labels can be too jargony** for a general audience ("DevOps"). Add a short helper line for level 3 tech nodes.
- **The demo can run long.** Script a fast path (about 40 s: 4 taps, 3 swipes, Next, Next) for the Loom video.

## 8. Sources
- Flipboard 3.0 topic picking: https://techcrunch.com/2014/10/29/flipboard-3-0/
- Flipboard personalization cards: https://www.bgr.com/tech/new-flipboard-update-makes-one-of-the-best-news-apps-even-more-personalized/ · https://www.macstories.net/news/flipboard-40-presents-deeper-personalization-options/
- Medium topics help: https://help.medium.com/hc/en-us/articles/224488047 · blog (403, unverified): https://medium.com/blog/make-medium-yours-86665fd5f16d
- Pinterest onboarding (secondary): https://www.chameleon.io/blog/new-user-onboarding-examples-from-pinterest · https://goodux.appcues.com/blog/pinterests-value-driven-onboarding-flow
- TikTok onboarding (secondary/dated): https://goodux.appcues.com/blog/tiktok-user-onboarding · https://catalogimages.wiley.com/images/db/pdf/9781119803416.excerpt.pdf
- Netflix cold start (secondary): https://www.scienceabc.com/innovation/netflix-get-right-content-time.html
- Deezer cold-start: https://arxiv.org/abs/2106.03819 · https://arxiv.org/pdf/2205.14651
- YouTube Music preference elicitation: https://icml.cc/virtual/2023/29091 · https://arxiv.org/pdf/2409.17436
- Google News customize: https://support.google.com/googlenews/answer/9010862
- daily.dev feed filtering: https://docs.daily.dev/docs/setting-up-your-feed/filtering-content-feed
- Reddit Discover tab: https://techcrunch.com/2022/02/24/reddit-revamps-with-a-new-discover-tab-for-finding-communities/
- Apple News launch: https://venturebeat.com/technology/apple-introduces-news-app-for-ios
- Choice overload meta-analysis: https://abcwest.cogs.indiana.edu/pmwiki/pdf/scheibehenne.options.2010.pdf · https://www.psychologytoday.com/us/blog/pop-psych/201602/is-choice-overload-real-thing
- Choice overload moderators (Chernev et al. 2015, via secondary): https://inmoment.com/blog/choice-overload-is-your-customer-onboarding-overwhelming-find-out-fast/
- Gradual engagement: https://static.lukew.com/SignUpForms_10052010.pdf · https://alistapart.com/article/signupforms · https://www.appcues.com/blog/gradual-engagement-mobile-app-first-screen
- WCAG 2.2 target size: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- WAI-ARIA disclosure pattern: https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/
