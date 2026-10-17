import { describe, expect, it } from 'vitest';
import type { Candidate, UserModel } from '@/contracts/engine';
import type { Slot } from '@/contracts/edition';
import { DEFAULT_PARAMS } from './params';
import { scoreCandidate } from './score';
import { bestPerCluster, mmrFill, type Scored } from './select';
import { baseTier } from './layout';
import { reasonsFor } from './reasons';
import { NOW, makeCandidate, makeInterests, makeTaxonomy, makeUser, state, unitVec } from './__fixtures__/factory';

const TAX = makeTaxonomy();
const scored = (u: UserModel, c: Candidate): Scored => {
  const b = scoreCandidate(u, c, DEFAULT_PARAMS, NOW);
  return { c, b, fresh: 1, root: c.labels[0]?.slug.split('.')[0] ?? 'news' };
};
const texts = (u: UserModel, c: Candidate, slot: Slot, extra = {}) =>
  reasonsFor(scored(u, c), u, slot, TAX, DEFAULT_PARAMS, extra).map((r) => r.text);
const cricket = (p: Partial<Candidate> = {}) => makeCandidate({ id: 'k1', labels: [{ slug: 'sports.cricket', conf: 1 }], ...p });

describe('bestPerCluster', () => {
  it('keeps the best-scored item per cluster; a null cluster is its own cluster', () => {
    const u = makeUser({ interests: { sports: state(9, 1) } });
    const a = makeCandidate({ id: 'a', clusterId: 'k', labels: [{ slug: 'sports', conf: 1 }] });
    const b = makeCandidate({ id: 'b', clusterId: 'k', labels: [{ slug: 'sports', conf: 0.2 }] });
    const n1 = makeCandidate({ id: 'n1', clusterId: null });
    const n2 = makeCandidate({ id: 'n2', clusterId: null });
    const out = bestPerCluster([b, a, n1, n2].map((c) => scored(u, c))).map((s) => s.c.id);
    expect(out).toHaveLength(3);
    expect(out[0]).toBe('a');
    expect(out).toEqual(expect.arrayContaining(['a', 'n1', 'n2']));
  });
});

describe('mmrFill', () => {
  it('prefers a dissimilar item over a near-duplicate of a taken one', () => {
    const u = makeUser({ interests: { sports: state(5, 1) } });
    const e = unitVec(1);
    const taken = scored(u, makeCandidate({ id: 't', embedding: e, labels: [{ slug: 'sports', conf: 1 }], sourceId: 'x' }));
    const dup = scored(u, makeCandidate({ id: 'dup', embedding: e, labels: [{ slug: 'sports', conf: 1 }], sourceId: 'y', importance: 0.2 }));
    const other = scored(u, makeCandidate({ id: 'other', embedding: unitVec(2), labels: [{ slug: 'sports', conf: 1 }], sourceId: 'z' }));
    expect(dup.b.total).toBeGreaterThan(other.b.total);
    expect(mmrFill([dup, other], [taken], 1, DEFAULT_PARAMS).map((s) => s.c.id)).toEqual(['other']);
  });

  it('respects the per-source cap, then continues uncapped when nothing else remains', () => {
    const u = makeUser();
    const items = Array.from({ length: 5 }, (_, i) => scored(u, makeCandidate({ id: `s${i}`, sourceId: 'one', embedding: unitVec(10 + i), importance: 0.5 - i * 0.05 })));
    const alt = scored(u, makeCandidate({ id: 'alt', sourceId: 'two', embedding: unitVec(99), importance: 0 }));
    const out = mmrFill([...items, alt], [], 5, DEFAULT_PARAMS).map((s) => s.c.id);
    // alt scores lowest, yet it comes 4th: source 'one' is capped at 3 until nothing else remains.
    expect(out.slice(0, 3).every((id) => id.startsWith('s'))).toBe(true);
    expect(out[3]).toBe('alt');
    expect(out).toHaveLength(5);
  });
});

