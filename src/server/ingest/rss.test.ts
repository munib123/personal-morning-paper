import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseFeedXml } from './rss';

const readFixture = (name: string) => readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8');

describe('parseFeedXml', () => {
  it('maps the Dawn items: decoded title, media image, content:encoded, creator, date', async () => {
    const items = await parseFeedXml(readFixture('dawn.xml'), 'dawn-home', 'https://www.dawn.com/feeds/home');
    expect(items).toHaveLength(3);
    expect(items[0].sourceId).toBe('dawn-home');
    expect(items[0].title).toBe('PM & army chief meet');
    expect(items[0].link).toBe('https://www.dawn.com/news/1950001/pm-army-chief-meet?utm_source=rss&utm_medium=feed');
    expect(items[0].imageUrl).toBe('https://i.dawn.com/large/2026/10/a.jpg');
    expect(items[0].contentHtml).toContain('<p>');
    expect(items[0].descriptionHtml).toContain('security situation');
    expect(items[0].author).toBe('Staff Reporter');
    expect(new Date(String(items[0].publishedRaw)).toISOString()).toBe('2026-10-17T04:00:00.000Z');
  });

  it('skips the generic media image for the thumbnail, and uses an image enclosure', async () => {
    const items = await parseFeedXml(readFixture('dawn.xml'), 'dawn-home', 'https://www.dawn.com/feeds/home');
    expect(items[1].imageUrl).toBe('https://i.dawn.com/thumbnail/2026/10/b.jpg');
    expect(items[2].imageUrl).toBe('https://i.dawn.com/large/2026/10/c.jpg');
    expect(items[2].contentHtml).toBeNull();
  });

  it('parses a feed with whitespace before the XML declaration (Dezeen)', async () => {
    const items = await parseFeedXml(readFixture('dezeen-ws.xml'), 'dezeen', 'https://www.dezeen.com/feed/');
    expect(items.length).toBeGreaterThan(0);
    expect(items[0].imageUrl).toBe('https://static.dezeen.com/uploads/2026/10/timber-tower.jpg');
    expect(items[0].author).toBe('Jane Englefield');
  });

  it('resolves a relative item link against the feed url', async () => {
    const xml = '<rss version="2.0"><channel><title>T</title><item><title>X</title><link>/story/9</link></item></channel></rss>';
    const items = await parseFeedXml(xml, 'tribune', 'https://tribune.com.pk/feed/home');
    expect(items[0].link).toBe('https://tribune.com.pk/story/9');
  });

  it('rejects a body that is not a feed', async () => {
    await expect(parseFeedXml('<html><body>Access denied</body></html>', 'bad', 'https://bad.example/feed')).rejects.toThrow();
  });
});
