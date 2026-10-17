import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FIXTURE_INTEREST_WEIGHTS } from '@/contracts/fixtures';
import type { InterestWeight } from '@/contracts/profile';
import { InterestEditor } from './InterestEditor';
import { applyEdit, effectCopy } from './interest-edit';

const cricket: InterestWeight = { slug: 'sports.cricket', name: 'Cricket', level: 2, theta: 0.5, alpha: 2, beta: 2, picked: true, muted: false, pinned: false };

describe('effectCopy', () => {
  it('says what tomorrow will change, in plain words', () => {
    expect(effectCopy('pin', 'Cricket')).toBe("Tomorrow's paper will always include Cricket.");
    expect(effectCopy('unpin', 'Cricket')).toBe("Tomorrow's paper will no longer always include Cricket.");
    expect(effectCopy('mute', 'Celebrity')).toBe("Tomorrow's paper will leave out Celebrity.");
    expect(effectCopy('unmute', 'Celebrity')).toBe("Tomorrow's paper will bring back Celebrity.");
    expect(effectCopy('set', 'AI', 0.8, 0.5)).toBe("Tomorrow's paper will lean more on AI.");
    expect(effectCopy('set', 'AI', 0.3, 0.5)).toBe("Tomorrow's paper will lean less on AI.");
    expect(effectCopy('set', 'AI', 0.5, 0.5)).toBe("Tomorrow's paper will keep AI where it is.");
  });
});

describe('applyEdit (optimistic update)', () => {
  it('flips the flag or sets the weight on that slug only', () => {
    const other = { ...cricket, slug: 'sports', name: 'Sports', level: 1 as const };
    expect(applyEdit([cricket, other], 'sports.cricket', 'pin')[0].pinned).toBe(true);
    expect(applyEdit([{ ...cricket, pinned: true }], 'sports.cricket', 'unpin')[0].pinned).toBe(false);
    expect(applyEdit([cricket], 'sports.cricket', 'mute')[0].muted).toBe(true);
    expect(applyEdit([{ ...cricket, muted: true }], 'sports.cricket', 'unmute')[0].muted).toBe(false);
    expect(applyEdit([cricket, other], 'sports.cricket', 'set', 0.8).map((w) => w.theta)).toEqual([0.8, 0.5]);
  });
});

describe('InterestEditor', () => {
  it('renders the header, the Tell your editor entry, a slider per visible row and pressed-state buttons', () => {
    const html = renderToStaticMarkup(createElement(InterestEditor, { weights: FIXTURE_INTEREST_WEIGHTS }));
    expect(html).toContain('Your interests');
    expect(html).toContain('Tell your editor in your own words.'); // wave 2 mount in the slot L7 reserved
    const roots = FIXTURE_INTEREST_WEIGHTS.filter((w) => w.level === 1).length;
    expect(html.match(/type="range"/g)).toHaveLength(roots);
    expect(html).toContain('aria-pressed');
    expect(html).toContain('weight"');
  });
});
