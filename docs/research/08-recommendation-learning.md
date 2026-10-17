# 08 · Personalization and learning for the Daily Top 20

Owner: research agent 08 · 2026-10-17 · Optimizes for **Model/Algorithm Efficiency** and **Req. 4 (visible learning)**.

## TL;DR
- **Use a content-based, event-sourced, explainable model. Skip deep learning and per-user LLM ranking.** Each item gets an embedding plus taxonomy labels, computed once at ingest. Each user gets a **Beta(α, β) per taxonomy node** plus a **profile embedding** (a decayed moving average of what they engaged with). Every number can be explained in one sentence.
- **Score = topic affinity + embedding similarity − "less like this" similarity + cross-source importance + freshness.** Then select: one item per story cluster, **MMR** for diversity, a cap per section, **2 Thompson-sampling exploration slots**, 1 serendipity slot and 1 "big story" slot.
- **Onboarding sets the Beta priors directly.** A picked leaf starts at Beta(3,1), a picked broad area at Beta(2,1), anything unpicked at a pessimistic Beta(1,3). Weights flow parent to child at 0.5x and child to parent at 0.3x. The same Beta numbers serve as the exploit weight (mean) and the exploration sampler. One structure does both jobs.
- **The paper changes its layout too.** Section order follows affinity. The lead story is the highest score times importance. Summary depth (brief, standard or deep) is chosen per item from affinity. All three summary lengths are generated **once per article**, so personalization costs no extra LLM calls per user.
- **Cost per user per day is about 2M multiply-adds, under 10 ms in plain TypeScript.** Do it in memory with `Float32Array`. pgvector is optional: exact search is its default, and HNSW buys nothing below roughly 10k candidates.
- **Prove learning with a seeded simulated reader over 7 days.** The persona has a hidden "true" taste and receives only broad onboarding. Plot daily precision@20 and nDCG@10 for *learning* against an *onboarding-only* baseline, and add a time-lapse of the interest map. Build this into the app as a "fast-forward 7 days" demo button.

## Findings (what current practice says, and what we take from it)
1. **Understanding the content is what drives news recommendation.** MIND (Microsoft News, about 1M users and more than 160k English articles with title, abstract and body) concluded that performance "depends heavily on" how well systems understand news content and model user interests, and that pretrained language models help. *Take:* represent items with a sentence embedding, not item IDs. News items live too briefly for collaborative filtering, and we have no user base anyway. Source: MIND, ACL 2020.
2. **The 2024-2026 trend is LLM encoders plus LLM reranking.** Examples: LECOP (an LLM embedding plus co-occurrence, arXiv 2411.06046), LLM4Rerank (balancing accuracy, diversity and fairness, 2406.12433), and LLM-assisted reranking evaluated on MIND (2606.02883). The surveyed abstracts mention scalability and personalization costs. *Take:* use the LLM **per article** (summaries, labels, entities), never per user × article. An optional LLM rerank of the top 40 is a stretch goal.
3. **Bandits are the industry standard for exploration.** Yahoo's LinUCB news work reported a 12.5% CTR lift over a non-contextual baseline (per secondary summary; original arXiv 1003.0146). Chapelle and Li (2011) found Thompson sampling competitive on Yahoo news and more robust under delayed feedback. Eugene Yan's survey adds three practical lessons: Deezer found **pessimistic priors** better, Deezer found **semi-personalized (clustered) bandits** better than fully personalized ones because each gets more feedback, and Schibsted injects about **5% random items**. *Take:* run Thompson sampling over *taxonomy nodes*, not items, to pool feedback. Use pessimistic priors for unpicked topics and keep exploration to a fixed 2-3 of the 20 slots.
4. **Dwell time beats clicks as a relevance signal.** Yi et al., "Beyond Clicks", won the RecSys 2014 best paper award and normalize dwell time across devices and contexts. A Yahoo summary reports that dwell correlates with length up to about 1,000 words. *Take:* normalize dwell by *expected read time* (words ÷ 230 wpm, our assumption) and cap it, so long items don't dominate.
5. **Diversity: MMR is the standard baseline and calibration is the principled upgrade.** Session-based news studies use MMR as their re-ranking baseline (arXiv 2102.03265). Embeddings increase relevance but also homogeneity. Steck's *Calibrated Recommendations* (RecSys 2018) greedily matches the list's topic mix to the user's mix using KL divergence. *Take:* minimal scope is MMR plus a cap per section. Stretch is a calibration term.
6. **Vector infrastructure.** By default pgvector does exact nearest-neighbour search, which has perfect recall. HNSW gives better speed and recall than IVFFlat but builds more slowly and uses more memory. `<=>` is cosine distance. `vector` columns can be indexed up to 2,000 dimensions. One small-corpus report found HNSW *slower* than a linear scan at about 1k rows (not pgvector, so treat as directional). *Take:* our daily candidate pool is about 300-1,000 items, so brute force in memory wins.
7. **Embedding options.** OpenAI `text-embedding-3-small` defaults to 1536 dimensions and accepts a `dimensions` parameter (about $0.02 per 1M tokens, derived from 62,500 pages per dollar). `Xenova/all-MiniLM-L6-v2` produces 384-dimension vectors locally through `@huggingface/transformers` with no key or rate limit. I found no Node benchmark, so speed is unverified. *Take:* the algorithm works with any dimension. Default to 384 dimensions (either MiniLM, or 3-small with `dimensions: 384`) so vectors are small and fast.

