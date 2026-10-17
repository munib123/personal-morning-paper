// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadEditionMemory, memoryKey, saveEditionMemory } from './edition-memory';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('edition memory', () => {
  it('keys each edition as subah_edition_{editionId}', () => {
    expect(memoryKey('ed1')).toBe('subah_edition_ed1');
  });

  it('round-trips save then load', () => {
    saveEditionMemory('ed1', { read: ['a', 'b'], skipped: ['c'] });
    expect(loadEditionMemory('ed1')).toEqual({ read: ['a', 'b'], skipped: ['c'] });
    expect(JSON.parse(localStorage.getItem('subah_edition_ed1') ?? 'null')).toEqual({ read: ['a', 'b'], skipped: ['c'] });
  });

  it('returns empty memory for a missing key', () => {
    expect(loadEditionMemory('nothing-here')).toEqual({ read: [], skipped: [] });
  });

  it('returns empty memory for garbage JSON or the wrong shape', () => {
    localStorage.setItem(memoryKey('ed1'), '{not json');
    expect(loadEditionMemory('ed1')).toEqual({ read: [], skipped: [] });
    localStorage.setItem(memoryKey('ed1'), JSON.stringify({ read: 3 }));
    expect(loadEditionMemory('ed1')).toEqual({ read: [], skipped: [] });
    localStorage.setItem(memoryKey('ed1'), JSON.stringify(['a']));
    expect(loadEditionMemory('ed1')).toEqual({ read: [], skipped: [] });
    localStorage.setItem(memoryKey('ed1'), 'null');
    expect(loadEditionMemory('ed1')).toEqual({ read: [], skipped: [] });
  });

  it('keeps only strings, deduped, in their first order', () => {
    localStorage.setItem(memoryKey('ed1'), JSON.stringify({ read: ['a', 1, 'a', null, 'b'], skipped: ['c', 'c', {}] }));
    expect(loadEditionMemory('ed1')).toEqual({ read: ['a', 'b'], skipped: ['c'] });
  });

  it('survives a throwing localStorage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(loadEditionMemory('ed1')).toEqual({ read: [], skipped: [] });
    expect(() => saveEditionMemory('ed1', { read: ['a'], skipped: [] })).not.toThrow();
  });

  it('keeps two editions apart', () => {
    saveEditionMemory('ed1', { read: ['a'], skipped: ['b'] });
    saveEditionMemory('ed2', { read: ['x'], skipped: [] });
    expect(loadEditionMemory('ed1')).toEqual({ read: ['a'], skipped: ['b'] });
    expect(loadEditionMemory('ed2')).toEqual({ read: ['x'], skipped: [] });
  });
});
