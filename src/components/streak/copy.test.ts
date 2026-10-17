import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FIXTURE_STREAK } from '@/contracts/fixtures';
import type { StreakState, StreakView } from '@/contracts/streak';
import { chipLabel, chipText, highestMilestone, milestoneLine, sheetHeadline, statusText } from './copy';
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
  it('StreakChip renders a quiet dateline in a ghost button', () => {
    const html = renderToStaticMarkup(createElement(StreakChip, { streak: FIXTURE_STREAK }));
    expect(html).toContain(`data-state="${FIXTURE_STREAK.state}"`);
    expect(html).toContain('class="dateline"');
    expect(html).toContain(chipText(FIXTURE_STREAK));
    expect(html).toContain('mw-btn--ghost');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain(`aria-label="${chipLabel(FIXTURE_STREAK)}"`);
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
    expect(html).toContain('Current 6 · Longest 6 · 12 reading days');
    expect(html).toContain('Three mornings in a row.');
    expect(html).toContain('3 of 5 stories today');
    expect(html).toContain('role="progressbar"');
    const complete = renderToStaticMarkup(createElement(StreakPanel, { streak: view({ editionComplete: true, todayStoriesRead: 6 }) }));
    expect(complete).toContain('Today&#x27;s paper is complete');
    const fresh = renderToStaticMarkup(createElement(StreakPanel, { streak: view({ state: 'new', current: 0, longest: 0, totalDays: 0 }) }));
    expect(fresh).not.toContain('in a row');
    expect(fresh).not.toContain('body-sm');
  });
});
