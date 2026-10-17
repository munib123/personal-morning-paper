// "Build my paper": make sure there is a session (a guest one if needed), then hand the onboarding
// answers to L3's POST /api/onboarding. Every failure says which stage broke, so the preview can show
// "Try again" while the draft stays in localStorage.
import { OnboardingInputSchema, OnboardingResponseSchema } from '@/contracts/api';
import type { OnboardingInput } from '@/contracts/profile';

export interface FinishDeps {
  hasSession: () => Promise<boolean>;
  signInAnonymously: () => Promise<void>;
  post: (input: OnboardingInput) => Promise<Response>;
}

export class FinishError extends Error {
  readonly stage: 'auth' | 'save';
  constructor(stage: 'auth' | 'save', message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'FinishError';
    this.stage = stage;
  }
}

export async function runFinish(input: OnboardingInput, deps: FinishDeps): Promise<{ editionDate: string }> {
  const valid = OnboardingInputSchema.safeParse(input);
  if (!valid.success) throw new FinishError('save', 'The onboarding answers do not match the contract');

  let signedIn = false;
  try {
    signedIn = await deps.hasSession();
  } catch {
    signedIn = false; // an unreadable session is replaced by a fresh guest one
  }
  if (!signedIn) {
    try {
      await deps.signInAnonymously();
    } catch (cause) {
      throw new FinishError('auth', 'Guest sign-in failed', { cause });
    }
  }

  let res: Response;
  try {
    res = await deps.post(valid.data);
  } catch (cause) {
    throw new FinishError('save', 'The paper could not be saved (network)', { cause });
  }
  if (!res.ok) throw new FinishError('save', `The paper could not be saved (${res.status})`);
  let body: unknown;
  try {
    body = await res.json();
  } catch (cause) {
    throw new FinishError('save', 'The paper could not be saved (bad response)', { cause });
  }
  const parsed = OnboardingResponseSchema.safeParse(body);
  if (!parsed.success) throw new FinishError('save', 'The paper could not be saved (unexpected response)');
  return parsed.data;
}

/** The dateline status while the first paper is being set: "Setting today's paper · 8 of 20 stories". */
export function buildStatus(k: number, n: number): string {
  const done = Math.max(0, Math.min(n, Math.round(k)));
  return `Setting today's paper · ${done} of ${n} stories`;
}
