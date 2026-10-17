import { describe, expect, it } from 'vitest';
import type { RecallQuestion } from '@/contracts/article';
import { selectRecall } from './recall';

const q = (articleId: string): RecallQuestion => ({ articleId, question: `About ${articleId}?`, options: ['x', 'y', 'z'], answerIndex: 1, explanation: 'Because.' });
const prev = [
  { articleId: 'c', rank: 1, recall: q('c') },
  { articleId: 'a', rank: 2, recall: q('a') },
  { articleId: 'd', rank: 3, recall: q('d') },
  { articleId: 'n', rank: 4, recall: null },
  { articleId: 'b', rank: 9, recall: q('b') },
  { articleId: 'late', rank: 12, recall: q('late') },
];

describe('selectRecall (Morning Recall from yesterday reads)', () => {
  it('reads most recent first, then fills from the top 5', () => {
    const out = selectRecall(prev, [
      { articleId: 'b', at: '2026-10-16T03:00:00Z' },
      { articleId: 'a', at: '2026-10-16T04:00:00Z' },
    ]);
    expect(out.map((x) => x.articleId)).toEqual(['a', 'b', 'c']);
  });

  it('day 1: nothing yesterday → []', () => {
    expect(selectRecall([], [])).toEqual([]);
  });

  it('skips articles without a question and never repeats one; max 3', () => {
    const out = selectRecall(prev, [
      { articleId: 'n', at: '2026-10-16T05:00:00Z' },
      { articleId: 'a', at: '2026-10-16T04:00:00Z' },
      { articleId: 'a', at: '2026-10-16T03:00:00Z' },
    ]);
    expect(out.map((x) => x.articleId)).toEqual(['a', 'c', 'd']);
  });

  it('a read of an article that was not in yesterday’s paper is ignored', () => {
    expect(selectRecall(prev, [{ articleId: 'elsewhere', at: '2026-10-16T05:00:00Z' }]).map((x) => x.articleId)).toEqual(['c', 'a', 'd']);
  });

  it('fill only comes from ranks 1–5', () => {
    const small = [{ articleId: 'late', rank: 12, recall: q('late') }];
    expect(selectRecall(small, [])).toEqual([]);
  });
});
