# W3 Learning: handoff

Status: ready for merge (branch `lane/W3-learning`, PR to `main`, not merged). Required feature #4: the paper measurably learns.

## Cause (one paragraph)

On the live pool the learner could not separate "she loves this" from "we showed her this", and the ranker could not use what it learned. (1) **Reward asymmetry.** A scroll-past cost a topic −0.05, while any open, even a 36% skim of a story she is lukewarm about, paid +0.30 plus up to +0.70 of dwell. So every topic the paper showed drifted upward: its Beta mean converged to about 0.77 whatever she thought of it. The seeded persona's top movers were Global Affairs and Pakistan Economy, topics she is indifferent to. (2) **Anisotropic embeddings.** gte-small vectors share one big direction (mean pairwise cosine 0.751 on the pool). So `cos(pos, e)` and `cos(neg, e)` came out almost the same for every story: on a simulated day 7 the similarity term was 0.205–0.221 and the negative term −0.126 to −0.133 across the whole pool. The 0.25 + 0.15 of score weight on taste was a constant, the MMR penalty was a constant, and the serendipity band never matched. With taste flat, the score was effectively 0.40·topic + 0.15·importance, and θ̂ moved too little (AI 0.32 → 0.33 in six days) to beat the day's big Trump stories. Both are fixed at the root: rewards that follow the signal semantics, and cosines taken around the pool's mean vector. No score weight changed (topic is still 0.40).

## Done

| Commit | What |
|---|---|
| `fix(rank): take every cosine around the pool's mean vector` | `src/server/rank/center.ts` (`poolMean`, `centerVec`, `centerSpace`), applied once at the top of `rankWithCounts`: candidates plus the reader's `pos`/`neg`/`engaged` are moved by the same mean (pool ≥ 20 embedded stories, `RANK_V1_FIXED.centerMinPool`). The pool's mean pairwise cosine goes from 0.751 to 0.010. Measured cost about 2 ms of a ~15 ms build (1000 × 384-d). |
| `fix(learn): rewards follow the signal semantics` | `DEFAULT_PARAMS.rewards.impression` −0.05 → −0.25, `open` +0.30 → 0. Impressions move the Beta only, never `pos`/`neg` (`RANK_V1_FIXED.betaOnlyTypes`). Net per story: scrolled past −0.25, skim ≈ 0, full read +0.45, skip −0.75, less −1.75. |
| `feat(sim): a stochastic, imperfect-self-report reader, measured over 5 seeds` | Reader model below. Common random numbers. `runSimulation` = mean of `SIM_SEEDS` (1..5). `runSimulationRuns` / `meanResult` / `simulateWeek` / `reactTo` exported. `scripts/simulate.ts` prints mean ± sd, the base rate and each arm's lift. |
| `docs: W3 rulings and handoff` | ARCHITECTURE §10.4 (reward rows plus three rulings), §10.5 (reader model, fairness); this file. |

**The simulated reader, stated plainly** (t = her true affinity for a story, a conf-weighted mean over its labels):
- Ayesha loves cricket (0.95) and AI (0.9), has a hidden interest in space (0.8), dislikes Pakistani showbiz (0.05). Everything else is mildly readable (0.30).
- Her onboarding is an imperfect self-report. She picks only Sports and Technical. She never picks Science, so space is hidden. She picked Sports for the cricket and rarely reads the rest of sport (0.15).
- For each story in her paper:
  - She sees it (one impression).
  - She opens it with p = σ(4·(t − 0.5)): 86% at 0.95, 31% at 0.30, 20% at 0.15.
  - If she opens it, she reads 1.2·t of the expected time × a lognormal factor (σ 0.35, cap 1.5×).
  - If she does not open it, she skips it with p = 0.25·(1 − t).
  - On a story she dislikes (t < 0.2) she taps "less" with p = 0.3.
  - She gives no other feedback: no saves, "more" or edits.
- **Fairness:** the three arms share the same pool (1000, seven contiguous slices by publish time), the same days, the same persona and the same seed. Her reaction to a story depends only on (seed, story), so two arms that show the same story get the same reaction. Only the learning arm updates its model. Day 1 is identical across learning and onboarding-only, which confirms it.

## Before / after (live pool, 1000 articles, `npx tsx --env-file=.env.local scripts/simulate.ts`)

**Before** (main at `7e28a16`, spec rewards, raw cosines, deterministic reader, one run, 16:00 PKT):

| day | learning p@20 | nDCG@10 | onboarding-only p@20 | nDCG@10 | popularity p@20 | nDCG@10 |
|---|---|---|---|---|---|---|
| 1 | 0.050 | 0.488 | 0.050 | 0.488 | 0.000 | 0.421 |
| 2 | 0.000 | 0.411 | 0.000 | 0.411 | 0.000 | 0.448 |
| 3 | 0.050 | 0.404 | 0.050 | 0.463 | 0.050 | 0.404 |
| 4 | 0.000 | 0.473 | 0.000 | 0.519 | 0.000 | 0.444 |
| 5 | 0.050 | 0.448 | 0.100 | 0.521 | 0.000 | 0.391 |
| 6 | 0.050 | 0.454 | 0.100 | 0.449 | 0.150 | 0.371 |
| 7 | 0.100 | 0.354 | 0.050 | 0.427 | 0.100 | 0.329 |

**After** (this branch, mean ± sd over seeds 1–5, same pool; "base" = what a randomly picked paper scores on average):

