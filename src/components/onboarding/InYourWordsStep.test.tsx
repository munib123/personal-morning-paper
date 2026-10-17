import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FIXTURE_TAXONOMY } from '@/contracts/fixtures';
import type { InterestPickerValue } from './lib/picker-state';
import { InYourWordsStep, type InYourWordsPatch } from './InYourWordsStep';

const ADDED = "Added to your paper. Remove anything that's wrong.";
const FAILED = "That didn't go through. Your picks are saved; try again or continue.";

function Harness({ spy, initial = { picks: [{ slug: 'sports.cricket', via: 'chip' }], blocked: [] } }: { spy: (p: InYourWordsPatch) => void; initial?: InterestPickerValue }) {
  const [state, setState] = useState({ words: '', avoidSources: '', ...initial });
  return (
    <InYourWordsStep
      words={state.words}
      avoidSources={state.avoidSources}
      value={{ picks: state.picks, blocked: state.blocked }}
      taxonomy={FIXTURE_TAXONOMY}
      onChange={(patch) => { spy(patch); setState((s) => ({ ...s, ...patch })); }}
    />
  );
}

const fetchMock = vi.fn();
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('InYourWordsStep', () => {
  test('the button waits for some words', async () => {
    render(<Harness spy={vi.fn()} />);
    const add = screen.getByRole('button', { name: 'Add to my topics' });
    expect(add).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Anything else you want in your paper?'), 'more cricket');
    expect(add).toBeEnabled();
    expect(screen.getByPlaceholderText('More climate tech and Pakistani startups, less celebrity news')).toBeInTheDocument();
  });

  test('adds described topics as removable chips, blocks the rest, and never double-submits', async () => {
    let answer: (r: Response) => void = () => {};
    fetchMock.mockReturnValue(new Promise<Response>((r) => { answer = r; }));
    const spy = vi.fn();
    render(<Harness spy={spy} />);
    await userEvent.type(screen.getByLabelText('Anything else you want in your paper?'), 'more climate tech, less celebrity gossip');
    const add = screen.getByRole('button', { name: 'Add to my topics' });
    await userEvent.click(add);
    expect(add).toBeDisabled();
    await userEvent.click(add);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/onboarding/describe');
    expect(JSON.parse(init.body)).toEqual({ text: 'more climate tech, less celebrity gossip' });
    answer(Response.json({ picks: ['science.climate-environment', 'sports.cricket'], blocked: ['entertainment.pakistani-showbiz'], provider: 'keyword' }));
    await screen.findByText(ADDED);
    expect(spy).toHaveBeenLastCalledWith({
      picks: [{ slug: 'sports.cricket', via: 'chip' }, { slug: 'science.climate-environment', via: 'describe' }],
      blocked: ['entertainment.pakistani-showbiz'],
    });
    expect(screen.getByText(ADDED).closest('[aria-live]')).not.toBeNull();
    const climate = screen.getByRole('button', { name: 'Climate & Environment' });
    expect(climate).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Less of')).toBeInTheDocument();
    const showbiz = screen.getByRole('button', { name: 'Pakistani Showbiz' });
    await userEvent.click(climate);
    expect(spy).toHaveBeenLastCalledWith({ picks: [{ slug: 'sports.cricket', via: 'chip' }], blocked: ['entertainment.pakistani-showbiz'] });
    await userEvent.click(showbiz);
    expect(spy).toHaveBeenLastCalledWith({ picks: [{ slug: 'sports.cricket', via: 'chip' }], blocked: [] });
  });

  test('a failed request keeps the picks and says what to do', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 500 }));
    const spy = vi.fn();
    render(<Harness spy={spy} />);
    await userEvent.type(screen.getByLabelText('Anything else you want in your paper?'), 'cricket');
    await userEvent.click(screen.getByRole('button', { name: 'Add to my topics' }));
    await screen.findByText(FAILED);
    expect(spy.mock.calls.every(([p]) => !('picks' in p))).toBe(true);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add to my topics' })).toBeEnabled());
  });

  test('says so when nothing matched', async () => {
    fetchMock.mockResolvedValue(Response.json({ picks: [], blocked: [], provider: 'keyword' }));
    render(<Harness spy={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Anything else you want in your paper?'), 'hello there');
    await userEvent.click(screen.getByRole('button', { name: 'Add to my topics' }));
    await screen.findByText('No topics matched that. Try other words, or continue.');
  });

  test('sources to avoid stay in the draft', async () => {
    const spy = vi.fn();
    render(<Harness spy={spy} />);
    await userEvent.type(screen.getByLabelText('Sources to avoid'), 'X');
    expect(spy).toHaveBeenLastCalledWith({ avoidSources: 'X' });
  });
});
