// buildEdition (§9.3): today's paper for one reader, built once per local day and stored.
//   profile → date (demo clock) → model (refolded) + pool (real-time window) → rank → persist → note later
// 0 LLM calls on this path: the template note is stored at once; Gemini's note follows via after().
import type { RecallQuestion } from '@/contracts/article';
import type { Edition, EditionReceipt } from '@/contracts/edition';
import type { RankingResult } from '@/contracts/engine';
import type { Presentation } from '@/contracts/profile';
import type { WeightDelta } from '@/contracts/signals';
import type { TopicNode, TopicSlug } from '@/contracts/taxonomy';
import { FIXTURE_EDITION } from '@/contracts/fixtures';
import { writeEditorNote } from '@/server/enrich';
import { loadRecentEvents, loadUserModel, refold, thetaOf, topicReadCounts } from '@/server/learn';
import { getProfile, isFixtureUser } from '@/server/profile';
import { DEFAULT_PARAMS, RANK_VERSION, rankWithCounts } from '@/server/rank';
import { getStreak } from '@/server/streaks';
import { localDate } from '@/server/time';
import {
  DbError,
  countEditionsBefore,
  deleteEditionItems,
  findEditionRow,
  insertEditionItems,
  previousEditionForRecall,
  snapshotBefore,
  updateEditionRow,
  upsertSnapshot,
  writeEditionRow,
} from './db';
import { deferNote } from './defer';
import { firstNameOf, templateNote } from './note';
import { loadCandidatePool } from './pool';
import { assembleEdition, getEdition, loadArticleCards, toEditionItems } from './read';
import { selectRecall } from './recall';
import { loadTaxonomy } from './taxonomy';

const MIN_MOVE = 0.02;
const DEFAULT_TZ = 'Asia/Karachi';
const r4 = (x: number) => Math.round(x * 10_000) / 10_000;

export interface PersistInput {
  userId: string;
  date: string;
  number: number;
  paperName: string;
  presentation: Presentation;
  ranking: RankingResult;
  recall: RecallQuestion[];
  note: string;
  receipt: EditionReceipt;
  snapshot: Record<TopicSlug, number>;
  upsert?: boolean; // replace an existing paper for that date (forced rebuild) instead of inserting
}

/**
 * Writes the edition row (template note), its 28 items and the day's interest snapshot. Returns the id.
 * Two round trips: the row, the snapshot and (on a rebuild) the old items' delete go together, then the items.
 */
export async function persistEdition(i: PersistInput & { existingId?: string }): Promise<string> {
  const [id] = await Promise.all([
    writeEditionRow(
      {
        user_id: i.userId,
        edition_date: i.date,
        number: i.number,
        paper_name: i.paperName,
        editor_note: i.note,
        editor_note_source: 'template',
        section_order: i.ranking.sectionOrder,
        lead_article_id: i.ranking.leadId,
        recall: i.recall,
        presentation: i.presentation,
        receipt: i.receipt,
        algo_version: RANK_VERSION,
        params: DEFAULT_PARAMS,
        pdf_path: null,
      },
      i.upsert === true,
    ),
    upsertSnapshot(i.userId, i.date, i.snapshot),
    i.upsert && i.existingId ? deleteEditionItems(i.existingId) : Promise.resolve(),
  ]);
  if (i.upsert && i.existingId !== id) await deleteEditionItems(id); // the upsert hit a row we had not seen
  const rows = [...i.ranking.items, ...i.ranking.reserve].map((r) => ({
    rank: r.rank,
    article_id: r.candidateId,
    slot: r.slot,
    section_slug: r.sectionSlug,
    tier: r.tier,
    score: r.score,
    breakdown: r.breakdown,
    reasons: r.reasons,
  }));
  await insertEditionItems(id, rows);
  return id;
}

/** θ̂ moves of at least `minMove` (0.02) between two snapshots, biggest first, named from the taxonomy. */
export function moversBetween(before: Record<TopicSlug, number> | null, after: Record<TopicSlug, number>, taxonomy: TopicNode[], max = 5, minMove = MIN_MOVE): WeightDelta[] {
  if (!before) return [];
  const names = new Map(taxonomy.map((t) => [t.slug, t.name]));
  return Object.keys(after)
    .filter((s) => typeof before[s] === 'number' && Math.abs(after[s] - before[s]) >= minMove && after[s] !== before[s])
    .map((s) => ({ slug: s, name: names.get(s) ?? s, before: before[s], after: after[s] }))
    .sort((a, b) => Math.abs(b.after - b.before) - Math.abs(a.after - a.before) || (a.slug < b.slug ? -1 : 1))
    .slice(0, max);
}