describe('mmrFill (lazy) matches a plain eager MMR loop', () => {
  // Reference: the textbook loop, recomputing max similarity against everything taken, every step.
  function eager(short: Scored[], taken: Scored[], n: number): string[] {
    const cosine = (a: Float32Array, b: Float32Array) => {
      let ab = 0, aa = 0, bb = 0;
      for (let i = 0; i < a.length; i++) { ab += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; }
      return ab / Math.sqrt(aa * bb);
    };
    const chosen = [...taken];
    const out: string[] = [];
    const left = short.filter((s) => !taken.includes(s));
    const capOk = (s: Scored) =>
      chosen.filter((t) => t.root === s.root).length < DEFAULT_PARAMS.maxPerRoot &&
      chosen.filter((t) => t.c.sourceId === s.c.sourceId).length < DEFAULT_PARAMS.maxPerSource;
    while (out.length < n && left.length > 0) {
      const val = (s: Scored) => 0.7 * s.b.total - 0.3 * Math.max(0, ...chosen.map((t) => cosine(s.c.embedding!, t.c.embedding!)));
      const capped = left.filter(capOk);
      const from = capped.length > 0 ? capped : left;
      const best = from.reduce((a, b) => (val(b) > val(a) || (val(b) === val(a) && b.b.total > a.b.total) ? b : a));
      out.push(best.c.id);
      chosen.push(best);
      left.splice(left.indexOf(best), 1);
    }
    return out;
  }

  it('same 28 picks on a 150-item shortlist with 3 pre-taken items', () => {
    const u = makeUser({ interests: makeInterests(['sports']) });
    const roots = ['sports.cricket', 'science.space', 'news.pakistan', 'arts.visual-arts', 'business.markets'];
    const items = Array.from({ length: 150 }, (_, i) =>
      scored(u, makeCandidate({ id: `m${String(i).padStart(3, '0')}`, embedding: unitVec(300 + i), labels: [{ slug: roots[i % 5], conf: 1 }], sourceId: `src${i % 9}`, importance: (i * 37) % 100 / 100 })),
    );
    const sorted = [...items].sort((a, b) => b.b.total - a.b.total);
    const taken = sorted.slice(0, 3);
    expect(mmrFill(sorted, taken, 28, DEFAULT_PARAMS).map((s) => s.c.id)).toEqual(eager(sorted, taken, 28));
  });
});

describe('baseTier (Standard rule) and the Deep shift', () => {
  it('θ 0.75 → deep, 0.5 → std, 0.3 → brief; depthPref +1 lifts brief → std', () => {
    expect(baseTier(0.75, 0, 15, DEFAULT_PARAMS)).toBe('deep');
    expect(baseTier(0.5, 0, 15, DEFAULT_PARAMS)).toBe('std');
    expect(baseTier(0.3, 0, 15, DEFAULT_PARAMS)).toBe('brief');
    expect(baseTier(0.3, 1, 15, DEFAULT_PARAMS)).toBe('std');
    expect(baseTier(0.5, -1, 15, DEFAULT_PARAMS)).toBe('brief');
  });

  it('Deep (30) shifts every tier up one: θ 0.3 → std, 0.5 → deep, 0.75 stays deep', () => {
    expect(baseTier(0.3, 0, 30, DEFAULT_PARAMS)).toBe('std');
    expect(baseTier(0.5, 0, 30, DEFAULT_PARAMS)).toBe('deep');
    expect(baseTier(0.75, 0, 30, DEFAULT_PARAMS)).toBe('deep');
  });
});

