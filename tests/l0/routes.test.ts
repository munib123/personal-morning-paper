// Contract guard for every §9.2 route.
// Written in the stub phase (L0). Lanes are now replacing stubs with real, authenticated handlers,
// so this file only pins what must stay true for ANY implementation:
//   - a 200 body parses with its contract schema;
//   - every other answer is a sanctioned status (400 invalid, 401 signed out, 403 forbidden,
//     404 missing, 501 not built yet, 503 degraded/fallback), never a crash (500);
//   - security rules: cron routes refuse unauthenticated callers, demo routes need DEMO_MODE.
// Owners test the real behaviour of their routes in their own lane tests.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  ArchiveEntrySchema,
  DemoClockResponseSchema,
  DescribeResponseSchema,
  EditionSchema,
  EventsResultSchema,
  HealthSchema,
  InterestWeightSchema,
  LearningViewSchema,
  OnboardingResponseSchema,
  PdfFallbackSchema,
  ProfileSchema,
  RebuildResponseSchema,
  SimulationResultSchema,
  StreakResponseSchema,
  TasteCardSchema,
} from '@/contracts/api';
import { FIXTURE_ARTICLES, FIXTURE_EDITION, FIXTURE_TAXONOMY } from '@/contracts/fixtures';
import { GET as getCronEditions, POST as postCronEditions } from '@/app/api/cron/editions/route';
import { GET as getCronIngest, POST as postCronIngest } from '@/app/api/cron/ingest/route';
import { POST as postClock } from '@/app/api/demo/clock/route';
import { POST as postFastForward } from '@/app/api/demo/fast-forward/route';
import { GET as getPdf } from '@/app/api/editions/[date]/pdf/route';
import { GET as getEditionByDate } from '@/app/api/editions/[date]/route';
import { POST as postRebuild } from '@/app/api/editions/rebuild/route';
import { GET as getArchive } from '@/app/api/editions/route';
import { GET as getToday } from '@/app/api/editions/today/route';
import { POST as postEvents } from '@/app/api/events/route';
import { GET as getHealth } from '@/app/api/health/route';
import { PATCH as patchInterests } from '@/app/api/me/interests/route';
import { GET as getLearning } from '@/app/api/me/learning/route';
import { PATCH as patchProfile } from '@/app/api/me/profile/route';
import { GET as getStreak } from '@/app/api/me/streak/route';
import { POST as postDescribe } from '@/app/api/onboarding/describe/route';
import { POST as postOnboarding } from '@/app/api/onboarding/route';
import { GET as getTaste } from '@/app/api/taste/route';
import { GET as getDemo } from '@/app/demo/route';
import { GET as getOutbound } from '@/app/r/[articleId]/route';

