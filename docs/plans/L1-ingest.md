# L1 Ingest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `runIngest()` pulls the 116 seeded feeds plus Hacker News, Dev.to and arXiv into `articles` (status `raw`), with canonical URLs, images and plain text. The first real run lands in the shared Supabase DB within ~45 min of starting.

**Architecture:** Each source is a pure "fetch → decode → parse → window/cap" step that returns `RawItem[]`, run through a p-limit pool of 8. A global step then canonicalizes and hashes every URL, dedupes against the DB, fetches article pages (og:image plus Readability) only for new items that need them, and bulk-inserts with `ON CONFLICT (url_hash) DO NOTHING`. Source health is written on every run; `runIngest` itself never writes `job_runs` (§9.7). The same `runIngest` serves `npm run job:ingest` (Actions/local; `scripts/job-ingest.ts` writes the single `job='ingest'` row) and `GET|POST /api/cron/ingest` (Vercel; the route writes `job='ingest-cron'`).

**Tech Stack:** Node 24 · TypeScript · rss-parser 3.13.0 · @mozilla/readability 0.6.0 · linkedom 0.18.13 · p-limit 7.3.3 · @supabase/supabase-js 2.118.0 · Next.js 16.4.2 route handler · Vitest 5.0.5 · tsx 4.23.15 · GitHub Actions.

**Spec:** `docs/ARCHITECTURE.md` (§8 sources, §9.2 cron route, §9.3 `runIngest` contract, §9.7 sources seed / job_runs / Actions env, §10.1 ingestion, §12 jobs), plus `docs/PLAN.md` §4–5 and `docs/research/07-sources-taxonomy.md`.

**APIs verified 2026-10-17:**
- rss-parser README: `new Parser({ customFields: { item: [['media:content','media:content',{keepArray:true}], …] } })` and `parser.parseString(xml)`. xml2js puts attributes under `$`.
- Context7 `/mozilla/readability`: `new Readability(doc).parse()` returns `{ textContent, … } | null` and **mutates** `doc`.
- Context7 `/webreflection/linkedom`: `parseHTML(html)` returns `{ document }` and touches no globals.
- Context7 `/sindresorhus/p-limit`: ESM `import pLimit from 'p-limit'`, then `const limit = pLimit(n); limit(() => fn())`.
- postgrest-js source (supabase-js 2.118.0): `.upsert(rows, { onConflict: 'url_hash', ignoreDuplicates: true }).select('id')` sends `Prefer: resolution=ignore-duplicates` and returns only the rows actually inserted.
- Context7 `/vercel/next.js`: `export const maxDuration = 300` is a route-segment config.
- Context7 vitest: `vi.stubGlobal('fetch', vi.fn())` together with `vi.unstubAllGlobals()`.
- GitHub releases: `actions/checkout@v7` (7.0.1), `actions/setup-node@v7` (7.1.0), `actions/cache@v6` (6.1.0).
- Live probes: Dev.to `/api/articles?top=1&tag=python` returns `cover_image`, `social_image`, `published_timestamp` and `user.name`. A **single** arXiv API probe returned `Rate exceeded`, so throttle it. An HN item has the shape `{by, id, score, time (unix s), title, type, url?}`.

## Global Constraints

- **Edit only these:** `src/server/ingest/**`, `src/app/api/cron/ingest/route.ts` (and its colocated test), `.github/workflows/ingest.yml`, `docs/handoff/L1.md`. No `package.json`, contract, migration or `scripts/` edits. Deps come from L0.
- **Contract (§9.3), exact:** `src/server/ingest/index.ts` exports `interface IngestStats { sources: number; fetched: number; inserted: number; skippedOld: number; failedSources: string[]; ms: number; }` and `runIngest(opts?: { sourceIds?: string[]; maxPerSource?: number; sinceHours?: number }): Promise<IngestStats>`. Replace the L0 stub body; never change the signature.
- **DB:** use `createSupabaseAdminClient()` from `@/server/db/admin` and `TablesInsert<'articles'>` / `Database` from `@/contracts/database.types`. Insert `status: 'raw'`, `lang: 'en'`. `content_text` is summarizer input only.
- **Values (§10.1):**
  - Defaults: `maxPerSource` 60, `sinceHours` 48.
  - Fetching: UA `Mozilla/5.0 (compatible; SubahBot/1.0; +https://github.com/munib123/personal-morning-paper)`. Feed timeout 15 s; page fetch 10 s at 5 concurrent; source pool 8.
  - Text thresholds: Readability only when content is under 80 words; `content_text` truncated to 1,500 words.
  - Health: deactivate after 5 consecutive failures.
  - Adapters: HN takes the top 60 with `score >= 50`. Dev.to tags: `javascript, webdev, ai, devops, python`. arXiv categories: `cs.AI, cs.LG, cs.CL, cs.SE`, newest 10 each.
- **Bot walls** (403, Akamai 202 with an empty body): record the failure and drop the source. Never try to bypass.
- **Sources (§9.7):** L0 seeds the 116 core feeds **plus** the API sources `hacker-news` (hn), `dev-to` (devto) and `arxiv` (arxiv). `ensureApiSources()` is only a safety net that inserts a missing kind.
- **`job_runs` (§9.7):** `runIngest` does **not** write it. `scripts/job-ingest.ts` (L0) writes the one `job='ingest'` row; `/api/cron/ingest` writes `job='ingest-cron'`.
- **Env:** `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `CRON_SECRET` and `MODEL_CACHE_DIR` from `.env.local`. Actions maps the secret `SUPABASE_URL` → `NEXT_PUBLIC_SUPABASE_URL`, plus the secrets `SUPABASE_SECRET_KEY` and `GEMINI_API_KEY`, and sets `MODEL_CACHE_DIR`.
- **Commits:** `feat|test|fix|chore(ingest): …`, with the last line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. `git push` after every task.
- **Cross-platform:** run commands through npm scripts or `npx tsx`. Nothing bash-only goes in the code.

## Review Focus

1. **A feed answers 200 with HTML** (a bot wall or captcha page): the source lands in `failedSources` and the run still finishes. Covered by test `html body marks source failed` (Task 3).
2. **A source hangs or the TLS connection resets** (Al Jazeera): it aborts at 15 s, the source is marked failed, and the other sources still insert. Covered by test `rejected fetch marks source failed` (Task 3).
3. **One bad insert chunk** (a constraint error): the other chunks still insert, the error is recorded, and nothing throws. Covered by test `insertArticles continues after a failing chunk` (Task 3).
4. **Relative or protocol-relative image URLs** (`/img/a.jpg`, `//cdn/x.jpg`): they are resolved against the item link, never stored relative. Covered by image tests (Task 2).
5. **The same story in two feeds of one outlet** (Dawn Home + Dawn Latest, one of them with `utm_*`): it is inserted once, counted once, and gets one page fetch. Covered by test `dedupes the same story across feeds` (Task 3).

