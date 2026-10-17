import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { GET } from './route';

type CookieOpts = { cookies: { getAll: () => unknown; setAll: (c: { name: string; value: string; options: object }[], h?: Record<string, string>) => void } };
const ssr = vi.hoisted(() => ({ create: vi.fn(), signIn: vi.fn() }));
vi.mock('@supabase/ssr', () => ({ createServerClient: ssr.create }));

let options: CookieOpts | null = null;
beforeEach(() => {
  ssr.create.mockReset();
  ssr.signIn.mockReset();
  options = null;
  ssr.create.mockImplementation((_url: string, _key: string, opts: CookieOpts) => {
    options = opts;
    return { auth: { signInWithPassword: ssr.signIn } };
  });
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
  vi.stubEnv('DEMO_USER_EMAIL', 'demo@subah.app');
  vi.stubEnv('DEMO_USER_PASSWORD', 'pw');
});
afterEach(() => { vi.unstubAllEnvs(); });

const demo = () => GET(new Request('http://localhost:3005/demo', { headers: { cookie: 'theme=night' } }));

describe('GET /demo', () => {
  test('signs the demo persona in and lands on today, with the session cookie on the redirect', async () => {
    ssr.signIn.mockImplementation(async () => {
      options!.cookies.setAll([{ name: 'sb-test-auth-token', value: 'token', options: { path: '/', sameSite: 'lax' } }], { 'Cache-Control': 'private, no-store' });
      return { error: null };
    });
    const res = await demo();
    expect(ssr.signIn).toHaveBeenCalledWith({ email: 'demo@subah.app', password: 'pw' });
    expect([302, 303, 307]).toContain(res.status);
    expect(new URL(res.headers.get('location')!).pathname).toBe('/today');
    expect(res.headers.get('set-cookie')).toContain('sb-test-auth-token=token');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(options!.cookies.getAll()).toEqual([{ name: 'theme', value: 'night' }]);
  });

  test('a refused sign-in sends the reader back to /start with a note', async () => {
    ssr.signIn.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
    const res = await demo();
    const location = new URL(res.headers.get('location')!);
    expect(location.pathname).toBe('/start');
    expect(location.searchParams.get('demo')).toBe('unavailable');
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  test('missing demo credentials never reach Supabase', async () => {
    vi.stubEnv('DEMO_USER_PASSWORD', '');
    const res = await demo();
    expect(new URL(res.headers.get('location')!).search).toBe('?demo=unavailable');
    expect(ssr.create).not.toHaveBeenCalled();
  });

  test('a network failure is unavailable too, never a 500', async () => {
    ssr.signIn.mockRejectedValue(new TypeError('fetch failed'));
    const res = await demo();
    expect([302, 303, 307]).toContain(res.status);
    expect(new URL(res.headers.get('location')!).pathname).toBe('/start');
  });
});