// Handlers are called directly with plain Request objects: no Next server, no session cookie.
const ORIGIN = 'http://localhost:3000';
const req = new Request(`${ORIGIN}/`);
const get = (path: string) => new Request(`${ORIGIN}${path}`);
const send = (method: 'POST' | 'PATCH', path: string, body: unknown) =>
  new Request(`${ORIGIN}${path}`, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const ctx = <P>(params: P) => ({ params: Promise.resolve(params) });

const SANCTIONED_ERRORS = [400, 401, 403, 404, 501, 503];

/** 200 → body must match `schema`; anything else must be a sanctioned status, never a 500. */
async function expectContract(res: Response, schema: z.ZodTypeAny, label: string): Promise<unknown | null> {
  if (res.status === 200) {
    const body = await res.json();
    const parsed = schema.safeParse(body);
    expect(parsed.success, `${label}: 200 body must match its contract ${parsed.success ? '' : JSON.stringify(parsed.error.issues.slice(0, 3))}`).toBe(true);
    return body;
  }
  expect(SANCTIONED_ERRORS, `${label}: unexpected status ${res.status}`).toContain(res.status);
  return null;
}

/** Bad input must be rejected (400), or the caller stopped earlier because nobody is signed in (401). */
function expectRejected(res: Response, label: string) {
  expect([400, 401], `${label}: got ${res.status}`).toContain(res.status);
}

const onboardingInput = {
  displayName: 'Ayesha',
  paperName: null,
  picks: FIXTURE_TAXONOMY.slice(0, 3).map((t) => ({ slug: t.slug, via: 'tile' as const })),
  blocked: [],
  taste: [],
  presentation: { timeBudget: 15, depth: 'basics', lang: 'en' },
  city: 'Islamabad',
  tz: 'Asia/Karachi',
};

beforeEach(() => {
  // Real handlers must degrade fast when the DB is unreachable. Point Supabase at a closed local
  // port so every network call fails at once (CI's placeholder host can take seconds to fail DNS).
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:9');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
  vi.stubEnv('SUPABASE_SECRET_KEY', 'sb_secret_test');
  // postgrest-js retries idempotent reads with backoff (~7 s per lookup on a dead host). A fast,
  // non-retryable 400 makes every DB read fail at once and deterministically.
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ message: 'db unavailable in tests' }), { status: 400, headers: { 'content-type': 'application/json' } })));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('every §9.2 route answers with its contract (or a sanctioned error, never a 500)', () => {
  it('GET /api/editions/today → Edition', async () => {
    await expectContract(await getToday(), EditionSchema, 'editions/today');
  });

  it('GET /api/editions → ArchiveEntry[], also for empty or out-of-range limits', async () => {
    for (const q of ['?limit=60', '?limit=', '?limit=-5']) await expectContract(await getArchive(get(`/api/editions${q}`)), z.array(ArchiveEntrySchema), `editions${q}`);
  });

  it('GET /api/editions/[date] → Edition, and a date with no edition is 404 (or 401 signed out)', async () => {
    await expectContract(await getEditionByDate(req, ctx({ date: FIXTURE_EDITION.date })), EditionSchema, 'editions/[date]');
    expect([401, 404]).toContain((await getEditionByDate(req, ctx({ date: '1999-01-01' }))).status);
  });

  it('GET /api/editions/[date]/pdf → a PDF redirect or the print fallback', async () => {
    const res = await getPdf(req, ctx({ date: FIXTURE_EDITION.date }));
    expect([302, 303, 307, 401, 404, 503], `pdf: ${res.status}`).toContain(res.status);
    if (res.status === 503) expect(PdfFallbackSchema.parse(await res.json())).toEqual({ fallback: `/paper/${FIXTURE_EDITION.date}/print` });
  });

  it('POST /api/editions/rebuild → { edition, deltas }, also for a bare POST', async () => {
    await expectContract(await postRebuild(send('POST', '/api/editions/rebuild', {})), RebuildResponseSchema, 'rebuild');
    await expectContract(await postRebuild(new Request(`${ORIGIN}/api/editions/rebuild`, { method: 'POST' })), RebuildResponseSchema, 'rebuild (bare)');
  });

  it('POST /api/events → EventsResult, including a sendBeacon text/plain body', async () => {
    await expectContract(await postEvents(send('POST', '/api/events', { events: [{ type: 'open' }] })), EventsResultSchema, 'events');
    const beacon = new Request(`${ORIGIN}/api/events`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ events: [{ type: 'open', articleId: FIXTURE_ARTICLES[0].id, meta: { mode: 'sheet' } }] }),
    });
    await expectContract(await postEvents(beacon), EventsResultSchema, 'events (beacon)');
  });

  it('POST /api/onboarding → { editionDate }', async () => {
    await expectContract(await postOnboarding(send('POST', '/api/onboarding', onboardingInput)), OnboardingResponseSchema, 'onboarding');
  });

  it('POST /api/onboarding/describe → { picks, blocked, provider }', async () => {
    await expectContract(await postDescribe(send('POST', '/api/onboarding/describe', { text: 'less cricket, more climate' })), DescribeResponseSchema, 'describe');
  });

  it('GET /api/taste → TasteCard[]', async () => {
    const picks = FIXTURE_TAXONOMY.slice(0, 2).map((t) => t.slug).join(',');
    await expectContract(await getTaste(get(`/api/taste?picks=${picks}`)), z.array(TasteCardSchema), 'taste');
  });

  it('GET /api/me/learning → LearningView', async () => {
    await expectContract(await getLearning(get('/api/me/learning?since=7')), LearningViewSchema, 'me/learning');
  });

  it('PATCH /api/me/interests → InterestWeight[]', async () => {
    await expectContract(await patchInterests(send('PATCH', '/api/me/interests', { slug: FIXTURE_TAXONOMY[0].slug, action: 'pin' })), z.array(InterestWeightSchema), 'me/interests');
  });

  it('PATCH /api/me/profile → Profile', async () => {
    await expectContract(await patchProfile(send('PATCH', '/api/me/profile', { city: 'Lahore', presentation: { timeBudget: 30 } })), ProfileSchema, 'me/profile');
  });

  it('GET /api/me/streak → { streak, heatmap }', async () => {
    await expectContract(await getStreak(), StreakResponseSchema, 'me/streak');
  });

  it('GET /api/health always answers HealthSchema, even without Supabase env', async () => {
    expect(HealthSchema.safeParse(await (await getHealth()).json()).success).toBe(true);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_SECRET_KEY', '');
    vi.stubEnv('DEMO_FALLBACK', '1');
    vi.resetModules(); // a fresh admin-client memo, whatever earlier tests did
    const { GET } = await import('@/app/api/health/route');
    const res = await GET();
    expect(res.status).toBe(200);
    expect(HealthSchema.parse(await res.json())).toMatchObject({ db: false, fallback: true });
  });

  it('GET /r/[articleId] redirects to an http(s) original, or 404s an unknown id', async () => {
    const article = FIXTURE_ARTICLES[0];
    for (const res of [
      await getOutbound(get(`/r/${article.id}?src=web&e=${FIXTURE_EDITION.id}`), ctx({ articleId: article.id })),
      await getOutbound(get(`/r/${article.id}?src=print`), ctx({ articleId: article.id })),
    ]) {
      expect([302, 307, 404], `/r: ${res.status}`).toContain(res.status);
      if (res.status !== 404) expect(res.headers.get('location')).toMatch(/^https?:\/\//);
    }
    expect((await getOutbound(get('/r/not-an-article'), ctx({ articleId: 'not-an-article' }))).status).toBe(404);
  });

  it('GET /demo always redirects (to the demo paper, or back to /start when it cannot sign in)', async () => {
    const res = await getDemo(get('/demo'));
    expect([302, 303, 307]).toContain(res.status);
    expect(res.headers.get('location')).toMatch(/\/(today|start)/);
  });
});

