import { describe, expect, it } from 'vitest';
import { resolvePdfAction } from './pdf-action';

const DATE = '2026-10-17';
const PRINT = '/paper/2026-10-17/print';

describe('resolvePdfAction', () => {
  it('downloads when the route answered with the PDF itself', () => {
    expect(resolvePdfAction({ ok: true, status: 200, contentType: 'application/pdf' }, DATE)).toEqual({ kind: 'download' });
    expect(resolvePdfAction({ ok: true, status: 200, contentType: 'application/pdf; charset=binary' }, DATE)).toEqual({ kind: 'download' });
  });

  it('opens the fallback the route names on a 503', () => {
    const res = { ok: false, status: 503, contentType: 'application/json', body: { fallback: PRINT } };
    expect(resolvePdfAction(res, DATE)).toEqual({ kind: 'fallback', href: PRINT });
  });

  it('opens the print route when a 200 is not a PDF', () => {
    expect(resolvePdfAction({ ok: true, status: 200, contentType: 'text/html' }, DATE)).toEqual({ kind: 'fallback', href: PRINT });
  });

  it('opens the print route on 401 or a malformed body', () => {
    expect(resolvePdfAction({ ok: false, status: 401, contentType: 'application/json', body: { error: 'unauthorized' } }, DATE)).toEqual({
      kind: 'fallback',
      href: PRINT,
    });
    expect(resolvePdfAction({ ok: false, status: 500, contentType: null }, DATE)).toEqual({ kind: 'fallback', href: PRINT });
  });

  it('never follows a fallback that leaves the site', () => {
    const away = { ok: false, status: 503, contentType: 'application/json', body: { fallback: 'https://evil.example/x' } };
    expect(resolvePdfAction(away, DATE)).toEqual({ kind: 'fallback', href: PRINT });
    const protocolRelative = { ok: false, status: 503, contentType: 'application/json', body: { fallback: '//evil.example/x' } };
    expect(resolvePdfAction(protocolRelative, DATE)).toEqual({ kind: 'fallback', href: PRINT });
  });
});
