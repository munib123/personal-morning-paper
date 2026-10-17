import { describe, expect, test, vi, type Mock } from 'vitest';
import { OnboardingInputSchema } from '@/contracts/api';
import type { OnboardingInput } from '@/contracts/profile';
import { DEFAULT_DRAFT, buildOnboardingInput } from './draft';
import { FinishError, buildStatus, runFinish, type FinishDeps } from './finish';

const input: OnboardingInput = buildOnboardingInput({ ...DEFAULT_DRAFT, name: 'Ayesha', picks: [{ slug: 'sports.cricket', via: 'chip' }] }, 'Asia/Karachi');
const ok = () => Promise.resolve(Response.json({ editionDate: '2026-10-17' }));

function deps(over: Partial<FinishDeps> = {}) {
  const d = {
    hasSession: vi.fn(async () => false),
    signInAnonymously: vi.fn(async () => {}),
    post: vi.fn(ok),
    ...over,
  };
  return d as unknown as FinishDeps & { hasSession: Mock; signInAnonymously: Mock; post: Mock };
}

async function failure(p: Promise<unknown>): Promise<FinishError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(FinishError);
    return e as FinishError;
  }
  throw new Error('expected runFinish to reject');
}

describe('runFinish', () => {
  test('signs a guest in once, then posts the validated input with no taste', async () => {
    const d = deps();
    await expect(runFinish(input, d)).resolves.toEqual({ editionDate: '2026-10-17' });
    expect(d.signInAnonymously).toHaveBeenCalledTimes(1);
    expect(d.post).toHaveBeenCalledTimes(1);
    const sent = d.post.mock.calls[0][0];
    expect(sent).toEqual(OnboardingInputSchema.parse(input));
    expect(sent.taste).toEqual([]);
    expect(d.signInAnonymously.mock.invocationCallOrder[0]).toBeLessThan(d.post.mock.invocationCallOrder[0]);
  });

  test('an existing session is reused', async () => {
    const d = deps({ hasSession: vi.fn(async () => true) });
    await runFinish(input, d);
    expect(d.signInAnonymously).not.toHaveBeenCalled();
    expect(d.post).toHaveBeenCalledTimes(1);
  });

  test('a session check that throws counts as no session', async () => {
    const d = deps({ hasSession: vi.fn(async () => { throw new Error('bad cookie'); }) });
    await runFinish(input, d);
    expect(d.signInAnonymously).toHaveBeenCalledTimes(1);
  });

  test('a failed sign-in stops before the save', async () => {
    const d = deps({ signInAnonymously: vi.fn(async () => { throw new Error('rate limited'); }) });
    const e = await failure(runFinish(input, d));
    expect(e.stage).toBe('auth');
    expect(d.post).not.toHaveBeenCalled();
  });

  test('a 500 is a save failure', async () => {
    const d = deps({ post: vi.fn(async () => new Response('x', { status: 500 })) });
    expect((await failure(runFinish(input, d))).stage).toBe('save');
  });

  test('a network error is a save failure', async () => {
    const d = deps({ post: vi.fn(async () => { throw new TypeError('Failed to fetch'); }) });
    expect((await failure(runFinish(input, d))).stage).toBe('save');
  });

  test('a 200 with the wrong body is a save failure', async () => {
    for (const body of ['not json', JSON.stringify({ editionDate: 'tomorrow' }), JSON.stringify({})]) {
      const d = deps({ post: vi.fn(async () => new Response(body, { status: 200 })) });
      expect((await failure(runFinish(input, d))).stage).toBe('save');
    }
  });

  test('an input that fails the contract never leaves the browser', async () => {
    const d = deps();
    const bad = { ...input, presentation: { ...input.presentation, timeBudget: 10 } } as unknown as OnboardingInput;
    expect((await failure(runFinish(bad, d))).stage).toBe('save');
    expect(d.signInAnonymously).not.toHaveBeenCalled();
    expect(d.post).not.toHaveBeenCalled();
  });
});

describe('buildStatus', () => {
  test('dateline copy', () => {
    expect(buildStatus(8, 20)).toBe("Setting today's paper · 8 of 20 stories");
    expect(buildStatus(1, 20)).toBe("Setting today's paper · 1 of 20 stories");
    expect(buildStatus(25, 20)).toBe("Setting today's paper · 20 of 20 stories");
    expect(buildStatus(-3, 20)).toBe("Setting today's paper · 0 of 20 stories");
  });
});
