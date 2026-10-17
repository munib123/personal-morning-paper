// W2 "Tell your editor": tellEditor and applyEditorChanges with their collaborators mocked. Pins that a
// mapper failure still answers, that apply goes through editInterest (never user_interests directly),
// rebuilds after the edits, and never reaches Gemini.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FIXTURE_EDITION, FIXTURE_PROFILE, FIXTURE_TAXONOMY } from '@/contracts/fixtures';
import type { InterestWeight } from '@/contracts/profile';
import { callLLM } from '@/server/ai';
import { buildEdition } from '@/server/edition';
import { mapTextToTopics } from '@/server/enrich';
import { editInterest, toInterestWeights } from '@/server/learn';
import { getProfile } from '@/server/profile';
import { applyEditorChanges, tellEditor } from '@/server/editor';
import type { EditorChange } from '@/server/editor/propose';

vi.mock('@/server/ai', () => ({ callLLM: vi.fn() }));
vi.mock('@/server/enrich', () => ({ mapTextToTopics: vi.fn() }));
vi.mock('@/server/profile', () => ({ getProfile: vi.fn() }));
vi.mock('@/server/edition', () => ({ buildEdition: vi.fn(), loadTaxonomy: vi.fn(async () => FIXTURE_TAXONOMY) }));
vi.mock('@/server/learn', () => ({ editInterest: vi.fn(async () => []), loadUserModel: vi.fn(async () => ({})), toInterestWeights: vi.fn() }));

const USER = '5d9967f0-a20e-4298-8e5a-69322679956a';
const NOW = new Date('2026-10-17T04:00:00.000Z');

const w = (slug: string, theta: number, o: Partial<InterestWeight> = {}): InterestWeight => {
  const n = FIXTURE_TAXONOMY.find((t) => t.slug === slug)!;
  return { slug, name: n.name, level: n.level, theta, alpha: theta * 4, beta: (1 - theta) * 4, picked: true, muted: false, pinned: false, ...o };
};
const WEIGHTS = [w('sports.cricket', 0.6), w('business.crypto', 0.5, { pinned: true }), w('science.space', 0.25, { picked: false })];
const change = (o: Partial<EditorChange>): EditorChange => ({ slug: 'sports.cricket', name: 'Cricket', before: 0.6, after: 0.75, action: 'raise', reason: 'You said "more cricket".', ...o });

beforeEach(() => {
  vi.mocked(getProfile).mockReset().mockResolvedValue(FIXTURE_PROFILE);
  vi.mocked(toInterestWeights).mockReset().mockReturnValue(WEIGHTS);
  vi.mocked(mapTextToTopics).mockReset();
  vi.mocked(editInterest).mockReset().mockResolvedValue([]);
  vi.mocked(buildEdition).mockReset().mockResolvedValue(FIXTURE_EDITION);
  vi.mocked(callLLM).mockReset();
});

describe('tellEditor', () => {
  it("maps the reader's words, then proposes against their current weights", async () => {
    vi.mocked(mapTextToTopics).mockResolvedValue({ picks: ['sports.cricket', 'science.space'], blocked: [], provider: 'gemini' });
    const r = await tellEditor(USER, 'more cricket and I am curious about astronomy', NOW);
    expect(mapTextToTopics).toHaveBeenCalledWith('more cricket and I am curious about astronomy');
    expect(r.provider).toBe('gemini');
    expect(r.changes.map((c) => [c.slug, c.action])).toEqual([
      ['sports.cricket', 'raise'],
      ['science.space', 'add'],
    ]);
  });

  it('a mapper that throws still answers: no changes, the words back as unmatched, provider none', async () => {
    vi.mocked(mapTextToTopics).mockRejectedValue(new Error('quota'));
    expect(await tellEditor(USER, 'more cricket', NOW)).toEqual({ changes: [], unmatched: ['cricket'], provider: 'none' });
  });

  it('a reader who has not onboarded gets the 409 the other routes use', async () => {
    vi.mocked(getProfile).mockResolvedValue(null);
    const thrown = await tellEditor(USER, 'more cricket', NOW).catch((e: unknown) => e);
    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(409);
  });
});

describe('applyEditorChanges', () => {
  it('goes through editInterest per change, then rebuilds today with force, and never reaches Gemini', async () => {
    const r = await applyEditorChanges(USER, [change({}), change({ slug: 'business.crypto', name: 'Crypto & Web3', before: 0.5, after: 0, action: 'mute' })], NOW);
    expect(vi.mocked(editInterest).mock.calls).toEqual([
      [USER, { slug: 'sports.cricket', action: 'set', value: 0.825 }, NOW],
      [USER, { slug: 'business.crypto', action: 'unpin' }, NOW],
      [USER, { slug: 'business.crypto', action: 'mute' }, NOW],
    ]);
    expect(buildEdition).toHaveBeenCalledWith(USER, NOW, { force: true });
    const lastEdit = Math.max(...vi.mocked(editInterest).mock.invocationCallOrder);
    expect(vi.mocked(buildEdition).mock.invocationCallOrder[0]).toBeGreaterThan(lastEdit);
    const lead = FIXTURE_EDITION.items.find((i) => i.article.id === FIXTURE_EDITION.leadArticleId)!;
    expect(r).toEqual({ date: FIXTURE_EDITION.date, number: FIXTURE_EDITION.number, leadHeadline: lead.article.headline, changed: 2 });
    expect(mapTextToTopics).not.toHaveBeenCalled();
    expect(callLLM).not.toHaveBeenCalled();
  });

  it('ignores slugs outside the taxonomy and counts only what it applied', async () => {
    const r = await applyEditorChanges(USER, [change({ slug: 'made.up' }), change({})], NOW);
    expect(vi.mocked(editInterest).mock.calls.map((c) => c[1].slug)).toEqual(['sports.cricket']);
    expect(r.changed).toBe(1);
  });

  it('a failed edit rejects (the route answers 503) and the paper is not rebuilt', async () => {
    vi.mocked(editInterest).mockRejectedValue(new Error('editInterest upsert: db down'));
    await expect(applyEditorChanges(USER, [change({})], NOW)).rejects.toThrow('db down');
    expect(buildEdition).not.toHaveBeenCalled();
  });
});
