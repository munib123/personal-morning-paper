# 02: How leading news aggregators personalize and present news

Research agent 02 · 2026-10-17 · Scope: Inshorts, Google News, Flipboard, SmartNews, Ground News, Particle, Artifact, Yahoo News, NewsBreak, Dailyhunt, Way2News, Apple News, Pakistani outlet apps (Dawn, Geo, ARY).
Anything marked **(unverified)** comes from secondary sources, or I could not confirm it against a primary page.

## TL;DR

- **Proven patterns we should copy.** One card per story, with a short AI summary (Inshorts' 60 words, Yahoo/Artifact "Key Takeaways"). Duplicate articles collapse into one story with an "N sources" badge (Google News, Particle). Every story carries explicit per-story controls: *fewer like this*, *hide source*, *flag clickbait* (Google News, Yahoo).
- **Implicit signals matter most.** Artifact, the best-regarded personalization engine (Yahoo bought it), learned from clicks, **reading/dwell time** and shares, and Inshorts learns from swipes. We should log dwell time, opens of the original, skips, and finishing a story.
- **Nobody makes learning visible or editable, except Ground News.** Its "My News Bias" dashboard, a paid feature, shows a reader their own reading habits. That is the closest analogue to our required "visible learning" feature. Google lets users act on preferences, but users complain that "Fewer stories like this" seems to do nothing. **Feedback must have an immediate, visible effect.**
- **Finite, daily, gamified products are being validated.** Yahoo News (built on Artifact) ships reading **streaks and badges**. Apple News Today is a weekday morning briefing. Our "Daily Top 20 + streak" sits squarely in that trend, but as a *finished edition* rather than an infinite feed.
- **Cautionary tales.** Artifact shut down in 2024: the market was too small, and comments and posts needed moderation it could not afford. So: **no social features**. Reuters found that NewsBreak's AI-written local stories invented events (at least 40 inaccurate stories, 2021-2024). So: **summaries must stay grounded in the source text, labelled as AI, and always link the original.**
- **Gaps we can own.** (1) Nobody offers a *personalized print-style PDF* newspaper. (2) Nobody offers an *editable, explainable interest model* that shows "why this story is in your paper". (3) Nobody has a "since you last read" follow-up across editions. (4) No good general-audience personalized aggregator exists for Pakistan: local outlet apps are single-publisher, focused on live TV, and the Dawn iOS app is rated 2.1/5.

---

## Findings by app

### Inshorts (India): 60-word cards, swipe
- **Format.** Each story is one screen: headline, image, and a ~60-word fact-only summary. Readers swipe vertically to the next card. An in-house model called "Rapid60" reportedly condenses articles, with editors still handling ~20% of content (unverified, from a third-party teardown).
- **Signals.** Explicit: follow topics and categories. Implicit: swipe behaviour feeds "My Feed", which "adapts to your preferences as you swipe".
- **Complaints.** Ads have become more frequent. Users see repetitive stories, "twisty wording"/clickbait, a Bollywood/cricket skew, and "no way to filter out news I don't like" (review-analysis aggregators, unverified).
- **Borrow** the single-card summary and the swipe or skip gesture. **Avoid** opaque learning and repetition.

### Google News: For You, Headlines, Full Coverage
- **Personalization.** Uses Google News settings (followed topics, sources and locations) plus "past activity on Google services and YouTube" via Web & App Activity, reviewable in My Activity. *Headlines* in the Briefing are the same for everyone in a language and region. *For you* and *Picks for you* are personalized.
- **Explicit controls.** Follow or unfollow topics, locations and sources. Under each story, "More" offers "Fewer stories like this", "Fewer stories about [topic]", "Hide all stories from [source]", and like/unlike.
- **Full Coverage (2018).** Articles about one event are clustered into one unpersonalized story page: top coverage, local, explainers, interviews and a timeline. This builds on Google's clustering since 2002, and Google describes it as AI that organizes the flow of news "into storylines".
- **Complaints.** Community threads say "Fewer stories like this" "does not work at all" and that hidden sources reappear. A Google reply says you "may need to take these actions several times".
- **Borrow** the split between Headlines (shared) and For You (personal), plus clustering with a "Full coverage" drawer. **Fix** the feedback lag by updating the paper visibly as soon as a reader gives feedback.

### Flipboard: topics, Smart Magazines
- Readers pick a "passion", then sub-topics, and Flipboard builds a **Smart Magazine** with similar stories grouped together. A "Trending Stories" toggle mixes in general stories on that topic and is on by default. Home holds up to nine Smart Magazines.
- **Signals:** what readers follow, heart and add (flip). Sources include publications, YouTube feeds and hashtags.
- **Borrow** the passion-then-subtopic onboarding: it is exactly our hierarchical onboarding, and it validates the decision. A per-topic "include trending/general" toggle is a cheap nice-to-have.

### SmartNews: channels, "News From All Sides"
- **Channels** are tabs per topic, plus local news covering more than 6,000 US cities (2020).
- **News From All Sides** (2019) is a slider that shows the same topic from publishers across the political spectrum. It was reduced from five positions to three "to get people to explore more sources rather than focusing on the labels". SmartNews also says it tunes its algorithms *for diversity*, so users see viewpoints that differ from their own.
- **Borrow** a deliberate diversity injection: a few "outside your usual" slots in the Top 20.

### Ground News: bias ratings, Blindspot
- **Ratings.** Each outlet gets one of seven bias labels (Far Left to Far Right) and a factuality score, averaged from AllSides, Ad Fontes Media and Media Bias/Fact Check. These are ratings of the **publication, not the article**.
- **Blindspot.** Stories covered mostly by one side, plus a weekly report built on the mean and standard deviation of the bias ratings of the day's top 100 stories.
- **My News Bias** (paid) is a personal dashboard: articles read, the bias mix of your reading, top sources, and "Blindspot consumption".
- **Borrow** the *personal reading dashboard* idea for our visible learning, keyed on topics instead of politics. **Avoid** political bias labels: no rating data exists for Pakistani outlets, and labelling them would be contentious.

### Particle: AI story summaries, perspectives, ELI5
- **Format.** Particle clusters articles into stories (a card shows a count such as "162 ARTICLES") and writes an AI summary per story, with key quotes and reference links.
- **Modes.** "Explain Like I'm 5", "just the facts" (the 5 Ws), other languages, and audio.
- **Opposite Sides.** A left-right spectrum of bubbles shows which side dominates coverage, with an AI summary of each side's position. It works best in the US.
- **Q&A.** A per-story chatbot with suggested questions.
- **Other.** Newer features include a podcast search ("Radar") and a newsletter.
- **Borrow** the story-level summary, with source count and reading-mode toggles. Precompute modes when the edition is generated, so the demo never waits on an LLM.

### Artifact (2023-2024), and Yahoo News after it
- **What it did.** It had the strongest ML personalization in this group. It ranked on clicks, **reading time and dwell time**, and shares, rather than popularity. AI summaries came in styles such as "Explain like I'm five" or emoji. In June 2023 it added **AI clickbait-headline rewriting**: a reader flags a headline, GPT-4 rewrites it, and a star icon marks the rewrite. It also added text-to-speech voices.
- **Why it shut down (Jan 2024).** Kevin Systrom said the market opportunity was not big enough to justify continued investment. Comments and posting were removed first, since they needed moderation the team of about 8 could not sustain. Core reading continued until late February 2024. His lesson: cut losses early.
- **Yahoo.** Yahoo acquired Artifact in **April 2024** (per Yahoo's press release; some outlets say March). It relaunched Yahoo News on **13 June 2024** with the same personalization:
  - readers choose topics and publishers
  - AI **Key Takeaways** at the top of articles
  - **flag clickbait, and the headline is auto-rewritten**
  - **block keywords or publishers**
  - a daily "Top Stories" guide to trending topics
  - **reading streaks and badges**.
- **Lessons for us.**
  - Dwell time is the signal that matters.
  - Social features are a moderation trap.
  - AI cleanup of headlines is liked, but it must be labelled.
  - Streaks and badges are now mainstream, so our streak needs a twist (see Innovation ideas).

### NewsBreak (US local)
- The most-downloaded US local news app. In 2024 Reuters found **at least 40 AI-generated stories with errors (2021-2024)**, including a fabricated Christmas Eve shooting in Bridgeton, NJ, and wrong food-bank distribution times. It also found stories copied from local sites under fictitious bylines, and an added disclaimer that content "may not always be error-free" (from secondary coverage of the Reuters piece).
- **Lesson.** Never let the model write facts that are not in the source. Always show the source and a link. A "location" interest is valuable, but only with real sources behind it.

### Dailyhunt and Way2News (South Asian, local-language)
- **Dailyhunt** offers news, video and live TV in **14 Indian languages**, with ML/DL personalization. It claimed processing of ~100k articles a day (2019) and 300M+ users (vendor claims, unverified/dated).
- **Way2News** (Hyderabad) offers screen-sized, roughly 400-character summaries in up to eight or nine Indian languages, with hyperlocal reporters. DAU claims range from 1.5M to 6.5M depending on source and year (unverified).
- **Lesson.** In South Asia, **local language plus hyperlocal plus short format** wins scale. An Urdu reading mode, or an Urdu summary toggle, is a credible and cheap differentiator for a Pakistani judging panel.

### Apple News
- Editors curate the day's top stories from trusted sources, and algorithms add personalized discovery.
- **Apple News Today** is a free weekday-morning audio briefing hosted by Shumita Basu, available in the News app and on Apple Podcasts.
- News+ adds narrated audio stories (expanded beyond the US in 2025), daily crosswords with an archive, and CarPlay support.
- **Borrow** the morning ritual: one short daily briefing, optionally as audio, plus "past editions/archive". Puzzles and archive are retention hooks.

### Pakistani outlet apps (Dawn, Geo, ARY)
- **Single-publisher apps.** They offer breaking-news push, live TV streaming (Geo, ARY), bookmarks, offline download, and markets data (ARY). There is no cross-source personalization and no aggregation.
- **Dawn's iOS app is rated 2.1/5 from 116 ratings.** Geo has no official listing or rating I could confirm.
- **Gap.** Pakistan has no personalized, multi-source "morning paper" for a general audience. This is our local Practical Impact story.

---

## Feature matrix

Legend: ● = strong/core · ◐ = partial/limited · ○ = absent · ? = unverified.
Columns: IS = Inshorts · GN = Google News · FB = Flipboard · SN = SmartNews · GrN = Ground News · PA = Particle · AR = Artifact (RIP) · YN = Yahoo News · NB = NewsBreak · DH/W2N = Dailyhunt/Way2News · AN = Apple News · PK = Dawn/Geo/ARY · **Us** = planned.

| Feature | IS | GN | FB | SN | GrN | PA | AR | YN | NB | DH/W2N | AN | PK | **Us** |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Topic/source follow at onboarding | ◐ | ● | ● | ● | ● | ● | ● | ● | ◐ | ◐ | ● | ○ | ● hierarchical |
| Hierarchical topic → subtopic picker | ○ | ○ | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ● |
| Implicit signals (swipe/click/dwell) | ● | ● | ● | ●? | ◐? | ◐? | ● dwell | ● | ●? | ● | ● | ○ | ● dwell, open, skip |
| Per-story "fewer like this" / hide source | ◐ | ● | ◐ | ◐? | ○? | ◐? | ● | ● | ◐? | ◐? | ● | ○ | ● instant effect |
| Keyword block | ○ | ○ | ○? | ○? | ○? | ○? | ? | ● | ? | ? | ◐? | ○ | ◐ stretch |
| Explainability ("why this story") | ○ | ◐ | ○ | ○ | ○ | ○ | ○? | ○? | ○ | ○ | ○ | ○ | ● reason chip |
| Visible/editable interest model | ○ | ◐ My Activity | ◐ | ○ | ● reading dashboard (paid) | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ● |
| Story clustering + dedup | ◐ | ● | ◐ | ● | ● | ● | ●? | ●? | ◐ | ◐ | ◐ | ○ | ● |
| Multi-perspective / "all sides" | ○ | ● Full Coverage | ○ | ● slider | ● bias | ● Opposite Sides | ○ | ○ | ○ | ○ | ◐ | ○ | ◐ sources drawer |
| Diversity / anti-bubble injection | ○ | ◐ | ◐ trending toggle | ● | ● Blindspot | ● | ○ | ○ | ○ | ○ | ◐ editors | ○ | ● 2-3 slots |
| Short AI/edited summary | ● 60w | ○ | ○ | ○ | ◐ | ● | ● | ● Key Takeaways | ● (error-prone) | ● | ○ | ○ | ● |
| Reading modes (ELI5 / facts) | ○ | ○ | ○ | ○ | ○ | ● | ● | ○ | ○ | ○ | ○ | ○ | ● |
| Clickbait headline rewrite | ○ | ○ | ○ | ○ | ○ | ○ | ● | ● | ○ | ○ | ○ | ○ | ● labelled |
| Finite daily edition / digest | ○ | ◐ Briefing | ○ | ○ | ◐ daily briefing | ◐ newsletter | ○ | ◐ Top Stories | ○ | ○ | ● News Today | ○ | ● Top 20 |
| Streaks / badges | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ● | ○ | ○ | ○? | ○ | ● |
| Audio | ○? | ◐ | ○ | ◐? | ○? | ● | ● TTS | ○? | ○? | ◐ video/TV | ● | ● live TV | ◐ stretch (Web Speech) |
| Archive of past editions | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ◐ puzzles/issues | ○ | ● |
| Personalized print-style PDF | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ◐ e-paper (not personal) ? | ● **unique** |
| Local language (Urdu/regional) | ● Hindi | ● | ◐ | ◐ | ○ | ◐ translate | ○ | ○ | ○ | ● | ◐ | ● Urdu | ◐ Urdu toggle |
| Local/hyperlocal | ◐ | ● | ◐ | ● | ◐ | ◐ | ○ | ◐ | ● | ● | ● | ● | ◐ city interest |
| Social/comments | ◐ | ○ | ● | ○ | ○ | ○ | ● (cut) | ◐ share | ● | ● | ○ | ● | ○ by design |

The matrix is a 15-minute desk scan: treat any "○" for a closed product as "not found", not as a certain absence.

---

## Recommendations for our build (ranked)

Effort is in Claude-Code-agent hours, assuming the feed ingestion and LLM client already exist.

1. **Story clustering and dedup before ranking (2.5 h).**
   - Embed title and lede, then greedily cluster items above a cosine threshold of about 0.8.
   - Each cluster becomes one card with an "N sources" badge and a "Full coverage" drawer listing the other outlets.
   - **Also dedup against the reader's last 3 editions**, so a story already read reappears only as a follow-up.
   - This answers the most common complaint about Inshorts and Google: repetition.
2. **Learning loop with explicit and implicit signals (3 h).**
   - Implicit: dwell time, with a threshold scaled to summary length; open original; skip; read to end.
   - Explicit: 👍 *More like this*, *Fewer like this*, *Hide source*, *Flag clickbait*.
   - Update a per-reader topic and source weight vector with an exponential moving average, then rank tomorrow's edition by `relevance × freshness × source quality + diversity bonus`. Each step fits in one sentence for the judges.
   - Explicit feedback **immediately** re-weights the reader's interests and shows a toast such as "Got it, less Celebrity news". This fixes Google's "it never listens" complaint.
3. **"Why this is in your paper" chip on every story (1.5 h).** Examples: "Because you follow Cricket", "You read 4 AI stories this week", "Outside your usual: picked for variety". Generate the chip from the ranking features, not from an LLM. It is cheap, explainable, and no competitor ships it. It directly evidences the visible learning feature.
4. **"Your paper is learning" dashboard (2 h).** Apply Ground News' My News Bias pattern to topics: interest bars that move over time, a delta since yesterday ("+ Space, − Politics"), reading minutes, the streak, and top sources. Readers can **edit** the bars (sliders) and lock or mute topics. It doubles as the demo's "learning made visible" moment.
5. **Cold start: hierarchical picker plus a 5-card calibration swipe (2 h).**
   - Use the Flipboard pattern (pick a passion, then sub-topics) and add an Inshorts/Tinder-style "swipe 5 sample headlines" step to seed weights.
   - Default to region = Pakistan, plus a "Headlines everyone should know" block: Google's split between Headlines (shared) and For You (personal). Two or three slots of the Top 20 are reserved for top national stories.
6. **Diversity slots (1 h).** Two or three of the 20 slots go to high-quality stories outside the reader's top interests, labelled "Outside your bubble". This is the SmartNews and Ground News principle, made explicit and explained.
7. **Summary card plus reading modes (1.5 h).**
   - Write a ~60-word grounded summary when the edition is generated. Optional modes: *ELI5* and *Just the facts*. These come from Particle and Artifact.
   - The prompt must forbid facts that are not in the source. Show an "AI summary · source: X · Read original" label, which is the lesson from NewsBreak.
   - Cache everything in the seeded edition, so the demo never waits on an LLM.
8. **Neutral headline rewrite (1 h).** Rewrite clickbait-y titles once per story when the edition is generated, mark them with an icon, and let the reader tap to see the original. This follows Artifact and Yahoo. Use one LLM call batched with the summary.
9. **Finite edition UX (1 h).** Top 20, a progress bar ("12/20 read"), and a "You're done for today ✓" end state that grows the streak. This is the anti-doomscroll counter-position to infinite feeds. Apple News Today shows the morning-ritual value.
10. **Do NOT build:** comments or social posting (Artifact's moderation trap), political bias labels (no data for PK outlets, and contentious), or AI-original reporting (NewsBreak).

**Must-have total: about 15 h of agent time across recommendations 1-9, which parallelizes across workstreams.**

---

## Innovation ideas

| Idea | Wow (1-5) | Effort (h) | Judging criteria |
|---|---|---|---|
| **AI "Editor's Letter" on the front page.** A personalized two-to-three-sentence lede explains today's edition and how it changed: "You've been reading more about climate, so today's paper leads with COP coverage; we toned down cricket after you skipped 3 match reports." | 5 | 1.5 | Innovation, UI/UX, visible learning |
| **Editable interest model ("Tune my paper").** Sliders show the learned weights; dragging one re-ranks the edition live. | 4 | 2 | UI/UX, Technical Complexity, Practical Impact |
| **"Since you last read" follow-ups.** When a cluster you read yesterday has new articles, show it as a short "Update" card with a one-line "what changed" diff. No aggregator in this scan does this per reader. | 4 | 2 | Innovation, Technical Complexity |
| **Print-native personalized PDF front page.** The layout adapts to the reader: the lead story size reflects their top interest, and section order follows their weights. This is "personalized in *how* it presents". | 5 | (owned by the PDF workstream) | Innovation, required feature |
| **Urdu toggle per story.** A summary in Urdu, for a Pakistani audience. This is the Dailyhunt/Way2News lesson on local language. | 3 | 1 | Practical Impact, Originality locally |
| **Streak with substance.** Instead of plain badges (Yahoo already has them), a weekly "you explored 3 new topics" or "balanced reader" badge rewards breadth, so gamification works against filter bubbles. | 3 | 1 | Innovation, Practical Impact |
| **Read-aloud "Morning Brief" via Web Speech API.** A 90-second audio version of the top 5, after Apple News Today. It needs no API, so it is demo-safe. | 3 | 1 | UI/UX, Accessibility |

---

## Risks

- **Hallucinated summaries or rewritten headlines** (NewsBreak, and Artifact's own "summaries may contain mistakes"). Mitigation: a grounded prompt that uses only source text, a visible "AI" label, always a link to the original, and a short summary length.
- **Filter-bubble criticism from judges.** Mitigation: diversity slots, the "Outside your bubble" label, and a breadth badge.
- **Feedback that looks like it does nothing** (Google's complaints). Mitigation: instant re-weighting, a toast, and visible dashboard deltas.
- **Repetition across days** (Inshorts complaints). Mitigation: dedup against previous editions, and show follow-ups only when the cluster has new articles.
- **Cold start in the live demo.** A fresh account has no history to learn from. Mitigation: a seeded persona with 7 days of synthetic reading events, so the dashboard and Editor's Letter have material. Label the history as a demo persona.
- **Clustering quality.** Bad merges look worse than duplicates (an early TechCrunch critique of Google). Mitigation: a conservative threshold, and merges only within a 48-hour window.
- **Copyright and publisher relations** (a factor in Artifact's struggles). Mitigation: short summaries, prominent links out, and no full-text reproduction in the PDF.
- **Scope creep from copying everything.** Recommendations 1-5 alone already cover the required features. Treat 6-9 and the innovation ideas as stretch, ordered by wow per hour.

## Open questions for the team

- Will Urdu summaries be a demo feature, or is the edition English-only?
- How many of the 20 slots go to shared national Headlines versus personal For You stories versus diversity? Proposed: 3 / 15 / 2.
- Do we show source reliability or quality at all, given there are no third-party ratings for Pakistani outlets?
- Should "Hide source" or "Fewer like this" change *today's* edition live, or only tomorrow's? Live is better UX but harder.

## Sources

- Inshorts App Store: https://apple.co/2Zuoas1 · review analysis: https://kimola.com/reports/inshorts-news-app-review-145426 · teardown (unverified): https://assets.nextleap.app/submissions/ProductTeardown-PersonalisationandSearch-8c92da2d-74df-4819-8c90-fc45405b0ef5.pdf
- Google News controls: https://support.google.com/googlenews/answer/9010862 · story selection: https://support.google.com/googlenews/answer/9005749 · complaint thread: https://support.google.com/googlenews/thread/18239231/increasingly-horrible-feed?hl=en · 2018 revamp: https://imore.com/google-announces-new-version-google-news-rolling-out-ios-and-android · clustering history: https://news.googleblog.com/2008/05/keeping-good-news-stories-together-just.html
- Flipboard Smart Magazines: https://about.flipboard.com/press/new-flipboard-first-smart_magazines/ · https://fortune.com/2017/02/08/flipboard-smart-magazines
- SmartNews: https://api.politifact.com/article/2021/may/12/filter-bubbles-be-gone-smartnews-and-politifact-te/ · https://techcrunch.com/2020/03/03/smartnews-local-news-feature-now-covers-more-than-6000-u-s-cities/
- Ground News: https://help.ground.news/en/articles/485057 · https://about.ground.news/blindspot · https://mediabiasfactcheck.com/ground-news/ · https://app.stationx.net/articles/ground-news-review
- Particle: https://particle.news · https://techcrunch.com/2024/11/12/particle-launches-an-ai-news-app-to-help-publishers-instead-of-just-stealing-their-work · https://maketecheasier.com/how-particle-app-helps-me-read-news-critically
- Artifact: https://medium.com/artifact-news/shutting-down-artifact-1e70de46d419 (403 on fetch; content via coverage) · https://www.iphoneincanada.ca/2024/01/13/artifact-news-app-shut-down/ · https://www.dtnext.in/lifestyle/technology/instagram-co-founders-shut-down-their-artifact-news-app-760883 · https://techcrunch.com/2023/06/02/artifact-news-app-now-uses-ai-to-rewrite-headline-of-a-clickbait-article · https://techcrunch.com/2023/07/27/news-app-artifact-adds-ai-text-to-speech-voices-including-snoop-dogg-and-gwyneth-paltrow
- Yahoo News: https://www.yahooinc.com/press/yahoo-news-app-reimagined-with-next-level-personalization-from-artifact · https://www.thurrott.com/mobile/303955/artifact-lives-on-in-the-new-yahoo-news-app · https://thewrap.com/yahoo-news-artifact-app-ai-technology
- NewsBreak: https://en.wikipedia.org/wiki/NewsBreak · https://dankennedy.net/2024/06/14/reuters-exposes-newsbreaks-chinese-ties-and-ai-based-local-news-hallucinations/ · https://www.medianama.com/2024/06/223-news-app-us-using-ai-tools-leads-spread-misinformation-report/
- Dailyhunt: https://yourstory.com/2018/09/dailyhunt-100m-indians-hooked-month-21m-hooked-day-heres/ · https://craft.co/dailyhunt · Way2News: https://yourstory.com/2015/08/way2news · https://www.exchange4media.com/digital-news/how-way2news-transformed-the-hyper-local-news-ecosystem-in-india-102853.html
- Apple News: https://apple.com/news · https://9to5mac.com/2025/07/23/five-years-after-launch-apple-news-audio-stories-expand-beyond-the-u-s/
- Pakistani apps: Dawn App Store https://apps.apple.com/app/id935631940 · ARY App Store (per search) https://apps.apple.com/app/id1164931041
