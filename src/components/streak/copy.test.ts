import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FIXTURE_STREAK } from '@/contracts/fixtures';
import type { StreakState, StreakView } from '@/contracts/streak';
import {
  HOW_IT_WORKS,
  chipLabel,
  chipParts,
  chipText,
  goalLine,
  goalProgress,
  heroStat,
  highestMilestone,
  keptLine,
  milestoneLine,
  sheetHeadline,
  statsLine,
  statusText,
} from './copy';
import { StreakChip } from './StreakChip';
import { StreakPanel } from './StreakPanel';
import { StreakStrip } from './StreakStrip';

const view = (over: Partial<StreakView>): StreakView => ({ ...FIXTURE_STREAK, milestone: null, ...over });
const ALL_STATES: StreakState[] = ['new', 'pending', 'done_today', 'at_risk', 'frozen', 'repairable', 'broken'];

describe('streak copy', () => {
  it('chipLabel', () => {
    expect(chipLabel(view({ state: 'done_today', current: 12 }))).toBe('Reading streak: 12 days, read today');
    expect(chipLabel(view({ state: 'done_today', current: 1 }))).toBe('Reading streak: 1 day, read today');
    expect(chipLabel(view({ state: 'new', current: 0 }))).toBe('Read 1 story to start your streak');
    expect(chipLabel(view({ state: 'broken', current: 0, totalDays: 42 }))).toBe('42 reading days so far. Read 1 story to start a new streak');
  });

  it('chipText', () => {
    expect(chipText(view({ state: 'done_today', current: 6 }))).toBe('6-day streak');
    expect(chipText(view({ state: 'pending', current: 6 }))).toBe('6-day streak');
    expect(chipText(view({ state: 'at_risk', current: 6 }))).toBe('6-day streak · read 1 story today');
    expect(chipText(view({ state: 'new', current: 0 }))).toBe('Start a streak');
    expect(chipText(view({ state: 'broken', current: 0, totalDays: 42 }))).toBe('42 reading days');
    expect(chipText(view({ state: 'broken', current: 0, totalDays: 1 }))).toBe('1 reading day');
  });

  it('sheetHeadline leads a broken streak with the days so far', () => {
    expect(sheetHeadline(view({ state: 'broken', current: 0, totalDays: 42 }))).toBe('42 reading days so far');
    expect(sheetHeadline(view({ state: 'pending', current: 4 }))).toBe('Read 1 story today to keep your 4-day streak');
  });

  it('every state has calm copy: no exclamation marks, no "I"', () => {
    for (const state of ALL_STATES) {
      for (const fn of [chipLabel, chipText, sheetHeadline]) {
        const text = fn(view({ state, current: 5, totalDays: 9 }));
        expect(text.length).toBeGreaterThan(0);
        expect(text).not.toMatch(/!|\bI\b|our AI/);
      }
    }
  });

  it('freeze and repair copy (Task 15)', () => {
    expect(chipLabel(view({ state: 'frozen', current: 6 }))).toBe('Reading streak: 6 days. A freeze saved yesterday');
    expect(chipText(view({ state: 'frozen', current: 6 }))).toBe('6-day streak · freeze used');
    expect(chipText(view({ state: 'repairable', current: 12 }))).toBe('12-day streak · catch up today');
    expect(sheetHeadline(view({ state: 'repairable', current: 12 }))).toBe("Catch up on yesterday's paper (3 questions) to keep your 12-day streak");
  });

  it('milestoneLine', () => {
    expect(milestoneLine(3)).toBe('Three mornings in a row.');
    expect(milestoneLine(7)).toBe('A week of mornings.');
    expect(milestoneLine(14)).toBe('Two weeks of mornings.');
    expect(milestoneLine(30)).toBe('A month of mornings.');
    expect(milestoneLine(50)).toBe('50 mornings in a row.');
    expect(milestoneLine(100)).toBe('100 mornings in a row.');
    expect(milestoneLine(2)).toBeNull();
  });

  it('highestMilestone', () => {
    expect(highestMilestone(2)).toBeNull();
    expect(highestMilestone(6)).toBe(3);
    expect(highestMilestone(29)).toBe(14);
    expect(highestMilestone(150)).toBe(100);
  });

  it('statusText never shames a missed day', () => {
    expect(statusText('read')).toBe('read');
    expect(statusText('missed')).toBe('not read');
    expect(statusText('today')).toBe('today, not read yet');
  });
});