describe('reason chips (Morrow voice, exact copy)', () => {
  it('picked topic → "Because you follow {name}"', () => {
    const u = makeUser({ interests: { 'sports.cricket': state(3, 1, { picked: true }) } });
    expect(texts(u, cricket(), 'core')).toEqual(['Because you follow Cricket']);
  });

  it('a picked ancestor names the picked node', () => {
    const u = makeUser({ interests: makeInterests(['sports']) });
    expect(texts(u, makeCandidate({ labels: [{ slug: 'sports.cricket.pakistan', conf: 1 }] }), 'core')).toEqual(['Because you follow Sports']);
  });

  it('not picked, no counts → "More from {name}"', () => {
    expect(texts(makeUser(), cricket(), 'core')).toEqual(['More from Cricket']);
  });

  it('explore → "Trying something new: {name}"', () => {
    const c = makeCandidate({ labels: [{ slug: 'science.space', conf: 1 }] });
    expect(texts(makeUser(), c, 'explore', { exploreSlug: 'science.space' })).toContain('Trying something new: Space & Astronomy');
  });

  it('serendipity → "A step outside your usual"', () => {
    const c = makeCandidate({ labels: [{ slug: 'arts.visual-arts', conf: 1 }] });
    expect(texts(makeUser(), c, 'serendipity')).toContain('A step outside your usual');
  });

  it('bigstory → "Covered by {n} outlets today" from sourceCount', () => {
    expect(texts(makeUser(), cricket({ sourceCount: 9, importance: 0.9 }), 'bigstory')).toContain('Covered by 9 outlets today');
  });

  it('pinned → "You pinned {name}"', () => {
    const u = makeUser({ interests: { 'sports.cricket': state(2, 2, { pinned: true }) } });
    expect(texts(u, cricket(), 'core')).toContain('You pinned Cricket');
  });

  it('similar → Because you read "{headline}" for an engaged item with cos ≥ 0.55', () => {
    const e = unitVec(3);
    const u = makeUser({ pos: e, nEngaged: 10, engaged: [{ articleId: 'old', embedding: e, headline: 'Rust 2.0 lands', at: NOW.toISOString() }] });
    expect(texts(u, cricket({ embedding: e }), 'core')).toContain('Because you read "Rust 2.0 lands"');
  });

  it('similar is skipped for null embeddings and for an engaged item below the threshold', () => {
    const u = makeUser({ engaged: [{ articleId: 'old', embedding: null, headline: 'Rust 2.0 lands', at: NOW.toISOString() }] });
    expect(texts(u, cricket({ embedding: unitVec(3) }), 'core').some((t) => t.startsWith('Because you read'))).toBe(false);
    const v = makeUser({ engaged: [{ articleId: 'old', embedding: unitVec(4), headline: 'Rust 2.0 lands', at: NOW.toISOString() }] });
    expect(texts(v, cricket({ embedding: unitVec(3) }), 'core').some((t) => t.startsWith('Because you read'))).toBe(false);
  });

  it('no other reason → "Fresh this morning"', () => {
    const r = reasonsFor(scored(makeUser(), makeCandidate({ labels: [] })), makeUser(), 'core', TAX, DEFAULT_PARAMS, {});
    expect(r).toEqual([{ code: 'fresh', text: 'Fresh this morning', weight: expect.any(Number) }]);
  });

  it('keeps at most 2 reasons, highest weight first, slot reason first', () => {
    const e = unitVec(3);
    const u = makeUser({
      pos: e,
      nEngaged: 10,
      interests: { 'sports.cricket': state(3, 1, { picked: true, pinned: true }) },
      engaged: [{ articleId: 'old', embedding: e, headline: 'Rust 2.0 lands', at: NOW.toISOString() }],
    });
    const r = reasonsFor(scored(u, cricket({ embedding: e, sourceCount: 4 })), u, 'bigstory', TAX, DEFAULT_PARAMS, {});
    expect(r).toHaveLength(2);
    expect(r[0].code).toBe('bigstory');
    expect(r[0].weight).toBeGreaterThanOrEqual(r[1].weight);
  });

  it('no copy contains "!", "I " or emoji', () => {
    const e = unitVec(3);
    const u = makeUser({ pos: e, nEngaged: 10, interests: { 'sports.cricket': state(3, 1, { pinned: true }) }, engaged: [{ articleId: 'o', embedding: e, headline: 'H', at: NOW.toISOString() }] });
    const all = (['core', 'bigstory', 'explore', 'serendipity'] as Slot[]).flatMap((s) => texts(u, cricket({ embedding: e }), s, { exploreSlug: 'sports.cricket' }));
    for (const t of all) {
      expect(t).not.toMatch(/!|\bI\b|\p{Extended_Pictographic}/u);
    }
  });
});