---

## File map (`src/server/ingest/`)

| File | Responsibility |
|---|---|
| `types.ts` | `SourceKind`, `IngestSource`, `FeedCache`, `RawItem`, `PageInfo`, `PreparedArticle`, `SourceResult` |
| `canonical.ts` | `canonicalizeUrl`, `urlHash` |
| `window.ts` | `resolvePublishedAt`, `filterAndCap` |
| `decode.ts` | `decodeFeedBody` (charset, BOM, leading whitespace) |
| `http.ts` | `USER_AGENT`, `fetchWithTimeout`, `fetchFeed` (conditional GET) |
| `rss.ts` | `parseFeedXml` (rss-parser plus custom fields) |
| `images.ts` | `pickFeedImage`, `firstImgSrc`, `isGenericImage`, `GENERIC_IMAGE_PATTERNS` |
| `text.ts` | `htmlToText`, `countWords`, `truncateWords` |
| `prepare.ts` | `prepareArticle`, `needsPage` |
| `page.ts` | `parseArticlePage`, `fetchArticlePage`, `enrichFromPages` |
| `health.ts` | `nextHealth` |
| `adapters/{hn,devto,arxiv}.ts` | API adapters returning `RawItem[]` |
| `source.ts` | `processSource` (dispatch by kind) |
| `store.ts` | every Supabase read and write |
| `index.ts` | `runIngest`, `IngestStats` (contract) |
| `run-cli.ts` | local runner: `--only=`, `--max=`, `--sources`, `--report`, `--backfill-images` |
| `__fixtures__/` | `dawn.xml`, `dezeen-ws.xml`, `article.html`, `devto.json`, `arxiv.atom.xml` (each ≤ 3 items) |

Shared internal types (Task 1 creates them, and later tasks use these exact names):
```ts
export type SourceKind = 'rss' | 'hn' | 'devto' | 'arxiv';
export interface FeedCache { httpStatus: number | null; etag: string | null; lastModified: string | null; error: string | null; items: number; at: string; } // JSON in sources.last_status
export interface IngestSource { id: string; name: string; url: string; kind: SourceKind; homepage: string | null; cache: FeedCache | null; failCount: number; }
export interface RawItem { sourceId: string; link: string; title: string; descriptionHtml: string | null; contentHtml: string | null; imageUrl: string | null; author: string | null; publishedRaw: string | number | null; }
export interface PageInfo { ogImage: string | null; twitterImage: string | null; description: string | null; readableText: string | null; }
export interface PreparedArticle { sourceId: string; url: string; urlHash: string; title: string; lede: string | null; contentText: string; imageUrl: string | null; author: string | null; publishedAt: string; wordCount: number; needsImage: boolean; needsText: boolean; raw: RawItem; }
export interface SourceResult { sourceId: string; items: RawItem[]; fetched: number; skippedOld: number; ok: boolean; cache: FeedCache; }
```

---

### Task 0: Worktree setup + draft PR (≈10 min)

**Files:** Create `docs/handoff/L1.md` (a skeleton with "Status: in progress").

- [ ] **Step 1:** `git fetch origin && git rev-parse --abbrev-ref HEAD`. Expect `lane/L1-ingest`. If it isn't, run `git switch -c lane/L1-ingest origin/main`, or from the main checkout `git worktree add ../subah-L1 -b lane/L1-ingest origin/main`.
- [ ] **Step 2:** `cp /d/Documents/fast_Ai_Heckathon/.env.local ./.env.local`, then `echo "MODEL_CACHE_DIR=$USERPROFILE\\.cache\\subah-models" >> .env.local` (in PowerShell: `Add-Content .env.local "MODEL_CACHE_DIR=$env:USERPROFILE\.cache\subah-models"`). Check the key names without printing values: `grep -oE '^[A-Z_]+=' .env.local`. Expect `NEXT_PUBLIC_SUPABASE_URL=`, `SUPABASE_SECRET_KEY=`, `CRON_SECRET=` and `MODEL_CACHE_DIR=`.
- [ ] **Step 3:** `npm ci`. Expect it to exit 0. Check that `ls node_modules/rss-parser node_modules/@mozilla/readability node_modules/linkedom node_modules/p-limit` all exist. If any is missing, write it in the handoff and ask the integrator; don't install it.
- [ ] **Step 4:** `npm run typecheck`. Expect 0 errors on the L0 stubs. Also confirm that the vitest `include` covers `src/**/*.test.ts` (`grep include vitest.config.*`).
- [ ] **Step 5:** Commit the handoff skeleton (`chore(ingest): start L1 lane`), then `git push -u origin lane/L1-ingest` and `gh pr create --draft --base main --title "L1: Ingest" --body "Plan: docs/plans/L1-ingest.md"`. Expect a PR URL.

### Task 1: URL canonicalization, hashing, date window (≈10 min)

**Files:** Create `types.ts` (the block above), `canonical.ts`, `window.ts`. Tests: `canonical.test.ts`, `window.test.ts`.
**Interfaces:**
- Produces: `canonicalizeUrl(raw: string, base?: string): string | null`, `urlHash(canonical: string): string`, `resolvePublishedAt(raw: string | number | null | undefined, now: Date): Date`, `filterAndCap(items: RawItem[], now: Date, sinceHours: number, maxPerSource: number): { kept: RawItem[]; skippedOld: number }`.

