# 06 · Reading experience, newspaper-on-web layout, visual language

Research agent 6 of 12, 2026-10-17. Scope: layout, interaction and component inventory for the web edition. Brand colours are left to the team's design system, which is inspired by DevBytes.

## TL;DR
- **Build a hybrid with two views of the same 20-story edition.** **Front page** is the default on desktop. It is a newspaper hierarchy: 1 lead, 3 secondary, 6 standard, then 10 briefs. **Bytes** is the default on mobile: one story per screen, a ~60-word summary, vertical snap scroll. One toggle switches between them and stays on the same story. The pattern is proven: Inshorts does 60-word summaries with "tap to read the original", DevBytes does 64-word reads, and PressReader pairs a Page View with a Text View.
- **Make the paper personal and self-explaining. This is what wins originality.** The masthead carries the reader's name and an edition number. Every story has a "why you're seeing this" chip. Skipping a story re-lays the front page live. A "What your paper learned" page shows interest weights and how they changed today.
- **Type.** Every face below is on Google Fonts and verified as OFL-1.1 through the Fontsource API. Headlines: **Fraunces** (variable, 100-900). Body: **Newsreader** (variable, 200-800) or **Literata**. UI: **Bricolage Grotesque** or **Public Sans**. Urdu: **Noto Nastaliq Urdu** (variable, 400-700) for headlines, plus **Noto Naskh Arabic** (variable, 400-700) for body and UI. Load the Urdu faces only when Urdu is turned on.
- **Spend motion on one memorable moment.** After onboarding, the first edition is shown being "typeset". On top of that, add responsive motion: a card morphs into the story view (View Transitions are same-document in Chrome 111, Firefox 144 and Safari 18), and a skipped story slides out while the layout re-flows. Respect `prefers-reduced-motion`.
- **Quality floor.** Server-render the edition, so that the LCP element is the lead headline text, not an image (target LCP of 2.5 s or less at p75). Meet WCAG 2.2 AA: 4.5:1 text contrast and 24x24 px targets (SC 2.5.8). Every gesture also needs a button and a keyboard shortcut. Make it an installable PWA (`app/manifest.ts` plus 192 and 512 icons) with an offline cached edition, which also covers the "demo never depends on the network" rule.
- **Avoid the generic newspaper.** The frontend-design skill lists "broadsheet with hairline rules, zero radius, dense columns", "ALL-CAPS eyebrows", "A · B · C meta strings" and "monospace data labels" as tells of generated design. Our brief requires a newspaper, so make the structure carry meaning: the fold line, the edition number, and section rules coloured by interest. Do not use decorative broadsheet chrome.

---

## Findings

### F1. How others do it
| Product | Pattern | What we take |
|---|---|---|
| **NYT Today's Paper** (couldn't fetch the page; this is from press coverage) | Lists that day's *print* stories grouped by the real print sections. The Times has no true replica edition. A review notes each section "offers a small glimpse" of the print layout. | Group by section with "page" metadata. A finite, dated edition, not an endless feed. |
| **PressReader** | **Page View** (the replica) and **Text View** (a simplified reading mode). In 2026, Text View got a "vertical, newspaper-inspired layout" with font-size, translate and listen controls. | Two views of one edition. Our Front page and Bytes map onto them. A font-size control in the story view. |
| **Inshorts** (App Store listing) | Summaries of "60 words or less". "Tap anytime to read the original full story". "My Feed" tailored to interests. Saved stories readable offline. 9 Indian languages. | Short summary plus a prominent "Read original". Offline saved stories. Multilingual is expected in South Asia. |
| **DevBytes** (homepage) | "Read in 64 words". A personalised **Daily Digest** morning brief. Sources: HN, Techmeme, GitHub trends. | Byte length of about 60 words. The morning-brief framing. |
| **Flipboard** | Magazine page-flip on iPad (2010). On the web, flipping "wasn't a natural experience" and was replaced by scrolling modules. | **Don't build page-flip on the web.** Use snap-scroll in Bytes. |
| **Google News** | "For You" is personalised. **Full Coverage is deliberately the same for everyone.** I couldn't find a "why am I seeing this" UI in Google News. | Explainability chips are a gap competitors leave open. An "Outside your bubble" section echoes Full Coverage. |
| **Duolingo streaks** (secondary sources; treat as indicative) | Streak freezes and weekend amulets reduce churn. Reported: 1 to 2 days and 7 days are big retention jumps, and weekend amulets gave +4% week-later return (unverified primary). | A streak with a forgiving "rest day" (1 per week). Celebrate days 2, 7 and 30. |