## Recommended design

### 1. Item representation (precomputed at ingest, shared by all users)
| Field | How | Why |
|---|---|---|
| `embedding` (384-d, L2-normalized) | embed `title + " — " + lede` | similarity, MMR, clustering |
| `labels[] {nodeId, conf}` (1-3 nodes) | cosine to **taxonomy-node embeddings** (embed "label: description" once); keep the top 3 with conf = softmax(cos/0.05); optional LLM override | cheap and offline, no LLM needed |
| `entities[]` | from the existing LLM summary call (JSON) | "Because you follow X", stretch |
| `cluster_id` | leader clustering: join a cluster if cos(e, centroid) ≥ **0.82** within 36 h, else start a new one | dedup plus importance |
| `importance` | `log(1+distinctSources)/log(1+maxDistinctSourcesToday)`, in [0,1] | cross-source "big story" signal |
| `fresh(t)` | `exp(-ageHours/24)` | morning-paper recency |
| `summary_{brief,std,deep}` | **one** LLM call per article returns all three (about 25 / 60 / 120 words) | adapts presentation at zero cost per user |
| `word_count`, `source_id` | parser | dwell normalization, source affinity |

### 2. Cold start from hierarchical onboarding
- The taxonomy has 3 levels (Area → Field → Topic, e.g. Technical → Computer Science → Web Dev). Each node stores `{alpha, beta, prior_alpha, prior_beta}` per user.
- Priors: picked leaf **(3,1)**, picked mid/broad node **(2,1)**, unpicked **(1,3)**. Unpicked children of a picked parent get the pessimistic prior plus propagation: `α_child += 0.5·(α_parent − 1)`.
- Effective affinity of a leaf blends in its ancestors: `θ̂(L) = 0.6·m(L) + 0.3·m(parent) + 0.1·m(grandparent)`, with `m = α/(α+β)`. A reader who only picked "Science" therefore still gets reasonable scores for "Astronomy".
- Cold-start profile embedding: `p_u = normalize(Σ_picked w_node · e_node)`, using the taxonomy-node embeddings. This means similarity works from day 1.

### 3. User model
- `user_interests(node)`: a Beta(α, β). The mean is the exploit weight and a sample is the exploration draw.
- `p_u` (positive profile) and `n_u` (negative profile): EMAs of item embeddings. Update with `p ← normalize((1−η r)·p + η r·e)`, where η = 0.10 and r is the reward clipped to [0,1]. For negatives, update `n_u` with |r| at η = 0.15.
- **Event-sourced:** the model is a deterministic `fold(events)` from the priors. A nightly or on-demand recompute keeps it decayed and replayable, which is exactly what the demo time-lapse needs. Keep an incremental update on each event too, so changes show instantly.
- **Time decay:** each event is weighted by `0.5^(ageDays/14)`, a **14-day half-life**. Old evidence fades back toward the onboarding prior, not toward zero.
- `depth_pref ∈ {-1, 0, +1}`: the reader's median normalized dwell. Above 1.2 means they read deep, so bump the summary tier. Below 0.5 means they skim, so lower it.

