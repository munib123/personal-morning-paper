import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FIXTURE_HEATMAP, FIXTURE_STREAK } from '@/contracts/fixtures';
import { ReadingHeatmap, cellOpacity } from './ReadingHeatmap';
import { StreakPanel } from './StreakPanel';

describe('ReadingHeatmap', () => {
  it('draws 84 cells with titles and a hidden table', () => {
    const html = renderToStaticMarkup(createElement(ReadingHeatmap, { days: FIXTURE_HEATMAP }));
    expect(html.match(/<rect/g)).toHaveLength(84);
    expect(html).toContain('<title>Sat 17 Oct · 3 stories</title>');
    expect(html).toContain('<title>Sun 11 Oct · 0 stories</title>');
    expect(html).toMatch(/<table class="sr-only"/);
    const body = html.split('<tbody>')[1]?.split('</tbody>')[0] ?? '';
    expect(body.match(/<tr>/g)).toHaveLength(84);
    expect(html).toContain('Fewer');
    expect(html).toContain('More');
  });

  it('uses one ink hue: outlined at level 0, rising opacity above', () => {
    expect([0, 1, 2, 3, 4].map((l) => cellOpacity(l as 0 | 1 | 2 | 3 | 4))).toEqual([0, 0.15, 0.35, 0.6, 1]);
    const html = renderToStaticMarkup(createElement(ReadingHeatmap, { days: FIXTURE_HEATMAP }));
    expect(html).toContain('fill-ink');
    expect(html).toContain('stroke-rule');
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
  });

  it('StreakPanel draws the heatmap only when it is given one', () => {
    expect(renderToStaticMarkup(createElement(StreakPanel, { streak: FIXTURE_STREAK }))).not.toContain('<rect');
    expect(renderToStaticMarkup(createElement(StreakPanel, { streak: FIXTURE_STREAK, heatmap: FIXTURE_HEATMAP })).match(/<rect/g)).toHaveLength(84);
  });
});
