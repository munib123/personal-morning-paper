import { describe, expect, it } from 'vitest';
import { FIXTURE_STREAK } from '@/contracts/fixtures';
import type { StreakView } from '@/contracts/streak';
import { atRiskLine, shouldNoteAtRisk } from './prefs';

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
