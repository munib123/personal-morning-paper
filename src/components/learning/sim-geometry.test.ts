import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FIXTURE_INTEREST_WEIGHTS, FIXTURE_SIMULATION } from '@/contracts/fixtures';
import type { SimulationDay, SimulationResult } from '@/contracts/learning';
import { SimulationChart } from './SimulationChart';
import { diffSentence, editionDiff, linePath, simPrimaryView, simSeries } from './sim-geometry';

const day = (d: number, precisionAt20: number): SimulationDay => ({ day: d, precisionAt20, ndcgAt10: 0, diversity: 0, exploreHits: 0 });
const lastDay = (learning: number, onboarding: number): SimulationResult => ({
  ...FIXTURE_SIMULATION,
  learning: [day(1, 0.4), day(7, learning)],
  onboardingOnly: [day(1, 0.4), day(7, onboarding)],
});

describe('simulation geometry', () => {
  it('simSeries maps the three arms to labelled precision@20 series', () => {
    const series = simSeries(FIXTURE_SIMULATION);
    expect(series.map((s) => s.label)).toEqual(['Learning', 'Onboarding only', 'Popularity']);
    expect(series.map((s) => s.key)).toEqual(['learning', 'onboardingOnly', 'popularity']);
    series[0].points.forEach((p, i) => {
      expect(p.value).toBe(FIXTURE_SIMULATION.learning[i].precisionAt20);
      expect(p.day).toBe(FIXTURE_SIMULATION.learning[i].day);
    });
  });

  it('linePath scales day and value into the box', () => {
    expect(linePath([{ day: 1, value: 0 }, { day: 2, value: 1 }], { w: 100, h: 100, pad: 0 }, 2)).toBe('M0,100L100,0');
    expect(linePath([{ day: 1, value: 0.5 }, { day: 3, value: 0.25 }], { w: 120, h: 60, pad: 10 }, 3)).toBe('M10,30L110,40');
    expect(linePath([], { w: 100, h: 100, pad: 0 }, 7)).toBe('');
  });

  it('simPrimaryView leads with the chart only when learning clearly wins', () => {
    expect(simPrimaryView(lastDay(0.62, 0.56))).toBe('chart');
    expect(simPrimaryView(lastDay(0.6, 0.55))).toBe('chart');
    expect(simPrimaryView(lastDay(0.58, 0.55))).toBe('map');
    expect(simPrimaryView(lastDay(0.5, 0.56))).toBe('map');
  });

  it('editionDiff compares the top-k topics of the first and last snapshots', () => {
    const r: SimulationResult = {
      ...FIXTURE_SIMULATION,
      snapshots: [
        { day: 1, weights: { a: 0.9, b: 0.8, c: 0.1 } },
        { day: 7, weights: { a: 0.9, c: 0.85, b: 0.2 } },
      ],
    };
    expect(editionDiff(r, 2)).toEqual({ entered: ['c'], left: ['b'], kept: ['a'] });
  });

  it('diffSentence reads the change in plain words', () => {
    const names = { 'science.space': 'Space', 'technical.ai-policy': 'AI policy', 'entertainment.celebrity': 'Celebrity' };
    expect(diffSentence({ entered: ['science.space', 'technical.ai-policy'], left: ['entertainment.celebrity'], kept: [] }, names)).toBe(
      'Your paper now leads with Space and AI policy; Celebrity dropped out of the top 5.',
    );
    expect(diffSentence({ entered: [], left: [], kept: ['science.space'] }, names)).toBe('Your top 5 topics held; their weights moved.');
  });
});

describe('SimulationChart', () => {
  it('draws three lines in pen, ink and ink-muted with a legend and direct labels', () => {
    const html = renderToStaticMarkup(createElement(SimulationChart, { result: FIXTURE_SIMULATION }));
    expect(html.match(/<path/g)?.length).toBeGreaterThanOrEqual(3);
    expect(html).toContain('stroke-pen');
    expect(html).toContain('stroke-ink-muted');
    expect(html).toContain('stroke-dasharray="6 4"');
    expect(html).toContain('stroke-dasharray="2 4"');
    expect(html).toContain('Onboarding only');
    expect(html).toContain('Show table');
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
  });

  it('renders nothing without a result', () => {
    expect(renderToStaticMarkup(createElement(SimulationChart, { result: null }))).toBe('');
  });

  it('weights stay importable for the map', () => {
    expect(FIXTURE_INTEREST_WEIGHTS.length).toBeGreaterThan(0);
  });
});