### 4. Signals and rewards (defaults; tune with the simulator)
| Event | Reward r | Notes |
|---|---|---|
| impression (≥1 s in viewport, not opened) | −0.05 | only for positions the reader actually saw |
| open (expand the byte) | +0.30 | |
| dwell | +0.70 · min(1, dwell / expected) | expected = max(8 s, words/230 wpm); dwell under 3 s counts as a bounce, −0.10 |
| read-original click | +0.60 | strong intent |
| save / share | +1.00 | |
| "More like this" | +1.50 | explicit |
| "Less like this" | −1.50 | also updates `n_u` |
| skip / dismiss | −0.50 | |
| quiz correct / wrong | +0.40 / +0.10 | proves a read, nudges depth up |
| PDF download | +0.05 to every edition item | weak, but counts for the streak |

Update rule for each label of the item: `if r>0: α += r·conf·decay` and `if r<0: β += |r|·conf·decay`. The parent gets 0.3x of the update and the grandparent 0.1x. A source Beta gets the same update at 0.5x (stretch).

### 5. Candidate scoring
```
s(u,i) = 0.40·T(u,i) + c_u·0.25·cos(p_u,e_i) − 0.15·max(0,cos(n_u,e_i))
       + 0.15·importance_i + 0.15·fresh_i + 0.05·S(u,src_i)
T(u,i) = Σ_l conf_l · θ̂(l)        c_u = min(1, nEngaged/10)
```
`c_u` gives a visible handover. On day 1 the paper runs on onboarding topics. As reading accumulates, the embedding term ramps up and catches fine-grained taste below the taxonomy. Keep all weights in a `params` JSON so they can be versioned on each edition.

### 6. Selecting the 20
```ts
function buildEdition(u: UserModel, pool: Item[], rng: Rng): EditionItem[] {
  const fresh = pool.filter(i => !u.seenIds.has(i.id) && !u.dismissedClusters.has(i.clusterId));
  const scored = fresh.map(i => ({ i, s: score(u, i), why: reasons(u, i) }));
  const best = bestPerCluster(scored);                    // dedup: 1 item per story cluster
  const short = topK(best, 200);                          // shortlist
  const out: Pick[] = [];
  out.push(pickBigStory(best));                           // slot: top importance overall (civic "must know")
  out.push(...pickExplore(u, best, rng, 2));              // slots: Thompson over nodes the user does NOT rank top-5
  out.push(pickSerendipity(u, best));                     // slot: cos(p_u,e) in [0.25,0.45], unseen Area, importance>=0.4
  while (out.length < 20) {                               // MMR, λ=0.7, max 5/Area, max 3/source
    const c = argmax(short.filter(ok(out)), x => 0.7*x.s - 0.3*maxCos(x.i, out));
    out.push({ ...c, slot: 'core' });
  }
  return layout(u, out);                                  // lead, section order, depth tier
}
function pickExplore(u, items, rng, k) {
  const nodes = u.nodes.filter(n => !u.top5.has(n.id) && n.depth <= 2)
    .map(n => ({ n, draw: rng.beta(n.alpha, n.beta) })).sort(byDrawDesc).slice(0, k);
  return nodes.map(({ n }) => bestBy(items.filter(i => hasLabel(i, n.id)), i => i.importance + i.fresh))
              .map(p => ({ ...p, slot: 'explore' }));
}
```
- Exploration uses a **seeded RNG** (`hash(userId + date)`), so an edition can be reproduced and the archive stays stable.
- If an explore slot turns out to be a hit, the posterior moves fast. A Beta(1,3) prior with one save becomes Beta(2,3), and the node starts competing for core slots.
- Complexity: scoring is N×d ≈ 1,000×384 ≈ 0.4M MACs. MMR is 20×200×384 ≈ 1.5M. Clustering is incremental at ingest. Total build time is well under 10 ms of CPU.