describe('streak components', () => {
  it('StreakChip puts the number up front, with a today mark, in a 44 px button', () => {
    const html = renderToStaticMarkup(createElement(StreakChip, { streak: FIXTURE_STREAK }));
    expect(html).toContain(`data-state="${FIXTURE_STREAK.state}"`);
    expect(html).toContain('data-today="kept"');
    expect(html).toMatch(/class="[^"]*headline-sm[^"]*">6<\/span>/);
    expect(html).toContain('day streak');
    expect(html).toContain('min-h-11');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain(`aria-label="${chipLabel(FIXTURE_STREAK)}"`);
    const pending = renderToStaticMarkup(createElement(StreakChip, { streak: view({ state: 'at_risk', todayQualified: false }) }));
    expect(pending).toContain('data-today="at-risk"');
    expect(pending).toContain('read 1 story today');
    expect(renderToStaticMarkup(createElement(StreakChip, { streak: view({ state: 'pending', todayQualified: false }) }))).toContain('data-today="pending"');
    const fresh = renderToStaticMarkup(createElement(StreakChip, { streak: view({ state: 'new', current: 0, todayQualified: false }) }));
    expect(fresh).toContain('Start a streak');
    expect(fresh).not.toMatch(/>0<\/span>/);
  });

  it('StreakChip renders nothing without a streak (before the fetch lands)', () => {
    expect(renderToStaticMarkup(createElement(StreakChip, {}))).toBe('');
  });

  it('StreakStrip has 7 squares with hidden text for each day', () => {
    const html = renderToStaticMarkup(createElement(StreakStrip, { last7: FIXTURE_STREAK.last7 }));
    expect(html.match(/<li/g)).toHaveLength(7);
    expect(html).toContain('Sat 17 Oct: read');
    expect(html).toContain('Sun 11 Oct: not read');
  });

  it('StreakPanel shows the stats, the milestone line and today’s progress', () => {
    const html = renderToStaticMarkup(createElement(StreakPanel, { streak: FIXTURE_STREAK }));
    expect(html).toContain('Longest 6 days · 12 reading days');
    expect(html).toMatch(/class="[^"]*headline-xl[^"]*">6<\/p>/);
    expect(html).toContain('Streak kept for today');
    expect(html).toContain('1 of 1 story read');
    expect(html).toContain('Three mornings in a row.');
    expect(html).toContain('3 of 5 stories today');
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('Freezes held: 0.');
    const held = renderToStaticMarkup(createElement(StreakPanel, { streak: view({ freezesAvailable: 2 }) }));
    expect(held).toContain('Freezes held: 2. They cover a missed day automatically; you earn one every 7 days (max 2).');
    const complete = renderToStaticMarkup(createElement(StreakPanel, { streak: view({ editionComplete: true, todayStoriesRead: 6 }) }));
    expect(complete).toContain('Today&#x27;s paper is complete');
    const fresh = renderToStaticMarkup(createElement(StreakPanel, { streak: view({ state: 'new', current: 0, longest: 0, totalDays: 0 }) }));
    expect(fresh).not.toContain('in a row');
    expect(fresh).not.toContain('body-sm');
    expect(fresh).toContain('03:00'); // a new reader is told how a streak works
    const unread = renderToStaticMarkup(createElement(StreakPanel, { streak: view({ state: 'new', current: 0, longest: 0, totalDays: 0, todayQualified: false, todayStoriesRead: 0 }) }));
    expect(unread).toContain('Read 1 story to start your streak');
    expect(unread).toContain('0 of 1 story read');
  });
});