- [ ] **Step 1: Write failing tests**
```ts
expect(canonicalizeUrl('https://www.Dawn.com/news/1950001/?utm_source=rss&utm_medium=feed&fbclid=abc#comments')).toBe('https://www.dawn.com/news/1950001');
expect(canonicalizeUrl('https://x.com/a?b=2&utm_campaign=z&a=1')).toBe('https://x.com/a?a=1&b=2');   // remaining params sorted
expect(canonicalizeUrl('https://example.com/')).toBe('https://example.com/');                          // root keeps its slash
expect(canonicalizeUrl('/story/9', 'https://tribune.com.pk/feed/home')).toBe('https://tribune.com.pk/story/9');
expect(canonicalizeUrl('  https://a.com/x  ')).toBe('https://a.com/x');
expect(canonicalizeUrl('javascript:alert(1)')).toBeNull(); expect(canonicalizeUrl('not a url')).toBeNull();
const h = urlHash(canonicalizeUrl('https://a.com/x/?utm_source=1')!);
expect(h).toMatch(/^[0-9a-f]{64}$/); expect(h).toBe(createHash('sha256').update('https://a.com/x').digest('hex'));
// window.test.ts, with now = new Date('2026-10-17T06:00:00Z')
expect(resolvePublishedAt(undefined, now)).toEqual(now); expect(resolvePublishedAt('garbage', now)).toEqual(now);
expect(resolvePublishedAt('2026-10-18T09:00:00Z', now)).toEqual(now);                 // more than 1 h in the future → clamp to now
expect(resolvePublishedAt('Sat, 17 Oct 2026 04:00:00 +0500', now).toISOString()).toBe('2026-10-16T23:00:00.000Z');
expect(resolvePublishedAt(1760680800, now).toISOString()).toBe('2025-10-17T06:00:00.000Z'); // < 1e12 → epoch seconds
// filterAndCap: an item 47 h old is kept, one 49 h old is dropped → skippedOld 1; 100 fresh items with max 60 → the 60 newest, newest first
```
- [ ] **Step 2:** `npx vitest run src/server/ingest/canonical.test.ts src/server/ingest/window.test.ts`. Expect FAIL (module not found).
- [ ] **Step 3: Implement.** `canonicalizeUrl` does `new URL(raw.trim(), base)`, keeps only `http:` and `https:`, deletes `utm_*` and `fbclid`, clears the hash, sorts the search params, and strips one trailing `/` unless the path is `/`. It returns null when the URL can't be parsed. `urlHash` uses `node:crypto` sha256 hex. `filterAndCap` drops items whose `resolvePublishedAt` is before `now - sinceHours`, sorts by date descending, then slices to `maxPerSource`.
- [ ] **Step 4:** Re-run. Expect PASS.
- [ ] **Step 5:** `git add src/server/ingest && git commit -m "feat(ingest): canonical url, url_hash and 48h window"` and `git push`.

### Task 2: Decode + parse RSS + feed images + text (≈15 min)

**Files:** Create `decode.ts`, `rss.ts`, `images.ts`, `text.ts`, `prepare.ts`, `__fixtures__/dawn.xml`, `__fixtures__/dezeen-ws.xml`. Tests: `decode.test.ts`, `rss.test.ts`, `images.test.ts`, `prepare.test.ts`.
**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `decodeFeedBody(bytes: Uint8Array, contentType: string | null): string`
  - `parseFeedXml(xml: string, sourceId: string, feedUrl: string): Promise<RawItem[]>`
  - `pickFeedImage(item: FeedItem, base: string): string | null`, `firstImgSrc(html: string, base: string): string | null`, `isGenericImage(url: string): boolean`
  - `htmlToText(html: string): string`, `countWords(t: string): number`, `truncateWords(t: string, max: number): string`
  - `prepareArticle(raw: RawItem, page: PageInfo | null, now: Date): PreparedArticle | null`