### 7. Presentation adapts per reader
- **Lead:** among items with importance ≥ 0.5, pick the highest `s·(1+importance)`. If there are none, use the top core item. The lead gets the PDF's hero block and the deep summary.
- **Section order:** group by Area and order sections by `Σ s` of their items. A reader who loves Science opens on Science. The serendipity, explore and big-story slots sit together in a "Beyond your usual" box. This box is the visible home of requirement 5.
- **Depth tier per item:** `tier = θ̂ ≥ 0.70 ? deep : θ̂ ≥ 0.40 ? std : brief`, shifted by `depth_pref`. In the PDF, deep items get large boxes, std items get column stories, and brief items go to an "In Brief" rail.
- **Summary length** is therefore personal without any LLM call per user.

### 8. Explainability (stored on each edition item as `reason` JSON)
| Code | Chip text |
|---|---|
| `similar` (nearest engaged item in the last 14 days, cos ≥ 0.55) | "Because you read *Rust 2.0 lands*" |
| `topic` (dominant label, θ̂) | "You follow **AI policy** · 82%" |
| `explore` | "Trying something new: **Astronomy**. Keep it?" (👍 / 👎) |
| `serendipity` | "A step outside your usual" |
| `bigstory` | "Covered by 9 sources today" |

Add a **score-breakdown drawer** ("Why this story?") with one bar per term of `s(u,i)`, plus an **Interest Map** page: a sunburst or tree of θ̂ with week-over-week deltas, built from `interest_snapshots`.

### 9. Efficiency and architecture
- **Precompute (O(items), shared):** embeddings, labels, clusters, the three summaries, importance. **Per user (O(N·d)):** scoring and selection when the reader first opens the edition, or a 05:00 PKT cron. The result is written to `editions` and `edition_items`, which are immutable and serve as the archive.
- **Events:** store raw rows (POST under 50 ms) and apply the incremental α/β/EMA update in the same request. Run the full decayed refold at edition build. That is O(events_user) for us, roughly hundreds of rows.
- **Vectors:** use the `vector(384)` column if the DB is Postgres with pgvector (handy for "More like this" via `ORDER BY embedding <=> $1 LIMIT 10`, exact). Otherwise use JSON `real[]` and in-memory `Float32Array`. Targets: build p95 under 300 ms including DB reads, CPU under 10 ms.
- **Offline fallback:** if embeddings are unavailable, set `c_u = 0`, drop MMR to label-based diversity (Jaccard of labels), and the paper still works from taxonomy weights alone.

### 10. Data model (shared contract; one commit, announce in HANDOFF)
```
taxonomy_nodes(id PK, parent_id FK null, slug, label, depth 0..2, description, embedding vector(384))
sources(id PK, name, domain, quality_prior real default 0.5)
story_clusters(id PK, centroid vector(384), first_seen_at, source_count int, article_count int, importance real)
articles(id PK, url, canonical_url UNIQUE, source_id FK, title, lede, image_url, published_at, fetched_at,
         word_count int, embedding vector(384), entities jsonb, cluster_id FK,
         summary_brief text, summary_std text, summary_deep text)
article_labels(article_id FK, node_id FK, conf real, PK(article_id,node_id))
user_interests(user_id FK, node_id FK, alpha real, beta real, prior_alpha real, prior_beta real,
               picked bool, updated_at, PK(user_id,node_id))
user_profiles(user_id PK, pos_emb vector(384), neg_emb vector(384), n_engaged int, depth_pref int, updated_at)
events(id PK, user_id, edition_id, article_id null, type enum(impression,open,dwell,original,save,share,
       more,less,dismiss,quiz,pdf), value real null /*dwell ms | 1/0 quiz*/, position int, created_at)
editions(id PK, user_id, edition_date, built_at, algo_version text, params jsonb, pdf_url, UNIQUE(user_id,edition_date))
edition_items(edition_id FK, rank int, article_id FK, section_node_id FK, slot enum(lead,core,explore,serendipity,bigstory),
              score real, breakdown jsonb, reason jsonb, tier enum(brief,std,deep), PK(edition_id,rank))
interest_snapshots(user_id, snap_date, weights jsonb /*nodeId->θ̂*/, PK(user_id,snap_date))
```

