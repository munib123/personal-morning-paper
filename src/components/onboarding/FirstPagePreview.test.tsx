import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FIXTURE_TASTE_CARDS } from '@/contracts/fixtures';
import { FirstPagePreview, type FirstPagePreviewProps } from './FirstPagePreview';

afterEach(() => { cleanup(); });

const base: FirstPagePreviewProps = {
  date: 'Saturday, 17 October 2026',
  name: 'Ayesha',
  city: 'Islamabad',
  cards: FIXTURE_TASTE_CARDS,
  status: 'idle',
  built: 0,
  onBuild: vi.fn(),
  onBack: vi.fn(),
};

describe('FirstPagePreview', () => {
  test('shows the masthead and up to 5 matched stories: one standard, then briefs', () => {
    render(<FirstPagePreview {...base} />);
    const masthead = screen.getByRole('banner');
    expect(within(masthead).getByRole('heading', { level: 1, name: 'The Morrow' })).toBeInTheDocument();
    expect(within(masthead).getByText('Prepared for Ayesha')).toBeInTheDocument();
    expect(within(masthead).getByText('Edition No. 1')).toBeInTheDocument();
    expect(within(masthead).getByText('Islamabad')).toBeInTheDocument();
    expect(within(masthead).getByText('20 stories')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'A preview of your first front page' })).toHaveAttribute('id', 'mw-ob-title');
    const matched = FIXTURE_TASTE_CARDS.filter((c) => !c.wildcard).slice(0, 5);
    const headlines = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headlines).toEqual(matched.map((c) => c.headline));
    expect(screen.getByText(matched[0].topicName)).toBeInTheDocument();
    for (const w of FIXTURE_TASTE_CARDS.filter((c) => c.wildcard)) expect(screen.queryByText(w.headline)).toBeNull();
  });

  test('without a name the ear is left out', () => {
    render(<FirstPagePreview {...base} name={null} />);
    expect(screen.queryByText(/Prepared for/)).toBeNull();
  });

  test('with no cards it says when stories are chosen', () => {
    render(<FirstPagePreview {...base} cards={[]} />);
    expect(screen.getByText('Your first stories are chosen when you build your paper.')).toBeInTheDocument();
    expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0);
  });

  test('build and back call their handlers', async () => {
    const onBuild = vi.fn();
    const onBack = vi.fn();
    render(<FirstPagePreview {...base} onBuild={onBuild} onBack={onBack} />);
    await userEvent.click(screen.getByRole('button', { name: 'Build my paper' }));
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBuild).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  test('while building: skeletons, a live status, and no second submit', () => {
    render(<FirstPagePreview {...base} status="building" built={8} />);
    expect(screen.getByRole('status')).toHaveTextContent("Setting today's paper · 8 of 20 stories");
    expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Build my paper' })).toBeDisabled();
  });

  test('an error says what to do and offers to try again', async () => {
    const onBuild = vi.fn();
    render(<FirstPagePreview {...base} status="error" onBuild={onBuild} />);
    expect(screen.getByRole('alert')).toHaveTextContent("Your paper couldn't be set. Check your connection and try again.");
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onBuild).toHaveBeenCalledTimes(1);
  });
});
