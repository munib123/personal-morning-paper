# StoryCard

One article in the edition, in four ranks: `lead`, `standard`, `brief`, `compact`.

- `lead`: one per edition, the reader's highest-scoring story. `headline-xl`, deck, optional 3:2 image with caption, AI summary in `body-text`.
- `standard`: the section grid. `headline-md`, `body-sm` summary, optional image.
- `brief`: one-liners under "In brief". `compact`: lists, search results, the archive.
- Provide `headline` and `href` (the original article; it opens in a new tab), plus `kicker`, `deck`, `summary`, `source`, `readingTime`, `published`, `imageUrl`/`imageAlt`/`caption`, `why`, `read`, `breaking`, `footer` (usually a FeedbackBar) and `onOpen` (log an open signal).
- Rank sets size, not color. Kicker is always `press`; summaries are `ink-soft`; meta is `ink-muted` with the source in `ink`.
- Always credit the source by name and link out. Summaries are short and factual; never rewrite a headline into clickbait.
- Read stories keep their place and dim their headline to `ink-muted` with a check, so the page does not jump.
