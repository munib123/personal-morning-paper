import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import type { FrontPage } from '@/components/landing/headlines';

const frontPage = vi.hoisted(() => ({ current: null as FrontPage | null }));
vi.mock('@/components/landing/headlines', () => ({ loadFrontPage: vi.fn(async () => frontPage.current) }));

import LandingPage, { revalidate } from './page';

const LIVE: FrontPage = {
  origin: 'live',
  stories: [
    { id: 'a', headline: 'Central bank holds rates for a third month', sourceName: 'Dawn - Home', section: 'Pakistan Economy', url: 'https://example.com/a', ago: '2h ago', outlets: 9 },
    { id: 'b', headline: 'Pakistan name an uncapped leg-spinner', sourceName: 'Geo News - Sports', section: 'Cricket', url: 'https://example.com/b', ago: '3h ago', outlets: 4 },
    { id: 'c', headline: 'Small open models close the gap', sourceName: 'TechJuice', section: 'News', url: null, ago: '5h ago', outlets: 1 },
    { id: 'd', headline: 'Water vapour found around a rocky planet', sourceName: 'Space.com', section: 'Space', url: 'https://example.com/d', ago: '6h ago', outlets: 2 },
  ],
};

beforeEach(() => { frontPage.current = LIVE; });
afterEach(() => { cleanup(); });
// jsdom + userEvent can be slow on a loaded machine (seven lanes share one); give each test room.
vi.setConfig({ testTimeout: 15_000 });

describe('landing page', () => {
  test('opens on the masthead, the promise and one call to action', async () => {
    render(await LandingPage());
    expect(screen.getByRole('heading', { level: 1, name: 'The Morrow' })).toBeInTheDocument();
    expect(screen.getByText('Every morning')).toBeInTheDocument();
    expect(screen.getByText(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), \d{1,2} [A-Z][a-z]+ \d{4}$/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'One paper, every morning, about what you care about.' })).toBeInTheDocument();
    expect(screen.getByText('Takes about a minute. No account needed.')).toBeInTheDocument();
    const build = screen.getAllByRole('link', { name: 'Build my paper' });
    expect(build.length).toBeGreaterThan(0);
    for (const a of build) expect(a).toHaveAttribute('href', '/start');
    expect(screen.getByRole('link', { name: 'Read the demo paper' })).toHaveAttribute('href', '/demo');
  });

  test("previews today's front page with each story's section and source, linked to the original", async () => {
    render(await LandingPage());
    const preview = screen.getByRole('region', { name: "On today's front page" });
    expect(within(preview).getByRole('link', { name: 'Central bank holds rates for a third month' })).toHaveAttribute('href', 'https://example.com/a');
    expect(within(preview).getByText('Cricket')).toBeInTheDocument();
    expect(within(preview).getByText('Geo News - Sports')).toBeInTheDocument();
    expect(within(preview).getByText('Covered by 9 outlets')).toBeInTheDocument();
    // A story with no safe link still shows, as plain text.
    expect(within(preview).getByText('Small open models close the gap')).toBeInTheDocument();
    for (const a of within(preview).getAllByRole('link')) {
      expect(a).toHaveAttribute('target', '_blank');
      expect(a).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });

  test('still renders when no headlines could be loaded', async () => {
    frontPage.current = { origin: 'none', stories: [] };
    render(await LandingPage());
    expect(screen.getByText(/front page is being set/)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Build my paper' }).length).toBeGreaterThan(0);
  });

  test('explains how it works and what makes it different', async () => {
    render(await LandingPage());
    const how = screen.getByRole('region', { name: 'How it works' });
    expect(within(how).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Pick what you care about',
      'Get your Top 20 every morning',
      'It learns from what you read',
    ]);
    const diff = screen.getByRole('region', { name: 'What makes it different' });
    expect(within(diff).getAllByRole('heading', { level: 3 })).toHaveLength(4);
    expect(within(diff).getByText(/0\.52 nDCG@10 on day 7, against 0\.34/)).toBeInTheDocument();
    expect(within(diff).getByRole('img', { name: /Page 1 of a real edition/ })).toBeInTheDocument();
    const pdf = within(diff).getByRole('link', { name: 'Open today’s demo PDF' });
    expect(pdf).toHaveAttribute('href', '/demo/persona-today.pdf');
    expect(pdf).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test('ends with a slim footer: the repository and its architecture', async () => {
    render(await LandingPage());
    const footer = screen.getByRole('contentinfo');
    expect(within(footer).getByText(/NaSCon’26 AI Hackathon/)).toBeInTheDocument();
    expect(within(footer).getByRole('link', { name: 'GitHub' })).toHaveAttribute('href', 'https://github.com/munib123/personal-morning-paper');
    expect(within(footer).getByRole('link', { name: 'Architecture' })).toHaveAttribute('href', 'https://github.com/munib123/personal-morning-paper#architecture');
  });

  test('regenerates every 10 minutes so the date and headlines stay current', () => {
    expect(revalidate).toBe(600);
  });
});
