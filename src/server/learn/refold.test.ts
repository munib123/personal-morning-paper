import { describe, expect, it } from 'vitest';
import type { SignalEvent } from '@/contracts/signals';
import { DEFAULT_PARAMS } from '@/server/rank/params';
import { NOW, makeCandidate, makeUser, state } from '@/server/rank/__fixtures__/factory';
import { depthPrefFrom, refold, topicReadCounts } from './refold';

const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();
const cricket = (id = 'a1') => makeCandidate({ id, labels: [{ slug: 'sports.cricket', conf: 1 }] });
const pk = (id: string) => makeCandidate({ id, labels: [{ slug: 'sports.cricket.pakistan', conf: 1 }] });
const ev = (type: SignalEvent['type'], articleId = 'a1', p: Partial<SignalEvent> = {}): SignalEvent => ({ type, articleId, ...p });
const user = () => makeUser({ interests: { 'sports.cricket': state(1.5, 3), sports: state(2, 1, { picked: true }) } });

describe('refold (14-day half-life, decays toward the prior)', () => {
  it('refold today: one "more" at age 0 → α = prior + 1.5', () => {
    const m = refold(user(), [{ ev: ev('more'), item: cricket(), occurredAt: ago(0) }], NOW, DEFAULT_PARAMS);
    expect(m.interests['sports.cricket'].alpha).toBeCloseTo(1.5 + 1.5, 9);
  });

  it('refold 14 days: → prior + 0.75', () => {
    const m = refold(user(), [{ ev: ev('more'), item: cricket(), occurredAt: ago(14) }], NOW, DEFAULT_PARAMS);
    expect(m.interests['sports.cricket'].alpha).toBeCloseTo(1.5 + 0.75, 9);
  });

  it('refold 28 days: → prior + 0.375', () => {
    const m = refold(user(), [{ ev: ev('more'), item: cricket(), occurredAt: ago(28) }], NOW, DEFAULT_PARAMS);
    expect(m.interests['sports.cricket'].alpha).toBeCloseTo(1.5 + 0.375, 9);
  });

  it('refold ignores incremental drift: α 9 with no events goes back to the prior', () => {
    const u = makeUser({ interests: { 'sports.cricket': { ...state(1.5, 3), alpha: 9, beta: 7 } } });
    const m = refold(u, [], NOW, DEFAULT_PARAMS);
    expect(m.interests['sports.cricket'].alpha).toBe(1.5);
    expect(m.interests['sports.cricket'].beta).toBe(3);
  });

  it('keeps flags, pos, neg and nEngaged; the input is not mutated', () => {
    const pos = new Float32Array([1, 0]);
    const u = makeUser({ pos, nEngaged: 7, interests: { 'sports.cricket': state(1.5, 3, { pinned: true, picked: true }) } });
    const m = refold(u, [{ ev: ev('less'), item: cricket(), occurredAt: ago(1) }], NOW, DEFAULT_PARAMS);
    expect(m.interests['sports.cricket'].pinned).toBe(true);
    expect(m.interests['sports.cricket'].picked).toBe(true);
    expect(m.pos).toBe(pos);
    expect(m.nEngaged).toBe(7);
    expect(u.interests['sports.cricket'].beta).toBe(3);
    expect(m.interests['sports.cricket'].beta).toBeGreaterThan(3);
  });

  it('sets depthPref from normalized dwells (long reads → +1)', () => {
    const item = makeCandidate({ id: 'a1', labels: [{ slug: 'sports.cricket', conf: 1 }], wordCount: 230 }); // expected 60 s
    const evs = [90_000, 80_000, 100_000].map((ms) => ({ ev: ev('dwell', 'a1', { value: ms }), item, occurredAt: ago(1) }));
    expect(refold(user(), evs, NOW, DEFAULT_PARAMS).depthPref).toBe(1);
  });
});

describe('depthPrefFrom', () => {
  it('median > 1.2 → 1, < 0.5 → −1, none → 0', () => {
    expect(depthPrefFrom([1.5, 1.3, 1.4])).toBe(1);
    expect(depthPrefFrom([0.2, 0.3, 0.9])).toBe(-1);
    expect(depthPrefFrom([])).toBe(0);
    expect(depthPrefFrom([0.8, 1.0])).toBe(0);
  });
});

describe('topicReadCounts', () => {
  it('counts distinct read articles per top label and its ancestors over the last 7 days', () => {
    const events = [
      { ev: ev('open', 'p1'), item: pk('p1'), occurredAt: ago(1) },
      { ev: ev('read_original', 'p1'), item: pk('p1'), occurredAt: ago(1) }, // same article again
      { ev: ev('open', 'p2'), item: pk('p2'), occurredAt: ago(3) },
      { ev: ev('open', 'p3'), item: pk('p3'), occurredAt: ago(9) }, // too old
      { ev: ev('impression', 'p4'), item: pk('p4'), occurredAt: ago(1) }, // not a read
    ];
    expect(topicReadCounts(events, NOW)).toEqual({ 'sports.cricket.pakistan': 2, 'sports.cricket': 2, sports: 2 });
  });

  it('is empty without reads', () => {
    expect(topicReadCounts([], NOW)).toEqual({});
  });
});