describe('streak sheet and chip copy (polish)', () => {
  it('chipParts: the number up front, a short label, a note only for states that need one', () => {
    expect(chipParts(view({ state: 'done_today', current: 8 }))).toEqual({ value: '8', label: 'day streak', short: 'days', note: null });
    expect(chipParts(view({ state: 'done_today', current: 1 }))).toEqual({ value: '1', label: 'day streak', short: 'day', note: null });
    expect(chipParts(view({ state: 'pending', current: 6 })).note).toBeNull();
    expect(chipParts(view({ state: 'at_risk', current: 6 })).note).toBe('read 1 story today');
    expect(chipParts(view({ state: 'frozen', current: 6 })).note).toBe('freeze used');
    expect(chipParts(view({ state: 'repairable', current: 6 })).note).toBe('catch up today');
    expect(chipParts(view({ state: 'new', current: 0 }))).toEqual({ value: null, label: 'Start a streak', short: 'Start a streak', note: null });
    expect(chipParts(view({ state: 'broken', current: 0, totalDays: 42 }))).toEqual({ value: '42', label: 'reading days', short: 'days read', note: null });
    expect(chipParts(view({ state: 'broken', current: 0, totalDays: 1 })).label).toBe('reading day');
  });

  it('heroStat leads a broken streak with the reading days, and is empty for a new reader', () => {
    expect(heroStat(view({ state: 'done_today', current: 8 }))).toEqual({ value: 8, label: 'day streak' });
    expect(heroStat(view({ state: 'broken', current: 0, totalDays: 42 }))).toEqual({ value: 42, label: 'reading days so far' });
    expect(heroStat(view({ state: 'broken', current: 0, totalDays: 1 }))).toEqual({ value: 1, label: 'reading day so far' });
    expect(heroStat(view({ state: 'new', current: 0 }))).toBeNull();
  });

  it('statsLine', () => {
    expect(statsLine(view({ state: 'done_today', current: 6, longest: 9, totalDays: 12 }))).toBe('Longest 9 days · 12 reading days');
    expect(statsLine(view({ state: 'done_today', current: 1, longest: 1, totalDays: 1 }))).toBe('Longest 1 day · 1 reading day');
    expect(statsLine(view({ state: 'broken', current: 0, longest: 6, totalDays: 42 }))).toBe('Longest streak 6 days');
    expect(statsLine(view({ state: 'new', current: 0, longest: 0, totalDays: 0 }))).toBeNull();
  });

  it("goalLine and goalProgress say where today's goal stands", () => {
    expect(goalLine(view({ state: 'done_today', todayQualified: true }))).toBe('Streak kept for today');
    expect(goalLine(view({ state: 'pending', todayQualified: false }))).toBe('Read 1 story to keep it');
    expect(goalLine(view({ state: 'at_risk', todayQualified: false }))).toBe('Read 1 story to keep it');
    expect(goalLine(view({ state: 'frozen', todayQualified: false }))).toBe('Read 1 story to keep it');
    expect(goalLine(view({ state: 'new', current: 0, todayQualified: false }))).toBe('Read 1 story to start your streak');
    expect(goalLine(view({ state: 'broken', current: 0, todayQualified: false }))).toBe('Read 1 story to start a new streak');
    expect(goalLine(view({ state: 'repairable', todayQualified: true }))).toBe("Catch up on yesterday's paper to keep it");
    expect(goalProgress(view({ todayQualified: true }))).toBe('1 of 1 story read');
    expect(goalProgress(view({ todayQualified: false }))).toBe('0 of 1 story read');
  });

  it('sheetHeadline on a kept day points at tomorrow', () => {
    expect(sheetHeadline(view({ state: 'done_today', current: 8 }))).toBe('Come back tomorrow for day 9');
  });

  it('keptLine is one calm line', () => {
    expect(keptLine(view({ current: 8 }))).toBe('Streak kept: 8 days.');
    expect(keptLine(view({ current: 1 }))).toBe('Streak started: 1 day.');
  });

  it('HOW_IT_WORKS explains the rule and the 03:00 rollover, calmly', () => {
    expect(HOW_IT_WORKS.join(' ')).toContain('1 story a day');
    expect(HOW_IT_WORKS.join(' ')).toContain('03:00');
    for (const line of [...HOW_IT_WORKS, goalLine(view({})), keptLine(view({})), chipParts(view({ state: 'at_risk' })).note ?? '']) {
      expect(line).not.toMatch(/!|\bI\b|our AI/);
    }
  });
});
