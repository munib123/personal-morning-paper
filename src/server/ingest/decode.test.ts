import { describe, expect, it } from 'vitest';
import { decodeFeedBody } from './decode';

// Geo and The News serve ISO-8859-1; the bytes are built inline (no binary fixture).
const latin1 = (s: string) => Buffer.from(s, 'latin1');

describe('decodeFeedBody', () => {
  it('honours the XML prolog encoding when the header has no charset (WHATWG maps iso-8859-1 to windows-1252)', () => {
    const body = latin1('<?xml version="1.0" encoding="ISO-8859-1"?><rss><channel><title>Caf\xe9 \x92quote\x92</title></channel></rss>');
    expect(decodeFeedBody(body, 'text/xml')).toContain('Café ’quote’');
  });

  it('honours the header charset', () => {
    expect(decodeFeedBody(latin1('<rss>Caf\xe9</rss>'), 'application/rss+xml; charset=ISO-8859-1')).toContain('Café');
  });

  it('falls back to windows-1252 when bytes labelled utf-8 are not valid utf-8', () => {
    expect(decodeFeedBody(latin1('<rss>Caf\xe9</rss>'), 'text/xml; charset=utf-8')).toContain('Café');
  });

  it('decodes valid utf-8 as utf-8 by default', () => {
    expect(decodeFeedBody(Buffer.from('<rss>Café ’q’ دنیا</rss>', 'utf8'), null)).toBe('<rss>Café ’q’ دنیا</rss>');
  });

  it('strips a BOM and leading whitespace before the prolog (Dezeen)', () => {
    const out = decodeFeedBody(Buffer.from('﻿\n\n  <?xml version="1.0"?><rss/>', 'utf8'), null);
    expect(out.startsWith('<?xml')).toBe(true);
  });
});
