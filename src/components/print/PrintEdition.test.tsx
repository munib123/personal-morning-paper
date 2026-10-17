// @vitest-environment node
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Edition, EditionItem } from '@/contracts/edition';
import { FIXTURE_EDITION } from '@/contracts/fixtures';
import { fixtureExtras } from '@/server/pdf/fixture';
import { buildPrintLayout, countSources, formatPaperDate, pageCount, teasers } from '@/server/pdf/layout';
import type { PrintLayout, PrintModel } from '@/server/pdf/types';
import { threeThingsToKnow } from './FrontPage';
import { reasonLine, threeThingsLearned } from './LastPage';
import { PRINT_CSS } from './print-css';
import { PrintEdition } from './PrintEdition';

const E = FIXTURE_EDITION;

function storiesWithQr(l: PrintLayout): EditionItem[] {
  return [l.lead, ...l.rail, ...l.inner.flatMap((p) => p.items)];
}
function printed(l: PrintLayout): EditionItem[] {
  return [...storiesWithQr(l), ...l.inner.flatMap((p) => p.briefs ?? []), ...l.beyond, ...l.briefs];
}

/** The fixture model with faked assets: a marker SVG per QR and no images at all. */
function modelOf(edition: Edition = E): PrintModel {
  const layout = buildPrintLayout(edition);
  const qr = Object.fromEntries(storiesWithQr(layout).map((i) => [i.article.id, `<svg data-qr="${i.article.id}"></svg>`]));
  return { edition, layout, extras: fixtureExtras(), assets: { qr, images: {} } };
}

const html = (m: PrintModel) => renderToStaticMarkup(<PrintEdition model={m} />);
/** React's text escaping, to look for fixture strings inside the markup. */
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
/** The markup of each page, in order. */
const pages = (markup: string) => markup.split('<section class="page').slice(1);
const count = (s: string, needle: string) => s.split(needle).length - 1;

describe('PrintEdition', () => {
  const m = modelOf();
  const out = html(m);
  const total = pageCount(m.layout);

  it('renders one A4 page box per page', () => {
    expect(count(out, 'class="page')).toBe(total);
    expect(out.startsWith('<div class="print-root">')).toBe(true);
  });

  it('opens page 1 with the full Morrow masthead', () => {
    const front = pages(out)[0];
    expect(front).toContain('mw-masthead');
    expect(front).toContain('The Morrow');
    expect(front).toContain(`Edition No. ${E.number}`);
    expect(front).toContain(`Prepared for ${m.extras.displayName}`);
    expect(front).toContain(formatPaperDate(E.date));
    expect(front).toContain(m.extras.city);
    expect(front).toContain(`Page 1 of ${total}`);
  });

  it('carries the front-page and last-page blocks', () => {
    expect(out).toMatch(/class="mw-takeaway"[^]*Three things to know/);
    expect(out).toContain('Inside');
    expect(out).toContain('Beyond your usual');
    expect(out).toContain('In brief');
    expect(out).toContain('Three things you learned');
    expect(out).toContain('Why these stories');
    expect(out).toContain('Tomorrow&#x27;s Morning Recall will ask you about these.');
  });

  it('gives every inner and last page a running head, and every page the footer', () => {
    expect(count(out, 'masthead-sm')).toBe(total - 1);
    const foot = ` · from ${countSources(m.layout)} sources`;
    for (const page of pages(out)) {
      expect(page).toContain(`Prepared for ${m.extras.displayName}${foot}`);
    }
  });

  it('points one teaser per inner story or brief, up to 5, at its page', () => {
    const list = teasers(m.layout);
    const row = out.slice(out.indexOf('class="teasers"'), out.indexOf('</nav>', out.indexOf('class="teasers"')));
    expect(count(row, 'class="teaser"')).toBe(list.length);
    for (const t of list) expect(row).toContain(`Page ${t.page}`);
  });

  it('links headlines and QR codes through /r with src=print and the edition id', () => {
    const appUrl = m.extras.appUrl;
    const qrStories = storiesWithQr(m.layout).length;
    expect(count(out, `href="${appUrl}/r/`)).toBeGreaterThanOrEqual(qrStories);
    expect(out).toContain(`src=print&amp;e=${E.id}`);
    for (const id of Object.keys(m.assets.qr)) expect(out).toContain(`data-qr="${id}"`);
    for (const item of printed(m.layout)) expect(out).toContain(esc(item.article.sourceName));
  });

  it('prints every story of the layout', () => {
    for (const item of printed(m.layout)) expect(out).toContain(esc(item.article.headline));
  });

  it('sets the briefs of an inner page under In brief on that page, linked like every story', () => {
    const k = m.layout.inner.findIndex((p) => (p.briefs ?? []).length > 0);
    const page = pages(out)[k + 1];
    expect(page).toContain('In brief');
    for (const b of m.layout.inner[k].briefs!) {
      expect(page).toContain(esc(b.article.headline));
      expect(page).toContain(`href="${m.extras.appUrl}/r/${b.article.id}?src=print&amp;e=${E.id}"`);
      expect(page).toContain(esc(b.article.sourceDomain));
    }
  });

  it('draws the paper-sunk fallback, never a broken <img>, when an image is missing', () => {
    expect(m.layout.lead.article.imageUrl).not.toBeNull();
    expect(out).toContain('class="img-fallback"');
    expect(out).not.toContain('<img');
  });

  it('inlines an image the model carries as a data URI', () => {
    const withImage: PrintModel = { ...m, assets: { ...m.assets, images: { [m.layout.lead.article.id]: 'data:image/jpeg;base64,AAAA' } } };
    expect(html(withImage)).toContain('src="data:image/jpeg;base64,AAAA"');
  });

  it('PrintEdition escapes markup-hostile text', () => {
    const hostile: Edition = {
      ...E,
      items: E.items.map((i, k) => (k === 0 ? { ...i, article: { ...i.article, headline: 'AT&T <b>"wins"</b>' } } : i)),
    };
    const markup = html(modelOf(hostile));
    expect(markup).toContain('AT&amp;T &lt;b&gt;');
    expect(markup).not.toContain('<b>"wins"');
  });
});

