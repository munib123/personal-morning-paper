import type { NextResponse } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DemoClockResponseSchema } from '@/contracts/api';
import { POST } from './route';

const URL_ = 'http://localhost:3007/api/demo/clock';
const post = (body: unknown) =>
  POST(new Request(URL_, { method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) }));
const cookieOf = (res: Response) => (res as NextResponse).cookies.get('subah_now')?.value;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/demo/clock', () => {
  it('403 unless DEMO_MODE=1 (as the L0 route contract test pins)', async () => {
    vi.stubEnv('DEMO_MODE', '');
    const res = await post({ now: '2026-10-18T02:00:00.000Z' });
    expect(res.status).toBe(403);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('sets the cookie', async () => {
    vi.stubEnv('DEMO_MODE', '1');
    const res = await post({ now: '2026-10-18T02:00:00.000Z' });
    expect(res.status).toBe(200);
    const body = DemoClockResponseSchema.parse(await res.json());
    expect(body).toEqual({ now: '2026-10-18T02:00:00.000Z' });
    expect(cookieOf(res)).toBe('2026-10-18T02:00:00.000Z');
    expect(res.headers.get('set-cookie')).toContain('Path=/');
    expect(res.headers.get('set-cookie')).toContain('HttpOnly');
  });

  it('stores UTC', async () => {
    vi.stubEnv('DEMO_MODE', '1');
    const res = await post({ now: '2026-10-18T07:00:00+05:00' });
    expect(cookieOf(res)).toBe('2026-10-18T02:00:00.000Z');
    expect(await res.json()).toEqual({ now: '2026-10-18T02:00:00.000Z' });
  });

  it('null clears it and answers the real time', async () => {
    vi.stubEnv('DEMO_MODE', '1');
    const res = await post({ now: null });
    expect(res.status).toBe(200);
    expect(cookieOf(res)).toBe('');
    expect(res.headers.get('set-cookie')).toContain('Path=/');
    const { now } = DemoClockResponseSchema.parse(await res.json());
    expect(Number.isNaN(Date.parse(now))).toBe(false);
  });

  it('rejects junk', async () => {
    vi.stubEnv('DEMO_MODE', '1');
    expect((await post({ now: 'tomorrow' })).status).toBe(400);
    expect((await post('not json')).status).toBe(400);
    expect((await post({})).status).toBe(400);
  });
});
