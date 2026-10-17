import { canonicalizeUrl, urlHash } from './canonical';
import { isGenericImage } from './images';
import { countWords, htmlToText, truncateWords } from './text';
import type { PageInfo, PreparedArticle, RawItem } from './types';
import { resolvePublishedAt } from './window';

/** Below this, the feed text is too thin: fetch the page and run Readability (§10.1). */
export const MIN_CONTENT_WORDS = 80;
/** content_text is summarizer input only; it is stored truncated to this many words. */
export const MAX_CONTENT_WORDS = 1500;
/** lede is the feed description as plain text; full-text descriptions are cut to this. */
export const MAX_LEDE_WORDS = 120;

const collapse = (t: string | null | undefined) => (t ? t.replace(/\s+/g, ' ').trim() : '');
const goodImage = (u: string | null | undefined) => (u && !isGenericImage(u) ? u : null);
const joinTitle = (title: string, text: string) => `${title}${/[.!?:]$/.test(title) ? ' ' : '. '}${text}`;

/**
 * RawItem (+ the article page, when it was fetched) → the `articles` row we insert. Null when the
 * link is not a usable http(s) URL or the title is empty.
 * Text: content:encoded when it has ≥ 80 words, else the page's Readability text when it is longer
 * than the feed text, else the longer of content and description; when the og:description is longer
 * still (Hacker News items have no feed text), "title. og:description". Stored ≤ 1,500 words;
 * wordCount is the count before truncation.
 * Image: the feed image, else the page og:image, else twitter:image (generic images never count).
 */
export function prepareArticle(raw: RawItem, page: PageInfo | null, now: Date): PreparedArticle | null {
  const url = canonicalizeUrl(raw.link);
  if (!url) return null;
  const title = collapse(raw.title);
  if (!title) return null;

  const content = htmlToText(raw.contentHtml ?? '');
  const description = htmlToText(raw.descriptionHtml ?? '');
  const readable = collapse(page?.readableText);
  const pageDescription = collapse(page?.description);

  const contentWords = countWords(content);
  const descriptionWords = countWords(description);
  let text: string;
  if (contentWords >= MIN_CONTENT_WORDS) {
    text = content;
  } else {
    const feedText = contentWords >= descriptionWords ? content : description;
    text = countWords(readable) > Math.max(contentWords, descriptionWords) ? readable : feedText;
  }
  if (pageDescription && countWords(pageDescription) > countWords(text)) text = joinTitle(title, pageDescription);

  const wordCount = countWords(text);
  const imageUrl = goodImage(raw.imageUrl) ?? goodImage(page?.ogImage) ?? goodImage(page?.twitterImage);
  const ledeText = description || pageDescription;
  const lede = !ledeText ? null : countWords(ledeText) > MAX_LEDE_WORDS ? `${truncateWords(ledeText, MAX_LEDE_WORDS)}…` : ledeText;

  return {
    sourceId: raw.sourceId,
    url,
    urlHash: urlHash(url),
    title,
    lede,
    contentText: truncateWords(text, MAX_CONTENT_WORDS),
    imageUrl,
    author: collapse(raw.author) || null,
    publishedAt: resolvePublishedAt(raw.publishedRaw, now).toISOString(),
    wordCount,
    needsImage: !imageUrl,
    needsText: wordCount < MIN_CONTENT_WORDS,
    raw,
  };
}

/** True when the page phase has something to add (an image or more text). */
export const needsPage = (a: PreparedArticle): boolean => a.needsImage || a.needsText;