### 11. Demonstrating learning (for the 5-minute video)
1. **Simulated reader (`npm run simulate`).** Persona "Ayesha" has a hidden true-affinity vector over leaves (loves Cricket, AI, Urdu literature; dislikes Celebrity). She onboards with only *Sports* and *Technical*. Each day, build an edition from that day's seeded corpus. She opens an item with probability `σ(4·(true−0.5))`, with dwell drawn from her affinity and a "less" on items she dislikes. Run with a fixed seed for 7 days.
2. **Metrics per day:** precision@20 (share of items whose true affinity is ≥ 0.6), nDCG@10 on the *next* day's held-out simulated clicks, intra-list diversity (1 − mean pairwise cos), and explore hit-rate. Plot **learning vs onboarding-only vs popularity-only** on one chart, so the gap *is* the proof. Record the actual numbers; don't promise a target.
   - `nDCG@k = DCG/IDCG`, where `DCG = Σ_{r=1..k} rel_r / log2(r+1)`.
3. **Visuals:** the interest-map sunburst time-lapse (day 1 to day 7), the edition's front page on day 1 next to day 7, and the "Learning receipt" box in the PDF ("This week I learned: +Cricket, +AI policy, −Celebrity; 2 explorations kept").
4. **In-app "Fast-forward 7 days"** on the demo account replays the simulator's events, so judges can watch it happen live without network access.
5. *Stretch:* replay real held-out clicks from MIND-small through the same scorer for one external nDCG/AUC number. The dataset's size and licence for this use are unverified.

### 12. Failure modes and mitigations
| Risk | Mitigation |
|---|---|
| Filter bubble / homogeneity | MMR (λ = 0.7), max 5 per Area, 2 explore + 1 serendipity slots, decay back to prior; stretch: Steck calibration term |
| Popularity bias | importance capped at weight 0.15 and log-scaled; big-story slot is exactly one |
| Feedback loop / position bias | negatives only from viewed impressions, at −0.05; explore slots supply less biased data; stretch: weight impression negatives by `1/log2(pos+1)` |
| Over-reacting to one click | small rewards against prior mass; Beta means move gradually; EMA η = 0.1 |
| Topic drift or a stale profile | 14-day half-life; explicit More/Less is ±1.5; Interest Map lets the reader edit weights (written as explicit events) |
| Duplicate stories | one item per cluster; "also covered by N sources" chip |
| Learning that's invisible in the demo | simulator plus seeded corpus plus reason chips plus learning receipt |

## Recommendations for our build (ranked)
1. **Freeze the contract first:** tables above plus TS types `Item`, `UserModel`, `EditionItem`, `Reason`, `Params`. *0.5 h*
2. **Scoring and selection module** as a pure TS library (`lib/reco/`) with no I/O: `score`, `bestPerCluster`, `mmr`, `pickExplore`, `pickSerendipity`, `layout`, a seeded RNG and a Beta sampler (gamma ratio via Marsaglia-Tsang). Unit-test it for determinism. *1.25 h*
3. **User model:** onboarding to priors with propagation, `applyEvent` (incremental), `refold(events)` with decay, EMA profiles, `interest_snapshots` written at edition build. *0.75 h*
4. **Item enrichment hooks at ingest:** embed, label by nearest taxonomy node, leader clustering, importance, and the 3-tier summary JSON in the existing summary call. Coordinate with the ingestion workstream. *1.0 h*
5. **Event capture on the web edition:** IntersectionObserver for impressions and dwell (pause on `visibilitychange`), open, original, save, share, more/less, dismiss, quiz, pdf. Send via `navigator.sendBeacon`. *0.75 h*
6. **Explainability:** reason chips, a "Why this story?" breakdown drawer, Interest Map data endpoint. The UI is owned by the frontend workstream. *0.75 h*
7. **Simulator and metrics script** plus a JSON output that feeds a chart and the "Fast-forward 7 days" button. *1.0 h*
8. **Presentation adaptation in the PDF:** pass `tier`, `slot` and section order to the PDF template. *0.25 h on the reco side*