### F2. Front-page hierarchy for a Daily Top 20
Rank comes from the personalization score. The layout tier comes from rank, and section placement comes from the topic.
- **Masthead:** "The {First name} Morning", plus the date (PKT), "Edition No. {n}" (days since sign-up), streak, and a "Download PDF" button.
- **Above the fold (ranks 1-4):** 1 lead (big headline, image if one exists, 2-3 line dek, why-chip) and 3 secondary stories (headline and dek).
- **The fold:** a real divider labelled in sentence case, for example "Below the fold: more from your interests". It means something: above it is the paper's most confident picks.
- **Sections (ranks 5-10):** 6 standard stories grouped under the reader's top 2-3 interest sections, each with a coloured section rule.
- **Briefs (ranks 11-18):** a compact list with a headline, one-line summary and source.
- **Outside your bubble (ranks 19-20):** 2 serendipity picks from interests the reader hasn't chosen, each labelled with why it was picked. This satisfies "room to explore".
- **Footer:** "Today's reading: 7 of 20", the streak, a link to the archive, and "What your paper learned".

ASCII, desktop at 1200 px or wider (12-column grid):
```
+---------------------------------------------------------------+
| The Ayesha Morning      Sat 17 Oct 2026   No. 14   🔥6  [PDF]  |
+-------------------------------------+-------------------------+
| LEAD (cols 1-8)                     | SECONDARY x3 (cols 9-12)|
| Headline, image, dek, why-chip      | headline + dek + chip   |
+-------------------------------------+-------------------------+
| ---- Below the fold: more from your interests ---------------  |
| [Cricket]  std  std     | [AI]   std  std  | [Climate] std std |
+---------------------------------------------------------------+
| Briefs (2 columns of 4)               | Outside your bubble x2 |
+---------------------------------------------------------------+
```
Mobile (360-430 px): a single column in the same order. The lead's image is 16:9 at most. Briefs show as a list. A sticky bottom bar holds Front page / Bytes / Archive / Me.

### F3. Typography (all OFL-1.1, verified via api.fontsource.org)
| Role | Primary | Alternatives | Notes |
|---|---|---|---|
| Masthead / headlines | **Fraunces** (variable, 100-900, italic) | Bodoni Moda (variable, 400-900), Noto Serif Display (100-900), Playfair Display | Fraunces's optical-size and "soft"/"wonk" axes let the masthead have character while headlines stay sober. Use the axis itself as the design element. |
| Body (story view, summaries) | **Newsreader** (variable, 200-800) | Literata (200-900, Cyrillic/Greek), Source Serif 4 (200-900) | All are made for screen reading. Serif body needs line-height of about 1.55-1.65, with measure capped at about 68ch. |
| UI, chips, meta | **Bricolage Grotesque** (variable, 200-800) | Public Sans, Inter Tight | Avoid monospace for meta (a tell). |
| Urdu headline | **Noto Nastaliq Urdu** (variable 400-700, Arabic subset) | **Gulzar** (400 only, static; by Borna Izadpanah, Fiona Ross et al.) | Nastaliq has tall ascenders and descenders. It needs generous line-height (about 2 or more; tune by eye) and must never be clipped by `overflow:hidden`. |
| Urdu body / UI | **Noto Naskh Arabic** (variable 400-700) | none | Naskh reads better at small sizes and on chips. |
| Blackletter masthead (optional) | UnifrakturMaguntia (400) | none | It's a cliché. Use it only if the design system wants it. |

