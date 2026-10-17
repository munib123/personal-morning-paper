Morrow is a personal morning paper. It reads the web overnight for one reader, then hands them a single edition: a front page on the web and the same edition as a newspaper-style PDF. The design borrows the authority of print (nameplate, rules, columns, ranked headlines) and adds one new thing print never had: the paper explains itself and learns.

Four principles decide every screen:

1. **An edition, not a feed.** It has a beginning and an end. Never infinite scroll; end every paper with "That's your paper for today."
2. **Rank by size, not color.** Importance is shown by headline size and position, the way a front page does it. Color is for meaning only.
3. **Show the editor's pen.** Every personalized choice is visible and reversible: a Why-this tag on the story, More/Less controls under it.
4. **Credit and link out.** Every story names its source and links to the original.

## Voice and copy

- Write like a good newspaper editor: short, concrete, calm. Sentence case everywhere except kickers and datelines (uppercase in CSS, never typed in caps).
- Speak to the reader as "you"; the product is "Morrow" or "your paper", never "I" or "our AI".
- Headlines state what happened: "Central bank holds rates for a third month". No questions, no clickbait, no exclamation marks, no emoji.
- AI summaries are one to three plain sentences of fact. Never invent a quote or a number; if the source does not say it, the summary does not.
- Explain personalization in the reader's own terms: "Because you follow climate tech", "You read 3 stories on chips this week". Not "Recommended by our algorithm".
- Buttons are verbs: "Build my paper", "Download PDF", "Past editions". Disabled states say what is missing: "Pick 1 more".
- Numbers: "6 min read", "5h ago", "12 stories", "Edition No. 42". Dates in full on the paper ("Saturday, 17 October 2026"), short in lists ("Sat 17 Oct").
- Empty and error states tell the reader what happens next: "Your first paper is being set. It takes about 30 seconds." / "We couldn't reach Reuters this morning, so this edition has 11 stories."

## Color

The paper is warm newsprint with near-black ink. There is one brand accent and one functional accent.

| Token | Role |
| --- | --- |
| `paper` | Every page background, web and PDF. Never pure white. |
| `paper-raised` | Inputs, sticky header, floating bars. Sparingly. |
| `paper-sunk` | Image placeholders, skeletons, progress tracks, hover fills. |
| `rule` / `rule-strong` | Hairline column rules / borders of controls. |
| `ink` / `ink-soft` / `ink-muted` | Headlines and body / decks and summaries / metadata. |
| `press` (+ `press-soft`, `on-press`) | Press red: kickers, Developing badge, the single accent button, errors. |
| `pen` (+ `pen-soft`, `on-pen`) | Editor's-pen blue: personalization and learning only (Why-this, pressed feedback, links, focus). |
| `highlight` | The marker behind one key phrase per takeaway, and reader highlights. |

- Use `press` at most once per story (the kicker) and on at most one button per screen.
- `pen` means "the paper learned this". Do not use it decoratively.
- Never color-code sections or topics. Sections are told apart by name and position.
- Two themes: **Morning** (default) and **Night edition**, switched by `data-theme="night"` on `<html>` from the moon icon in the header. Respect `prefers-color-scheme` on first visit. The PDF always uses Morning.
- Text on a fill uses its `on-` token (`on-ink`, `on-press`, `on-pen`), never literal white. All text pairs listed in token notes meet 4.5:1 in both themes; `rule-strong` meets 3:1 for control borders.

## Typography

Three families, each with one job:

- **UnifrakturMaguntia** (`masthead`, `masthead-sm`): the nameplate "The Morrow" and nothing else. It is the wordmark; there is no separate logo.
- **Newsreader** (Headlines, Reading, Print groups): every headline, deck, summary and quote. Variable with optical sizing; let `font-optical-sizing: auto` do its work.
- **Libre Franklin** (Interface group): the newspaper sans for kickers, datelines, meta, labels, buttons and all UI copy.

Rules:

