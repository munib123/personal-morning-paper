import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { config, proxy } from '@/proxy';

describe('proxy', () => {
  it('passes through without Supabase env instead of throwing', async () => {
    const saved = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY };
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const res = await proxy(new NextRequest('http://localhost/today'));
    expect(res.status).toBe(200);
    if (saved.url) process.env.NEXT_PUBLIC_SUPABASE_URL = saved.url;
    if (saved.key) process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = saved.key;
  });

  it('skips static assets in its matcher', () => {
    expect(config.matcher[0]).toContain('_next/static');
  });
});