Type scale: a 1.25 ratio for UI, and a wider 1.333 ratio for headlines (lead headline about 48-56 px on desktop, 32-36 px on mobile). Use `next/font/google` with `display: 'swap'` and subsets `['latin']`. Preload only the headline face. Lazy-load the Arabic-script faces behind the Urdu toggle.

### F4. Interactions
- **Skip / dismiss.** Every card gets a skip control (an "×", 24x24 or larger). On click, a 3-option reason popover appears: "Not interested in {topic}", "Already seen this", "Not today". The default is a one-tap skip, with the reason optional. An **Undo** toast stays for 5 s. The card collapses and the next-ranked story is promoted (FLIP / View Transition). Signal weights: reason 1 strongly negative on the topic, 2 neutral on the topic (dedupe the source), 3 zero.
- **Bytes gestures.** Swipe up or down moves to the next or previous story (CSS `scroll-snap-type: y mandatory`, so there's no gesture library to break). A horizontal swipe on the card body skips the story, with the same reasons and undo. Tap "Read original" to open the source in a new tab, which logs a strong positive signal. Bookmark saves it for offline. **Every gesture has a visible button and a key:** `j`/`k` next/prev, `x` skip, `o` open, `s` save, `b` toggle Bytes. Leave a 20 px or wider horizontal margin so the iOS edge back-swipe doesn't fire.
- **Read original.** It is the primary action on the story view (full-width button on mobile). Show the source favicon and domain, and say "Opens {domain}". Before it opens, record `open_original` plus the time on the summary. When the reader returns to the tab, show a "Done reading? Mark as read" toast, so we can estimate dwell.
- **Why-chip.** A small chip under each headline: "Because you follow Cricket", "You read 3 AI stories this week", "Trending in Pakistan", "Outside your bubble". Tapping it opens a popover with the top 2-3 score factors as plain sentences, plus actions "More like this", "Less like this" and "Mute {source}". This makes the learning visible at the point where the reader reads.
- **Read state.** A story counts as read after it is opened, or after 8 s or more in view in Bytes (a threshold for the team to tune). Read cards get a subtle check and dimmed headline, and the progress ring "7 of 20" updates.

### F5. Archive of previous editions
- **Month calendar** (the default): each day cell shows a tiny masthead thumbnail, the lead headline, and a streak fill (full = read 5 or more stories, partial = opened). Days without a paper are muted, and days before sign-up are hidden. Tapping a day opens that edition read-only, with a "Download PDF" button.
- **Shelf** (an optional delight): the last 7 editions as stacked folded papers with the date on the spine. Reserve this for the wow if time allows.
- Data: editions are immutable snapshots, so the archive is a cheap list query with no recompute. This also gives the demo a seeded fallback.

### F6. Streak and progress UI
- In the masthead, a flame (or a design-system glyph) with a count. Tapping it opens a 7-day strip and the rules: "Read at least 3 stories a day to keep your streak. One rest day a week is free."
- Progress ring "7 of 20 read". Finishing the Top 20 shows a small end-of-paper card: "You're done for today. Tomorrow's paper arrives at 6:00 AM." This makes the edition feel finite, which is the opposite of doom-scrolling.
- Milestones at 2, 7 and 30 days get a one-time celebratory animation. Never guilt-trip the reader in copy.

### F7. "What your paper learned"
- **Interest map:** a horizontal bar per interest showing its current weight, with a delta since yesterday (for example "Cricket, up 12%"). Hierarchical rows can expand, for example Technical > CS > Rust.
- **Today's changes:** a short generated sentence such as "Today's paper has more climate and less football because you skipped 2 football stories and read 3 climate pieces to the end."
- **Signals timeline:** the last 20 events (read, opened original, skipped with reason, saved).
- **Controls:** pin an interest, mute a topic or source, a "Surprise me" serendipity slider (0-30%), and reset. Every control states its effect ("Tomorrow's paper will…").

### F8. Dark mode ("Night edition")
Use tokens with a `data-theme` override plus `prefers-color-scheme`. Don't use pure #000 (it's harsh), and don't use "tinted near-black" as decoration either. Use a warm, dark paper surface from the design system. Images get a slight `filter: brightness(.9)`. Re-check chip and section-rule colours for 4.5:1 and 3:1 contrast in both themes.