/** Another request is writing this paper (unique violation): wait for its items, then return it. */
async function waitForEdition(userId: string, date: string): Promise<Edition> {
  for (let k = 0; k < 10; k++) {
    const e = await getEdition(userId, date);
    if (e && e.items.length > 0) return e;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw Response.json({ error: 'edition_in_progress' }, { status: 503 });
}

export async function buildEdition(userId: string, now: Date, opts: { force?: boolean; awaitNote?: boolean } = {}): Promise<Edition> {
  if (isFixtureUser(userId)) return FIXTURE_EDITION;
  const t0 = performance.now();
  // §9.7 demo clock: `now` sets the date; the pool window and freshness never run ahead of real time.
  const realNow = new Date();
  const poolNow = now.getTime() <= realNow.getTime() ? now : realNow;
  const loadAll = (d: string) =>
    Promise.all([
      loadTaxonomy(),
      loadUserModel(userId, { targetDate: d }),
      loadRecentEvents(userId, now),
      loadCandidatePool(poolNow),
      previousEditionForRecall(userId, d),
      snapshotBefore(userId, d),
      countEditionsBefore(userId, d),
    ]);

  // One round trip for the profile and today's row: the date is guessed in the default timezone and
  // re-checked once the profile's timezone is known. A forced build also loads everything it needs
  // in that same round trip (it never returns early).
  const guess = localDate(now, DEFAULT_TZ);
  const [profile, guessed, speculative] = await Promise.all([getProfile(userId), findEditionRow(userId, guess), opts.force ? loadAll(guess) : null]);
  if (!profile) throw Response.json({ error: 'not_onboarded' }, { status: 409 });
  const date = localDate(now, profile.tz);

  const existing = date === guess ? guessed : await findEditionRow(userId, date);
  if (existing && !opts.force) {
    const stored = await getEdition(userId, date);
    if (stored) return stored;
  }

  const [taxonomy, model0, events, pool, recallSrc, prevSnap, countBefore] = speculative && date === guess ? speculative : await loadAll(date);
  const before = existing ? existing.number - 1 : countBefore;
  const model = { ...refold(model0, events, now, DEFAULT_PARAMS), presentation: profile.presentation };
  const ranking = rankWithCounts(model, pool, DEFAULT_PARAMS, `${userId}|${date}`, poolNow, taxonomy, topicReadCounts(events, now));
  if (ranking.items.length === 0) throw Response.json({ error: 'no_candidates' }, { status: 503 });

  const number = existing?.number ?? before + 1;
  const recall = selectRecall(recallSrc.prev, recallSrc.reads);
  const ranked = [...ranking.items, ...ranking.reserve];
  const byId = new Map(pool.map((c) => [c.id, c]));
  const snapshot = Object.fromEntries(taxonomy.map((t) => [t.slug, r4(thetaOf(model, t.slug, DEFAULT_PARAMS))]));
  const movers = moversBetween(prevSnap?.weights ?? null, snapshot, taxonomy);
  const note = templateNote({
    firstName: firstNameOf(profile.displayName),
    number,
    k: ranking.items.length,
    leadHeadline: byId.get(ranking.leadId)?.headline ?? '',
    movers,
  });
  // aiShare needs the cards, which load while the paper is written; the stored receipt is finalized below.
  const receipt: EditionReceipt = {
    buildMs: 0,
    articlesConsidered: pool.length,
    clustersConsidered: new Set(pool.map((c) => c.clusterId ?? `article:${c.id}`)).size,
    llmCallsThisEdition: 0,
    aiShare: { gemini: 0, extractive: 0 },
    algoVersion: RANK_VERSION,
  };

  const persist = (upsert: boolean, existingId?: string) =>
    persistEdition({ userId, date, number, paperName: profile.paperName, presentation: profile.presentation, ranking, recall, note, receipt: { ...receipt }, snapshot, upsert, existingId });
  const cardsP = loadArticleCards(
    ranked.map((r) => r.candidateId),
    ranked.map((r) => byId.get(r.candidateId)?.clusterId ?? null),
  );
  cardsP.catch(() => undefined); // awaited below; never an unhandled rejection if the write fails first
  let id: string;
  try {
    id = await persist(!!existing, existing?.id);
  } catch (e) {
    if (!(e instanceof DbError && e.code === '23505')) throw e;
    // Another request created today's paper between our read and our insert (double first open).
    // A plain open takes that paper; a forced build (rebuild, onboarding, seed) replaces it.
    if (!opts.force) return waitForEdition(userId, date);
    id = await persist(true, (await findEditionRow(userId, date))?.id);
  }
  const cards = await cardsP;
  receipt.buildMs = Math.round(performance.now() - t0);
  for (const r of ranking.items) {
    const c = cards.get(r.candidateId);
    if (c) receipt.aiShare[c.aiProvider] += 1;
  }

  const items = toEditionItems(
    ranked.map((r) => ({ rank: r.rank, article_id: r.candidateId, slot: r.slot, section_slug: r.sectionSlug, tier: r.tier, score: r.score, breakdown: r.breakdown, reasons: r.reasons })),
    cards,
  );
  const edition = await assembleEdition(
    {
      id,
      user_id: userId,
      edition_date: date,
      number,
      paper_name: profile.paperName,
      editor_note: note,
      editor_note_source: 'template',
      section_order: ranking.sectionOrder,
      lead_article_id: ranking.leadId,
      recall,
      presentation: profile.presentation,
      receipt,
      pdf_path: null,
      created_at: realNow.toISOString(),
      edition_items: null,
    },
    items,
    null,
  );

  // Gemini's note (and the final receipt) after the response; scripts and jobs wait for it.
  await deferNote(async () => {
    let written: { text: string; source: 'gemini' | 'template' } | null = null;
    try {
      const streak = await getStreak(userId, now, profile.tz).then((s) => s.current, () => 0);
      written = await writeEditorNote({
        paperName: profile.paperName,
        displayName: profile.displayName,
        date,
        number,
        headlines: edition.items.map((i) => ({ headline: i.article.headline, section: edition.sectionNames[i.sectionSlug] ?? i.sectionSlug })),
        movers,
        streak,
        preferSmart: profile.isDemo,
      });
    } catch (e) {
      console.error('[edition] writeEditorNote failed; keeping the template note', e);
    }
    await updateEditionRow(id, written ? { editor_note: written.text, editor_note_source: written.source, receipt } : { receipt });
    if (written) {
      edition.editorNote = written.text;
      edition.editorNoteSource = written.source;
    }
  }, opts.awaitNote === true);

  return edition;
}
