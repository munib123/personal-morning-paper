# 07 - Interest taxonomy and verified free news sources

Researched 2026-10-17 (a Saturday). Every feed below was requested with curl in parallel from our network (Pakistan) and the body was parsed: item count, title/link/date/description present, image present, newest item date. Machine-readable outputs:

- `docs/research/taxonomy.json`: 9 roots, 44 level-2 nodes, 14 level-3 nodes (67 nodes). Each node has a stable dot-path slug, a name and a one-line description for embedding.
- `docs/research/feeds.json`: 199 RSS/Atom candidates plus 13 APIs. Each entry has `verified`, `httpStatus`, `hasImages` and `notes`. The notes carry items in the last 24h, the newest date and `tier=core|extra|skip`.

## TL;DR

- **RSS alone covers us.** 163 of 199 feeds verified today (HTTP 200, parseable, fresh within 7 days). The 114 verified `tier=core` feeds yield about 1,570 items in 24h, with each feed capped at 60. That is inside our 500-1,500 target after dedup, with no API key or paid tier.
- **Pakistan coverage is strong.** Dawn (8 sections), Express Tribune (7), Geo (6), ARY, Business Recorder, ProPakistani, TechJuice, Arab News PK and Aaj English all work, almost all with images. **Samaa** (no feed; the URLs return HTML) and **The News** (top and national feeds stale since 2025/May 2026) are broken. The News sports and business feeds do work.
- **Skip every commercial news API for content.** NewsAPI's free tier bans staging and production use and delays articles 24h. GNews is non-commercial with a 12h delay. Mediastack gives 100 calls a month. Currents caps at 250 requests a day and AI summaries need separate terms. The **Guardian developer key** explicitly allows hackathons (500 calls/day, 1/s, includes body text). It is the one API worth a key.
- **Images:** 113 of the 163 verified feeds carry an image (media:content, enclosure or `<img>`). The gaps are HN, Dev.to RSS, TechCrunch, Artnet, arXiv, ScienceDaily and CNBC. For those, fetch `og:image` from the article page (verified on TechCrunch). Artnet pages return 403, so fall back to a per-category illustration.
- **Gotchas that would bite us in the demo:** arXiv RSS is empty on Saturday and Sunday (`<skipDays>`), so use the arXiv API. Al Jazeera's TLS connection resets from our network. ESPN and the PCB site are behind bot walls. Dezeen sends whitespace before the XML declaration. Several blogs (OpenAI, HF, Node) return their entire archive.
- **Legal posture:** store the title, link, our own 2-3 sentence AI summary, the source name and the og:image URL (hotlinked, not rehosted). Show "Read at Dawn" link-outs. Never republish full text. Readability extraction is for summarization input only.

## Findings

### 1. Taxonomy (summary; full text in taxonomy.json)

Slug rule: a lowercase dot-path, where a parent is a prefix of its children (`technical.cs.web-dev`). Classify an article to a leaf; it then inherits all of its ancestors for feed matching. Onboarding goes root, then child, then grandchild.

| Root (slug) | Level 2 children | Level 3 (only where sources exist) |
|---|---|---|
| World & Pakistan `news` | pakistan, south-asia, middle-east, global-affairs, opinion | pakistan.politics, pakistan.law-security, pakistan.cities |
| Business & Economy `business` | pakistan-economy, markets, global-economy, startups, personal-finance, crypto | - |
| Technical `technical` | cs, gadgets, industry, pakistan-tech, engineering | cs.web-dev, cs.mobile-dev, cs.ai-ml, cs.devops-cloud, cs.security, cs.languages-tools, cs.data-databases, cs.research |
| Science `science` | space, physics-math, life-sciences, climate-environment, discoveries | - |
| Health `health` | medicine, public-health, mental-health, fitness-nutrition | - |
| Sports `sports` | cricket, football, tennis, motorsport, other | cricket.pakistan, cricket.international, cricket.leagues |
| Entertainment `entertainment` | film, tv-streaming, music, pakistani-showbiz, gaming | - |
| Arts & Culture `arts` | visual-arts, design-architecture, books-literature, culture-heritage | - |
| Lifestyle `lifestyle` | food, travel, fashion-beauty, home-living, productivity | - |

