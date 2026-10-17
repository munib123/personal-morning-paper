import { describe, expect, it } from 'vitest';
import { keyToAction } from './bytes-keys';

const key = (k: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}, target: { tagName?: string; isContentEditable?: boolean } | null = { tagName: 'BODY' }) => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...mods,
  target,
});

describe('keyToAction', () => {
  it('maps the reader keys', () => {
    expect(keyToAction(key('j'))).toBe('next');
    expect(keyToAction(key('k'))).toBe('prev');
    expect(keyToAction(key('x'))).toBe('skip');
    expect(keyToAction(key('o'))).toBe('open');
    expect(keyToAction(key('s'))).toBe('save');
    expect(keyToAction(key('b'))).toBe('toggle');
    expect(keyToAction(key('J'))).toBe('next');
  });

  it('keyToAction ignores shortcuts with modifiers', () => {
    expect(keyToAction(key('s', { ctrlKey: true }))).toBeNull();
    expect(keyToAction(key('k', { metaKey: true }))).toBeNull();
    expect(keyToAction(key('j', { altKey: true }))).toBeNull();
  });

  it('keyToAction ignores keys typed into fields', () => {
    for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) expect(keyToAction(key('j', {}, { tagName }))).toBeNull();
    expect(keyToAction(key('x', {}, { tagName: 'DIV', isContentEditable: true }))).toBeNull();
  });

  it('ignores other keys and a missing target is fine', () => {
    expect(keyToAction(key('q'))).toBeNull();
    expect(keyToAction(key('Enter'))).toBeNull();
    expect(keyToAction(key('j', {}, null))).toBe('next');
  });
});