describe('bad input is rejected (400, or 401 when signed out), never a 500', () => {
  it.each([
    ['an unknown signal type', { events: [{ type: 'like' }] }],
    ['an empty batch', { events: [] }],
    ['no events key', {}],
    ['51 events', { events: Array(51).fill({ type: 'open' }) }],
  ])('POST /api/events with %s', async (_label, body) => {
    expectRejected(await postEvents(send('POST', '/api/events', body)), `events ${_label}`);
  });

  it('POST /api/events with malformed JSON', async () => {
    expectRejected(await postEvents(new Request(`${ORIGIN}/api/events`, { method: 'POST', body: '{"events": [' })), 'events malformed');
  });

  it('POST /api/onboarding without picks', async () => {
    expectRejected(await postOnboarding(send('POST', '/api/onboarding', { ...onboardingInput, picks: undefined })), 'onboarding');
  });

  it('POST /api/onboarding/describe without text', async () => {
    expectRejected(await postDescribe(send('POST', '/api/onboarding/describe', {})), 'describe');
  });

  it('PATCH /api/me/interests with an unknown action', async () => {
    expectRejected(await patchInterests(send('PATCH', '/api/me/interests', { slug: FIXTURE_TAXONOMY[0].slug, action: 'boost' })), 'interests');
  });

  it('GET /api/editions and /api/me/learning with non-numeric queries', async () => {
    expectRejected(await getArchive(get('/api/editions?limit=abc')), 'editions limit=abc');
    expectRejected(await getLearning(get('/api/me/learning?since=week')), 'learning since=week');
  });

  it('PATCH /api/me/profile with an unsupported paper length', async () => {
    expectRejected(await patchProfile(send('PATCH', '/api/me/profile', { presentation: { timeBudget: 7 } })), 'profile');
  });
});

describe('security rules hold for every implementation', () => {
  it('cron routes refuse callers without the CRON_SECRET bearer token', async () => {
    vi.stubEnv('CRON_SECRET', 'test-secret');
    const handlers: Array<(request: Request) => Promise<Response>> = [getCronIngest, postCronIngest, getCronEditions, postCronEditions];
    for (const h of handlers) expect([401, 403, 501]).toContain((await h(req)).status);
  });

  it('demo clock and fast-forward are 403 unless DEMO_MODE=1', async () => {
    vi.stubEnv('DEMO_MODE', '');
    expect((await postClock(send('POST', '/api/demo/clock', { now: null }))).status).toBe(403);
    expect((await postFastForward(send('POST', '/api/demo/fast-forward', {}))).status).toBe(403);
  });

  it('the demo clock sets, then clears, the subah_now cookie (§9.7)', async () => {
    vi.stubEnv('DEMO_MODE', '1');
    const set = await postClock(send('POST', '/api/demo/clock', { now: '2026-10-18T02:00:00.000Z' }));
    expect(set.status).toBe(200);
    expect(DemoClockResponseSchema.parse(await set.json())).toEqual({ now: '2026-10-18T02:00:00.000Z' });
    expect(set.headers.get('set-cookie')).toMatch(/subah_now=2026-10-18T02/);
    const cleared = await postClock(send('POST', '/api/demo/clock', { now: null }));
    expect(cleared.status).toBe(200);
    expect(cleared.headers.get('set-cookie')).toMatch(/subah_now=;.*Path=\//);
  });

  it('fast-forward answers a SimulationResult in demo mode (or a sanctioned error)', async () => {
    vi.stubEnv('DEMO_MODE', '1');
    await expectContract(await postFastForward(send('POST', '/api/demo/fast-forward', { days: 7 })), SimulationResultSchema, 'fast-forward');
  });
});
