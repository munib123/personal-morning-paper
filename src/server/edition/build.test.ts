import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditionSchema } from '@/contracts/api';
import type { RecallQuestion } from '@/contracts/article';
import type { Candidate } from '@/contracts/engine';
import { FIXTURE_EDITION, FIXTURE_PROFILE, FIXTURE_STREAK, FIXTURE_TAXONOMY, FIXTURE_USER_ID } from '@/contracts/fixtures';
import type { Profile } from '@/contracts/profile';
import type { LoggedEvent } from '@/server/learn';
import { makeInterests, makePool, makeUser } from '@/server/rank/__fixtures__/factory';
import type { ArticleRow } from './hydrate';
import type { EditionRow } from './db';

const U = '6f1c2a9e-2222-4c4c-9d9d-000000000002';
const REAL = new Date('2026-10-17T02:00:00Z'); // 07:00 PKT

const h = vi.hoisted(() => ({
  profile: null as Profile | null,
  pool: [] as Candidate[],
  events: [] as LoggedEvent[],
  existing: null as { id: string; number: number } | null,
  stored: null as EditionRow | null,
  writeError: null as Error | null,
  recall: { prev: [], reads: [] } as { prev: { articleId: string; rank: number; recall: RecallQuestion | null }[]; reads: { articleId: string; at: string }[] },
  scheduled: [] as (() => Promise<void>)[],
}));

vi.mock(import('next/server'), async (orig) => ({ ...(await orig()), after: vi.fn((fn: () => Promise<void>) => void h.scheduled.push(fn)) as never }));
vi.mock(import('@/server/profile'), async (orig) => ({ ...(await orig()), getProfile: vi.fn(async () => h.profile) }));
vi.mock(import('@/server/learn'), async (orig) => ({
  ...(await orig()),
  loadUserModel: vi.fn(async (userId: string) => makeUser({ userId, interests: makeInterests(['sports', 'technical']) })),
  loadRecentEvents: vi.fn(async () => h.events),
}));
vi.mock(import('@/server/rank'), async (orig) => {
  const mod = await orig();
  return { ...mod, rankWithCounts: vi.fn(mod.rankWithCounts) };
});
vi.mock(import('./pool'), async (orig) => ({ ...(await orig()), loadCandidatePool: vi.fn(async () => h.pool) }));
vi.mock(import('./taxonomy'), () => ({ loadTaxonomy: vi.fn(async () => FIXTURE_TAXONOMY), loadTopicEmbeddings: vi.fn(async () => ({})) }));
vi.mock(import('@/server/enrich'), async (orig) => ({ ...(await orig()), writeEditorNote: vi.fn(async () => ({ text: 'A note from your editor.', source: 'gemini' as const })) }));
vi.mock(import('@/server/streaks'), async (orig) => ({ ...(await orig()), getStreak: vi.fn(async () => FIXTURE_STREAK) }));
vi.mock(import('@/server/pdf'), async (orig) => ({ ...(await orig()), getEditionPdfUrl: vi.fn(async () => null) }));
vi.mock(import('./db'), async (orig) => {
  const mod = await orig();
  return {
    ...mod,
    findEditionRow: vi.fn(async () => h.existing),
    readEditionRow: vi.fn(async () => h.stored),
    countEditionsBefore: vi.fn(async () => 2),
    previousEditionForRecall: vi.fn(async () => h.recall),
    snapshotBefore: vi.fn(async () => ({ date: '2026-10-16', weights: { sports: 0.5, 'sports.cricket': 0.3 } })),
    fetchArticleRows: vi.fn(async (ids: string[]) => ids.map(articleRow)),
    fetchClusterSources: vi.fn(async () => new Map<string, string[]>()),
    writeEditionRow: vi.fn(async () => {
      if (h.writeError) throw h.writeError;
      return 'ed-new';
    }),
    deleteEditionItems: vi.fn(async () => undefined),
    insertEditionItems: vi.fn(async () => undefined),
    upsertSnapshot: vi.fn(async () => undefined),
    updateEditionRow: vi.fn(async () => undefined),
  };
});

const db = await import('./db');
const pool = await import('./pool');
const rank = await import('@/server/rank');
const enrich = await import('@/server/enrich');
const next = await import('next/server');
const { buildEdition } = await import('./build');