- Headline size follows story rank: `headline-xl` for the one lead, `headline-lg` for second rank and page titles, `headline-md` for section stories, `headline-sm` for briefs and lists.
- Under every lead and second-rank headline, a `deck` in italic `ink-soft`.
- Kickers (`kicker`, press, uppercase) sit 4px above a headline. Datelines (`dateline`, uppercase, ink-muted) carry dates, edition numbers and step counts.
- Reading text (`body-text`) never runs wider than the `measure` token. Apply `text-wrap: balance` to headlines.
- Never set UI in the serif or headlines in the sans. Never use the blackletter for anything but the nameplate.

## Layout: the web paper

The front page reads top to bottom in a fixed order:

1. **Masthead** (full): ears with edition number and "Prepared for {name}", nameplate, double rule, dateline strip. Becomes the compact masthead with a ReadingProgress bar once scrolled.
2. **Above the fold**: a 2fr / 1fr grid. Left: the lead StoryCard (highest score of the day). Right: the TakeawayBox ("Three things to know") then one second-rank story.
3. **Sections** in order of the reader's affinity (strongest interest first). Each is a SectionHeader and a 3-column grid of standard StoryCards.
4. **In brief** and **Long read** side by side: briefs as one-liners, a PullQuote, one compact long read.
5. **End of paper**: "That's your paper for today.", one sentence on what tomorrow will change, Download PDF (accent) and Past editions.

- Grid: max width `page-max`, columns separated by `gutter` with a 1px `rule` down the middle. Sections separated by `space-7` (desktop) or `space-6` (mobile).
- Below 640px: one column, lead first, TakeawayBox second, then sections; the masthead ears stack under the nameplate.
- Square corners on all paper content (`radius-0`). Only controls round: `radius-1` buttons and inputs, `radius-2` floating panels and edition cards, `radius-pill` chips and Why-this tags.
- Borders, not shadows. `shadow-float` only on things that float.

## Layout: the PDF

The PDF is the same edition set as a newspaper. Render it from HTML (an `/edition/[date]/print` route printed with Playwright or Puppeteer `page.pdf`), A4 portrait, `@page { size: A4; margin: 0 }`, Morning theme, `lang="en"` for hyphenation.

- **Page 1**: nameplate at about 60px with ears, double rule, dateline strip (date · city and weather · "Page 1 of N"). A 5-column grid: the lead spans columns 1–3 (`print-lead` headline, deck, image, body in 2 text columns with a drop cap); columns 4–5 hold "Three things to know", one or two stories and an "Inside" index. A heavy rule then a row of five teasers pointing to inner pages.
- **Inner pages**: running head (`masthead-sm` + date + page), one section per page where possible, 3–5 columns with `column-rule: 1px solid var(--rule)`.
- Sizes: `print-headline` for column stories, `print-body` justified with `hyphens: auto`, `print-kicker` in press.
- Every story ends with its source and a short link or QR code to the original. The footer says who it was made for and from how many sources.
- Never put interactive affordances (feedback bars, buttons) in the PDF.

## Onboarding

Four steps in the OnboardingStep frame, each one question, under two minutes in total:

1. **Welcome**: the full masthead, one sentence of promise ("One paper, every morning, about what you care about"), first name.
2. **Topics**: 15–24 TopicChips grouped under small labels; at least three.
3. **In your words**: a multiline TextField ("Anything else you want in your paper?"). The AI turns it into topics shown as chips the reader can remove. Optional: sources to avoid.
4. **Your routine**: Segmented controls for paper length (Quick 5 min / Standard 15 / Deep 30) and delivery time, plus city for local news and weather.

Finish on a live preview of their first front page with "Build my paper", never a confetti screen.

## Learning

The reader should feel the paper getting better. Every signal has a visible effect.