- [ ] **Step 1: Write failing tests**
```ts
// decode: Geo/The News are ISO-8859-1 (bytes are built inline, no binary fixture)
const latin = Buffer.from('<?xml version="1.0" encoding="ISO-8859-1"?><rss><channel><title>Caf\xe9 \x92quote\x92</title></channel></rss>', 'latin1');
expect(decodeFeedBody(latin, 'text/xml')).toContain('Café ’quote’');                  // WHATWG maps iso-8859-1 to windows-1252
expect(decodeFeedBody(Buffer.from('<rss>Caf\xe9</rss>', 'latin1'), 'application/rss+xml; charset=ISO-8859-1')).toContain('Café');
expect(decodeFeedBody(Buffer.from('<rss>Caf\xe9</rss>', 'latin1'), 'text/xml; charset=utf-8')).toContain('Café'); // invalid UTF-8 → falls back to windows-1252
expect(decodeFeedBody(Buffer.from('﻿\n\n  <?xml version="1.0"?><rss/>'), null).startsWith('<?xml')).toBe(true);  // Dezeen
// rss: dawn.xml = 3 items (media:content + long content:encoded; title "PM &amp; army chief meet"; enclosure-only)
const items = await parseFeedXml(readFixture('dawn.xml'), 'dawn-home', 'https://www.dawn.com/feeds/home');
expect(items).toHaveLength(3); expect(items[0].title).toBe('PM & army chief meet');
expect(items[0].imageUrl).toBe('https://i.dawn.com/large/2026/10/a.jpg'); expect(items[0].contentHtml).toContain('<p>');
expect((await parseFeedXml(readFixture('dezeen-ws.xml'), 'dezeen', 'https://www.dezeen.com/feed/')).length).toBeGreaterThan(0);
// images, in order: media:content → media:thumbnail → enclosure[type^=image] → first <img>; generic ones are skipped
const full = { 'media:content': [{ $: { url: 'https://s.com/A.jpg', medium: 'image' } }], 'media:thumbnail': { $: { url: 'https://s.com/B.jpg' } }, enclosure: { url: 'https://s.com/C.jpg', type: 'image/jpeg' }, content: '<img src="/img/D.jpg">' };
expect(pickFeedImage(full, 'https://s.com/a')).toBe('https://s.com/A.jpg');
expect(pickFeedImage({ ...full, 'media:content': undefined }, 'https://s.com/a')).toBe('https://s.com/B.jpg');
expect(pickFeedImage({ enclosure: full.enclosure, content: full.content }, 'https://s.com/a')).toBe('https://s.com/C.jpg');
expect(pickFeedImage({ enclosure: { url: 'https://s.com/p.mp3', type: 'audio/mpeg' }, content: full.content }, 'https://s.com/a')).toBe('https://s.com/img/D.jpg');
expect(firstImgSrc('<img src="//cdn.s.com/x.jpg">', 'https://s.com/a')).toBe('https://cdn.s.com/x.jpg');
expect(pickFeedImage({ 'media:content': [{ $: { url: 'https://www.dawn.com/_img/social-default.jpg' } }], 'media:thumbnail': { $: { url: 'https://s.com/B.jpg' } } }, 'https://www.dawn.com/x')).toBe('https://s.com/B.jpg');
expect(isGenericImage('https://static.arxiv.org/static/browse/0.3.4/images/arxiv-logo-fb.png')).toBe(true);
expect(isGenericImage('https://i.dawn.com/large/2026/10/abc.jpg')).toBe(false);
// prepare: a 2,000-word content:encoded → contentText has 1,500 words, wordCount 2000, lede = plain-text description; no link → null
```
- [ ] **Step 2:** `npx vitest run src/server/ingest`. Expect the new tests to FAIL.
- [ ] **Step 3: Implement.**
  - `decodeFeedBody` picks a label from the header `charset=` first, then the XML prolog `encoding=` (sniffed from the first 200 bytes as latin1), then `utf-8`. For a utf-8 label it decodes with `TextDecoder('utf-8',{fatal:true})`; if that throws, it uses the prolog label if that isn't utf-8, else `windows-1252`. Finally it strips the BOM and `trimStart()`s.
  - `rss.ts` builds one module-level `new Parser<unknown, FeedItem>({ customFields: { item: [['media:content','media:content',{keepArray:true}], 'media:thumbnail', 'content:encoded', 'enclosure', 'dc:creator'] } })`. It maps fields to `RawItem` as: `link` = `item.link`; `title` = `htmlToText(title)`; `descriptionHtml` = `item.content ?? item.summary`; `contentHtml` = `item['content:encoded']`; `author` = `creator ?? dc:creator ?? author`; `publishedRaw` = `isoDate ?? pubDate`.
  - `GENERIC_IMAGE_PATTERNS` are case-insensitive substrings: `social-default`, `default-og`, `og-default`, `placeholder`, `no-image`, `noimage`, `spacer.gif`, `blank.gif`, `pixel.gif`, `gravatar.com/avatar`, `/logo`, `arxiv-logo`, `favicon`.
  - `htmlToText` uses linkedom `parseHTML('<body>'+html+'</body>').document.body.textContent` and collapses whitespace.
  - `prepareArticle` sets `url = canonicalizeUrl(link)` (null → drop the item) and drops items with an empty title. `contentText` is the text of `contentHtml` if it has ≥ 80 words, else the page's `readableText` if it is longer, else whichever of content/description has more words. The result is truncated to 1,500 words; `wordCount` is the count before truncation. `needsImage = !imageUrl` and `needsText = words < 80`. For the image, it falls back to the page's `ogImage`, then its `twitterImage` (both non-generic), when the feed has none.
- [ ] **Step 4:** Re-run. Expect PASS.
- [ ] **Step 5:** Commit `feat(ingest): charset decoding, rss parsing, feed image order, plain text`, then push.

### Task 3: Store + runIngest (RSS) + FIRST REAL RUN (≈15 min; target T+45 min)

**Files:** Create `store.ts`, `http.ts`, `source.ts`, `run-cli.ts`. Replace the stub in `index.ts`. Tests: `index.test.ts`, `store.test.ts`.
**Interfaces:**
- Consumes: Tasks 1–2; `createSupabaseAdminClient` from `@/server/db/admin`.
- Produces:
  - `store.ts`: `loadSources(sourceIds?: string[]): Promise<IngestSource[]>` (active only), `ensureApiSources(): Promise<void>` (a no-op until Task 5), `findExistingHashes(hashes: string[]): Promise<Set<string>>` (`.in()` chunks of 100), `insertArticles(rows: PreparedArticle[]): Promise<{ inserted: number; errors: string[] }>` (upsert chunks of 200, `{ onConflict: 'url_hash', ignoreDuplicates: true }`, `.select('id')`), `recordSourceHealth(source: IngestSource, result: SourceResult): Promise<void>` (writes `last_fetched_at` and `last_status = JSON.stringify(cache)`), `startJobRun(job: 'ingest-cron'): Promise<number | null>`, `finishJobRun(id: number | null, status: 'ok' | 'error', stats: Record<string, unknown>): Promise<void>` (the last two are used **only** by the cron route, Task 9).
  - `http.ts`: `fetchFeed(url: string, cache: FeedCache | null): Promise<{ status: 'ok' | 'not_modified' | 'error'; body: string | null; cache: FeedCache }>`.
  - `source.ts`: `processSource(src: IngestSource, now: Date, o: { sinceHours: number; maxPerSource: number }): Promise<SourceResult>`. Only `rss` is handled for now; other kinds return `{ ok: true, items: [] }`.
  - `index.ts`: `runIngest` (contract).