function articleRow(id: string): ArticleRow {
  const c = h.pool.find((x) => x.id === id);
  return {
    id,
    url: `https://www.dawn.com/news/${id}`,
    source_id: c?.sourceId ?? 'dawn',
    title: c?.headline ?? id,
    headline: c?.headline ?? null,
    lede: 'Lede.',
    summary_brief: 'Brief.',
    summary_std: 'Std.',
    summary_deep: 'Deep.',
    why_it_matters: null,
    key_fact: 'Fact.',
    image_url: c?.hasImage ? 'https://img/x.jpg' : null,
    published_at: c?.publishedAt ?? REAL.toISOString(),
    word_count: c?.wordCount ?? 300,
    labels: c?.labels ?? [],
    cluster_id: c?.clusterId ?? null,
    enrich_provider: Number(id.slice(1)) % 4 === 0 ? 'extractive' : 'gemini:gemini-3.5-flash-lite',
    recall: { question: `About ${id}?`, options: ['a', 'b', 'c'], answerIndex: 1, explanation: 'E.' },
    ur: null,
    sources: { name: `Source ${c?.sourceId}`, homepage: 'https://www.dawn.com', url: 'https://www.dawn.com/feed' },
  };
}

const q = (articleId: string): RecallQuestion => ({ articleId, question: `Q ${articleId}?`, options: ['x', 'y', 'z'], answerIndex: 0, explanation: 'E' });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(REAL);
  h.profile = { ...FIXTURE_PROFILE, userId: U, displayName: 'Ayesha Khan', isDemo: false };
  h.pool = makePool(300, { now: REAL });
  h.events = [];
  h.existing = null;
  h.stored = null;
  h.writeError = null;
  h.recall = { prev: [], reads: [] };
  h.scheduled = [];
  vi.clearAllMocks();
});
afterEach(() => {
  vi.useRealTimers();
});

const storedRow = (p: Partial<EditionRow> = {}): EditionRow => ({
  id: 'ed-0',
  user_id: U,
  edition_date: '2026-10-17',
  number: 3,
  paper_name: 'The Morrow',
  editor_note: 'Stored note.',
  editor_note_source: 'template',
  section_order: ['sports'],
  lead_article_id: 'p0001',
  recall: [],
  presentation: { timeBudget: 15, depth: 'basics', lang: 'en' },
  receipt: { buildMs: 40, articlesConsidered: 300, clustersConsidered: 120, llmCallsThisEdition: 0, aiShare: { gemini: 15, extractive: 5 }, algoVersion: 'rank-v1' },
  pdf_path: null,
  created_at: '2026-10-17T02:00:00+00:00',
  edition_items: [{ rank: 1, article_id: 'p0001', slot: 'lead', section_slug: 'sports', tier: 'deep', score: 0.6, breakdown: FIXTURE_EDITION.items[0].breakdown, reasons: [] }],
  ...p,
});

