import { afterEach, describe, expect, it, vi } from 'vitest';
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
import { FIXTURE_ARTICLES, FIXTURE_EDITION, FIXTURE_PROFILE, FIXTURE_TAXONOMY } from '@/contracts/fixtures';
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

// The handlers are imported directly and called with plain Request objects (no Next server, no env).
const ORIGIN = 'http://localhost:3000';
const req = new Request(`${ORIGIN}/`);
const get = (path: string) => new Request(`${ORIGIN}${path}`);
const send = (method: 'POST' | 'PATCH', path: string, body: unknown) =>
  new Request(`${ORIGIN}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const jsonReq = (body: unknown) => send('POST', '/api/events', body);
const ctx = <P>(params: P) => ({ params: Promise.resolve(params) });

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

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('L0 route stubs (plan Task 4, Step 1)', () => {
  it('GET /api/editions/today returns the 20-story fixture edition', async () => {
    expect(EditionSchema.parse(await (await getToday()).json()).items).toHaveLength(20);
  });

  it('POST /api/events rejects a batch of 51 events with 400', async () => {
    expect((await postEvents(jsonReq({ events: Array(51).fill({ type: 'open' }) }))).status).toBe(400);
  });

  it('POST /api/events answers an EventsResult with accepted = 1', async () => {
    expect(EventsResultSchema.parse(await (await postEvents(jsonReq({ events: [{ type: 'open' }] }))).json()).accepted).toBe(1);
  });

  it('GET /api/editions/[date] is 404 for a date with no edition', async () => {
    expect((await getEditionByDate(req, ctx({ date: '1999-01-01' }))).status).toBe(404);
  });

  it('GET /api/editions/[date]/pdf is 503 with the print fallback', async () => {
    const res = await getPdf(req, ctx({ date: '2026-10-17' }));
    expect(res.status).toBe(503);
    expect(PdfFallbackSchema.parse(await res.json())).toEqual({ fallback: '/paper/2026-10-17/print' });
  });

  it('both cron routes answer 501 on GET and POST', async () => {
    const handlers: Array<(request: Request) => Promise<Response>> = [getCronIngest, postCronIngest, getCronEditions, postCronEditions];
    for (const h of handlers) expect((await h(req)).status).toBe(501);
  });

  it('GET /api/health matches HealthSchema', async () => {
    expect(HealthSchema.safeParse(await (await getHealth()).json()).success).toBe(true);
  });
});

describe('bad input is a 400 JSON error, never a 500', () => {
  it.each([
    ['an unknown signal type', { events: [{ type: 'like' }] }],
    ['an empty batch', { events: [] }],
    ['no events key', {}],
  ])('POST /api/events with %s', async (_label, body) => {
    const res = await postEvents(jsonReq(body));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'invalid', issues: expect.any(Array) });
  });

  it('POST /api/events with malformed JSON', async () => {
    const res = await postEvents(new Request(`${ORIGIN}/api/events`, { method: 'POST', body: '{"events": [' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'invalid' });
  });

  it('POST /api/onboarding without picks', async () => {
    // JSON drops undefined, so the body has no picks at all.
    expect((await postOnboarding(send('POST', '/api/onboarding', { ...onboardingInput, picks: undefined }))).status).toBe(400);
  });

  it('POST /api/onboarding/describe without text', async () => {
    expect((await postDescribe(send('POST', '/api/onboarding/describe', {}))).status).toBe(400);
  });

  it('PATCH /api/me/interests with an unknown action', async () => {
    const res = await patchInterests(send('PATCH', '/api/me/interests', { slug: FIXTURE_TAXONOMY[0].slug, action: 'boost' }));
    expect(res.status).toBe(400);
  });

  it('PATCH /api/me/profile with an unsupported paper length', async () => {
    const res = await patchProfile(send('PATCH', '/api/me/profile', { presentation: { timeBudget: 7 } }));
    expect(res.status).toBe(400);
  });
});

describe('every §9.2 route answers with its contract', () => {
  it('POST /api/events accepts a sendBeacon text/plain body', async () => {
    const res = await postEvents(
      new Request(`${ORIGIN}/api/events`, {
        method: 'POST',
        headers: { 'content-type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify({ events: [{ type: 'open', articleId: FIXTURE_ARTICLES[0].id, meta: { mode: 'sheet' } }] }),
      }),
    );
    expect(res.status).toBe(200);
    expect(EventsResultSchema.parse(await res.json()).accepted).toBe(1);
  });

  it('POST /api/onboarding → { editionDate }', async () => {
    const res = await postOnboarding(send('POST', '/api/onboarding', onboardingInput));
    expect(res.status).toBe(200);
    expect(OnboardingResponseSchema.parse(await res.json())).toEqual({ editionDate: FIXTURE_EDITION.date });
  });

  it('POST /api/onboarding/describe → { picks, blocked, provider }', async () => {
    const res = await postDescribe(send('POST', '/api/onboarding/describe', { text: 'less cricket, more climate' }));
    expect(res.status).toBe(200);
    expect(DescribeResponseSchema.safeParse(await res.json()).success).toBe(true);
  });

  it('GET /api/taste → 8 taste cards, 2 of them wildcards', async () => {
    const picks = FIXTURE_TAXONOMY.slice(0, 2).map((t) => t.slug).join(',');
    const res = await getTaste(get(`/api/taste?picks=${picks}`));
    expect(res.status).toBe(200);
    const cards = z.array(TasteCardSchema).parse(await res.json());
    expect(cards).toHaveLength(8);
    expect(cards.filter((c) => c.wildcard)).toHaveLength(2);
  });

  it('GET /api/editions → the fixture archive', async () => {
    const res = await getArchive(get('/api/editions?limit=60'));
    expect(res.status).toBe(200);
    expect(z.array(ArchiveEntrySchema).parse(await res.json())).toHaveLength(10);
  });

  it('GET /api/editions/[date] → the fixture edition for its own date', async () => {
    const res = await getEditionByDate(req, ctx({ date: FIXTURE_EDITION.date }));
    expect(res.status).toBe(200);
    const edition = EditionSchema.parse(await res.json());
    expect(edition.reserve).toHaveLength(8);
    expect(Object.keys(edition.sectionNames).length).toBeGreaterThan(0);
  });

  it('POST /api/editions/rebuild → { edition, deltas }, also for a bare POST', async () => {
    const withBody = await postRebuild(send('POST', '/api/editions/rebuild', {}));
    expect(RebuildResponseSchema.parse(await withBody.json()).edition.items).toHaveLength(20);
    const bare = await postRebuild(new Request(`${ORIGIN}/api/editions/rebuild`, { method: 'POST' }));
    expect(bare.status).toBe(200);
    expect(RebuildResponseSchema.safeParse(await bare.json()).success).toBe(true);
  });

  it('GET /api/me/learning → LearningView', async () => {
    const res = await getLearning(get('/api/me/learning?since=7'));
    expect(res.status).toBe(200);
    expect(LearningViewSchema.safeParse(await res.json()).success).toBe(true);
  });

  it('PATCH /api/me/interests → InterestWeight[]', async () => {
    const res = await patchInterests(send('PATCH', '/api/me/interests', { slug: FIXTURE_TAXONOMY[0].slug, action: 'pin' }));
    expect(res.status).toBe(200);
    expect(z.array(InterestWeightSchema).safeParse(await res.json()).success).toBe(true);
  });

  it('PATCH /api/me/profile → the patched Profile', async () => {
    const res = await patchProfile(send('PATCH', '/api/me/profile', { city: 'Lahore', presentation: { timeBudget: 30 } }));
    expect(res.status).toBe(200);
    const profile = ProfileSchema.parse(await res.json());
    expect(profile.city).toBe('Lahore');
    expect(profile.presentation).toEqual({ ...FIXTURE_PROFILE.presentation, timeBudget: 30 });
  });

  it('GET /api/me/streak → { streak, heatmap }', async () => {
    const res = await getStreak();
    expect(res.status).toBe(200);
    expect(StreakResponseSchema.safeParse(await res.json()).success).toBe(true);
  });

  it('POST /api/demo/clock and /api/demo/fast-forward are 403 unless DEMO_MODE=1', async () => {
    vi.stubEnv('DEMO_MODE', '');
    expect((await postClock(send('POST', '/api/demo/clock', { now: null }))).status).toBe(403);
    expect((await postFastForward(send('POST', '/api/demo/fast-forward', {}))).status).toBe(403);
  });

  it('POST /api/demo/clock sets, then clears, the subah_now cookie', async () => {
    vi.stubEnv('DEMO_MODE', '1');
    const set = await postClock(send('POST', '/api/demo/clock', { now: '2026-10-18T02:00:00.000Z' }));
    expect(set.status).toBe(200);
    expect(DemoClockResponseSchema.parse(await set.json())).toEqual({ now: '2026-10-18T02:00:00.000Z' });
    expect(set.headers.get('set-cookie')).toMatch(/subah_now=2026-10-18T02/);
    const cleared = await postClock(send('POST', '/api/demo/clock', { now: null }));
    expect(cleared.status).toBe(200);
    expect(DemoClockResponseSchema.safeParse(await cleared.json()).success).toBe(true);
    expect(cleared.headers.get('set-cookie')).toMatch(/subah_now=;.*Path=\//);
  });

  it('POST /api/demo/fast-forward → SimulationResult in demo mode', async () => {
    vi.stubEnv('DEMO_MODE', '1');
    const res = await postFastForward(send('POST', '/api/demo/fast-forward', { days: 7 }));
    expect(res.status).toBe(200);
    expect(SimulationResultSchema.safeParse(await res.json()).success).toBe(true);
  });

  it('GET /api/health never throws without Supabase env and reports DEMO_FALLBACK', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_SECRET_KEY', '');
    vi.stubEnv('DEMO_FALLBACK', '1');
    vi.resetModules(); // a fresh admin-client memo, whatever earlier tests did
    const { GET } = await import('@/app/api/health/route');
    const res = await GET();
    expect(res.status).toBe(200);
    expect(HealthSchema.parse(await res.json())).toMatchObject({ db: false, lastIngest: null, fallback: true });
  });

  it('GET /r/[articleId] → 302 to the original article; unknown ids are 404', async () => {
    const article = FIXTURE_ARTICLES[0];
    const res = await getOutbound(get(`/r/${article.id}?src=web&e=${FIXTURE_EDITION.id}`), ctx({ articleId: article.id }));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(new URL(article.url).toString());
    const printed = await getOutbound(get(`/r/${article.id}?src=print`), ctx({ articleId: article.id }));
    expect(printed.status).toBe(302);
    const missing = await getOutbound(get('/r/not-an-article'), ctx({ articleId: 'not-an-article' }));
    expect(missing.status).toBe(404);
  });

  it('GET /demo → 302 to /today', async () => {
    const res = await getDemo(get('/demo'));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(`${ORIGIN}/today`);
  });
});