Design notes:
- **Climate sits under Science** (Pakistan floods and smog are big). **Pakistan Tech** sits under Technical and **Pakistan Economy** under Business. This keeps "Pakistan" a regional facet rather than a dumping-ground root; `region` on each feed gives us a "Pakistan / Global" toggle for free.
- **Deliberately thin areas:** `health.fitness-nutrition` and `lifestyle.home-living` have weak free feeds (Healthline, MNT and Serious Eats feeds 404). Expect embeddings to route articles there from Guardian Life & Style, NPR Health and Lifehacker.
- **Possible 10th root, Education & Careers** (scholarships, jobs, freelancing). It fits Pakistani students, but no reliable free feed was verified, so it is left out.

### 2. Verified feeds by root (core tier; 24h counts measured today)

Columns: feed - items in last 24h - image in feed (Y/N) - notes. Full URLs are in feeds.json.

**World & Pakistan**
- Dawn: Home (27, Y), Latest (30, Y), Pakistan (30, Y), World (17, Y), Opinion (9, mostly Y). Full `content:encoded`.
- Express Tribune: Home (59, Y), Pakistan (14, Y), World (11, Y). Full content.
- Geo News: Top `rss/1/0` (50, Y), Pakistan `rss/1/1` (11, Y); World extra. Feeds are ISO-8859-1 encoded, so decode properly.
- ARY News all (69, Y), Arab News Pakistan (50, Y), Aaj English (30, Y), Pakistan Observer (10, N, extra), Daily Times (10, N, extra).
- BBC World (24, Y), BBC Asia (4, Y), Guardian World (31, Y), NPR News (10, Y), DW all English (24, N), France 24 (24, Y), FT World (25, N, extra).
- Al Jazeera `xml/rss/all.xml`: **unverified** (TLS reset twice from our network; retry from the deploy region).

**Business & Economy**
- Business Recorder latest (30, Y) and markets (30, Y); Dawn Business (7, Y); Tribune Business (14, Y); ProPakistani (10, Y); Geo Business and The News Business (extra).
- BBC Business (3, Y), Guardian Business (26, Y), CNBC top (30, N), MarketWatch (10, Y), CoinDesk (14, Y), TechCrunch (14, N, startups).

**Technical** (the DevBytes depth)
- Web: Dev.to #javascript and #webdev (12 each), Smashing (Y), freeCodeCamp (Y); extra: web.dev, Chrome dev, Node, React and TypeScript blogs (low frequency).
- AI/ML: TechCrunch AI (10), WIRED AI (5, Y), MIT Tech Review (6), Dev.to #ai (12); extra: DeepMind, Google AI, HF blog, OpenAI news, Simon Willison, NVIDIA, arXiv.
- DevOps/Cloud: Dev.to #devops, Cloudflare blog (Y), InfoQ (13, Y); extra: AWS, Kubernetes, Docker, Netflix Tech.
- Security: Krebs (Y; served as text/html but valid RSS), The Hacker News (10, Y), BleepingComputer (8, N).
- Languages and open source: GitHub blog, Dev.to #python, Lobsters (18, N); extra: LWN, Rust, Go, PostgreSQL.
- Mobile: Android Developers blog (no images).
- General developer: HN front page via hnrss.org (20, N; first request 502, retry fine), InfoQ, Ars Technica (16, Y, full content).
- Gadgets and industry: The Verge (10, Y), WIRED (21, Y), Engadget (12, Y), GSMArena (17, Y), The Register (18, Y), BBC Tech, Guardian Tech.
- Pakistan tech: TechJuice (14, Y), ProPakistani, Dawn Tech (6, Y), Tribune Tech (4, Y).

