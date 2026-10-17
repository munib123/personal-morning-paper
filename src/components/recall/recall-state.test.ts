import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FIXTURE_EDITION } from '@/contracts/fixtures';
import { MorningRecallCard } from './MorningRecallCard';
import { answerEvent, firstUnanswered, isHiddenOnLoad, parseRecallStore, recallScore } from './recall-state';

const [q1, q2, q3] = FIXTURE_EDITION.recall;
const wrong = (i: 0 | 1 | 2): 0 | 1 | 2 => ((i + 1) % 3) as 0 | 1 | 2;

describe('recall state', () => {
  it('answerEvent: a right answer is value 1 with the chosen index (§9.7)', () => {
    expect(answerEvent(q1, q1.answerIndex, 'e1')).toEqual({
      type: 'recall_answer',
      articleId: q1.articleId,
      editionId: 'e1',
      value: 1,
      meta: { chosen: q1.answerIndex },
    });
  });

  it('answerEvent: a wrong answer is value 0', () => {
    const chosen = wrong(q1.answerIndex);
    expect(answerEvent(q1, chosen, 'e1')).toMatchObject({ value: 0, meta: { chosen } });
  });

  it('recallScore counts the right answers among the questions', () => {
    const answers = { [q1.articleId]: q1.answerIndex, [q2.articleId]: wrong(q2.answerIndex), [q3.articleId]: q3.answerIndex };
    expect(recallScore(answers, [q1, q2, q3])).toEqual({ correct: 2, total: 3 });
    expect(recallScore({}, [q1, q2, q3])).toEqual({ correct: 0, total: 3 });
  });

  it('firstUnanswered finds the next open question', () => {
    expect(firstUnanswered([q1, q2, q3], { [q1.articleId]: 0 })).toBe(q2);
    expect(firstUnanswered([q1], { [q1.articleId]: 0 })).toBeNull();
  });

  it('parseRecallStore survives junk', () => {
    expect(parseRecallStore(null)).toEqual({ answers: {}, dismissed: [] });
    expect(parseRecallStore('{not json')).toEqual({ answers: {}, dismissed: [] });
    expect(parseRecallStore(JSON.stringify({ answers: { a1: 2, a2: 7 }, dismissed: ['a1', 3] }))).toEqual({ answers: { a1: 2 }, dismissed: ['a1'] });
  });

  it('isHiddenOnLoad: skipped questions, or all answered on an earlier visit', () => {
    const qs = [q1, q2];
    expect(isHiddenOnLoad(qs, { answers: {}, dismissed: [] })).toBe(false);
    expect(isHiddenOnLoad(qs, { answers: {}, dismissed: [q1.articleId, q2.articleId] })).toBe(true);
    expect(isHiddenOnLoad(qs, { answers: { [q1.articleId]: 0 }, dismissed: [] })).toBe(false);
    expect(isHiddenOnLoad(qs, { answers: { [q1.articleId]: 0, [q2.articleId]: 1 }, dismissed: [] })).toBe(true);
    // A skip of other questions (e.g. Morning Recall) never hides a different set (Quiz me now).
    expect(isHiddenOnLoad([q3], { answers: {}, dismissed: [q1.articleId, q2.articleId] })).toBe(false);
  });
});

describe('MorningRecallCard markup', () => {
  it('renders nothing without questions', () => {
    expect(renderToStaticMarkup(createElement(MorningRecallCard, { editionId: 'e1', questions: [] }))).toBe('');
  });

  it('renders all three questions at once in a takeaway frame', () => {
    const html = renderToStaticMarkup(createElement(MorningRecallCard, { editionId: FIXTURE_EDITION.id, questions: FIXTURE_EDITION.recall }));
    expect(html).toContain('class="mw-takeaway"');
    expect(html).toMatch(/class="[^"]*\bkicker\b[^"]*">Morning recall</);
    expect(html.match(/<fieldset/g)).toHaveLength(3);
    expect(html.match(/mw-btn--secondary/g)).toHaveLength(9);
    expect(html).toContain('Skip for today');
    expect(html).toContain(q1.question.replace(/'/g, '&#x27;'));
  });

  it('shows at most three questions', () => {
    const four = [...FIXTURE_EDITION.recall, { ...q1, articleId: 'extra' }];
    const html = renderToStaticMarkup(createElement(MorningRecallCard, { editionId: 'e1', questions: four }));
    expect(html.match(/<fieldset/g)).toHaveLength(3);
  });
});
