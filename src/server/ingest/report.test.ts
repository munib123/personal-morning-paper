import { describe, expect, it } from 'vitest';
import { summarizeArticles } from './report';

const now = new Date('2026-10-17T10:00:00Z');
const row = (source_id: string, image: boolean, hoursAgo: number) => ({
  source_id,
  image_url: image ? 'https://i.example.com/a.jpg' : null,
  fetched_at: new Date(now.getTime() - hoursAgo * 3_600_000).toISOString(),
});

describe('summarizeArticles', () => {
  it('counts rows, distinct sources, image share, the last 48 h and the API sources', () => {
    const rows = [
      row('dawn-home', true, 1),
      row('dawn-home', true, 2),
      row('hacker-news', false, 3),
      row('dev-to', true, 3),
      row('arxiv', false, 50),
    ];
    expect(summarizeArticles(rows, now)).toEqual({
      total: 5,
      distinctSources: 4,
      imageShare: 0.6,
      last48h: 4,
      apiSources: { 'hacker-news': 1, 'dev-to': 1, arxiv: 1 },
    });
  });

  it('handles an empty table', () => {
    expect(summarizeArticles([], now)).toEqual({
      total: 0,
      distinctSources: 0,
      imageShare: 0,
      last48h: 0,
      apiSources: { 'hacker-news': 0, 'dev-to': 0, arxiv: 0 },
    });
  });
});