### F9. Performance (LCP 2.5 s or less at p75, per web.dev)
- LCP candidates include images and *block-level text*. Server-render the edition and make the lead **headline** the LCP element. Give the lead image `priority`, explicit dimensions and AVIF/WebP via `next/image`, and lazy-load every other image.
- External source images are slow and sometimes missing. Use a **typographic fallback**: section colour plus a large initial or the source favicon. Never show a broken image.
- Fonts: 2 Latin families preloaded, the rest swapped in. The Nastaliq file is large, so load it only on the Urdu toggle.

### F10. Accessibility (WCAG 2.2 AA)
Contrast of 4.5:1 for text and 3:1 for UI. Targets of 24x24 px or more (SC 2.5.8; aim for 44 px on mobile). Visible focus ring. Landmarks: `header` (masthead), `main`, each section an `<section aria-labelledby>`, and each story an `<article>`. Bytes mode works with `aria-roledescription="slide"` plus the keyboard keys. Skip and undo are announced through an `aria-live="polite"` region. Urdu content gets `lang="ur" dir="rtl"`, and CSS uses logical properties (`margin-inline-start`) so the RTL edition mirrors for free. Reduced motion turns the typesetting animation and the morphs into simple fades.

### F11. PWA and offline
Chrome's install criteria: HTTPS, a manifest with `name`/`short_name`, 192 and 512 icons, `start_url`, a `display` of standalone or similar, and engagement (one click plus 30 s). Next.js supports `app/manifest.ts` natively. Serwist (Context7 `/serwist/serwist`) adds a service worker for caching today's edition, the last 7 editions and saved stories. The offline page says "You're offline. Here's this morning's paper." This doubles as the demo safety net.

---

## Page-by-page UX spec
1. **Landing** (`/`): the hero *is* a live, real front page. It's rendered with the reader-name slot animating through names ("The Ayesha Morning", "The Bilal Morning"…) with today's real headlines underneath. CTA: "Make my paper". Secondary: "See a sample PDF". No feature grid with icons.
2. **Onboarding** (`/start`, 3 steps plus a "printing" step, with a progress bar since it really is a sequence). Step 1: name and city (for the masthead and local news). Step 2: broad areas as large tappable tiles (Arts, Science, Technical, Sport, Business, World, Pakistan, Lifestyle…). Step 3: drill down only in chosen areas, with chips revealing subtopics in place and a "Surprise me" toggle. Optional step: language (English / اردو) and reading time (5 / 10 / 20 min, which sets the byte length). Then **"Printing your first paper…"**: a 3-5 s orchestrated typesetting reveal that lands on the edition. If generation is slow, fall back to the seeded edition.
3. **Today's paper** (`/today`): the front page from F2. On mobile it defaults to Bytes with a toggle. Header actions: PDF, theme, language. Interactions from F4.
4. **Story view** (`/story/[id]`, also a sheet over the paper): headline, source and time, why-chip, an AI summary (about 120-180 words, clearly labelled "Summary by AI"), "Key points" (3 bullets), a primary **Read original** button, and secondary Save / Skip / Share. Then "Related in your paper" (2 items). Text-size control (A-/A+). Swiping or pressing Esc returns to the same scroll position.
5. **Archive** (`/archive`): calendar from F5, the streak strip, and a "Download PDF" per day.
6. **Me: profile, interests and learning** (`/me`): three tabs. **Interests** is the hierarchical tree editor, reusing the onboarding chips. **What your paper learned** is F7. **Settings** covers name, city, language, delivery time, theme and reset.
7. **PDF download**: a modal with a first-page preview thumbnail, page count, "Download today's PDF" and "Generated 6:00 AM, personalised for Ayesha". The layout matches the web front page so the two read as one product. A second state, "Generating… (about 10 s)", has a skeleton. If generation fails, it says "Couldn't build the PDF. Download the cached 6:00 AM edition instead."