**Science**: Nature (75 items/week, no description, no image), ScienceDaily (12, N), NASA news releases (5, Y), Quanta (2, Y), New Scientist (9, Y), Space.com (15, Y), Phys.org (30, Y), BBC Science (9, Y), Guardian Science and Environment (Y), NPR Science (Y), Smithsonian (10, Y). Science (AAAS) returns 403 (Cloudflare).

**Health**: BBC Health (15, Y), NPR Health (3, Y), STAT (10, Y), Medical Xpress (30, Y); extra: ScienceDaily Health. WHO news is stale (newest Feb 2026).

**Sports**: ESPNcricinfo global `feeds/0.xml` (15, Y) and Pakistan `feeds/7.xml` (2, Y; newest Oct 13); BBC Sport (38), BBC Cricket (5), BBC Football (35); Guardian Football (14) and Cricket (2); Dawn Sport (7); Tribune Sports (11); Geo Sports; The News Sports (22). All have images. Sky Sports (extra). ESPN.com returns 202 with an empty body (bot wall). PCB and cricket.com.pk: blocked or stale.

**Entertainment**: Variety (10, Y), Hollywood Reporter (10, N), Pitchfork (6, Y), Guardian Film and Music (Y), BBC Entertainment (10, Y), Polygon (10, Y), IGN (20, Y), Geo Entertainment (4, Y), Dawn Images (9, Y), Tribune Life & Style (6, Y), Kotaku and Rolling Stone (extra).

**Arts**: Hyperallergic (11, Y; timed out on the first try), Artnet (10, N; pages 403), Colossal (Y), designboom (9, Y), Dezeen (9, Y; needs whitespace trim), Literary Hub (10, Y), Open Culture (Y), Guardian Art & Design and Books (Y).

**Lifestyle**: Guardian Life & Style, Food and Travel (Y), Lifehacker (9, Y), Bon Appetit (11, Y), Conde Nast Traveler (7, Y), Vogue (29, Y), Apartment Therapy (extra).

### 3. APIs: verified status and terms