- **Explicit**: FeedbackBar (More like this, Less like this, Save, Skip) on every story; following or muting a topic from a WhyTag.
- **Implicit**: opening the original (`onOpen`), time on the reader view, reading to the end, skipping a whole section, downloading the PDF.
- **Visible effect**: each story carries a WhyTag; pressing More/Less shows a one-line note ("Got it. More climate tech tomorrow."); the end of paper states what tomorrow will change; a Your interests page lists topics with their weight and lets the reader edit them.
- Never use streaks, badges or confetti. Finishing the paper is the reward.

## Archive

Past editions live at `/archive` as a grid of EditionCards, newest first, grouped by week. Each opens the edition exactly as published and offers its PDF. Old papers are never regenerated.

## Motion and states

- Motion is quiet: 150ms ease on color and background changes, 300ms on progress fills. No parallax, no slide-in cards. Honor `prefers-reduced-motion`.
- Hover: headlines underline (1px, 3px offset); outlined controls darken their border to `ink`; ghost controls fill with `paper-sunk`.
- Focus: every control shows `focus-ring` (2px paper gap, 2px solid pen), drawn with box-shadow so it follows the radius.
- Loading: skeleton blocks in `paper-sunk` shaped like headlines and text lines, plus a dateline-style status ("Setting today's paper · 8 of 12 stories").
- Read stories keep their place; their headline dims to `ink-muted` with a check.

## Iconography

Line icons on a 24px grid with a 1.75 stroke in `currentColor`, matching Lucide (`lucide-react`, `strokeWidth={1.75}`). The `Icon` component carries the core set. Sizes: 16px inside small controls, 18px in buttons, 22px standalone. Icons belong to controls and metadata only, never to headlines or kickers. `reason` marks personalization; `plus` and `minus` are More and Less. No stars, hearts, thumbs or emoji.

## Accessibility

- Text meets 4.5:1 and control borders 3:1 in both themes (see each token's note).
- Every icon-only control has an `aria-label`. TopicChips and feedback buttons expose `aria-pressed`; Segmented is a radio group.
- Headlines are real headings in order (`h1` nameplate, `h2` sections, `h3` stories). Links to originals open in a new tab with `rel="noopener noreferrer"`.
- Touch targets are at least 40px (chips) and 44px (buttons).

## Building with it (Next.js + Tailwind v4)

Copy `tokens.css` (served beside this README), `components/bundle.css` and the font files into the app, and `components/src/index.tsx` as the component library (add `'use client'` at the top). Then map the tokens into Tailwind under names that do not collide with its defaults:

```css
@import "tailwindcss";
@import "./morrow/tokens.css";
@import "./morrow/bundle.css";
@custom-variant dark (&:where([data-theme="night"], [data-theme="night"] *));
@theme inline {
  --color-paper: var(--paper);          --color-paper-raised: var(--paper-raised);
  --color-paper-sunk: var(--paper-sunk); --color-rule: var(--rule);
  --color-rule-strong: var(--rule-strong);
  --color-ink: var(--ink);              --color-ink-soft: var(--ink-soft);
  --color-ink-muted: var(--ink-muted);  --color-on-ink: var(--on-ink);
  --color-press: var(--press);          --color-press-soft: var(--press-soft);
  --color-on-press: var(--on-press);    --color-pen: var(--pen);
  --color-pen-soft: var(--pen-soft);    --color-on-pen: var(--on-pen);
  --color-highlight: var(--highlight);
  --font-nameplate: var(--font-masthead); --font-news: var(--font-serif); --font-ui: var(--font-sans);
  --radius-control: var(--radius-1);    --radius-card: var(--radius-2); --radius-chip: var(--radius-pill);
  --shadow-floating: var(--shadow-float);
}
```

- Utilities then read `bg-paper text-ink border-rule font-news rounded-control shadow-floating`. Type styles are classes from `tokens.css`: `className="headline-md"`, `"kicker"`, `"ui-meta"`.
- Spacing: `space-1`…`space-9` (4, 8, 12, 16, 24, 32, 48, 64, 96px) equal Tailwind's `1, 2, 3, 4, 6, 8, 12, 16, 24`.
- Put `data-theme="morning"` on `<html>` and swap to `night` for the Night edition.