## Component inventory
`Masthead` (name, date, edition No., streak, actions) · `FoldDivider` · `SectionHeader` (interest colour rule) · `StoryCard` in variants lead / secondary / standard / brief / byte / bubble · `WhyChip` + `WhyPopover` · `SkipButton` + `SkipReasonPopover` · `UndoToast` · `ReadOriginalButton` · `SaveButton` · `ProgressRing` · `StreakBadge` + `StreakStrip` · `ViewToggle` (Front page / Bytes) · `BytesDeck` (snap container + key handler) · `StorySheet` · `TextSizeControl` · `ImageWithTypographicFallback` · `InterestTile` · `InterestChipTree` · `OnboardingStepper` · `PrintingReveal` · `ArchiveCalendar` + `EditionThumb` · `EditionShelf` (stretch) · `InterestWeightBar` · `ChangeSummary` · `SignalTimeline` · `PdfModal` · `ThemeToggle` · `LangToggle` · `OfflineBanner` · `InstallPrompt` · `EmptyState` · `BottomNav` (mobile).

## Recommendations for our build (ranked; hours for Claude Code agents)
1. **Front page layout with 4 card variants, fold and sections**, server-rendered from the edition JSON and tested at 360 px and 1280 px: **3 h**.
2. **Skip with reason, undo, and live re-flow** (View Transition with a fallback), posting signals to the API: **2 h**.
3. **Why-chip and popover**, rendered from `reasons[]` in the story payload. Agree that field with the ranking workstream now: **1.5 h**.
4. **Bytes mode** (snap scroll, keys, buttons, read-on-dwell): **2.5 h**.
5. **Story sheet/page with Read original** and its signal logging: **1.5 h**.
6. **Hierarchical onboarding** (tiles to chips tree) plus the **printing reveal**: **3 h**.
7. **"What your paper learned"** (weight bars, delta, change sentence, controls): **2.5 h**.
8. **Archive calendar** plus read-only past edition: **1.5 h**.
9. **Streak badge, strip and progress ring** with an end-of-paper card: **1.5 h**.
10. **Fonts and tokens wiring** (next/font, dark mode, reduced motion, focus ring), done once the design system lands: **1 h**.
11. **PWA manifest and Serwist offline cache** for today plus 7 editions: **1.5 h**.
12. **Urdu edition toggle** (RTL, Nastaliq/Naskh, translated headlines and summaries), as a stretch: **3 h**.
13. **PDF modal UI** (the PDF generator itself is another workstream): **0.5 h**.
14. **An a11y and LCP pass** (Lighthouse, axe, keyboard-only run) before the Loom recording: **1 h**.

## Innovation ideas
- **Live re-layout on skip.** The skipped story leaves and the next-ranked one is promoted into its slot, so the reader sees the paper being re-edited. (Wow 5, 2 h; Innovation and UI/UX)
- **"Why your paper changed today" diff** at the top of the learned page and as a dismissible note under the masthead. (Wow 5, 2.5 h; Innovation, Practical Impact, Presentation)
- **Personal masthead with edition number**: "The Ayesha Morning, No. 14". Cheap, and the screenshot judges remember. (Wow 4, 0.5 h; UI/UX, Originality)
- **The fold as a confidence line**: above it are high-confidence picks, below it discovery, plus an "Outside your bubble" section with its reasons shown. (Wow 4, 1 h; Innovation, Algorithm explainability)
- **Printing reveal** after onboarding: the masthead stamps in and headlines set in rank order. This is the single orchestrated motion moment. (Wow 4, 1.5 h; UI/UX, Presentation)
- **Edition shelf**: past papers stacked as folded papers, with streak days glowing. (Wow 4, 3 h; UI/UX)
- **Bilingual edition (English and Urdu Nastaliq)** with a single toggle and RTL mirroring. (Wow 4, 3 h; Practical Impact, Originality)
- **Reading-time-aware paper**: choose 5, 10 or 20 minutes, and the Top 20 adapts how many become bytes versus briefs. (Wow 3, 1.5 h; Practical Impact)