- [ ] **Step 1: Write failing tests.** `index.test.ts` uses `vi.mock('./store', …)` to mock every store export (`insertArticles` resolves `{ inserted: rows.length, errors: [] }`), and `vi.stubGlobal('fetch', …)` serves fixtures by URL. The test names:
  - `dedupes the same story across feeds`: `dawn-home` and `dawn-latest` both contain `…/news/1?utm_source=rss` and `…/news/1`. Expect `insertArticles` to receive one row with that `urlHash`.
  - `skips hashes already in the DB`: `findExistingHashes` returns that hash. Expect it to be absent from the inserted rows.
  - `html body marks source failed`: the response is 200 with `<html>Access denied</html>`. Expect `stats.failedSources` toEqual `['bad']`, and the run resolves.
  - `rejected fetch marks source failed`: fetch rejects with `new DOMException('aborted','AbortError')`. Expect the source in `failedSources` and the other sources still inserted.
  - `stats add up`: `fetched` = the parsed item total, `skippedOld` = items older than 48 h, `inserted` = the mock's count, `sources` = 3, and `ms >= 0`.
  - `respects maxPerSource and sourceIds`: `runIngest({ sourceIds:['dawn-home'], maxPerSource:1 })`. Expect `loadSources` to be called with `['dawn-home']` and ≤ 1 row.
  - `does not write job_runs`: after a run, `startJobRun` and `finishJobRun` were never called.

  `store.test.ts` mocks `@/server/db/admin` with a chainable fake:
  - `insertArticles continues after a failing chunk`: 450 rows with chunk 2 returning `{ error: { message: 'boom' } }`. Expect `inserted` 250 and `errors` `['boom']`.
  - Row mapping: `url_hash`, `status: 'raw'`, `published_at` as an ISO string, `word_count`.
- [ ] **Step 2:** `npx vitest run src/server/ingest`. Expect FAIL.
- [ ] **Step 3: Implement.**
  - `http.ts`: `fetchWithTimeout(url, init, ms)` uses `AbortSignal.timeout(ms)` and the `USER_AGENT` header. `fetchFeed` reads `arrayBuffer()` and calls `decodeFeedBody(new Uint8Array(buf), res.headers.get('content-type'))`. A non-2xx response, or a body whose first non-space char is not `<`, or that contains no `<rss`/`<feed`/`<rdf`, is an `error` with `cache.error` set.
  - `runIngest`:
    1. `ensureApiSources` (safety net), then `loadSources(opts.sourceIds)`.
    2. Run `processSource` over all sources with `pLimit(8)`; each call is wrapped in try/catch, so a thrown error becomes a failed `SourceResult`. `recordSourceHealth` is called per source.
    3. Run `prepareArticle(raw, null, now)` on every kept item, then dedupe in memory by `urlHash`.
    4. Call `findExistingHashes`; only new items continue. (Task 4 adds the page phase here.)
    5. Call `insertArticles`.
    6. Log one `console.info` line `ingest detail {"imageShare":…,"insertedBySource":{…}}` (not part of `IngestStats`) and return `IngestStats`. No `job_runs` writes; errors propagate to the caller.
  - `run-cli.ts` parses `--only=a,b`, `--max=N` and `--sources` (prints active source counts by kind and exits), calls `runIngest` and prints `JSON.stringify(stats)`.
- [ ] **Step 4:** Re-run. Expect PASS. Then `npm run typecheck`, expecting 0 errors.
- [ ] **Step 5: Real run (Checkpoint A).**
  - `npx tsx --env-file=.env.local src/server/ingest/run-cli.ts --sources`. Expect `rss ≥ 110` and `hn 1, devto 1, arxiv 1` (all seeded by L0). If the result is 0, the L0 seed is missing: run `npm run seed` and note it in the handoff. If only an API kind is missing, `ensureApiSources` adds it on the run below; note that in the handoff too.
  - Then `npx tsx --env-file=.env.local src/server/ingest/run-cli.ts`. Expect JSON with `inserted ≥ 500`, `sources ≥ 110`, `failedSources.length ≤ 15` and `ms < 300000`.
  - If `tsx` rejects `--env-file`, use `node --env-file=.env.local --import tsx src/server/ingest/run-cli.ts`.
  - Paste the stats into `docs/handoff/L1.md` under "Runs".
- [ ] **Step 6:** Commit `feat(ingest): runIngest end-to-end for rss sources + first real ingest`, then push. Tell the orchestrator that Checkpoint A has data.

### Task 4: Article pages: og:image, twitter:image, Readability, backfill (≈25 min)

**Files:** Create `page.ts`, `__fixtures__/article.html`. Modify `index.ts`, `store.ts`, `run-cli.ts`. Test: `page.test.ts`.
**Interfaces:**
- Consumes: `prepareArticle`, `isGenericImage`, `fetchWithTimeout`.
- Produces:
  - `parseArticlePage(html: string, url: string, wantText: boolean): PageInfo`
  - `fetchArticlePage(url: string, wantText: boolean): Promise<PageInfo | null>` (10 s, `text/html` only)
  - `enrichFromPages(drafts: PreparedArticle[], now: Date, o?: { concurrency?: number; maxFetches?: number; budgetMs?: number }): Promise<PreparedArticle[]>` (defaults 5 / 400 / 150_000)
  - `store.updateArticleImages(rows: { urlHash: string; imageUrl: string }[]): Promise<number>`, `store.listImageless(sinceHours: number, limit: number): Promise<{ urlHash: string; url: string }[]>`

- [ ] **Step 1: Write failing tests**
```ts
const info = parseArticlePage(readFixture('article.html'), 'https://site.com/a', true);
expect(info.ogImage).toBe('https://cdn.site.com/og.jpg'); expect(info.twitterImage).toBe('https://cdn.site.com/tw.jpg');
expect(info.description).toBe('A short og description.'); expect(countWords(info.readableText!)).toBeGreaterThan(200);
expect(parseArticlePage(html.replace('og.jpg','social-default.jpg'), url, false).ogImage).toBeNull();  // generic → null
expect(parseArticlePage(html, url, false).readableText).toBeNull();                              // no Readability unless wantText
// enrichFromPages: drafts = [hasImage+300 words, noImage+300 words, hasImage+30 words, noImage+30 words]
// → fetch called 3×; the first draft is untouched; the 4th gets imageUrl 'https://cdn.site.com/og.jpg' and wordCount > 200
// peak in-flight fetches ≤ 5 across 20 drafts; with maxFetches 2, exactly 2 fetches happen
// a fetch that throws leaves that draft as it was (still inserted)
```
- [ ] **Step 2:** `npx vitest run src/server/ingest/page.test.ts`. Expect FAIL.
- [ ] **Step 3: Implement.**
  - `parseArticlePage`: linkedom `parseHTML(html)`; read `meta[property="og:image"]`, then `meta[name="twitter:image"]` (resolved absolute, dropped if generic), then `og:description` / `meta[name=description]`. When `wantText`, run `new Readability(document).parse()?.textContent` (it runs last because it mutates the DOM).
  - `enrichFromPages`: selects drafts with `needsImage || needsText` and orders them image-first. It processes up to `maxFetches` of them through `pLimit(concurrency)` and stops scheduling once `budgetMs` has elapsed. It re-runs `prepareArticle(d.raw, page, now)` for each fetched draft.
  - `runIngest` calls it after `findExistingHashes` (new items only).
  - `run-cli --backfill-images`: `listImageless(48, 300)` → `fetchArticlePage(url,false)` → `updateArticleImages`. It prints `{ checked, updated }`.
