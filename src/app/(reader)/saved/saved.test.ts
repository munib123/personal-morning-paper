import { describe, expect, it } from 'vitest';
import { latestSaves, type SaveRow } from './saved';

const row = (article_id: string | null, occurred_at: string, edition_id: string | null = 'e1'): SaveRow => ({ article_id, edition_id, occurred_at });

describe('latestSaves', () => {
  it('keeps one entry per story, newest save first', () => {
    const rows = [
      row('a', '2026-10-15T07:00:00Z'),
      row('b', '2026-10-17T07:00:00Z', 'e3'),
      row('a', '2026-10-16T07:00:00Z', 'e2'),
    ];
    expect(latestSaves(rows, 10)).toEqual([
      { articleId: 'b', editionId: 'e3', savedAt: '2026-10-17T07:00:00Z' },
      { articleId: 'a', editionId: 'e2', savedAt: '2026-10-16T07:00:00Z' },
    ]);
  });

  it('skips rows without a story and caps the list', () => {
    const rows = [row(null, '2026-10-17T08:00:00Z'), row('a', '2026-10-17T07:00:00Z'), row('b', '2026-10-16T07:00:00Z'), row('c', '2026-10-15T07:00:00Z')];
    expect(latestSaves(rows, 2).map((s) => s.articleId)).toEqual(['a', 'b']);
  });

  it('puts unparseable timestamps last instead of failing', () => {
    const rows = [row('x', 'not a date'), row('y', '2026-10-17T07:00:00Z')];
    expect(latestSaves(rows, 10).map((s) => s.articleId)).toEqual(['y', 'x']);
  });
});