## Risks
- **Looks generated.** A literal broadsheet (cream, hairlines, all caps) is a known AI-design tell. Mitigation: meaningful structure (fold, edition no., interest colours), sentence-case labels, no middle-dot meta.
- **Gesture conflicts.** iOS edge back-swipe and horizontal skip can collide, and scroll-snap can feel sticky on desktop. Mitigation: margins, buttons and keys first, swipe as a bonus, and Bytes defaults only on touch.
- **Images.** Source images are missing, slow or hotlink-blocked. Mitigation: typographic fallback, and never put an image as the LCP element.
- **Nastaliq** renders slowly, the file is heavy, and it clips easily. Keep it behind a toggle and test on real Android Chrome.
- **View Transitions** support is partial (cross-document has no Firefox support). Use same-document only, with a plain-update fallback.
- **Streak pressure.** Streaks can feel punitive. Use a rest day and positive copy.
- **Time.** About 30 h of UI is listed against ~9 h × parallel agents. Items 1-6 plus 9-10 are the MVP. Items 7, 8 and 11 make the demo. 12 and the shelf are stretch goals.

## Sources
- web.dev, LCP thresholds and candidates: https://web.dev/articles/lcp
- web.dev, PWA install criteria: https://web.dev/articles/install-criteria
- Chrome, View Transitions support: https://developer.chrome.com/docs/web-platform/view-transitions
- W3C, WCAG 2.2 SC 2.5.8 Target Size (Minimum): https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- Next.js PWA guide and manifest (via Context7 `vercel/next.js`): https://github.com/vercel/next.js/blob/canary/docs/01-app/02-guides/progressive-web-apps.mdx
- Serwist (Context7 `/serwist/serwist`): https://github.com/serwist/serwist
- Fontsource API (licence, weights, variable flags): https://api.fontsource.org/v1/fonts/fraunces (likewise newsreader, literata, source-serif-4, bricolage-grotesque, public-sans, noto-nastaliq-urdu, noto-naskh-arabic, gulzar, bodoni-moda, unifrakturmaguntia)
- Google Fonts, Noto Nastaliq Urdu: https://fonts.google.com/noto/specimen/Noto+Nastaliq+Urdu/about
- Gulzar project: https://github.com/googlefonts/Gulzar
- DevBytes: https://devbytes.co.in/
- Inshorts App Store listing: https://apps.apple.com/us/app/id892146527
- PressReader, How to read content: https://help.pressreader.com/hc/en-us/articles/40891072966548-How-to-read-content-in-PressReader
- PressReader blog, browsing updates: https://blog.pressreader.com/pressreader-browsing-and-discovery-updates
- Dan Kennedy on NYT Today's Paper (2022, 2024): https://dankennedy.net/2022/05/05/the-new-york-times-is-about-to-kill-off-its-todays-paper-web-app/ and https://dankennedy.net/2024/08/18/whats-a-page-one-story-in-the-new-york-times-it-depends-on-where-you-look/
- Nieman Lab, NYT A2/A3 redesign: https://www.niemanlab.org/2017/03/the-new-york-times-redesigns-pages-a2-and-a3-as-a-quick-and-engaging-roundup/
- Google News, how stories are selected: https://support.google.com/googlenews/answer/9005749?hl=en
- Flipboard web launch: https://venturebeat.com/business/flipboard-launches-a-full-web-version-with-design-cues-from-medium-and-pinterest
- Duolingo streaks (secondary): https://uxmag.com/articles/the-psychology-of-hot-streak-game-design
- Frontend-design skill (local): C:\Users\HP\.claude\plugins\cache\claude-plugins-official\frontend-design\ea10b213686c\skills\frontend-design\SKILL.md
- Could not fetch (blocked): nytimes.com/section/todayspaper, theguardian.com/theguardian. Their descriptions above are from secondary sources.