describe('Morrow fidelity', () => {
  const out = html(modelOf());

  it('keeps PRINT_CSS to layout: Morrow tokens only, no hex, font family, radius or shadow', () => {
    expect(PRINT_CSS).toContain('column-rule: 1px solid var(--rule)');
    expect(PRINT_CSS).toContain('hyphens: auto');
    expect(PRINT_CSS).toContain('repeat(5, 1fr)');
    expect(PRINT_CSS).toContain('@page { size: A4; margin: 0 }');
    expect(PRINT_CSS).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(PRINT_CSS).not.toContain('font-family');
    expect(PRINT_CSS).not.toContain('border-radius');
    expect(PRINT_CSS).not.toContain('box-shadow');
    expect(PRINT_CSS).not.toContain('--sec-');
  });

  it('prints no streak, quiz, button, feedback bar, why tag or emoji', () => {
    expect(out).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(out).not.toMatch(/streak/i);
    expect(out).not.toContain('Quiz me');
    expect(out).not.toContain('<button');
    expect(out).not.toContain('mw-fb');
    expect(out).not.toContain('mw-why');
  });

  it('composes the Morrow masthead, takeaway boxes and pull quotes', () => {
    expect(count(out, 'class="mw-masthead"')).toBe(1);
    expect(count(out, 'class="mw-takeaway"')).toBe(2);
    expect(out).toContain('class="mw-pq"');
  });
});

describe('takeaway lists', () => {
  const m = modelOf();

  it('share no story between page 1 and the last page', () => {
    const know = threeThingsToKnow(m);
    const learned = threeThingsLearned(m);
    expect(know).toHaveLength(3);
    expect(learned).toHaveLength(3);
    expect(know.filter((t) => learned.includes(t))).toEqual([]);
  });

  it('use key facts of the lead and rail first', () => {
    expect(threeThingsToKnow(m)[0]).toBe(m.layout.lead.article.keyFact);
  });

  it('fall back to the first sentence of the brief (or, past 25 words, the headline) when there is no key fact', () => {
    const noFacts: Edition = { ...E, items: E.items.map((i) => ({ ...i, article: { ...i.article, keyFact: null } })) };
    const nm = modelOf(noFacts);
    const fallbacks = nm.edition.items.map((i) => {
      const first = i.article.summary.brief.split(/(?<=[.!?])\s/)[0];
      return first.split(/\s+/).length <= 25 ? first : i.article.headline;
    });
    const all = [...threeThingsToKnow(nm), ...threeThingsLearned(nm)];
    expect(all).toHaveLength(6);
    for (const t of all) expect(fallbacks).toContain(t);
  });
});

describe('copy that real (extractive) editions bring', () => {
  const LONG =
    'WASHINGTON: President Donald Trump waived key Russia-related US sanctions and tariffs days before they were to take effect under a law he signed last month, including duties on the country’s goods and penalties for buying its oil and gas.';
  const words = (t: string) => t.split(/\s+/).filter(Boolean).length;
  /** The fixture with one story's copy replaced. */
  const withCopy = (id: string, patch: Partial<EditionItem['article']>): Edition => ({
    ...E,
    items: E.items.map((i) => (i.article.id === id ? { ...i, article: { ...i.article, ...patch } } : i)),
  });

  it('never sets a takeaway longer than 25 words (the TakeawayBox rule)', () => {
    expect(words(LONG)).toBeGreaterThan(25);
    const lead = E.items.find((i) => i.article.id === E.leadArticleId)!;
    const shortBrief = 'Small open models now match last year’s best systems at a tenth of the cost.';
    const m = modelOf(withCopy(lead.article.id, { keyFact: LONG, summary: { ...lead.article.summary, brief: shortBrief } }));
    expect(threeThingsToKnow(m)[0]).toBe(shortBrief);
    const m2 = modelOf(withCopy(lead.article.id, { keyFact: LONG, summary: { ...lead.article.summary, brief: LONG } }));
    expect(threeThingsToKnow(m2)[0]).toBe(lead.article.headline);
  });

  it('drops a deck that would repeat the start of the lead text', () => {
    const lead = E.items.find((i) => i.article.id === E.leadArticleId)!;
    const same = `${LONG} More words follow here.`;
    const m = modelOf(withCopy(lead.article.id, { whyItMatters: null, summary: { brief: LONG, std: same, deep: same } }));
    expect(html(m)).not.toContain('class="deck front__deck"');
    expect(html(modelOf())).toContain('class="deck front__deck"');
  });

  it('pulls a quote only when it is short and not already in the story text', () => {
    const layout = buildPrintLayout(E);
    const sectionLead = layout.inner[0].items[0];
    const longQuote = modelOf(withCopy(sectionLead.article.id, { whyItMatters: null, keyFact: LONG }));
    expect(pages(html(longQuote))[1]).not.toContain('class="mw-pq"');
    expect(pages(html(modelOf()))[1]).toContain('class="mw-pq"');
  });
});

describe('reasonLine', () => {
  it('counts why each printed story is in the paper, in the reader’s terms', () => {
    const line = reasonLine(modelOf());
    expect(line.startsWith('15 from topics you follow')).toBe(true);
    expect(line).toContain('2 trying something new');
    expect(line).toContain('1 step outside your usual');
    expect(line).not.toMatch(/algorithm|our AI/i);
  });
});
