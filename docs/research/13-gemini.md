# 13 · Gemini: models, limits, prices, and how the Morning Paper should use them

Researched on 2026-10-17 from:
- Google's raw docs (`ai.google.dev/...md.txt`; the pricing page was last updated 2026-10-16).
- The published type definitions and source of `ai@7.0.143` and `@ai-sdk/google@4.0.99`.

Tags used below:
- **[OFFICIAL]**: quoted from Google or AI SDK docs or package source.
- **[3P]**: a third-party measurement or forum report.
- **[UNVERIFIED]**: our own estimate. Measure it on the day.

---

## TL;DR

1. **Workhorse: `gemini-3.5-flash-lite`** [OFFICIAL]: stable, 1,048,576 input / 65,536 output tokens, structured output, thinking defaults to `minimal`.
   - **Second bucket: `gemini-3.1-flash-lite`**, the cheapest capable model ($0.25 in / $1.50 out per 1M). Quotas are per model, so it is a separate pool.
   - **Premium, ≤5 calls/day: `gemini-3.8-flash`**, the newest stable Flash. It rejects `thinkingLevel: 'minimal'`.
   - **Not on the free tier:** Pro (`gemini-3.1-pro-preview`) and `gemini-4-argon`.
   - **Effectively unavailable:** `gemini-2.5-*` is limited to prior users.