| day | base p@20 | learning p@20 | onboarding-only p@20 | popularity p@20 | random nDCG@10 | learning nDCG@10 | onboarding-only nDCG@10 | popularity nDCG@10 |
|---|---|---|---|---|---|---|---|---|
| 1 | 0.049 | 0.000 ± 0.000 | 0.000 ± 0.000 | 0.000 ± 0.000 | 0.453 | 0.344 ± 0.011 | 0.344 ± 0.011 | 0.452 ± 0.000 |
| 2 | 0.084 | 0.030 ± 0.040 | 0.030 ± 0.024 | 0.050 ± 0.000 | 0.449 | 0.421 ± 0.027 | 0.389 ± 0.019 | 0.458 ± 0.000 |
| 3 | 0.021 | 0.060 ± 0.020 | 0.010 ± 0.020 | 0.000 ± 0.000 | 0.496 | 0.566 ± 0.040 | 0.462 ± 0.025 | 0.477 ± 0.000 |
| 4 | 0.056 | 0.120 ± 0.024 | 0.050 ± 0.000 | 0.000 ± 0.000 | 0.417 | 0.504 ± 0.030 | 0.420 ± 0.019 | 0.375 ± 0.000 |
| 5 | 0.098 | 0.200 ± 0.000 | 0.070 ± 0.024 | 0.100 ± 0.000 | 0.421 | 0.534 ± 0.061 | 0.431 ± 0.009 | 0.356 ± 0.000 |
| 6 | 0.175 | 0.120 ± 0.040 | 0.070 ± 0.024 | 0.100 ± 0.000 | 0.435 | 0.482 ± 0.064 | 0.407 ± 0.000 | 0.336 ± 0.000 |
| 7 | 0.147 | 0.150 ± 0.055 | 0.090 ± 0.058 | 0.050 ± 0.000 | 0.440 | 0.524 ± 0.051 | 0.344 ± 0.028 | 0.372 ± 0.000 |

- **Day 7, learning vs onboarding-only:** p@20 0.150 vs 0.090 (+0.06, +67%). nDCG@10 0.524 vs 0.344 (+0.18, +52%).
- **Days 4–7 mean:** learning 0.148 / 0.511, onboarding-only 0.070 / 0.401, popularity 0.063 / 0.360, base 0.119 / 0.428.
- **Lift over the base rate on day 7 (p@20 / nDCG@10):** learning ×1.02 / ×1.19, onboarding-only ×0.61 / ×0.78, popularity ×0.34 / ×0.85.
- **Read honestly:**
  - Her broad picks put the onboarding-only paper *below* chance: most of Sports and Technical is what she rarely reads.
  - In a week, learning climbs back to about chance on p@20 and clearly above it on nDCG@10 (graded by affinity, top 10).
  - The day-7 p@20 gap is about one sd, so the nDCG@10 gap and the days 4–7 means are the stronger evidence.
  - Only 9% of this pool (90 of 1000) is something she truly likes, and day 4's slice holds 8.
- **Explore hits per day (mean):** 0.4 0.6 0.8 0.8 0.2 0.4 0.6.
- **Run time:** `runSimulation` (5 seeds) takes 1.9 s on the real pool, well under the route's `maxDuration` 60 s.

## Stubbed

Nothing new is stubbed. Not done in the time box:
- MMR λ and the explore budget were not tuned. Centring already changes both: the MMR penalty is no longer a constant, and serendipity can now match. Their effect was not measured on its own.
- The 0.40 / 0.15 topic / importance balance was left as specified.

## Env needed

None new. `scripts/simulate.ts` uses the existing Supabase admin env (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`). It makes no Gemini calls.

## Verify commands

| Command | Expected |
|---|---|
| `npx vitest run src/server/rank src/server/learn src/app/api/demo src/app/api/events src/server/edition src/server/stubs.test.ts src/server/streaks` | all green |
| `npx tsx --env-file=.env.local scripts/simulate.ts` | the 7-row mean ± sd table above (numbers move with the live pool), then the mean `SimulationResult` JSON |
| `npm run typecheck && npm run lint` | exit 0 |

## Contract requests

None. No `src/contracts/*` type, route or migration changed. `RankParams` is unchanged: the new constants live in `RANK_V1_FIXED`, the reward values in `DEFAULT_PARAMS.rewards`. `buildEdition`, `editInterest`, `processSignals` and the interest write path keep their signatures.

## Notes for other lanes / the integrator

- **`/api/demo/fast-forward` picks it up with no route change.** It calls `runSimulation`, which is now the mean of five seeded weeks, measured live on the pool. Its per-process cache (10 min, keyed by `days`) means a running server shows the new numbers within 10 minutes of deploy, or immediately after a restart. `exploreHits` is now a mean, so it can be fractional; the schema allows any number ≥ 0.
- **Demo persona (Ayesha): NOT re-seeded.** Her stored history was generated by the old reader and rewards. `buildEdition` replays her stored events through `refold` with `DEFAULT_PARAMS` on every build, so her live weights switch to the new rewards on her next build. Her stored snapshots and past editions stay as they were. Expect her /me movers to change after that build (indifferent topics such as Global Affairs move down instead of up). For a week that matches this simulator end to end, run `npx tsx scripts/seed-demo-persona.ts` and then `npm run demo:snapshot`, and re-render her PDFs. That is optional and the integrator's call.
- **L4 / L7:** the "Because you read" chip (`similarChipMinCos` 0.55) now reads centred cosines, so it appears less often and only for close matches. Before, nearly every pair of stories cleared 0.55.
- **Risks:** see the PR. In short: the ground truth inherits zero-shot label noise (rugby and football stories labelled `sports.cricket` count as liked); the reader model is ours (assumed, not fitted to real logs); single-day p@20 is noisy at 20 slots.
