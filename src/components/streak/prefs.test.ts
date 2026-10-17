import { describe, expect, it } from 'vitest';
import { FIXTURE_STREAK } from '@/contracts/fixtures';
import type { StreakView } from '@/contracts/streak';
import { atRiskLine, shouldNoteAtRisk, shouldNoteKept } from './prefs';

const atRisk: StreakView = { ...FIXTURE_STREAK, state: 'at_risk', current: 6 }; // last7 ends on 2026-10-17

describe('at-risk note, at most once per day', () => {
  it('notes an at-risk streak once per edition day', () => {
    expect(shouldNoteAtRisk(atRisk, null)).toBe(true);
    expect(shouldNoteAtRisk(atRisk, '2026-10-16')).toBe(true);
    expect(shouldNoteAtRisk(atRisk, '2026-10-17')).toBe(false);
  });

  it('never notes any other state', () => {
    for (const state of ['new', 'pending', 'done_today', 'frozen', 'repairable', 'broken'] as const) {
      expect(shouldNoteAtRisk({ ...atRisk, state }, null)).toBe(false);
    }
  });

  it('says it warmly in one line', () => {
    expect(atRiskLine(atRisk)).toBe("Your paper's still warm: 1 story keeps your 6-day streak.");
  });
});

describe('streak kept note, once per day, never on a milestone day', () => {
  const before: StreakView = { ...FIXTURE_STREAK, state: 'pending', current: 7, todayQualified: false, milestone: null };
  const after: StreakView = { ...FIXTURE_STREAK, state: 'done_today', current: 8, todayQualified: true, milestone: null };

  it('notes the read that keeps today', () => {
    expect(shouldNoteKept(before, after, null)).toBe(true);
    expect(shouldNoteKept(before, after, '2026-10-16')).toBe(true);
  });

  it('notes it at most once per edition day', () => {
    expect(shouldNoteKept(before, after, '2026-10-17')).toBe(false);
  });

  it('stays quiet when today was already kept, or nothing changed', () => {
    expect(shouldNoteKept(after, { ...after, todayStoriesRead: 4 }, null)).toBe(false);
    expect(shouldNoteKept(before, before, null)).toBe(false);
    expect(shouldNoteKept(null, after, null)).toBe(false); // the first value seen on this page is not a change
  });

  it('leaves milestone days to the milestone note', () => {
    expect(shouldNoteKept(before, { ...after, current: 7, milestone: 7 }, null)).toBe(false);
  });
});
