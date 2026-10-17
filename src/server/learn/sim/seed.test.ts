import { describe, expect, it } from 'vitest';
import type { RecallQuestion } from '@/contracts/article';
import { DEFAULT_PARAMS } from '@/server/rank/params';
import { localDate } from '@/server/time';
import { NOW, makePool, makeTaxonomy, unitVec } from '@/server/rank/__fixtures__/factory';
import { AYESHA } from './persona';
import { runLearningArm } from './run';
import { planDemoHistory } from './seed';

const TAX = makeTaxonomy();
const topicEmb = Object.fromEntries(TAX.map((t, i) => [t.slug, unitVec(9000 + i)]));
const trace = runLearningArm({ pool: makePool(400, { now: NOW }), taxonomy: TAX, topicEmb, persona: AYESHA, days: 7, now: NOW, params: DEFAULT_PARAMS });
const recallOf = (articleId: string): RecallQuestion => ({ articleId, question: `About ${articleId}?`, options: ['a', 'b', 'c'], answerIndex: 2, explanation: 'E.' });
const plan = () => planDemoHistory({ trace, recallOf, today: '2026-10-17', tz: 'Asia/Karachi', seed: 'demo|Ayesha' });

const qualifyingReads = (events: { type: string; articleId?: string; value?: number }[]) => {
  const opened = new Set(events.filter((e) => e.type === 'open').map((e) => e.articleId));
  return new Set(events.filter((e) => e.type === 'dwell' && (e.value ?? 0) >= 20_000 && opened.has(e.articleId)).map((e) => e.articleId)).size;
};

describe('planDemoHistory', { timeout: 60_000 }, () => {
  const days = plan();

  it('dates 2026-10-10 … 2026-10-16, numbers 1–7', () => {
    expect(days.map((d) => d.date)).toEqual(['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16']);
    expect(days.map((d) => d.number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('every day has at least 3 qualifying reads (open + dwell ≥ 20 s)', () => {
    for (const d of days) {
      expect(qualifyingReads(d.events)).toBeGreaterThanOrEqual(3);
      expect(d.activity.qualifyingReads).toBeGreaterThanOrEqual(3);
    }
  });

  it('day 1 has no recall; days 2–7 ask about the previous day’s reads (max 3)', () => {
    expect(days[0].recall).toEqual([]);
    for (let k = 1; k < 7; k++) {
      const prev = days[k - 1].events;
      const opened = new Set(prev.filter((e) => e.type === 'open').map((e) => e.articleId));
      const reads = new Set(prev.filter((e) => e.type === 'dwell' && (e.value ?? 0) >= 20_000 && opened.has(e.articleId)).map((e) => e.articleId));
      expect(days[k].recall.length).toBeGreaterThan(0);
      expect(days[k].recall.length).toBeLessThanOrEqual(3);
      for (const q of days[k].recall) expect(reads.has(q.articleId)).toBe(true);
    }
  });

  it('one recall_answer per recall question; activity counts them', () => {
    for (const d of days) {
      const answers = d.events.filter((e) => e.type === 'recall_answer');
      expect(answers).toHaveLength(d.recall.length);
      expect(d.activity.recallTotal).toBe(d.recall.length);
      expect(d.activity.recallCorrect).toBe(answers.filter((a) => a.value === 1).length);
      for (const a of answers) {
        expect(a.meta?.chosen).toBeTypeOf('number');
        if (a.value === 1) expect(a.meta?.chosen).toBe(2);
        else expect(a.meta?.chosen).not.toBe(2);
      }
    }
  });

  it('all occurredAt fall on their own PKT date, between 07:30 and 08:30', () => {
    for (const d of days) {
      for (const e of d.events) {
        expect(localDate(new Date(e.occurredAt), 'Asia/Karachi')).toBe(d.date);
        const pkt = new Date(Date.parse(e.occurredAt) + 5 * 3_600_000);
        const minutes = pkt.getUTCHours() * 60 + pkt.getUTCMinutes();
        expect(minutes).toBeGreaterThanOrEqual(7 * 60 + 30);
        expect(minutes).toBeLessThanOrEqual(8 * 60 + 30);
      }
    }
  });

  it('events come in time order within a day and keep the reader’s signals', () => {
    for (const d of days) {
      const ts = d.events.map((e) => Date.parse(e.occurredAt));
      expect(ts).toEqual([...ts].sort((a, b) => a - b));
      expect(d.events.filter((e) => e.type === 'impression')).toHaveLength(20);
      for (const e of d.events.filter((x) => x.type === 'dwell')) expect(e.meta?.mode).toBe('sheet');
    }
  });

  it('snapshot = θ̂ before that day; deterministic for the same seed', () => {
    expect(days[0].snapshot).toEqual(trace[0].thetaBefore);
    expect(plan()).toEqual(days);
  });
});