- [ ] **Step 4:** Re-run. Expect PASS. Then run `npx tsx --env-file=.env.local src/server/ingest/run-cli.ts --backfill-images` and expect `updated > 0`.
- [ ] **Step 5:** Commit `feat(ingest): og:image/twitter:image resolution, readability for short text, image backfill`, then push.

### Task 5: Hacker News adapter + API source safety net (≈12 min)

**Files:** Create `adapters/hn.ts`. Modify `source.ts` and `store.ts` (`ensureApiSources`). Tests: `adapters/hn.test.ts`, `store.test.ts`.
**Interfaces:**
- Produces: `HN_MIN_SCORE = 50`, `fetchHackerNews(max = 60): Promise<RawItem[]>`, and the real `ensureApiSources()`. L0 already seeds these three rows (§9.7), so this is a safety net: it reads `sources.kind` (active or not) and upserts, onConflict `url` with ignoreDuplicates, only the kinds that have **no** row at all:
  - `{ id:'hacker-news', kind:'hn', url:'https://hacker-news.firebaseio.com/v0/topstories.json', topics:['technical.cs'] }`
  - `{ id:'dev-to', kind:'devto', url:'https://dev.to/api/articles', topics:['technical.cs.web-dev','technical.cs.languages-tools'] }`
  - `{ id:'arxiv', kind:'arxiv', url:'https://export.arxiv.org/api/query', topics:['technical.cs.research','technical.cs.ai-ml'] }`
  - All three get `region:'global'`.