describe('buildEdition', () => {
  it('builds 20 + 8, writes the edition, items and snapshot, and passes the Edition contract', async () => {
    const e = await buildEdition(U, REAL);
    expect(EditionSchema.safeParse(e).success).toBe(true);
    expect(e.items).toHaveLength(20);
    expect(e.reserve).toHaveLength(8);
    expect(e).toMatchObject({ id: 'ed-new', userId: U, date: '2026-10-17', number: 3, paperName: 'The Morrow' });
    expect(vi.mocked(db.writeEditionRow)).toHaveBeenCalledWith(expect.objectContaining({ user_id: U, edition_date: '2026-10-17', number: 3, algo_version: 'rank-v1', editor_note_source: 'template' }), false);
    const items = vi.mocked(db.insertEditionItems).mock.calls[0][1];
    expect(items.map((i) => i.rank)).toEqual(Array.from({ length: 28 }, (_, i) => i + 1));
    const snap = vi.mocked(db.upsertSnapshot).mock.calls[0];
    expect(snap[1]).toBe('2026-10-17');
    expect(Object.keys(snap[2]).sort()).toEqual(FIXTURE_TAXONOMY.map((t) => t.slug).sort());
  });

  it('receipt: pool and cluster counts, 0 LLM calls, the AI share of the 20, rank-v1', async () => {
    const e = await buildEdition(U, REAL);
    expect(e.receipt).toMatchObject({ articlesConsidered: 300, clustersConsidered: 120, llmCallsThisEdition: 0, algoVersion: 'rank-v1' });
    expect(e.receipt.aiShare.gemini + e.receipt.aiShare.extractive).toBe(20);
    expect(e.receipt.buildMs).toBeGreaterThanOrEqual(0);
  });

  it('idempotent: an existing paper without force is returned as stored, nothing is written', async () => {
    h.existing = { id: 'ed-0', number: 3 };
    h.stored = storedRow();
    const e = await buildEdition(U, REAL);
    expect(e.id).toBe('ed-0');
    expect(e.editorNote).toBe('Stored note.');
    expect(vi.mocked(db.writeEditionRow)).not.toHaveBeenCalled();
    expect(vi.mocked(pool.loadCandidatePool)).not.toHaveBeenCalled();
  });

  it('force rebuild keeps the number and upserts', async () => {
    h.existing = { id: 'ed-0', number: 5 };
    const e = await buildEdition(U, REAL, { force: true });
    expect(e.number).toBe(5);
    expect(vi.mocked(db.writeEditionRow)).toHaveBeenCalledWith(expect.objectContaining({ number: 5 }), true);
    expect(vi.mocked(db.deleteEditionItems)).toHaveBeenCalledWith('ed-0');
  });

  it('zero candidates → a 503 Response { error: "no_candidates" } (Review Focus 1)', async () => {
    h.pool = [];
    const err = await buildEdition(U, REAL).catch((x: unknown) => x);
    expect(err).toBeInstanceOf(Response);
    expect((err as Response).status).toBe(503);
    expect(await (err as Response).json()).toEqual({ error: 'no_candidates' });
    expect(vi.mocked(db.writeEditionRow)).not.toHaveBeenCalled();
  });

  it('not onboarded → a 409 Response', async () => {
    h.profile = null;
    const err = await buildEdition(U, REAL).catch((x: unknown) => x);
    expect((err as Response).status).toBe(409);
  });

  it('23505 on insert (double first open) → the stored edition, not a 500 (Review Focus 5)', async () => {
    h.writeError = new db.DbError('writeEditionRow', '23505', 'duplicate key value violates unique constraint');
    h.stored = storedRow({ id: 'ed-other' });
    const e = await buildEdition(U, REAL);
    expect(e.id).toBe('ed-other');
    expect(vi.mocked(db.insertEditionItems)).not.toHaveBeenCalled();
  });

  it('a forced build that loses the insert race (23505) still wins: it retries as an upsert over that row', async () => {
    vi.mocked(db.writeEditionRow)
      .mockRejectedValueOnce(new db.DbError('writeEditionRow', '23505', 'duplicate key value violates unique constraint'))
      .mockResolvedValueOnce('ed-race');
    vi.mocked(db.findEditionRow).mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'ed-race', number: 1 });
    const e = await buildEdition(U, REAL, { force: true });
    expect(e.id).toBe('ed-race');
    expect(e.number).toBe(3); // this build's count (2 earlier papers), not the racing row's 1
    const calls = vi.mocked(db.writeEditionRow).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[1][1]).toBe(true);
    expect(vi.mocked(db.deleteEditionItems)).toHaveBeenCalledWith('ed-race');
    expect(vi.mocked(db.insertEditionItems)).toHaveBeenCalledTimes(1);
  });

  it('other write errors propagate', async () => {
    h.writeError = new db.DbError('writeEditionRow', '42P01', 'relation missing');
    await expect(buildEdition(U, REAL)).rejects.toThrow(/relation missing/);
  });

  it('Morning Recall comes from the previous paper and its reads', async () => {
    h.recall = {
      prev: [
        { articleId: 'c', rank: 1, recall: q('c') },
        { articleId: 'a', rank: 2, recall: q('a') },
        { articleId: 'b', rank: 8, recall: q('b') },
      ],
      reads: [{ articleId: 'b', at: '2026-10-16T03:00:00Z' }],
    };
    const e = await buildEdition(U, REAL);
    expect(e.recall.map((x) => x.articleId)).toEqual(['b', 'c', 'a']);
    expect(vi.mocked(db.writeEditionRow).mock.calls[0][0].recall).toEqual(e.recall);
  });

  it('template note is stored at once; the editor note runs after the response', async () => {
    const e = await buildEdition(U, REAL);
    expect(e.editorNoteSource).toBe('template');
    expect(e.editorNote).toMatch(/^Good morning, Ayesha\. Edition No\. 3: 20 stories, led by ".+"\./);
    expect(vi.mocked(next.after)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(enrich.writeEditorNote)).not.toHaveBeenCalled();
    await h.scheduled[0]();
    expect(vi.mocked(enrich.writeEditorNote)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(db.updateEditionRow)).toHaveBeenCalledWith('ed-new', expect.objectContaining({ editor_note: 'A note from your editor.', editor_note_source: 'gemini' }));
  });

  it('awaitNote: true → the note is awaited and the returned paper carries it', async () => {
    const e = await buildEdition(U, REAL, { awaitNote: true });
    expect(vi.mocked(next.after)).not.toHaveBeenCalled();
    expect(e.editorNoteSource).toBe('gemini');
    expect(e.editorNote).toBe('A note from your editor.');
  });

  it('preferSmart follows profile.isDemo; the note input has the 20 headlines and the streak', async () => {
    await buildEdition(U, REAL, { awaitNote: true });
    expect(vi.mocked(enrich.writeEditorNote).mock.calls[0][0]).toMatchObject({ preferSmart: false, displayName: 'Ayesha Khan', number: 3, streak: FIXTURE_STREAK.current });
    expect(vi.mocked(enrich.writeEditorNote).mock.calls[0][0].headlines).toHaveLength(20);
    vi.clearAllMocks();
    h.profile = { ...h.profile!, isDemo: true };
    await buildEdition(U, REAL, { awaitNote: true });
    expect(vi.mocked(enrich.writeEditorNote).mock.calls[0][0].preferSmart).toBe(true);
  });

  it('demo clock ahead: the date follows the demo clock, the pool and freshness use real now (Review Focus 4)', async () => {
    const ahead = new Date(REAL.getTime() + 86_400_000);
    const e = await buildEdition(U, ahead);
    expect(e.date).toBe('2026-10-18');
    expect(e.items).toHaveLength(20);
    expect(vi.mocked(pool.loadCandidatePool).mock.calls[0][0].getTime()).toBe(REAL.getTime());
    expect(vi.mocked(rank.rankWithCounts).mock.calls[0][4].getTime()).toBe(REAL.getTime());
    expect(vi.mocked(db.previousEditionForRecall)).toHaveBeenCalledWith(U, '2026-10-18');
  });

  it('demo clock behind real time: both the pool and freshness use the demo now', async () => {
    const behind = new Date(REAL.getTime() - 2 * 3_600_000);
    await buildEdition(U, behind);
    expect(vi.mocked(pool.loadCandidatePool).mock.calls[0][0].getTime()).toBe(behind.getTime());
    expect(vi.mocked(rank.rankWithCounts).mock.calls[0][4].getTime()).toBe(behind.getTime());
  });

  it('read counts reach the chip: rankWithCounts gets topicReadCounts of the loaded events', async () => {
    const item = (id: string): Candidate => ({ ...h.pool[0], id, labels: [{ slug: 'sports.cricket', conf: 1 }] });
    h.events = [
      { ev: { type: 'open', articleId: 'r1' }, item: item('r1'), occurredAt: '2026-10-16T03:00:00Z' },
      { ev: { type: 'open', articleId: 'r2' }, item: item('r2'), occurredAt: '2026-10-15T03:00:00Z' },
    ];
    await buildEdition(U, REAL);
    expect(vi.mocked(rank.rankWithCounts).mock.calls[0][6]).toEqual({ 'sports.cricket': 2, sports: 2 });
    expect(vi.mocked(rank.rankWithCounts).mock.calls[0][3]).toBe(`${U}|2026-10-17`);
  });

  it('sectionNames has a name for every sectionSlug and label', async () => {
    const e = await buildEdition(U, REAL);
    for (const it of [...e.items, ...e.reserve]) {
      expect(e.sectionNames[it.sectionSlug]).toBeTruthy();
      for (const l of it.article.labels) expect(e.sectionNames[l.slug]).toBeTruthy();
    }
  });

  it('fixture mode: FIXTURE_USER_ID gets FIXTURE_EDITION without touching the DB', async () => {
    expect(await buildEdition(FIXTURE_USER_ID, REAL)).toBe(FIXTURE_EDITION);
    expect(vi.mocked(db.writeEditionRow)).not.toHaveBeenCalled();
  });
});