2. **Google no longer publishes per-model limits.** You read your own in AI Studio (<https://aistudio.google.com/rate-limit>).
   - A third-party test on 2026-09-02 read the limits from 429 payloads [3P]:
     - Flash-Lite: **15 RPM / 500 RPD**
     - Flash: **5 RPM / 20 RPD**
     - `gemini-embedding-2`: **100 RPM / 1,000 RPD**
   - Limits are **per project and per model**. RPD resets at **midnight Pacific, which is 12:00 PKT today** (the US is on PDT until 2026-11-01).
3. **A free key can run the whole demo.** Expected use: about 130 requests/day on 3.5 Flash-Lite (26%), about 250 on 3.1 Flash-Lite including dev testing (50%), and ≤5 on 3.8 Flash. That holds only if we:
   - batch **10 articles per request**,
   - **mock Gemini while building** (every parallel agent shares one project quota), and
   - generate the final demo editions **after the noon PKT reset**.
4. **Tier 1 billing ($5 minimum prepay) is cheap insurance.** The whole daily pipeline costs about **$1.2–1.6/day** at list price (§2g). Paid data is not used to improve Google's products.
5. **Batch API** is 50% off, but its target turnaround is 24 h (jobs expire at 48 h), so it can't feed a live demo. **Flex** is also 50% off but has a 1–15 minute latency target. **Implicit caching** is automatic and saves money only on the paid tier.
6. **Structured output** works on every 3.x text model. In AI SDK v7, use `generateText({ output: Output.object({ schema }) })`. `generateObject` and `system` are deprecated. The provider sends the schema as `responseJsonSchema`. Keep schemas flat: no unions, regex or length constraints.
7. **Embeddings.** `gemini-embedding-2` is stable: 8,192-token input, 128–3072 dims (Matryoshka), 100+ languages, no `task_type` (use text prefixes instead). **Recommendation: compute recommender vectors locally with `Supabase/gte-small`** (384-d, 34 MB, English), so the learning loop never touches a quota. Gemini embeddings are an opt-in upgrade.
8. **TTS.** `gemini-3.8-flash-tts` and `gemini-3.8-flash-lite-tts` are stable, with 30 prebuilt voices.
   - **2-speaker dialogue is supported**, so a two-host morning podcast works.
   - Output is WAV/PCM only (no MP3).
   - **Urdu is not in either model's supported-language list.**
   - A 3-minute episode is 4,500 audio tokens: **$0.027 (Lite) / $0.041 (Flash)**.
   - Pre-generate ≤5 episodes. Everyone else gets the Web Speech API.
9. **Google Search grounding is not available on the free tier for 3.x models.** Its terms also forbid caching or storing grounded results and using its links for crawling, so it can't build the paper. **URL context** is free and handles 20 URLs per request at about 5k tokens per page, with no paywalled pages. Use it only for on-demand "summarize this link", not as our scraper.
10. **The AI SDK retries 429s twice** (2 s, then 4 s) and honours only `retry-after` headers. Google puts `RetryInfo.retryDelay` in the body instead. Set **`maxRetries: 0`** and use our ladder:
    - 3.5 Flash-Lite → 3.1 Flash-Lite → 3.6 Flash / 3-flash-preview → cached → extractive or template text.
    - Core content never depends on a live Gemini call during the demo.

### Day-of verification (first 10 minutes, one person)
1. Open AI Studio → Rate limits for our project. Paste the real RPM, TPM and RPD into `docs/HANDOFF.md` for:
   - `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`, `gemini-3.8-flash`, `gemini-3.6-flash`
   - `gemini-embedding-2`, `gemini-3.8-flash-lite-tts`
2. Send one request to each model id above. A wrong id returns `404 model_not_found`.
3. Send one `embedMany` with 100 short texts, then check AI Studio usage: does it count as **1 or 100** requests? The answer decides whether Gemini embeddings are viable (§2c).
4. Generate a 20-second two-host TTS clip. Time it, and try one Urdu sentence.
5. Decide on Tier 1 billing. If you enable it, re-check the tier badge, because billed projects are sometimes stuck on the free tier [3P].

---

## 1. Facts (with sources)

### 1.1 Models [OFFICIAL]

| Model id | Status (release) | Input / output tokens | Default thinking | Free tier? | Notes |
|---|---|---|---|---|---|
| `gemini-4-argon` | Stable (Oct 2026) | 1,048,576 unified / 65,536 (up to 1M with long decode) | medium (low/med/high) | **No** | Flagship. Explicit caching not supported. |
| `gemini-3.8-flash` | Stable (2026-09-02) | 1,048,576 / 65,536 | medium; **`minimal` returns an error** | Yes | Newest Flash |
| `gemini-3.6-flash` | Stable (2026-07-21) | 1,048,576 / 65,536 | medium | Yes | Previous Flash |
| **`gemini-3.5-flash-lite`** | Stable (2026-07-21) | 1,048,576 / 65,536 | **minimal** | Yes | "high-throughput… subagent tasks and document parsing" |
| **`gemini-3.1-flash-lite`** | Stable (2026-05-07; shutdown no earlier than 2027-05-07) | 1,048,576 / 65,536 | not listed | Yes | Cheapest current text model |
| `gemini-3-flash-preview` | Preview (2025-12-17) | 1,048,576 / 65,536 | high | Yes | Preview models get stricter limits |
| `gemini-3.1-pro-preview` | Preview (2026-02-19) | 1,048,576 / 65,536 | high | **No** | |
| `gemini-3.7-flash`, `gemini-3.5-flash` | Aliases | — | — | — | Auto-route to 3.8 Flash / 3.6 Flash. Don't use them. |
| `gemini-2.5-flash` / `-flash-lite` / `-pro` | Not deprecated | — | — | Limited | "limiting access… to users who have actively used them in the past". Treat as unavailable. |
| `gemini-embedding-2` | Stable (2026-04-22) | 8,192 in; 128–3072 dims | — | Yes | Multimodal. The models overview still shows `gemini-embedding-2-preview`, but that preview's shutdown date (2026-08-10) has passed. Use `gemini-embedding-2`. |
| `gemini-embedding-001` | Stable (2025-07-14; shutdown ≥ 2028-05-14) | 2,048 in; 128–3072 dims | — | — | Text only. Supports `task_type`. Its vector space is **incompatible** with -2. |
| `gemini-3.8-flash-tts` | Stable (2026-09-22) | 8,192 in / 16,384 out | — | Yes | 130 languages, multi-speaker |
| `gemini-3.8-flash-lite-tts` | Stable (2026-09-22) | 8,192 / 16,384 | — | Yes | 101 languages, multi-speaker |
| `gemini-3.1-flash-tts-preview`, `gemini-2.5-*-tts` | Legacy (shutdown 2026-11-17) | — | — | — | Don't use |

Every 3.x text model above supports these features (per its model page):
- structured outputs, function calling, Search grounding, URL context, code execution
- caching, Batch, Flex and Priority

`gemini-3.1-flash-lite` has no computer use. Pakistan is a supported region.

Sources: [models](https://ai.google.dev/gemini-api/docs/models) · [3.5 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite) · [3.1 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite) · [3.8 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash) · [thinking defaults](https://ai.google.dev/gemini-api/docs/thinking) · [deprecations](https://ai.google.dev/gemini-api/docs/deprecations) · [regions](https://ai.google.dev/gemini-api/docs/available-regions)

### 1.2 Rate limits and 429 behaviour

**Official**:
- Limits are measured as RPM, input TPM and RPD, and "exceeding any of them will trigger a rate limit error."
- They are **"applied per project, not per API key."**
- **RPD resets "at midnight Pacific time"**: 12:00 PKT until 2026-11-01, then 13:00 PKT.
- Experimental and preview models are more restricted.
- "Specified rate limits are not guaranteed and actual capacity may vary."
- **Per-model numbers are no longer published.** They "can be viewed in Google AI Studio."

Usage tiers and the spend-based limit (a 429 when the 10-minute spend is exceeded):

| Tier | Qualification | Billing tier cap | Spend limit per rolling 10 min |
|---|---|---|---|
| Free | Active project | N/A | N/A |
| Tier 1 | Linked billing account (Prepay minimum is $5). "Typically instant." | $250 | $10 |
| Tier 2 | $100 paid + 3 days | $2,000 | $50 |
| Tier 3 | $1,000 paid + 30 days | $20k–$100k+ | $200 |

Batch limits:
- 100 concurrent batch jobs, 2 GB input file, 20 GB storage.
- Tier-1 enqueued tokens: 3.5 Flash-Lite 10M, 3.1 Flash-Lite 10M, 3.8 Flash 3M, Gemini Embedding 500k.
- No free-tier batch row is listed.

Priority inference gets 0.3× the standard limits.

**Free tier, measured** (2026-09-02, new unbilled project, read from 429 quota details) [3P, UNVERIFIED by Google]:

| Model | RPM | RPD | Source |
|---|---|---|---|
| `gemini-3.5-flash-lite` | 15 | 500 | dev.to measurement |
| `gemini-3.1-flash-lite` | 15 | 500 | dev.to measurement |
| `gemini-3.6-flash`, `gemini-3-flash-preview` (and the 3.5/3.7 aliases) | 5 | 20 | dev.to measurement |
| `gemini-3.8-flash` | ~5? | 20 | forum post 2026-09-03 ("free tier limit of 20 RPD") |
| `gemini-embedding-2` | 100 | 1,000 | dev.to (quota id `EmbedContentRequestsPerDayPerUserPerProjectPerModel-FreeTier`). **Unknown:** whether `batchEmbedContents` counts per call or per item. |
| `gemini-3.8-flash(-lite)-tts` | ? | ? | No free-tier number found. One **paid** project had 100 RPD enforced while AI Studio showed 1,000 RPM / 100K TPM / 10,000 RPD; staff said "should have been resolved". |

TPM was not reported. Google's 2025 table gave 250k TPM for free Flash-Lite (historical). **Tier 1 per-model limits are unpublished**: read them in AI Studio.

**What a 429 looks like** (generateContent, the API the AI SDK uses). This shape comes from the provider's error schema plus forum payloads; the values are illustrative:
```json
{ "error": { "code": 429, "status": "RESOURCE_EXHAUSTED", "message": "You exceeded your current quota…",
  "details": [
    { "@type": "type.googleapis.com/google.rpc.QuotaFailure", "violations": [{
        "quotaMetric": "generativelanguage.googleapis.com/generate_content_free_tier_requests",
        "quotaId": "GenerateRequestsPerDayPerProjectPerModel-FreeTier",
        "quotaDimensions": { "model": "gemini-3.5-flash", "location": "global" }, "quotaValue": "20" }] },
    { "@type": "type.googleapis.com/google.rpc.RetryInfo", "retryDelay": "27s" } ] } }
```
How to read it:
- **Quota id `…PerMinute…`:** wait `retryDelay`, then retry.
- **Quota id `…PerDay…`, or `quotaValue: "0"`** (no free access to that model): waiting won't help until 12:00 PKT. Switch model.
- **`-FreeTier` suffix:** the request was judged against the free tier.
- **No retry headers are documented**, and a third party reports no `Retry-After`.
- Google's guidance [OFFICIAL]:
  - Use exponential backoff with jitter for 429, 408 and 5xx.
  - **Don't retry 400, 402 or 403.**
  - **402** means the prepay balance is empty.
- The newer Interactions API uses string codes instead (`rate_limit_exceeded`, `quota_exceeded`). That doesn't apply to us, because the AI SDK's `google()` calls generateContent.

Sources: [rate-limits](https://ai.google.dev/gemini-api/docs/rate-limits) · [billing](https://ai.google.dev/gemini-api/docs/billing) · [troubleshooting](https://ai.google.dev/gemini-api/docs/troubleshooting) · [api-errors](https://ai.google.dev/gemini-api/docs/api-errors) · [3P measurement](https://dev.to/romeroyang/geminis-free-tier-measured-20-requests-a-day-and-google-no-longer-publishes-the-number-4gf2) · [forum: 3.8 Flash 20 RPD](https://discuss.ai.google.dev/t/gemini-3-8-flash-free-tier-20-rpd-is-too-limited-for-practical-evaluation/180609) · [forum: TTS 100 RPD](https://discuss.ai.google.dev/t/gemini-3-8-flash-tts-api-enforces-100-rpd-despite-ai-studio-showing-10k-rpd/187223) · [forum: RetryInfo 27s](https://discuss.ai.google.dev/t/gemini-api-429-resource-exhausted-error-on-tier-1/114413/18) · [3P: free vs paid overview](https://www.aifreeapi.com/en/posts/google-gemini-api-free-tier)

### 1.3 Pricing, Batch, Flex, caching [OFFICIAL]

Paid tier, USD per 1M tokens, standard tier. Arrows show scheduled price increases. On the **free tier, every model below is "Free of charge"** except Argon and 3.1 Pro. On the free tier, **content is "used to improve our products"**; on paid it is not.

| Model | Input | Output (incl. thinking) | Batch / Flex (in / out) | Cache read + storage |
|---|---|---|---|---|
| **`gemini-3.1-flash-lite`** (cheapest capable) | $0.25 (text/image/video), $0.50 (audio) | **$1.50** | $0.125 / $0.75 | $0.025 + $1.00 per 1M tokens per hour |
| `gemini-3.5-flash-lite` | $0.30 | $2.50 | $0.15 / $1.25 | $0.03 + $1.00 per 1M per hour |
| `gemini-3-flash-preview` | $0.50 | $3.00 | $0.25 / $1.50 | $0.05 + $1.00 |
| `gemini-3.8-flash` / `gemini-3.6-flash` | $0.75 → $1.50 (2027-01-01) | $3.75 → $7.50 | $0.375 / $1.875 | $0.075 + $0.50 per 1M per hour |
| `gemini-3.1-pro-preview` | $2.00 (≤200k) | $12.00 | $1.00 / $6.00 | $0.20 + $4.50 |
| `gemini-4-argon` | $2.00 → $4.00 (2026-12-01) | $10 → $20 | $1.00 / $5.00 | implicit only |
| `gemini-embedding-2` | $0.20 (text) | — | Batch $0.10 | — |
| `gemini-3.8-flash-tts` | $0.50 (text) | **$9.00 audio** (≈$0.00225 per 10 s) → $18 | $0.25 / $4.50 | — |
| `gemini-3.8-flash-lite-tts` | $0.50 | **$6.00 audio** (≈$0.0015 per 10 s) → $12 | $0.25 / $3.00 | — |

Audio is billed at **25 tokens per second**.

Tool pricing:
- **URL context:** free on the free tier; on paid, retrieved content is billed as input tokens.
- **Google Search, Gemini 3+:** free tier "Not available". Paid includes 5,000 free searches/month (shared across Gemini 3+ models), then **$14 per 1,000 searches**, counted per query the model runs.

**Batch API**:
- 50% of the standard price. "Target turnaround time is 24 hours, but in majority of cases, it is much quicker." Jobs **expire after 48 h**.
- Two ways to submit: inline (≤20 MB) or a JSONL file (≤2 GB) through the Files API.
- generateContent only. Webhooks `batch.succeeded` and `batch.failed`. Embeddings go through `batches.createEmbeddings`.
- In the AI SDK: `experimental_startBatch({ provider: google, requests })`. Every text request in a batch must use the same model. "API may change in patch releases."
- Free-tier batch is contradictory: the Flash-Lite pricing rows say "Free of charge", but the rate-limit page lists batch quotas only for Tiers 1–3. **[UNVERIFIED]**

**Flex**:
- `service_tier: 'flex'`, 50% off, "Best-effort (Sheddable)".
- Latency target "Minutes (1–15 min target)".
- In the AI SDK: `providerOptions.google.serviceTier: 'flex'`.

**Caching**:
- **Implicit** caching is on by default for Gemini 2.5 and newer. Minimum prefix is **4,096 tokens** for 3.8 Flash, 3.6 Flash, 3.1 Pro and Argon. The Flash-Lite minimum isn't listed. Put large shared content first.
- **Explicit** caching is generateContent only, with a default TTL of 1 h and storage billed per hour. It is "Not available" on the free tier for Flash-Lite, and unsupported on Argon and in the Interactions API.
- On the free tier, **caching saves nothing**, because tokens are already free and it doesn't raise RPD.

Sources: [pricing](https://ai.google.dev/gemini-api/docs/pricing) · [batch-api](https://ai.google.dev/gemini-api/docs/batch-api) · [flex](https://ai.google.dev/gemini-api/docs/flex-inference) · [caching](https://ai.google.dev/gemini-api/docs/caching) · [explicit caching](https://ai.google.dev/gemini-api/docs/generate-content/caching) · [AI SDK Google: Batch](https://ai-sdk.dev/providers/ai-sdk-providers/google)

### 1.4 Structured output [OFFICIAL]

- **Supported on:** 4 Argon, 3.8 Flash, 3.6 Flash, 3.5 Flash-Lite, 3.1 Flash-Lite, 3 Flash Preview and 3.1 Pro Preview (per each model page). **Not supported on the TTS models.**
- **JSON Schema subset:**
  - Types: `string`, `number`, `integer`, `boolean`, `object`, `array`, and `null` via a type array.
  - Descriptive fields: `title`, `description`.
  - Objects: `properties`, `required`, `additionalProperties`.
  - Strings: `enum`, `format` (`date-time`/`date`/`time`).
  - Numbers: `enum`, `minimum`, `maximum`.
  - Arrays: `items`, `prefixItems`, `minItems`, `maxItems`.
  - Not listed: `anyOf`/unions, `pattern`, `minLength`/`maxLength`. Put lengths in `description` and enforce them in code.
- **Limitations:**
  - "Very large or deeply nested schemas may be rejected."
  - Output is valid JSON, but its values still need validating.
  - Troubleshooting: repeated text appears when the field order differs from the schema. **Make all fields required and don't state the field order in the prompt.**
- **Structured output combined with built-in tools** (Search, URL context): preview, Gemini 3 only.
- **AI SDK mapping** (verified in the `@ai-sdk/google@4.0.99` source):
  - `Output.object/array/choice` sends `responseMimeType: "application/json"` plus `responseJsonSchema` (a sanitized JSON Schema built from Zod).
  - `providerOptions.google.structuredOutputs: false` sends no schema; the AI SDK still validates the result. Use it as the escape hatch for schemas Gemini rejects.
  - `generateObject` and `streamObject` still exist but are marked **`@deprecated Use generateText with an output setting instead`**.
  - Parse failures throw `NoObjectGeneratedError`.

Sources: [structured-output](https://ai.google.dev/gemini-api/docs/structured-output) · [troubleshooting](https://ai.google.dev/gemini-api/docs/troubleshooting) · [AI SDK structured data](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data)

### 1.5 Embeddings

**`gemini-embedding-2`** [OFFICIAL]:
- Stable. Text up to **8,192 tokens**. Also embeds images (≤6), audio (≤180 s), video (≤120 s) and PDFs (≤6 pages).
- **Dimensions 128–3072:** default 3072; Google recommends 768, 1536 or 3072. Truncated vectors are **auto-normalized** (with `-001` you normalize them yourself).
- Google's dimension-vs-quality table (MTEB, `-001`): 3072 (default) … 768 → 67.99, 512 → 67.55, 256 → 66.19.
- **No `task_type` parameter.** Prefix the text instead:
  - Queries: `task: search result | query: …` or `task: question answering | query: …`
  - Documents: `title: … | text: …`
  - Symmetric tasks: `task: clustering | query: …`, `task: sentence similarity | query: …`
- **100+ languages.** No Urdu-specific score was found [UNVERIFIED]. The Gemini Embedding paper reports an MMTEB task mean of 68.32 for `-001`.
- **Several inputs in one `embedContent` produce ONE aggregated vector.** For separate vectors, use separate `Content` objects or `batchEmbedContents`.
  - AI SDK `embedMany` does this for you: 1 value → `:embedContent`; more → `:batchEmbedContents`, **at most 100 values per call**, with parallel calls allowed.
- **Batch embeddings** are 50% off.
- **Price:** free on the free tier; $0.20 per 1M text tokens on paid.
- **pgvector:** `vector` columns can be indexed only up to 2,000 dims (see 08). Never store 3072 if you want an index.

**Local alternatives** [OFFICIAL model cards and Hugging Face file listings]:

| Option | Dims | Download | Languages | English MTEB avg (56 tasks) | Runs in | Cost / quota | Notes |
|---|---|---|---|---|---|---|---|
| `gemini-embedding-2` (API) | 128–3072 | — | 100+ | n/a (multilingual SOTA family) | Google | free tier 1,000 RPD [3P]; $0.20 per 1M | Needs network. Per-item counting unknown. |
| **`Supabase/gte-small`** (transformers.js) | 384 | **34.0 MB** q8 (133 MB fp32) | English only | **61.36** | Node pipeline, **plus a built-in twin in Supabase Edge (`Supabase.ai.Session('gte-small')`)** | $0, no quota | 512-token cap. Same space at ingest and query time (assumed same weights: confirm cosine ≈ 1 once). |
| `Xenova/multilingual-e5-small` | 384 | 118.3 MB q8 (470 MB fp32) | 100 languages from XLM-R, **incl. Urdu** (low-resource may degrade) | n/a | Node | $0, no quota | Prefix `query: ` for symmetric tasks and `passage: ` for documents. |
| `Xenova/all-MiniLM-L6-v2` | 384 | **23.0 MB** q8 (90 MB fp32) | English | 56.26 | Node or browser | $0, no quota | Fastest and smallest; lowest quality |

Local latency on a laptop CPU is roughly 5–40 ms per short text with batching, so 1,000 title+lede strings take about 10–40 s [UNVERIFIED: measure]. Library versions: `@huggingface/transformers@4.3.1`, `onnxruntime-node@1.30.0`. Run the local model in the **pipeline script, not in a Vercel function**: the native ONNX runtime plus the model is large.

Sources: [embeddings](https://ai.google.dev/gemini-api/docs/embeddings) · [gemini-embedding-2](https://ai.google.dev/gemini-api/docs/models/gemini-embedding-2) · [Gemini Embedding paper](https://arxiv.org/abs/2503.07891) · [gte-small card](https://huggingface.co/thenlper/gte-small) · [Supabase/gte-small](https://huggingface.co/Supabase/gte-small) · [multilingual-e5-small](https://huggingface.co/intfloat/multilingual-e5-small) · [MiniLM (Xenova)](https://huggingface.co/Xenova/all-MiniLM-L6-v2) · [Supabase AI models](https://supabase.com/docs/guides/functions/ai-models)

### 1.6 Text-to-speech [OFFICIAL]

- **Models:** `gemini-3.8-flash-tts`, "studio-grade… complex multi-speaker dialogue", and `gemini-3.8-flash-lite-tts`, "high-volume… everyday single-speaker". Same schema; switch with one parameter.
- **Limits:** 8,192 input tokens and 16,384 output tokens per request. At 25 audio tokens/s that is about **10.9 minutes of audio per call**, so a 3-minute edition is one call.
- **Voices:**
  - **30 prebuilt.** Good fits for a morning show: Kore (Firm), Puck (Upbeat), Charon (Informative), Sulafat (Warm), Achird (Friendly), Sadaltager (Knowledgeable).
  - An Extended Voice Library (`GET /v1beta/voices`), Voice design and Voice replication, with 200 stored voices per project.
  - **The AI SDK supports prebuilt voices only.**
- **Multi-speaker:** "**up to 2 speakers** using prebuilt voices" in one request. Each turn carries `speech_metadata.speaker` and an optional `style`.
  - Inline vocal tags such as `<laugh>`, `<sigh>`, `<short pause>` work, and so do `|backchannel|` reactions.
  - 3.8 reads the text as a **verbatim transcript**, so put stage directions in `style`.
- **Output:**
  - Unary requests return **WAV** (RIFF, 24 kHz, mono, 16-bit), about 2.9 MB/min, so **8.6 MB for 3 minutes**.
  - Streaming returns raw L16 PCM.
  - Other options: `audio/l16`, `audio/mulaw`, `audio/alaw`, with a `sample_rate` of 24000/16000/8000.
  - **No MP3.** The AI SDK warns and falls back to WAV.
- **Languages:** 130 (Flash) and 101 (Flash-Lite). The list includes Hindi, Punjabi, Sindhi, Southern Pashto and Kashmiri. **Urdu is not listed.** Language is auto-detected, so Urdu output is [UNVERIFIED].
- **Price per 3-minute episode** (4,500 audio tokens + ~600 text tokens): **$0.027 (Lite) / $0.041 (Flash)**. Both double on 2027-01-01. Free tier: "Free of charge", but the daily quota is unknown.

Sources: [speech-generation](https://ai.google.dev/gemini-api/docs/speech-generation) · [3.8 Flash TTS](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash-tts) · [3.8 Flash-Lite TTS](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash-lite-tts) · [AI SDK Google: speech](https://ai-sdk.dev/providers/ai-sdk-providers/google)

### 1.7 News-gathering tools [OFFICIAL]

**URL context** (`tools: [{type:'url_context'}]`; in the AI SDK, `google.tools.urlContext({})`):
- Supported on every current 3.x text model.
- **Up to 20 URLs per request, 34 MB per URL.**
- Public pages only: **no paywalled content**, YouTube, Google Docs, or video/audio files.
- It tries Google's internal index cache first and falls back to a live fetch.
- Each URL gets a safety check, and the response reports a per-URL `urlRetrievalStatus`.
- Retrieved content counts as input tokens. Google's own example used 10,309 tool tokens for two pages, so **about 5k tokens per article**.
- Free on the free tier.

**Grounding with Google Search** (`google_search`):
- The model decides whether to search and runs one or more queries; each query is billed.
- Returns inline `url_citation` annotations plus a `search_suggestions` HTML widget.
- On the free tier, every 3.x pricing row says **"Not available"** ("can be tested in Google AI Studio"). The 500 RPD free allowance applies to 2.5 models, which we can't use.

**Terms of service** for Search grounding (quoted):
- You "will only display the Grounded Results with the associated Search Suggestion(s) to the end user who submitted the prompt."
- You "will not… cache, frame, syndicate, resell, analyze, train on, or otherwise learn from Grounded Results or Search Suggestions."
- "…using Links to build an index, or using Links to identify destination pages for crawling or scraping" is a violation.
- Storage is allowed only for display optimisation, the user's own chat history, or law.

So it **cannot feed a stored daily paper.** At most it could power a live, unstored "what's new on this?" answer on the paid tier.

**Copyright** (our practice; not legal advice):
- Store and show only our derived fields (headline, a 60–80-word summary, "why it matters"), plus the **source name, link and time**.
- Never store or redisplay full article text. Respect paywalls and robots.txt.
- Gemini can block output with a **`recitation`** code ("Copyright or recitation restrictions"). Handle it like a model failure and fall back to headline + link or a ≤2-sentence attributed extract.

Sources: [url-context](https://ai.google.dev/gemini-api/docs/url-context) · [google-search](https://ai.google.dev/gemini-api/docs/google-search) · [terms](https://ai.google.dev/gemini-api/terms) · [api-errors (recitation)](https://ai.google.dev/gemini-api/docs/api-errors)

### 1.8 Vercel AI SDK, current versions [OFFICIAL, verified in package typings]

- **Versions:** `ai@7.0.143` (latest; older lines `ai-v6` 6.0.309 and `ai-v5` 5.0.277), `@ai-sdk/google@4.0.99` (published 2026-10-16), `zod@4.6.7`, `@google/genai@2.30.0`.
- **Provider setup:**
  - `import { google } from '@ai-sdk/google'` reads **`GOOGLE_GENERATIVE_AI_API_KEY`**.
  - For a custom key: `createGoogle({ apiKey })` (also exported as `createGoogleGenerativeAI`).
  - The model id union includes `gemini-3.5-flash-lite`, `gemini-3.8-flash`, `gemini-3.6-flash` and `gemini-4-argon`. Any other string is also accepted.
- **Text generation:**
  - `generateText` and `streamText` take **`instructions`** (`system` is deprecated) and `output: Output.object | array | choice | json | text`.
  - **Default `maxRetries` is 2**, with a 2 s initial delay doubling each time. Retries honour only `retry-after-ms` and `retry-after` headers up to 60 s.
  - Google's handler marks 408, 409, 429 and 5xx as retryable.
- **Embeddings:** `embed` and `embedMany` with top-level `dimensions` (mapped to `outputDimensionality`) and `maxParallelCalls`. `google.embedding('gemini-embedding-2')`. Exports `cosineSimilarity` and `rerank`.
- **Speech:** **`generateSpeech` is stable**; `experimental_generateSpeech` is a deprecated alias.
  - `google.speech('gemini-3.8-flash-lite-tts')` with `providerOptions.google`: `speechMetadata`, `turns` and `multiSpeakerVoiceConfig`.
  - `instructions` maps to `style`. `speed` and `language` are ignored with a warning. Custom voices throw an error.
- **Thinking and tiers:** `providerOptions.google.thinkingConfig.thinkingLevel: 'minimal' | 'low' | 'medium' | 'high'`, and `serviceTier: 'flex' | 'priority'`.
- **Batch:** `experimental_startBatch`, `experimental_getBatchStatus`, `experimental_getBatchResults` (`provider: google`).

Sources: `npm view ai`, `npm view @ai-sdk/google` · [AI SDK Google provider](https://ai-sdk.dev/providers/ai-sdk-providers/google) · [structured data](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data)

---

## 2. Recommendations, with throughput math

Assumptions:
- 1,000 articles/day; 20 demo users × 20 stories; about 100 chat questions/day.
- Free-tier caps as measured in §1.2: Flash-Lite 15 RPM / 500 RPD per model, Flash 5 RPM / 20 RPD.
- We pace at **12 RPM** (80% of 15) and keep each bucket's planned use **≤ 50% of RPD**, leaving room for retries and the live demo.

### (a) Per-article enrichment, 1,000 articles/day: `gemini-3.5-flash-lite`, 10 articles per request

What each article needs: a 60–80-word summary, a rewritten headline, "why it matters", 1–3 taxonomy labels and entities.

Token estimates per article: about 600 input tokens (title + source + ≤2,500 characters of RSS description or lede) and about 300 output tokens. A shared instruction block adds about 2,000 tokens per request [UNVERIFIED].

| Articles per request (N) | Requests/day | Share of 500 RPD | Input / output tokens per request | Minimum time at 12 RPM | Verdict |
|---|---|---|---|---|---|
| 1 | 1,000 | 200% | 2.6k / 0.3k | 83 min | Impossible on one bucket |
| 5 | 200 | 40% | 5k / 1.5k | 17 min | OK, but little headroom |
| **10** | **100** | **20%** | **8k / 3k** | **8.3 min** | **Recommended** |
| 20 | 50 | 10% | 14k / 6k | 4.2 min | Use only when quota is tight. Bigger blast radius, more skipped items. |

Input TPM at 12 RPM × 8k ≈ **96k**, well inside any plausible free TPM. Wall clock: 100 calls at 15–30 s each with 3 in flight ≈ 10–12 minutes [UNVERIFIED].

How to run it:
- Use `thinkingLevel: 'minimal'` (the default for 3.5 Flash-Lite).
- Echo an `id` for each item and **re-queue any article missing from the response**.
- Validate summary length in code.
- Labels:
  - Constrain them with `z.enum(TAXONOMY_SLUGS)` (leaf slugs).
  - If the schema is rejected, fall back to `z.string()` and validate against the taxonomy in code.
  - Merge the result with 08's embedding-cosine labels.
- Enrich each article **once** and key it by content hash, so pipeline re-runs cost nothing.

Paid-tier cost for 1,000 articles (800k input / 300k output tokens):
- 3.5 Flash-Lite: **$0.99/day** ($0.50 with Batch).
- 3.1 Flash-Lite: **$0.65/day** ($0.33 with Batch). That's about $0.0007 per article.

### (b) Per-user daily: one "bundle" call per user on `gemini-3.5-flash-lite` (premium on `gemini-3.8-flash`)

Make **one structured call per user per day**. It returns:
- `editorsNote` (90–130 words, including "what your paper learned")
- `oneLiners[20]` (≤18 words, why *you* get each story)
- `quiz[3]` (on stories read yesterday: question, 4 options, answer index, explanation)
- `podcastScript[≤24 turns]`, which feeds (d)

Size: about 2.5k input tokens (profile deltas + 20 story cards + yesterday's reads) and about 1.8k output tokens.

| Users | Model | Requests/day | Share |
|---|---|---|---|
| 20 | `gemini-3.5-flash-lite` (thinking `low`) | 20 | 4% of 500 RPD, < 2 min |
| 2–3 demo personas, Editor's note only | `gemini-3.8-flash` (thinking `low`) | ≤ 5 | 25% of 20 RPD |

Paid cost: about **$0.11/day** for 20 users on 3.5 Flash-Lite, plus about $0.03 for the premium notes. Don't run 3.8 Flash for all users on the free tier: 20 users would use 100% of its 20 RPD, with no room for retries.

### (c) Embeddings, ~1,000 articles/day + taxonomy nodes: local `Supabase/gte-small` (384-d); Gemini optional

**Recommended setup:**
- The **pipeline** embeds `title + " — " + lede` with transformers.js `Supabase/gte-small`: 384-d, 34 MB, 1,000 items in roughly 10–40 s of CPU [UNVERIFIED].
- **Zero Gemini requests.** It matches 08's `vector(384)` schema and works offline at the venue.
- **Taxonomy nodes** (~150–300) are embedded **once at seed time** and committed with the seed data.
- **Query-time** vectors, if ever needed, come from a Supabase Edge Function using the built-in `gte-small`: same model, same space.
- If **Urdu-language sources** are ingested, use `Xenova/multilingual-e5-small` instead (it has no Edge twin), or Gemini.

**Gemini option** (`gemini-embedding-2`, `dimensions: 768`, or 384 to keep 08's schema; 384 is supported but not a "recommended" size):
- 1,000 articles ÷ 100 values per call = **10 calls/day**, plus 2–3 one-off calls for taxonomy nodes.
- If a `batchEmbedContents` call counts as one request: 13 of 1,000 RPD (**1%**).
- If it counts per item: about 1,250 items, which is **more than 1,000 RPD**, and chat queries would push it further.
- Decide with the 100-item test in the day-of checklist.
- Rules either way:
  - **Never mix vector spaces.** Store `embedding_model` on each row.
  - Switching models means re-embedding everything: articles, taxonomy and user profiles.
- Paid cost: about $0.02/day.

### (d) Audio edition: Web Speech API for everyone; Gemini 2-host TTS for 2–5 showcase episodes

- **Script:** comes free with the (b) bundle (`podcastScript`, about 400 words for 2–3 minutes).
- **Audio:** one `generateSpeech` call on `gemini-3.8-flash-lite-tts` per episode, with 2 prebuilt voices (for example Sulafat and Charon).
  - Use `gemini-3.8-flash-tts` for the hero persona if quality matters.
  - 2–3 minutes = **3,000–4,500 audio tokens**: one request (cap 16,384).
  - Paid cost: **$0.018–0.041 per episode**.
- **When:** pre-generate after 12:00 PKT. Store the WAV (≈8.6 MB) in Supabase Storage, or transcode to ~64 kbps MP3 in the pipeline (≈1.4 MB) if time allows.
  - **Never generate on click.** Latency is unknown.
- **Fallbacks:** the free-tier TTS quota is unknown (≤ ~10/day is plausible, [UNVERIFIED]), so budget ≤5 calls. Everyone else gets `speechSynthesis` reading the same script, as research 03 proposed.
- **Urdu audio:** not officially supported, so audio stays English. Spend 5 minutes testing one Urdu sentence before promising anything.
- **Viable?** Yes, as a pre-generated "wow" for demo personas. Per-user daily Gemini audio for real users needs Tier 1 (about $0.81/day for 20 users on Flash TTS).

### (e) "Ask your paper" chat: context stuffing on `gemini-3.1-flash-lite`

- **No vector search is needed for today's paper.** Put all 20 stories in the instructions (headline + summary + why it matters + source ≈ 3–4k tokens), tagged `[S1]…[S20]`. Gemini's 1M context makes retrieval unnecessary at this scale.
- **For archive questions:**
  - Pre-filter with Postgres full-text search (`websearch_to_tsquery`), up to 10 past stories (about 1.5k tokens).
  - Or use pgvector with a gte-small query vector from the Edge Function.
- **Cost per question:** about 8k input / 200 output tokens, one request. At ≤100/day that is 20% of the 3.1 Flash-Lite bucket.
  - It runs on a **different bucket** from the pipeline, so a heavy pipeline run can't starve the live chat.
- **Paid cost:** about $0.23/day at 100 questions.
- **Fallback answer:** "Here is what your paper says about *X*" plus the top 3 FTS matches.

### (f) 429 / outage fallback ladder (the demo never breaks)

| Feature | Rung 1 | Rung 2 | Rung 3 | Rung 4 (no network) |
|---|---|---|---|---|
| Enrichment (pipeline) | 3.5 Flash-Lite, N=10 | 3.1 Flash-Lite, N=10 | 3.6 Flash, then 3-flash-preview, **N=20** (20 RPD each) | **Extractive:** first 2–3 sentences of the RSS description trimmed to 60–80 words, the original title, labels from embedding cosine, regex/`compromise` entities, "why it matters" omitted |
| Per-user bundle | 3.8 Flash (personas) or 3.5 Flash-Lite | 3.1 Flash-Lite | 3.6 Flash | **Template** Editor's note built from the learning deltas (it is the same data), one-liner = first summary sentence, quiz reused from cache or hidden |
| Chat | 3.1 Flash-Lite | 3.5 Flash-Lite | 3.6 Flash | FTS top-3 + summaries |
| Audio | Pre-generated WAV | 3.8 Flash-Lite TTS | 3.8 Flash TTS | Web Speech API reading the script |
| Embeddings | Local gte-small | — | — | Taxonomy-only scoring (08) |
| Whole demo | Precomputed editions in the DB | — | — | `GEMINI_MODE=offline`: serve the **seeded edition** JSON committed to the repo |

Rules:
1. Set **`maxRetries: 0` on every SDK call.** The ladder below owns retries.
2. Handle failures by type:
   - **429 per-minute:** sleep `retryDelay` plus jitter (cap 60 s) and retry the same rung up to 2 times.
   - **429 per-day, or `quotaValue` 0:** mark the rung exhausted until the next 12:00 PKT and move down.
   - **5xx or timeout:** retry once after about 2 s, then move down.
   - **`NoObjectGeneratedError`:** retry once, then move down.
   - **400, 403 or 404:** move down without retrying.
3. **Count before you call.** Keep a Postgres table `ai_usage(day_pt, model, requests)`. When a model reaches 90% of its measured RPD, skip it proactively. The same table holds the "exhausted until" flags, so they work across serverless instances.
4. **Tag every generated row** with `ai_source` (the model id, `extractive`, `template` or `seed`). The UI can show a subtle "auto summary" badge, and anyone on the team can explain where the text came from.
5. **The live demo path only reads the database.** The only live calls are chat and "summarize this link", and both have rung-4 answers.

### (g) Per-day request budget (free tier, measured caps)

| Workload | Model (quota bucket) | Requests/day | Tokens per request (in / out) | Cap (RPM / RPD) | Planned use |
|---|---|---|---|---|---|
| (a) Enrichment, 1,000 articles, N=10, +10% retries | `gemini-3.5-flash-lite` | 110 | 8k / 3k | 15 / 500 | 22% |
| (b) User bundles × 20 | `gemini-3.5-flash-lite` | 20 | 2.5k / 1.8k | (same bucket) | +4% → **26%** |
| (b) Premium Editor's notes, demo personas | `gemini-3.8-flash` | ≤5 | 2.5k / 0.4k | 5 / 20 | 25% |
| (e) Ask-your-paper | `gemini-3.1-flash-lite` | ≤100 | 8k / 0.2k | 15 / 500 | 20% |
| Dev and test live calls (all agents, after mocks) | `gemini-3.1-flash-lite` | ≤150 | varies | (same bucket) | +30% → **50%** |
| Reserve rungs | `gemini-3.6-flash`, `gemini-3-flash-preview` | 0 planned | — | 5 / 20 each | 0% |
| (c) Embeddings | local gte-small | 0 | — | — | — |
| (c) Alternative: Gemini embeddings | `gemini-embedding-2` | 10 (+3 one-off) | 100 × ~100 | 100 / 1,000 | 1% per request, or about 100% per item |
| (d) Audio episodes | `gemini-3.8-flash-lite-tts` | ≤5 | 0.8k / 4.5k audio | unknown | ? |

**Paid Tier-1 estimate for the same day:**

| Item | Cost/day |
|---|---|
| Enrichment | $0.65–0.99 |
| User bundles | $0.11 |
| Premium notes | $0.03 |
| Chat | $0.23 |
| 5 audio episodes | $0.14–0.20 |
| **Total** | **≈ $1.2–1.6** |

The $5 minimum prepay covers several days.

**Plan for today:**
- Before 12:00 PKT: development (mostly mocks) and one full pipeline run.
- After the 12:00 PKT reset: the final pipeline run, premium notes and TTS for the demo personas.
- Keep at least 50% of each bucket untouched for judging.
- **Don't create extra projects to multiply free quota.** Google APIs ToS §2(d): "will not attempt to circumvent, such limitations". Use mocks or Tier 1.

---

## 3. Code snippets

All snippets were checked against the `ai@7.0.143` and `@ai-sdk/google@4.0.99` type definitions.

```ts
// .env.local / .env.example
// GOOGLE_GENERATIVE_AI_API_KEY=   (default env var read by `google` from @ai-sdk/google)
// GEMINI_MODE=live                # live | mock | offline
```

### 3.1 Model map and thinking helper
```ts
// lib/ai/models.ts
export const GEMINI = {
  bulk: 'gemini-3.5-flash-lite',      // enrichment + per-user bundle
  bulk2: 'gemini-3.1-flash-lite',     // chat + overflow (separate quota bucket)
  premium: 'gemini-3.8-flash',        // <=5 calls/day; rejects thinkingLevel 'minimal'
  reserve: ['gemini-3.6-flash', 'gemini-3-flash-preview'],
  tts: 'gemini-3.8-flash-lite-tts',
  ttsPremium: 'gemini-3.8-flash-tts',
  embed: 'gemini-embedding-2',
} as const;

// Only set levels the docs list for that model; omit otherwise (model default).
export function thinkingFor(modelId: string) {
  if (modelId === 'gemini-3.8-flash') return { thinkingLevel: 'low' as const };
  if (['gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-3-flash-preview'].includes(modelId))
    return { thinkingLevel: 'minimal' as const };
  return undefined; // e.g. gemini-3.1-flash-lite: default not documented
}
```

### 3.2 Batch enrichment with structured output (pipeline script)
```ts
import { generateText, Output } from 'ai';
import { google, type GoogleLanguageModelOptions } from '@ai-sdk/google';
import { z } from 'zod';
import { thinkingFor } from './models';

// TAXONOMY_SLUGS must be a non-empty tuple: ['tech.ai', 'science.space', ...] as const
const Item = z.object({
  id: z.string(),
  headline: z.string().describe('Neutral newspaper headline, max 12 words, no clickbait'),
  summary: z.string().describe('60-80 words, facts only, no opinions'),
  whyItMatters: z.string().describe('One sentence, max 25 words, why a general reader should care'),
  labels: z.array(z.enum(TAXONOMY_SLUGS)).min(1).max(3),
  entities: z.array(z.object({
    name: z.string(),
    type: z.enum(['person', 'org', 'place', 'product', 'event', 'other']),
  })).max(8),
});
const EnrichedBatch = z.object({ items: z.array(Item) });

export async function enrichBatch(modelId: string, articles: { id: string; source: string; title: string; excerpt: string }[]) {
  const { output, usage } = await generateText({
    model: google(modelId),
    maxRetries: 0, // our ladder handles 429s
    instructions: ENRICH_INSTRUCTIONS, // constant text first (implicit-cache friendly on paid tier)
    prompt: JSON.stringify(articles.map(a => ({ ...a, excerpt: a.excerpt.slice(0, 2500) }))),
    output: Output.object({ schema: EnrichedBatch }),
    providerOptions: { google: { thinkingConfig: thinkingFor(modelId) } satisfies GoogleLanguageModelOptions },
  });
  const got = new Set(output.items.map(i => i.id));
  return { items: output.items, missing: articles.filter(a => !got.has(a.id)), usage }; // re-queue `missing`
}
```

### 3.3 Read Gemini 429s and walk the fallback ladder
```ts
import { APICallError, RetryError, NoObjectGeneratedError } from 'ai';

type Failure = { kind: 'minute' | 'day' | 'transient' | 'bad-output' | 'fatal'; retryMs: number };

export function classifyGeminiError(err: unknown): Failure {
  if (NoObjectGeneratedError.isInstance(err)) return { kind: 'bad-output', retryMs: 0 };
  const e = RetryError.isInstance(err) ? err.lastError : err;
  if (!APICallError.isInstance(e)) return { kind: 'transient', retryMs: 2_000 }; // network / timeout
  const status = e.statusCode ?? 0;
  const details = ((e.data as any)?.error?.details ?? []) as Array<Record<string, any>>;
  const v = details.find(d => String(d['@type']).endsWith('QuotaFailure'))?.violations?.[0];
  const delay = details.find(d => String(d['@type']).endsWith('RetryInfo'))?.retryDelay as string | undefined; // "27s"
  if (status === 429) {
    const daily = /PerDay/i.test(v?.quotaId ?? '') || v?.quotaValue === '0';
    return { kind: daily ? 'day' : 'minute', retryMs: delay ? parseFloat(delay) * 1000 : 30_000 };
  }
  if (status === 408 || status >= 500) return { kind: 'transient', retryMs: 2_000 };
  return { kind: 'fatal', retryMs: 0 }; // 400/401/403/404: bad request, key or model id
}

// RPD resets at midnight America/Los_Angeles (= 12:00 PKT until 2026-11-01).
export function nextQuotaReset(now = Date.now()): number {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hourCycle: 'h23',
    hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(now);
  const n = (t: string) => Number(p.find(x => x.type === t)?.value ?? 0);
  return now - ((n('hour') * 60 + n('minute')) * 60 + n('second')) * 1000 + 86_400_000;
}

const blockedUntil = new Map<string, number>(); // also persist in Postgres for serverless routes
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function withLadder<T>(
  models: readonly string[],
  call: (modelId: string) => Promise<T>,
  offline: () => T | Promise<T>,
): Promise<{ value: T; source: string }> {
  for (const model of models) {
    if ((blockedUntil.get(model) ?? 0) > Date.now()) continue;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return { value: await call(model), source: model };
      } catch (err) {
        const f = classifyGeminiError(err);
        if (f.kind === 'day') { blockedUntil.set(model, nextQuotaReset()); break; }
        if (f.kind === 'fatal' || (f.kind === 'bad-output' && attempt >= 1) || f.retryMs > 60_000) break;
        await sleep(f.retryMs + Math.random() * 1_000);
      }
    }
  }
  return { value: await offline(), source: 'offline' }; // extractive / template / seed
}

// usage:
// const { value, source } = await withLadder(
//   [GEMINI.bulk, GEMINI.bulk2, ...GEMINI.reserve],
//   m => enrichBatch(m, batch),
//   () => extractiveEnrich(batch));
```

### 3.4 Embeddings: local (recommended) and Gemini (optional)
```ts
// pipeline (Node): Supabase/gte-small, 384-d, English, 34 MB q8
import { pipeline } from '@huggingface/transformers';
const extractor = await pipeline('feature-extraction', 'Supabase/gte-small', { dtype: 'q8' });
export async function embedLocal(texts: string[]): Promise<number[][]> {
  const out = await extractor(texts, { pooling: 'mean', normalize: true });
  return out.tolist() as number[][];
}
// multilingual alternative: 'Xenova/multilingual-e5-small' and prefix every text with 'query: '
```
```ts
// query time (Supabase Edge Function, Deno): built-in twin of the same model
const model = new Supabase.ai.Session('gte-small');
Deno.serve(async req => {
  const { text } = await req.json();
  const embedding = await model.run(text, { mean_pool: true, normalize: true });
  return Response.json({ embedding });
});
```
```ts
// optional Gemini path (one space for everything; re-embed all rows if you switch)
import { embed, embedMany } from 'ai';
import { google } from '@ai-sdk/google';
const em = google.embedding('gemini-embedding-2');
const { embeddings } = await embedMany({
  model: em,
  values: articles.map(a => `title: ${a.title} | text: ${a.lede}`), // document format from Google's guide
  dimensions: 768,        // -> outputDimensionality; auto-normalized by embedding-2
  maxParallelCalls: 2,    // provider sends <=100 values per batchEmbedContents call
  maxRetries: 0,
});
const { embedding: q } = await embed({ model: em, value: `task: search result | query: ${question}`, dimensions: 768 });
```

### 3.5 Two-host audio edition
```ts
import { generateSpeech } from 'ai';
import { google, type GoogleSpeechModelOptions } from '@ai-sdk/google';

export async function renderEpisode(turns: { host: 'Ayesha' | 'Omar'; text: string }[]) {
  const { audio } = await generateSpeech({
    model: google.speech('gemini-3.8-flash-lite-tts'),
    text: '', // `turns` replace the top-level text
    maxRetries: 0,
    providerOptions: {
      google: {
        multiSpeakerVoiceConfig: {
          speakerVoiceConfigs: [ // max 2 prebuilt voices
            { speaker: 'Ayesha', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Sulafat' } } },
            { speaker: 'Omar', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Charon' } } },
          ],
        },
        turns: turns.map(t => ({ text: t.text, speechMetadata: { speaker: t.host } })), // e.g. "<short pause>" allowed inline
      } satisfies GoogleSpeechModelOptions,
    },
  });
  return audio; // audio.uint8Array = complete WAV (24 kHz mono 16-bit), audio.mediaType = 'audio/wav'
}
// await supabase.storage.from('audio').upload(`${userId}/${date}.wav`, audio.uint8Array, { contentType: 'audio/wav', upsert: true });
```

### 3.6 "Ask your paper" route (context stuffing, streaming)
```ts
// app/api/ask/route.ts
import { streamText, convertToModelMessages, type UIMessage } from 'ai';
import { google } from '@ai-sdk/google';

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();
  const stories = await getTodaysEdition(req); // 20 enriched stories from Supabase
  const context = stories.map((s, i) =>
    `[S${i + 1}] ${s.headline} (${s.source}, ${s.publishedAt})\n${s.summary}\nWhy it matters: ${s.whyItMatters}`).join('\n\n');
  const result = streamText({
    model: google(await pickFirstUnblocked(['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite'])), // reads ai_usage
    maxRetries: 0,
    instructions: `You are this reader's morning paper. Answer ONLY from the stories below and cite them like [S3]. ` +
      `If the answer is not in them, say so and point to the closest story.\n\n${context}`,
    messages: await convertToModelMessages(messages), // async in v7
    onError: ({ error }) => console.error('ask-your-paper', error), // client falls back to FTS answer
  });
  return result.toUIMessageStreamResponse();
}
```

### 3.7 URL context, for an on-demand "summarize this link" feature only
```ts
import { generateText } from 'ai';
import { google } from '@ai-sdk/google';
const { text, providerMetadata } = await generateText({
  model: google('gemini-3.5-flash-lite'),
  maxRetries: 0,
  prompt: `Summarize in 70 words for a general reader, then one "why it matters" line: ${url}`,
  tools: { url_context: google.tools.urlContext({}) },
});
// providerMetadata?.google?.urlContextMetadata?.urlMetadata[].urlRetrievalStatus -> show source + link, never store full text
```

---

## 4. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Free-tier numbers are **unofficial, unguaranteed and have been cut before** (Flash went from ~250 to 20 RPD, per [3P] reports) | Pipeline stalls mid-day | Read the real numbers in AI Studio first. Plan ≤50% per bucket. Ladder + extractive fallback. Tier 1 as insurance. |
| **One project quota shared by every parallel agent and every pipeline re-run** | Quota gone before judging | `GEMINI_MODE=mock` with recorded fixtures by default. Enrich once per content hash. The `ai_usage` counter. Final runs after 12:00 PKT. |
| 2.5 models unavailable; `gemini-3.5-flash` and `gemini-3.7-flash` are redirect aliases | `404`, or a surprise quota bucket | Use only the ids in §3.1. Check each in the day-of test. |
| Billing enabled but project still metered as free tier | Paid limits never arrive | Check the tier badge in AI Studio. A `-FreeTier` quota id in the 429 is the tell. A 402 means the prepay balance is $0. |
| Free-tier prompts are "used to improve our products" | Privacy | Send only public article text and pseudonymous interest summaries. No emails or names. |
| Schema rejected or batch items dropped | Missing summaries | Flat schemas, everything required, enum labels with a string fallback, `structuredOutputs: false` escape hatch, id echo + re-queue. |
| `recitation` or safety blocks on summaries | Missing summaries | Treat as a failure: next rung, then extractive ≤2 sentences with attribution. |
| AI SDK's default 2 retries burn time and requests on daily-quota 429s | Slow, wasteful | `maxRetries: 0` everywhere. Our ladder honours `RetryInfo.retryDelay`. |
| TTS: Urdu unlisted, free quota unknown, latency unknown, 8.6 MB WAV | Broken audio demo | Pre-generate ≤5 English episodes. Web Speech API fallback. Optional MP3 transcode. |
| Mixed embedding spaces (gte vs e5 vs Gemini) or 3072-d vectors | Garbage similarity / no index | Store `embedding_model` per row. One model per deployment. ≤2,000 dims for a pgvector index. |
| Search grounding misuse (storing grounded results) | ToS violation | Don't use Search grounding for the paper. URL context only on demand, with attribution. |
| AI SDK v7 is new: `generateObject` and `system` deprecated; batch API experimental | Agents write v5-style code | Use the patterns in §3: `generateText` + `Output`, `instructions`, `generateSpeech`. |
| Some model prices double on 2026-12-01 (Argon) and 2027-01-01 (3.8 Flash, TTS) | Weaker "practical impact" cost story | Quote Flash-Lite costs, which have no scheduled increase. |

## 5. Open questions (resolve on the day)
1. The project's actual RPM, TPM and RPD per model (AI Studio). Do they match §1.2?
2. Does a 100-item `batchEmbedContents` count as 1 request or 100 against `gemini-embedding-2`'s RPD?
3. How many free-tier TTS requests per day for `gemini-3.8-flash-lite-tts`, and what is the wall-clock time for a 3-minute two-speaker clip?
4. Does Urdu text produce acceptable speech? (Hindi is listed; Urdu is not.)
5. Real per-call latency of 3.5 Flash-Lite with N=10 (affects pipeline wall clock and the chat feel).
6. Does Supabase Edge's `gte-small` produce vectors identical to transformers.js `Supabase/gte-small`? (cosine ≈ 1)

## 6. Sources

Official Google:
- [Models](https://ai.google.dev/gemini-api/docs/models) · [Gemini 3.5 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite) · [Gemini 3.1 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite) · [Gemini 3.8 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash) · [Gemini 3.6 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.6-flash) · [Gemini 4 Argon](https://ai.google.dev/gemini-api/docs/models/gemini-4-argon) · [Deprecations](https://ai.google.dev/gemini-api/docs/deprecations)
- [Rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) · [AI Studio rate-limit page](https://aistudio.google.com/rate-limit) · [Billing](https://ai.google.dev/gemini-api/docs/billing) · [Pricing (updated 2026-10-16)](https://ai.google.dev/gemini-api/docs/pricing) · [Troubleshooting](https://ai.google.dev/gemini-api/docs/troubleshooting) · [API errors](https://ai.google.dev/gemini-api/docs/api-errors)
- [Structured output](https://ai.google.dev/gemini-api/docs/structured-output) · [Thinking](https://ai.google.dev/gemini-api/docs/thinking) · [Batch API](https://ai.google.dev/gemini-api/docs/batch-api) · [Flex inference](https://ai.google.dev/gemini-api/docs/flex-inference) · [Caching](https://ai.google.dev/gemini-api/docs/caching) · [Explicit caching](https://ai.google.dev/gemini-api/docs/generate-content/caching)
- [Embeddings](https://ai.google.dev/gemini-api/docs/embeddings) · [Gemini Embedding 2](https://ai.google.dev/gemini-api/docs/models/gemini-embedding-2) · [Speech generation](https://ai.google.dev/gemini-api/docs/speech-generation) · [3.8 Flash TTS](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash-tts) · [3.8 Flash-Lite TTS](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash-lite-tts)
- [URL context](https://ai.google.dev/gemini-api/docs/url-context) · [Grounding with Google Search](https://ai.google.dev/gemini-api/docs/google-search) · [Gemini API terms](https://ai.google.dev/gemini-api/terms) · [Google APIs ToS §2(d)](https://developers.google.com/terms) · [Available regions](https://ai.google.dev/gemini-api/docs/available-regions)

AI SDK and libraries:
- [AI SDK Google provider](https://ai-sdk.dev/providers/ai-sdk-providers/google) · [Generating structured data](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data)
- npm: `ai@7.0.143`, `@ai-sdk/google@4.0.99`, `@huggingface/transformers@4.3.1` (typings and source inspected in scratch; nothing installed in the repo)
- [transformers.js](https://huggingface.co/docs/transformers.js) · [Supabase/gte-small](https://huggingface.co/Supabase/gte-small) · [thenlper/gte-small (MTEB table)](https://huggingface.co/thenlper/gte-small) · [intfloat/multilingual-e5-small](https://huggingface.co/intfloat/multilingual-e5-small) · [Xenova/all-MiniLM-L6-v2](https://huggingface.co/Xenova/all-MiniLM-L6-v2) · [Supabase AI models](https://supabase.com/docs/guides/functions/ai-models) · [Gemini Embedding paper](https://arxiv.org/abs/2503.07891)

Third party (unverified by Google):
- [dev.to: free tier measured (2026-09-02)](https://dev.to/romeroyang/geminis-free-tier-measured-20-requests-a-day-and-google-no-longer-publishes-the-number-4gf2)
- [Forum: 3.8 Flash free tier 20 RPD](https://discuss.ai.google.dev/t/gemini-3-8-flash-free-tier-20-rpd-is-too-limited-for-practical-evaluation/180609)
- [Forum: 3.8 Flash TTS 100 RPD enforced](https://discuss.ai.google.dev/t/gemini-3-8-flash-tts-api-enforces-100-rpd-despite-ai-studio-showing-10k-rpd/187223)
- [Forum: 429 with RetryInfo](https://discuss.ai.google.dev/t/gemini-api-429-resource-exhausted-error-on-tier-1/114413/18)
- [AI Free API: free tier overview (updated 2026-10-10)](https://www.aifreeapi.com/en/posts/google-gemini-api-free-tier)
- [TinkerLLM: free tier quotas](https://tinkerllm.com/blog/gemini-api-free-tier-limits-rate-quotas/)
