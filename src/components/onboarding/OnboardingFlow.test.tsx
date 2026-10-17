import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FIXTURE_TAXONOMY } from '@/contracts/fixtures';
import { DRAFT_KEY } from './lib/draft';
import { OnboardingFlow } from './OnboardingFlow';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/supabase/browser', () => ({ createSupabaseBrowserClient: vi.fn() }));

const DATE = 'Saturday, 17 October 2026';
const UNAVAILABLE = "The demo reader isn't available right now. You can build your own paper instead.";

beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); });
// jsdom + userEvent can be slow on a loaded machine (seven lanes share one); give each test room.
vi.setConfig({ testTimeout: 15_000 });

describe('OnboardingFlow', () => {
  test('opens on Welcome with the full masthead, and the first name goes in the ear', async () => {
    render(<OnboardingFlow taxonomy={FIXTURE_TAXONOMY} date={DATE} />);
    expect(screen.getByText('Step 1 of 4')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'The Morrow' })).toBeInTheDocument();
    expect(screen.getByText(DATE)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('First name'), '  ayesha');
    expect(screen.getByText('Prepared for Ayesha')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(DRAFT_KEY)!).name).toBe('  ayesha');
    expect(screen.queryByText(UNAVAILABLE)).toBeNull();
  });

  test('says when the demo reader could not be opened', () => {
    render(<OnboardingFlow taxonomy={FIXTURE_TAXONOMY} date={DATE} demoUnavailable />);
    expect(screen.getByText(UNAVAILABLE)).toBeInTheDocument();
  });

  test('resumes a saved draft at its step', () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      step: 2, name: 'Bilal', picks: [{ slug: 'sports.cricket', via: 'chip' }], blocked: [], words: '', avoidSources: '',
      presentation: { timeBudget: 15, depth: 'basics', lang: 'en' }, deliveryHour: 7, city: 'Lahore', skipped: { picks: false, words: false },
    }));
    render(<OnboardingFlow taxonomy={FIXTURE_TAXONOMY} date={DATE} />);
    expect(screen.getByText('Step 2 of 4')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cricket' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^Pick 2 more/ })).toBeDisabled();
  });
});
