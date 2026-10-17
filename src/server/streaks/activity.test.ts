import { describe, expect, it } from 'vitest';
import type { SignalType } from '@/contracts/signals';
import { buildHeatmap, heatmapLevel, summarizeDay, toDayEvent, type DayEvent } from './activity';
import type { DayRecord } from './compute';

const ev = (type: SignalType, articleId: string | null, value: number | null = null, meta: Record<string, unknown> = {}): DayEvent => ({
  type,
  articleId,
  value,
  meta,
});
const sheet = { mode: 'sheet' };
const bytes = { mode: 'bytes' };

describe('summarizeDay (qualifying-read rules, §9.7)', () => {
  it('open + 25 s sheet dwell is one QR', () => {
    expect(summarizeDay([ev('open', 'a1', null, sheet), ev('dwell', 'a1', 25000, sheet)])).toEqual({
      qualifyingReads: 1,
      storiesRead: 1,
      recallCorrect: 0,
      recallTotal: 0,
    });
  });

  it('12 s sheet dwell is read but not qualifying', () => {
    expect(summarizeDay([ev('open', 'a1', null, sheet), ev('dwell', 'a1', 12000, sheet)])).toMatchObject({ qualifyingReads: 0, storiesRead: 1 });
  });

  it('a dwell with no mode uses the sheet threshold', () => {
    expect(summarizeDay([ev('open', 'a1'), ev('dwell', 'a1', 20000)]).qualifyingReads).toBe(1);
    expect(summarizeDay([ev('open', 'a1'), ev('dwell', 'a1', 19999)]).qualifyingReads).toBe(0);
  });

  it('bytes 9 s qualifies, a 9 s sheet dwell does not', () => {
    expect(summarizeDay([ev('open', 'a1', null, bytes), ev('dwell', 'a1', 9000, bytes)]).qualifyingReads).toBe(1);
    expect(summarizeDay([ev('open', 'a1', null, sheet), ev('dwell', 'a1', 9000, sheet)]).qualifyingReads).toBe(0);
  });

  it('dwell without an open does not qualify', () => {
    expect(summarizeDay([ev('dwell', 'a1', 25000, sheet)]).qualifyingReads).toBe(0);
  });

  it('a dwell on another article does not complete an open', () => {
    expect(summarizeDay([ev('open', 'a1', null, sheet), ev('dwell', 'a2', 25000, sheet)]).qualifyingReads).toBe(0);
  });

  it('read_original, qr_scan and recall_answer qualify', () => {
    const s = summarizeDay([
      ev('read_original', 'a1', null, { src: 'web' }),
      ev('qr_scan', 'a2', null, { src: 'print' }),
      ev('recall_answer', 'a9', 1, { chosen: 0 }),
    ]);
    expect(s).toEqual({ qualifyingReads: 3, storiesRead: 2, recallCorrect: 1, recallTotal: 1 });
  });

  it('the first answer per recall question decides recallCorrect', () => {
    const s = summarizeDay([ev('recall_answer', 'a9', 0, { chosen: 2 }), ev('recall_answer', 'a9', 1, { chosen: 0 }), ev('recall_answer', 'a8', 1, { chosen: 1 })]);
    expect(s).toMatchObject({ recallTotal: 2, recallCorrect: 1, qualifyingReads: 2 });
  });

  it('impression, skip and pdf_download never qualify', () => {
    const s = summarizeDay([ev('impression', 'a1', null, { slot: 'lead' }), ev('skip', 'a2', null, { reason: 'none' }), ev('pdf_download', null)]);
    expect(s).toMatchObject({ qualifyingReads: 0, storiesRead: 0 });
  });

  it('duplicates are counted once', () => {
    const batch = [ev('open', 'a1', null, sheet), ev('dwell', 'a1', 25000, sheet), ev('read_original', 'a2'), ev('recall_answer', 'a9', 1, { chosen: 0 })];
    expect(summarizeDay([...batch, ...batch])).toEqual(summarizeDay(batch));
    expect(summarizeDay([...batch, ...batch])).toEqual({ qualifyingReads: 3, storiesRead: 2, recallCorrect: 1, recallTotal: 1 });
  });

  it('two short dwells on one article do not add up to a qualifying read', () => {
    // A replayed 12 s dwell must not become 24 s.
    expect(summarizeDay([ev('open', 'a1', null, sheet), ev('dwell', 'a1', 12000, sheet), ev('dwell', 'a1', 12000, sheet)]).qualifyingReads).toBe(0);
  });
});

describe('toDayEvent', () => {
  it('fills absent fields with null and {}', () => {
    expect(toDayEvent({ type: 'pdf_download', editionId: 'e1' })).toEqual({ type: 'pdf_download', articleId: null, value: null, meta: {} });
    expect(toDayEvent({ type: 'dwell', articleId: 'a1', value: 9000, meta: { mode: 'bytes' } })).toEqual(ev('dwell', 'a1', 9000, bytes));
  });
});

describe('heatmap', () => {
  it('heatmap levels', () => {
    const levels = [0, 1, 2, 3, 4, 5, 9, 10].map(heatmapLevel);
    expect(levels).toEqual([0, 1, 1, 2, 2, 3, 3, 4]);
  });

  it('buildHeatmap covers the last N days, oldest first', () => {
    const rows: DayRecord[] = [
      { date: '2026-10-16', status: 'read', qualifyingReads: 1, storiesRead: 7, editionComplete: true },
      { date: '2026-10-18', status: 'read', qualifyingReads: 1, storiesRead: 3, editionComplete: false }, // future: ignored
    ];
    const map = buildHeatmap(rows, '2026-10-17', 84);
    expect(map).toHaveLength(84);
    expect(map[0].date).toBe('2026-07-26');
    expect(map[83]).toEqual({ date: '2026-10-17', storiesRead: 0, level: 0 });
    expect(map[82]).toEqual({ date: '2026-10-16', storiesRead: 7, level: 3 });
  });
});
