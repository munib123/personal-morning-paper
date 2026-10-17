import { describe, expect, it } from 'vitest';
import { FIXTURE_EDITION } from '@/contracts/fixtures';
import type { EditionItem } from '@/contracts/edition';
import { toStoryCardProps } from './card-props';
import { readingTimeLabel, timeAgo } from './format';

const item = FIXTURE_EDITION.items[1];
const ctx = { editionId: 'ed1', nowIso: '2026-10-17T06:00:00Z', sectionName: 'Sports', isRead: false };
const withArticle = (patch: Partial<EditionItem['article']>): EditionItem => ({ ...item, article: { ...item.article, ...patch } });

describe('toStoryCardProps', () => {
  it('maps the article', () => {
    const p = toStoryCardProps(item, 'standard', ctx);
    expect(p).toMatchObject({
      variant: 'standard',
      kicker: 'Sports',
      headline: item.article.headline,
      source: item.article.sourceName,
      readingTime: readingTimeLabel(item.article.readingMinutes),
      published: timeAgo(item.article.publishedAt, ctx.nowIso),
      href: `/r/${item.article.id}?src=web&e=ed1`,
      read: false,
    });
    expect(toStoryCardProps(item, 'standard', { ...ctx, isRead: true }).read).toBe(true);
    expect(toStoryCardProps(item, 'standard', { ...ctx, editionId: null }).href).toBe(`/r/${item.article.id}?src=web`);
  });

  it('imageUrl null → undefined', () => {
    expect(toStoryCardProps(withArticle({ imageUrl: null }), 'lead', ctx).imageUrl).toBeUndefined();
    expect(toStoryCardProps(withArticle({ imageUrl: 'https://img.example/a.jpg' }), 'lead', ctx).imageUrl).toBe('https://img.example/a.jpg');
  });

  it('deck only with withDeck', () => {
    const story = withArticle({ whyItMatters: 'It changes your commute.' });
    expect(toStoryCardProps(story, 'lead', ctx).deck).toBeUndefined();
    expect(toStoryCardProps(story, 'lead', { ...ctx, withDeck: true }).deck).toBe('It changes your commute.');
    expect(toStoryCardProps(withArticle({ whyItMatters: null }), 'lead', { ...ctx, withDeck: true }).deck).toBeUndefined();
  });

  it('summary by variant', () => {
    expect(toStoryCardProps(item, 'lead', ctx).summary).toBe(item.article.summary.deep);
    expect(toStoryCardProps({ ...item, tier: 'std' }, 'standard', ctx).summary).toBe(item.article.summary.std);
    expect(toStoryCardProps(item, 'brief', ctx).summary).toBe(item.article.summary.brief);
    expect(toStoryCardProps(item, 'compact', ctx).summary).toBeUndefined();
  });

  it('drops an unusable timestamp', () => {
    expect(toStoryCardProps(withArticle({ publishedAt: 'never' }), 'standard', ctx).published).toBeUndefined();
  });
});