**Minimal (about 3 h, items 1-5):** Beta topic weights with priors, rewards, the scoring formula, cluster dedup, MMR with caps, 2 explore slots, tiers and section order. **Stretch:** negative embedding, source affinity, calibration (KL) term, position-bias weighting, LLM rerank of the top 40 into an "editor's note", NL tuning, MIND-small offline evaluation.

## Innovation ideas
- **Fast-forward 7 days** button: a live simulated reader shows the paper evolving on stage (wow 5, about 1.5 h).
- **Learning receipt** printed in each PDF: what the paper learned about you this week (wow 4, 0.5 h).
- **Talk to your editor:** "less cricket, more climate tech" is mapped by an LLM to node deltas, stored as explicit events and shown on the Interest Map (wow 4, 1.5 h).
- **Interest-map time-lapse** sunburst with confidence rings from Beta variance (wow 4, 1.5 h).
- **"Why this story?"** score-breakdown bars on every card (wow 3, 0.75 h).
- **Taste-test cards:** explore slots show the Beta posterior as a "confidence we're right" meter, with a one-tap verdict (wow 3, 1 h).

## Risks
- **Embedding provider availability:** if no API key is set or the API is rate-limited, use local MiniLM. If both fail, the taxonomy-only path is ready. The local model download size and Node speed are unverified.
- **Not enough dated articles to simulate 7 real days.** Fallback: split one seeded corpus into 7 pseudo-days by `published_at` order.
- **Badly tuned rewards or priors** make learning either invisible (too slow) or jumpy. Tune with the simulator before recording.
- **Noisy dwell on mobile** (backgrounded tabs). Pause timers on `visibilitychange` and cap at 2× expected.
- **Taxonomy-label quality** from nearest-node cosine may be weak for short titles. Embed title plus lede, and allow an LLM override.
- **Scope creep** into an LLM reranker or MIND evaluation. These are stretch only.

## Open questions (team decisions)
- Embedding source: local MiniLM (offline-safe) or OpenAI `text-embedding-3-small` at 384 dimensions?
- Build editions with a 05:00 PKT cron, on first open, or both?
- Does a swipe-skip count as a dismiss (−0.5) or only as an unclicked impression (−0.05)?
- Do readers see the numeric score breakdown, or only the chips?
- Is the DB Postgres with pgvector (for example Supabase), or SQLite/JSON?

## Sources
- MIND dataset (ACL 2020): https://aclanthology.org/2020.acl-main.331/
- pgvector README: https://github.com/pgvector/pgvector
- Bandits for recommender systems (Eugene Yan): https://eugeneyan.com/writing/bandits/
- Chapelle & Li, An Empirical Evaluation of Thompson Sampling (NeurIPS 2011): https://proceedings.nips.cc/paper_files/paper/2011/file/e53a0a2978c28872a4505bdb51db06dc-Paper.pdf
- Li et al., contextual bandit (LinUCB) for news: https://arxiv.org/abs/1003.0146
- Yi et al., Beyond Clicks: Dwell Time for Personalization (RecSys 2014 session): https://recsys.acm.org/recsys14/session-metrics-evaluation/
- Yahoo dwell-time summary: https://martech.org/yahoo-scientists-measure-dwell-time-alternative-click-rate
- Diversification in session-based news RS (MMR baseline): https://arxiv.org/abs/2102.03265
- Calibrated Recommendations survey (describes Steck 2018): https://arxiv.org/html/2507.02643v1
- Recommenders with a Mission (news diversity metrics): https://research.tudelft.nl/en/publications/recommenders-with-a-mission-assessing-diversity-in-news-recommend
- LLM4Rerank: https://arxiv.org/abs/2406.12433 · LLM-assisted reranking (MIND appendix): https://arxiv.org/pdf/2606.02883 · LECOP: https://arxiv.org/abs/2411.06046 · Recall ceiling of LLM reranking (title only, unverified content): https://arxiv.org/pdf/2609.27953
- OpenAI embeddings guide: https://developers.openai.com/api/docs/guides/embeddings
- Xenova/all-MiniLM-L6-v2 (transformers.js): https://huggingface.co/Xenova/all-MiniLM-L6-v2
