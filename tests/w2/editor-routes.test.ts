// W2 "Tell your editor" routes, in the style of tests/l0/routes.test.ts: handlers called directly, Supabase
// pointed at a dead port and fetch answering a fast 400, so nothing retries. The session and the editor
// functions are real unless a test switches them (the hoisted `h`).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as postApply } from '@/app/api/editor/apply/route';
import { POST as postTell } from '@/app/api/editor/tell/route';
import type { EditorChange } from '@/server/editor/propose';
import { ApplyResponseSchema, TellResponseSchema } from '@/server/editor/schema';

const h = vi.hoisted(() => ({
  user: null as null | { userId: string; isAnonymous: boolean },
  tell: null as null | ((userId: string, text: string, now: Date) => Promise<unknown>),
  apply: null as null | ((userId: string, changes: unknown[], now: Date) => Promise<unknown>),
}));

vi.mock('@/server/auth/session', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/server/auth/session')>();
  return { ...real, requireUser: () => (h.user ? Promise.resolve(h.user) : real.requireUser()) };
});

vi.mock('@/server/editor', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/server/editor')>();
  return {
    ...real,
    tellEditor: (userId: string, text: string, now: Date) => (h.tell ? h.tell(userId, text, now) : real.tellEditor(userId, text, now)),
    applyEditorChanges: (userId: string, changes: EditorChange[], now: Date) => (h.apply ? h.apply(userId, changes, now) : real.applyEditorChanges(userId, changes, now)),
  };
});

const ORIGIN = 'http://localhost:3000';
const send = (path: string, body: unknown) => new Request(`${ORIGIN}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const tell = (body: unknown) => postTell(send('/api/editor/tell', body));
const apply = (body: unknown) => postApply(send('/api/editor/apply', body));
const USER = { userId: '5d9967f0-a20e-4298-8e5a-69322679956a', isAnonymous: false };

const change = (o: Partial<EditorChange> = {}): EditorChange => ({ slug: 'sports.cricket', name: 'Cricket', before: 0.6, after: 0.75, action: 'raise', reason: 'You said "more cricket".', ...o });

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:9');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
  vi.stubEnv('SUPABASE_SECRET_KEY', 'sb_secret_test');
  vi.stubEnv('GEMINI_API_KEY', ''); // never a live model call from a test
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ message: 'db unavailable in tests' }), { status: 400, headers: { 'content-type': 'application/json' } })));
});

afterEach(() => {
  h.user = null;
  h.tell = null;
  h.apply = null;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('signed out', () => {
  it('both routes answer 401 before reading the body', async () => {
    for (const res of [await tell({ text: 'more cricket' }), await apply({ changes: [change()] }), await tell({}), await apply({})]) {
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'unauthorized' });
    }
  });
});

describe('signed in: bad bodies are 400, never a call into the editor', () => {
  beforeEach(() => {
    h.user = USER;
    h.tell = vi.fn();
    h.apply = vi.fn();
  });

  it.each([
    ['no text', {}],
    ['empty text', { text: '' }],
    ['only spaces', { text: '   ' }],
    ['more than 500 characters', { text: 'more cricket '.repeat(40) }],
    ['a number', { text: 42 }],
  ])('POST /api/editor/tell with %s', async (_label, body) => {
    const res = await tell(body);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'invalid' });
    expect(h.tell).not.toHaveBeenCalled();
  });

  it('POST /api/editor/tell with malformed JSON', async () => {
    const res = await postTell(new Request(`${ORIGIN}/api/editor/tell`, { method: 'POST', body: '{"text": ' }));
    expect(res.status).toBe(400);
  });

  it.each([
    ['no changes key', {}],
    ['an empty list', { changes: [] }],
    ['7 changes', { changes: Array.from({ length: 7 }, () => change()) }],
    ['a weight above 1', { changes: [change({ after: 1.4 })] }],
    ['a negative weight', { changes: [change({ before: -0.1 })] }],
    ['an unknown action', { changes: [{ ...change(), action: 'boost' }] }],
    ['a slug that is not a topic slug', { changes: [change({ slug: 'DROP TABLE' })] }],
  ])('POST /api/editor/apply with %s', async (_label, body) => {
    const res = await apply(body);
    expect(res.status).toBe(400);
    expect(h.apply).not.toHaveBeenCalled();
  });
});

describe('signed in: good bodies', () => {
  beforeEach(() => {
    h.user = USER;
  });

  it('tell passes the trimmed text and the request clock, and answers the proposal', async () => {
    const proposal = { changes: [change()], unmatched: ['quilting'], provider: 'keyword' as const };
    h.tell = vi.fn(async () => proposal);
    const res = await tell({ text: '  more cricket and quilting  ' });
    expect(res.status).toBe(200);
    expect(TellResponseSchema.parse(await res.json())).toEqual(proposal);
    expect(h.tell).toHaveBeenCalledWith(USER.userId, 'more cricket and quilting', expect.any(Date));
  });

  it('apply passes the parsed changes and answers { edition }', async () => {
    const summary = { date: '2026-10-17', number: 9, leadHeadline: 'Pakistan level the series in Rawalpindi', changed: 1 };
    h.apply = vi.fn(async () => summary);
    const res = await apply({ changes: [change()] });
    expect(res.status).toBe(200);
    expect(ApplyResponseSchema.parse(await res.json())).toEqual({ edition: summary });
    expect(h.apply).toHaveBeenCalledWith(USER.userId, [change()], expect.any(Date));
  });

  it('a 409 from the editor (not onboarded) passes through', async () => {
    h.tell = vi.fn(async () => {
      throw Response.json({ error: 'not_onboarded' }, { status: 409 });
    });
    expect((await tell({ text: 'more cricket' })).status).toBe(409);
  });

  it('with the database down both routes answer a calm 503, never a 500', async () => {
    const t = await tell({ text: 'more cricket' });
    expect(t.status).toBe(503);
    expect(await t.json()).toEqual({ error: 'unavailable' });
    const a = await apply({ changes: [change()] });
    expect(a.status).toBe(503);
  });
});