| API | Status today | Free terms (official page unless marked) | Use? |
|---|---|---|---|
| Hacker News Firebase `hacker-news.firebaseio.com/v0` | 200, no key | Official; topstories, then one item fetch per id | Yes: the canonical HN source; score gives the "popularity" signal |
| Dev.to API `/api/articles?top=1&tag=` | 200, no key | JSON has `cover_image`, `tag_list`, `reading_time_minutes`, reactions | Yes: better than Dev.to RSS (RSS lacks images) |
| arXiv API `export.arxiv.org/api/query` | 200 | arXiv asks for at most 1 request every 3 s | Yes: on weekends, and for cs.research |
| Lobsters `hottest.json` | 200 | No key | Optional |
| Guardian Content API | 401 with the legacy `test` key | Developer key: "non-commercial usage... hackathons", up to 1 call/s, 500/day, includes article text | Optional: register a key (about 5 min) if we want body text for better summaries |
| NYT APIs | not tested (needs key) | Limits (unverified): developer.nytimes.com could not be fetched | No |
| Reddit JSON | 403 unauthenticated; `/top/.rss` 200 | Data API needs OAuth plus its own terms | No |
| GDELT DOC 2.0 | timed out twice from our network | (unverified) | No |
| NewsAPI.org Developer | needs key | 100 req/day, 24h delay, **not for staging or production**, CORS only for localhost | No |
| GNews Free | needs key | 100 req/day, 10 articles/req, 12h delay, non-commercial, excerpt only | No |
| NewsData.io Free | needs key | (unverified, from secondary listings) 200 credits/day x 10 articles, possibly 12h delay | No |
| Currents Free | needs key | 250 req/day, 20 results/req, 30 days history; customer-facing AI summaries "not included by default" | No |
| Mediastack Free | needs key | 100 calls/**month**, delayed, non-commercial | No |

### 4. Full text and images

- **Order of preference for body text** (input to our summarizer):
  1. `content:encoded` from the feed. 98 verified feeds have full content, including Dawn, Tribune, ARY, Business Recorder, Guardian, Ars, WIRED, Variety and Verge.
  2. The Guardian API `bodyText`.
  3. Fetch the article HTML, run `isProbablyReaderable(doc)`, then `new Readability(doc).parse()` from `@mozilla/readability` (Context7 `/mozilla/readability`; needs a DOM such as jsdom or linkedom on the server).
  4. Fall back to the feed description.
- **Lead image, in order:** `media:content` / `media:thumbnail`, then `enclosure[type^=image]`, then the first `<img>` in content, then `og:image`, then `twitter:image`, then a category illustration. Filter out generic social images, for example Dawn's `/_img/social-default.jpg`.
- **Fetch etiquette:** send a real browser-like User-Agent plus a bot token. Use a 15-20 s timeout and conditional GET (ETag / If-Modified-Since). Poll each feed every 30-60 min; that is about 3,000-5,000 requests/day for 120 feeds, which is fine. Bot walls (Cloudflare 403, Akamai 202) mean: drop the source, do not try to bypass.
- **Copyright:** headlines and short factual summaries with attribution and a link out are the safe pattern. Do not store or display full article text, and do not rehost images; hotlink them with `referrerpolicy="no-referrer"` and fall back on error. Show the source name and logo on every card, and keep "Read full story" as the primary action. Guardian content via API carries its own attribution terms. Our AI summary must be our own words, a few sentences, not a rewrite of the whole piece.

### 5. Ingestion mix (target 500-1,500 fresh items/day)

| Bucket | Feeds | Est. items/day (raw) | After dedup/caps |
|---|---|---|---|
| Pakistan general and politics (Dawn, Tribune, Geo, ARY, Aaj, Arab News PK) | 12 | ~400 | ~200 (heavy cross-outlet duplication; cluster by title embedding) |
| World (BBC, Guardian, NPR, DW, France 24, Al Jazeera) | 7 | ~150 | ~120 |
| Business (BR, Dawn/Tribune business, ProPakistani, Guardian, CNBC, MarketWatch, CoinDesk) | 10 | ~170 | ~120 |
| Technical / CS (HN API top 60, Dev.to API 5 tags x 15, Lobsters, InfoQ, Ars, Verge, WIRED, TechCrunch, Register, GitHub, Cloudflare, security x3, TechJuice) | 25 | ~350 | ~250 |
| arXiv (API: cs.AI, cs.LG, cs.CL, cs.SE; top 10 each by recency) | 4 | 40 | 40 |
| Science (Nature, SciDaily, NASA, Quanta, NewSci, Space.com, Phys.org, BBC/Guardian) | 10 | ~120 | ~90 |
| Sports (Cricinfo x2, BBC x3, Guardian x2, Dawn, Tribune, Geo, The News) | 11 | ~170 | ~120 |
| Health, Entertainment, Arts, Lifestyle | ~35 | ~250 | ~200 |
| **Total** | **~115** | **~1,650** | **~1,100-1,200** |

## Recommendations for our build (ranked)

1. **Seed the `sources` table straight from feeds.json** (`verified && tier=core`) and the `topics` table from taxonomy.json; embed each node's `name: description` once at boot. Effort: 1 h.
2. **One generic RSS/Atom ingester** (`rss-parser` or `fast-xml-parser`). Trim leading whitespace, honor the declared encoding (Geo and The News are ISO-8859-1), normalize to `{title, url, publishedAt||firstSeen, summary, contentHtml, imageUrl, source, feedTopics}`, and dedupe on canonical URL. Effort: 2 h.
3. **Image resolver**: feed media first, then a cached `og:image` fetch for items without one (5 concurrent, 10 s timeout); generic-image blocklist; category placeholder art. Effort: 1 h.
4. **Two special adapters**: HN Firebase (top 60 + score) and Dev.to API (cover_image + tags), with the arXiv API as the weekend fallback. Effort: 1.5 h.
5. **Classification**: feed tags give the prior topics (from feeds.json). Embed title+summary and assign the nearest leaf among those under the feed's topics (cosine), with a global fallback when similarity is below the threshold. That is cheap and explainable ("because you follow Cricket > Pakistan"). Effort: 1.5 h.
6. **Story clustering** across Pakistani outlets (embedding similarity > ~0.85 within 24h) so the Daily Top 20 shows one card with "also covered by Geo, Tribune". It doubles as the dedup step. Effort: 1.5 h.
7. **Readability extraction only when needed** (no `content:encoded` and a summary is needed); never shown verbatim. Effort: 1 h.
8. **Health check at boot / cron**: re-run the parse check and auto-disable feeds that are stale for more than 7 days or failing; show this on an admin page (judges like visible robustness). Effort: 0.5 h.
9. **Optional**: a Guardian developer key for body text in arts and culture, books and lifestyle (500 calls/day is enough for about 100 articles/day). Effort: 0.5 h.

## Innovation ideas

- **"Pakistan vs the world" lens:** for a clustered story, show how Dawn, Geo and BBC/Al Jazeera headline it side by side. This builds on clustering and the `region` field. Wow 4, about 2 h.
- **Source health and freshness badge** on each card ("Dawn, 12 min ago") plus a "verified sources" transparency page generated from feeds.json. Wow 3, about 1 h.
- **Weekend-aware "Research digest":** the arXiv API on weekends, plus a "paper of the day" explained in plain words for the Technical root. Wow 3, about 1.5 h.
- **Cricket match-day mode:** when Cricinfo, BBC Cricket and Dawn Sport spike on a Pakistan fixture, auto-pin a cricket card to the Top 20. Wow 4, about 1.5 h.

## Risks

- **Network variance.** Al Jazeera (TLS reset), GDELT and Python Insider (timeouts) failed from our network; the deploy region may differ. Re-verify from the server and never hard-depend on a single feed.
- **Feed rot.** The News top and national feeds and Samaa are already dead or stale; URLs change without notice, so keep the auto-disable health check.
- **Bot walls.** Cloudflare and Akamai (PCB, UrduPoint, Science, ESPN, Artnet article pages) can start blocking og:image fetches; image fallbacks must be graceful.
- **Duplication.** Pakistani outlets repeat the same story 5-8 times a day (Dawn Home, Latest and Pakistan overlap heavily); without clustering the feed looks spammy.
- **Archive dumps.** OpenAI (1,299 items), Node (1,062) and HF (880) return whole archives; filter by `publishedAt > now-48h` on first ingest or the "fresh" metric explodes.
- **Copyright and ToS.** Showing full text or rehosting images could draw a takedown; the free commercial news APIs prohibit our use, so use RSS plus link-out and our own summaries.
- **Missing dates.** The Google Developers blog has no dates, and one TechJuice item had none; use `firstSeen`.

## Sources

- Verification: our own curl and Python checks on 2026-10-17 (results embedded in feeds.json notes); all feed URLs are listed in feeds.json.
- NewsAPI pricing: https://newsapi.org/pricing
- GNews pricing: https://gnews.io/pricing
- Mediastack pricing: https://mediastack.com/pricing
- Currents pricing: https://currentsapi.services/en/pricing
- Guardian Open Platform access tiers: https://open-platform.theguardian.com/access/ (fetched with curl)
- NewsData.io (secondary, unverified): https://www.g2.com/products/algodom-media-llp-newsdata-io-news-api/pricing , https://www.capterra.com.au/software/1034832/newsdataio
- HN API: https://github.com/HackerNews/API (endpoint tested: https://hacker-news.firebaseio.com/v0/topstories.json)
- Dev.to API (tested): https://dev.to/api/articles
- arXiv API (tested): https://export.arxiv.org/api/query ; arXiv RSS `skipDays` observed at https://rss.arxiv.org/rss/cs.LG
- Mozilla Readability via Context7 `/mozilla/readability`: https://github.com/mozilla/readability