- [ ] **Step 1: Write failing tests.** Stub `topstories.json` → `[1,2,3,4]` and the items:
  - item 1: `{score:120,url:'https://x.com/a',time:1760680800,by:'pg',type:'story',title:'A'}`
  - item 2: score 10
  - item 3: `type:'job'`
  - item 4: score 80 with no url

  Expect 2 items. `items[1].link` is `'https://news.ycombinator.com/item?id=4'`, `items[0].publishedRaw` is `1760680800`, `items[0].author` is `'pg'`, and `imageUrl`/`descriptionHtml` are null (Task 4's page phase fills them). With 200 ids, at most 91 fetches happen (only the first 90 ids are read), and at most 60 items come back.

  `store.test.ts`: `ensureApiSources` with all three kinds present (one of them inactive) → no upsert; with `devto` missing → upserts only the `dev-to` row.
- [ ] **Step 2:** Run. Expect FAIL.
- [ ] **Step 3: Implement.** Items are fetched with `pLimit(10)` from `https://hacker-news.firebaseio.com/v0/item/${id}.json`. In `source.ts`, `kind 'hn'` calls `fetchHackerNews(o.maxPerSource)` and then `filterAndCap`.
- [ ] **Step 4:** Run. Expect PASS.
- [ ] **Step 5:** Commit `feat(ingest): hacker news adapter and api source safety net`, then push.

### Task 6: Dev.to adapter (≈10 min)

**Files:** Create `adapters/devto.ts`, `__fixtures__/devto.json`. Modify `source.ts`. Test: `adapters/devto.test.ts`.
**Interfaces:**
- Produces: `DEVTO_TAGS = ['javascript','webdev','ai','devops','python'] as const`, `fetchDevto(perTag = 15): Promise<RawItem[]>`.

- [ ] **Step 1: Write failing tests.**
  - Fetch is called 5×, sequentially, with `https://dev.to/api/articles?top=1&tag=javascript&per_page=15` (and so on per tag).
  - Mapping: `link` = `url`, `title`, `descriptionHtml` = `description`, `imageUrl` = `cover_image ?? social_image`, `publishedRaw` = `published_timestamp`, `author` = `user.name`.
  - The same article id under two tags appears once.
  - One tag returning 500 still yields the other tags.
- [ ] **Step 2:** Run. Expect FAIL. **Step 3:** Implement, and wire `kind 'devto'` in `source.ts`. **Step 4:** Run. Expect PASS.
- [ ] **Step 5:** Commit `feat(ingest): dev.to api adapter with cover images`, then push.

### Task 7: arXiv API adapter (≈12 min)

**Files:** Create `adapters/arxiv.ts`, `__fixtures__/arxiv.atom.xml`. Modify `source.ts`. Test: `adapters/arxiv.test.ts`.
**Interfaces:**
- Produces: `ARXIV_CATEGORIES = ['cs.AI','cs.LG','cs.CL','cs.SE'] as const`, `ARXIV_MIN_WINDOW_HOURS = 96`, `fetchArxiv(perCategory = 10, gapMs = 3100): Promise<RawItem[]>`.

- [ ] **Step 1: Write failing tests** (`gapMs: 0`).
  - 4 requests are made in order, to `https://export.arxiv.org/api/query?search_query=cat:cs.AI&sortBy=submittedDate&sortOrder=descending&max_results=10` and so on.
  - Entry `http://arxiv.org/abs/2610.01234v2` → `link` `'https://arxiv.org/abs/2610.01234'`.
  - The title `"Sparse\n  Attention"` becomes `'Sparse Attention'`.
  - `descriptionHtml` is the abstract, and `author` is the first `<author><name>`.
  - A response of 503 `Rate exceeded` is retried once. A second failure skips that category and the others still return.
  - In `source.ts`, arXiv items 80 h old are **kept**: its window is `max(sinceHours, 96)`, because weekend submissions lag.
- [ ] **Step 2:** Run. Expect FAIL. **Step 3:** Implement. The adapter parses Atom with the same `rss.ts` parser (via `parseString`), using `item.summary ?? item.contentSnippet` for the abstract. **Step 4:** Run. Expect PASS.
- [ ] **Step 5:** Commit `feat(ingest): arxiv api adapter (weekend-safe)`, then push.

### Task 8: Source health: conditional GET, fail_count, deactivate (≈15 min)

**Files:** Create `health.ts`. Modify `http.ts`, `store.ts` (`recordSourceHealth`) and `source.ts`. Test: `health.test.ts`.
**Interfaces:**
- Produces: `nextHealth(prev: { failCount: number }, ok: boolean): { failCount: number; active: boolean }`, plus `fetchFeed` sending `If-None-Match` / `If-Modified-Since` from `cache`.

- [ ] **Step 1: Write failing tests**
```ts
expect(nextHealth({ failCount: 4 }, false)).toEqual({ failCount: 5, active: false });
expect(nextHealth({ failCount: 3 }, true)).toEqual({ failCount: 0, active: true });
expect(nextHealth({ failCount: 0 }, false)).toEqual({ failCount: 1, active: true });
// fetchFeed with cache {etag:'"abc"', lastModified:'Sat, 17 Oct 2026 05:00:00 GMT'} → the request has both headers
// 304 → status 'not_modified', cache.etag stays '"abc"', and the source is NOT in failedSources
// 200 with an ETag '"new"' header → cache.etag '"new"'; 403 → status 'error', cache.httpStatus 403
```
- [ ] **Step 2:** Run. Expect FAIL. **Step 3:** Implement. `recordSourceHealth` writes `last_fetched_at`, `last_status` (the JSON cache), `fail_count` and `active` from `nextHealth`. `loadSources` parses `last_status` as JSON and falls back to null on bad input. **Step 4:** Run. Expect PASS.
- [ ] **Step 5:** Commit `feat(ingest): conditional GET and auto-deactivate after 5 failures`, then push.

### Task 9: Cron route (≈10 min)

**Files:** Create `src/app/api/cron/ingest/route.ts` and `src/app/api/cron/ingest/route.test.ts`.
**Interfaces:**
- Consumes: `runIngest` from `@/server/ingest`; `startJobRun`, `finishJobRun` from `@/server/ingest/store`.
- Produces (§9.2): `GET` **and** `POST /api/cron/ingest` (Vercel cron sends GET; both call one handler) with `Authorization: Bearer ${CRON_SECRET}`, returning `IngestStats` JSON. It runs `runIngest` only (NLP/enrich run in the worker, never on Vercel) and writes one `job_runs` row with `job='ingest-cron'`. Exports: `export const runtime = 'nodejs'; export const maxDuration = 300;`.

- [ ] **Step 1: Write failing tests** (with `vi.mock('@/server/ingest')` and `vi.mock('@/server/ingest/store')`):
  - `401` without a header, and no `job_runs` row is started.
  - `401` with `Bearer wrong`.
  - `401` when `CRON_SECRET` is unset, even with `Bearer `.
  - `200` on both `GET` and `POST` with `Bearer s3cret` (where `process.env.CRON_SECRET='s3cret'`) → the body equals the mocked stats, `runIngest` was called once with `{}`, `startJobRun` with `'ingest-cron'`, and `finishJobRun(id, 'ok', stats)`.
  - `500` with `{ error }` when `runIngest` throws, after `finishJobRun(id, 'error', { error })`.
- [ ] **Step 2:** Run. Expect FAIL. **Step 3:** Implement. Compare with `timingSafeEqual` after checking the lengths match. **Step 4:** Run. Expect PASS.
- [ ] **Step 5:** Manual check: `npm run dev -- -p 3001`, then `curl -s localhost:3001/api/cron/ingest -H "Authorization: Bearer $CRON_SECRET" --max-time 300` (GET). Expect stats JSON with `inserted` ≈ 0 on a re-run, a new `ingest-cron` row in `job_runs`, and a `401` without the header.
- [ ] **Step 6:** Commit `feat(ingest): GET/POST /api/cron/ingest with bearer auth`, then push.

### Task 10: GitHub Actions `ingest.yml` (≈10 min)

**Files:** Create `.github/workflows/ingest.yml`.

- [ ] **Step 1: Write the workflow**
  - Name `ingest`.
  - Triggers: `on: schedule: - cron: '*/30 * * * *'` plus `workflow_dispatch: {}`.
  - `concurrency: { group: ingest, cancel-in-progress: false }`.
  - Job `ingest` on `ubuntu-latest` with `timeout-minutes: 20`.
  - Env:
    - `NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}`
    - `SUPABASE_SECRET_KEY: ${{ secrets.SUPABASE_SECRET_KEY }}`
    - `GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}`
    - `MODEL_CACHE_DIR: ${{ github.workspace }}/.model-cache`
    - `EMBEDDINGS_PROVIDER: local`
    - Plain values from §5 (not secrets), so the worker's enrichment uses the spec models and budget guards: `GEMINI_MODEL_FAST: gemini-3.5-flash-lite`, `GEMINI_MODEL_FALLBACK: gemini-3.1-flash-lite`, `GEMINI_RPD_FAST: '450'`, `GEMINI_RPD_FALLBACK: '450'`, `GEMINI_RPM_FAST: '12'`.
  - Steps:
    1. `actions/checkout@v7`
    2. `actions/setup-node@v7` with `node-version: 24` and `cache: npm`
    3. `actions/cache@v6` with `path: .model-cache` and `key: models-${{ runner.os }}-gte-small-v1` (§10.2 `Supabase/gte-small`)
    4. `npm ci`
    5. `npm run job:ingest` (it writes the `job='ingest'` row)
- [ ] **Step 2: Validate.** `npx --yes @action-validator/cli .github/workflows/ingest.yml` should exit 0. Then `gh secret list` should list `SUPABASE_URL`, `SUPABASE_SECRET_KEY` and `GEMINI_API_KEY`; if any are missing, note it in the handoff for the user.
- [ ] **Step 3:** Commit `chore(ingest): github actions ingest every 30 min`, then push. (Scheduled and dispatched runs only work once the file is on `main`; the integrator runs `gh workflow run ingest.yml` after the merge. Every scheduled run enriches against the shared Gemini quota; L2's `llm_usage` guard caps it.)

### Task 11: Full verification run + handoff (≈15 min)

**Files:** Modify `src/server/ingest/run-cli.ts` (adds `--report`) and `docs/handoff/L1.md`.

- [ ] **Step 1:** Add `--report`. It pages through `articles` with `select('source_id,image_url,fetched_at')` and `.range()` in steps of 1,000, then prints `{ total, distinctSources, imageShare, last48h, apiSources: { 'hacker-news', 'dev-to', arxiv } }` (row counts). It also prints the latest `job_runs` row for each of `job='ingest'` and `job='ingest-cron'`.
- [ ] **Step 2:** `npx tsx --env-file=.env.local src/server/ingest/run-cli.ts`. Expect `ms < 300000`, and the `ingest detail` line shows `hacker-news`, `dev-to` and `arxiv` in `insertedBySource`.
- [ ] **Step 3:** Run it again straight away. Expect `inserted ≤ 10`.
- [ ] **Step 4:** `npx tsx --env-file=.env.local src/server/ingest/run-cli.ts --report`. Expect `total ≥ 500`, `distinctSources ≥ 80`, `imageShare ≥ 0.70` (if it's lower, run `--backfill-images` first) and every `apiSources` count > 0.
- [ ] **Step 5:** `npm run job:ingest` **once**. Expect exit 0, and `--report` then shows a `job='ingest'` row with `status:'ok'` and stats `{ ingest, nlp, enrich }` (written by `scripts/job-ingest.ts`, not by L1 code). In this worktree L2 is still stubbed, so this makes no Gemini calls; never loop it, because real enrichment runs are deliberate (§10.3).
- [ ] **Step 6:** Gates: `npm run typecheck && npm run lint && npm test && npm run build`. All must pass.
- [ ] **Step 7:** Write the handoff (below). Commit `docs(ingest): L1 handoff and run stats`, push, and `gh pr ready`.

### Task 12 (stretch): Resilience extras

- [ ] Retry each feed once after 2 s on a network error (not on HTTP 4xx). This covers Al Jazeera's TLS resets. Test: the first fetch rejects and the second returns XML → `ok: true`.
- [ ] Mark a source `last_status.error = 'stale'` when its newest item is older than 7 days (it stays active). Test with a fixture dated 2026-09-01.
- [ ] Add a per-source table (inserted, imageShare, failures) to `--report` for the newsroom status page (W2).

---

## Acceptance checks

| Check | Command | Expected |
|---|---|---|
| Unit tests | `npx vitest run src/server/ingest src/app/api/cron/ingest` | All pass: canonical, window, decode (ISO-8859-1), image order, prepare, page, dedupe, each adapter, health, route |
| Gates | `npm run typecheck && npm run lint && npm test && npm run build` | Exit 0 |
| First run volume | Task 3 Step 5 stats (in the handoff) | `inserted ≥ 500`, `ms < 300000` |
| Coverage | `npx tsx --env-file=.env.local src/server/ingest/run-cli.ts --report` | `distinctSources ≥ 80`, `imageShare ≥ 0.70` |
| Idempotent | run-cli twice in a row | The 2nd run has `inserted ≤ 10` |
| No job_runs from runIngest | `index.test.ts` `does not write job_runs` | Pass |
| Ops rows | `--report` after `npm run job:ingest` and the cron curl | One `job='ingest'` row (stats `{ ingest, nlp, enrich }`) and one `job='ingest-cron'` row, both `status='ok'` |
| Cron route | `curl` GET and POST `localhost:3001/api/cron/ingest` with and without the Bearer header | 200 stats / 401 |
| Workflow | `npx --yes @action-validator/cli .github/workflows/ingest.yml` | Exit 0; schedule `*/30`, `workflow_dispatch`, Node 24, `npm ci`, gte-small model cache, `MODEL_CACHE_DIR`, `secrets.SUPABASE_URL` → `NEXT_PUBLIC_SUPABASE_URL`, 3 secrets |

## Handoff (`docs/handoff/L1.md` contents)

1. **Status:** done / partially done, and the PR link.
2. **What ships:** `runIngest` (contract §9.3, unchanged), `GET|POST /api/cron/ingest`, `ingest.yml`, `run-cli.ts` (`--sources`, `--only`, `--max`, `--report`, `--backfill-images`).
3. **Runs:** the stats JSON from the first real run and the final run (inserted, sources, failedSources, ms, imageShare), plus the `--report` output.
4. **Failing sources:** ids and `last_status.error`, for example bot walls. Any source auto-deactivated so far.
5. **Notes for L2:**
   - Rows arrive with `status='raw'`.
   - `content_text` holds ≤ 1,500 words of plain text, and `word_count` is the pre-truncation count.
   - `lede` is the feed description as plain text.
   - HN rows carry `title. og:description` as their text.
   - arXiv rows have no image (the arXiv logo is blocklisted).
6. **Notes for L0/integrator:** `runIngest` writes no `job_runs`; L1 writes only `job='ingest-cron'` (cron route), and `scripts/job-ingest.ts` writes `job='ingest'`. `ensureApiSources` is a safety net for the L0-seeded `hacker-news`, `dev-to` and `arxiv` rows; say whether it ever had to insert one. Run `gh workflow run ingest.yml` after the merge.
7. **Env:** `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `CRON_SECRET` (Vercel); `MODEL_CACHE_DIR` (local/Actions); Actions secrets `SUPABASE_URL` (mapped to `NEXT_PUBLIC_SUPABASE_URL`), `SUPABASE_SECRET_KEY`, `GEMINI_API_KEY`.
8. **Verify:** the acceptance-check commands above.

## Cut line (PLAN.md §5, item 1: "Checkpoint A red on L1/L2")

- The pipeline runs locally only; there are no Actions. If you run short, skip Task 10 and run `npm run job:ingest` by hand before the demo.
- Lane-local order for dropping work (my ordering): stretch Task 12 first, then the Task 9 manual curl, then the Readability half of Task 4 (keep og:image, since images are required). Never drop: Task 3's real run, dedupe by `url_hash`, the 48 h window, ISO-8859-1 decoding, or the HN/arXiv adapters (they are tech depth on a Saturday).
