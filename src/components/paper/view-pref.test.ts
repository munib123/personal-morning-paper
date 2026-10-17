// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { VIEW_COOKIE, isEditionDate, persistView, resolveView } from './view-pref';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID_PHONE =
  'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';
const ANDROID_TABLET = 'Mozilla/5.0 (Linux; Android 15; SM-X910) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

afterEach(() => {
  document.cookie = `${VIEW_COOKIE}=; max-age=0; path=/`;
});

describe('resolveView', () => {
  it('a valid cookie wins', () => {
    expect(resolveView('front', IPHONE, '?1')).toBe('front');
    expect(resolveView('bytes', DESKTOP, '?0')).toBe('bytes');
  });
  it('ignores a garbage cookie', () => {
    expect(resolveView('garbage', DESKTOP, null)).toBe('front');
    expect(resolveView('garbage', IPHONE, null)).toBe('bytes');
  });
  it('reads the mobile client hint, then the user agent', () => {
    expect(resolveView(undefined, null, '?1')).toBe('bytes');
    expect(resolveView(undefined, IPHONE, '?0')).toBe('front');
    expect(resolveView(undefined, ANDROID_PHONE, null)).toBe('bytes');
    expect(resolveView(undefined, IPHONE, null)).toBe('bytes');
    expect(resolveView(undefined, ANDROID_TABLET, null)).toBe('front');
    expect(resolveView(undefined, DESKTOP, null)).toBe('front');
    expect(resolveView(undefined, null, null)).toBe('front');
  });
});

describe('isEditionDate', () => {
  it('accepts real calendar dates only', () => {
    expect(isEditionDate('2026-10-17')).toBe(true);
    expect(isEditionDate('2024-02-29')).toBe(true);
    expect(isEditionDate('2026-13-99')).toBe(false);
    expect(isEditionDate('2026-02-30')).toBe(false);
    expect(isEditionDate('2025-02-29')).toBe(false);
    expect(isEditionDate('abc')).toBe(false);
    expect(isEditionDate('2026-1-7')).toBe(false);
    expect(isEditionDate('')).toBe(false);
  });
});

describe('persistView', () => {
  it('remembers the view for a year', () => {
    expect(VIEW_COOKIE).toBe('subah_view');
    persistView('bytes');
    expect(document.cookie).toContain('subah_view=bytes');
    persistView('front');
    expect(document.cookie).toContain('subah_view=front');
  });
});
