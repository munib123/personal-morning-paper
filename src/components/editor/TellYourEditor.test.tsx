import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EditorChange } from '@/server/editor/propose';
import { TellYourEditor, TellYourEditorEntry } from './TellYourEditor';

const CHANGES: EditorChange[] = [
  { slug: 'sports.cricket', name: 'Cricket', before: 0.6, after: 0.75, action: 'raise', reason: 'You said "more on cricket".' },
  { slug: 'entertainment', name: 'Entertainment', before: 0.4, after: 0.25, action: 'lower', reason: 'You said "less showbiz".' },
  { slug: 'science.space', name: 'Space & Astronomy', before: 0.25, after: 0.5, action: 'add', reason: 'You said "curious about astronomy", so it joins your paper.' },
];
const EDITION = { date: '2026-10-17', number: 9, leadHeadline: 'Pakistan level the series in Rawalpindi', changed: 3 };
const TEXT = "more on cricket, less showbiz, and I'm curious about astronomy";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** fetch answering tell and apply in turn; `applyGate` lets a test hold the rebuild in flight. */
function stubFetch(opts: { tell?: () => Response | Promise<Response>; apply?: () => Response | Promise<Response> } = {}) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/editor/tell') return opts.tell ? opts.tell() : json({ changes: CHANGES, unmatched: [], provider: 'gemini' });
    if (url === '/api/editor/apply') return opts.apply ? opts.apply() : json({ edition: EDITION });
    return json({ error: 'unexpected' }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const bodyOf = (fetchMock: ReturnType<typeof stubFetch>, i: number) => JSON.parse(String((fetchMock.mock.calls[i] as unknown as [string, RequestInit])[1].body));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('TellYourEditor', () => {
  it('shows the kicker, a labelled text box with the listening placeholder, and a disabled button until there is text', async () => {
    stubFetch();
    render(<TellYourEditor />);
    expect(screen.getByRole('heading', { name: 'Tell your editor' })).toBeInTheDocument();
    const box = screen.getByRole('textbox', { name: 'What should change in your paper?' });
    expect(box).toHaveAttribute('placeholder', 'More of, less of, or something new. Your editor is listening.');
    expect(screen.getByRole('button', { name: 'Propose changes' })).toBeDisabled();
    await userEvent.type(box, 'more cricket');
    expect(screen.getByRole('button', { name: 'Propose changes' })).toBeEnabled();
  });

  it('proposes, lists each change with its reason and numbers, then applies and links to today', async () => {
    let release: (r: Response) => void = () => undefined;
    const fetchMock = stubFetch({ apply: () => new Promise<Response>((r) => (release = r)) });
    const onApplied = vi.fn();
    render(<TellYourEditor onApplied={onApplied} />);
    await userEvent.type(screen.getByRole('textbox'), TEXT);
    await userEvent.click(screen.getByRole('button', { name: 'Propose changes' }));

    expect(await screen.findByRole('heading', { name: 'Your editor proposes' })).toHaveFocus();
    expect(bodyOf(fetchMock, 0)).toEqual({ text: TEXT });
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText('Cricket')).toBeInTheDocument();
    expect(rows[0]).toHaveTextContent('60 → to 75');
    expect(within(rows[0]).getByText('You said "more on cricket".')).toHaveClass('text-ink-soft');
    expect(rows[1]).toHaveTextContent('Less');
    expect(rows[2]).toHaveTextContent('New in your paper');
    expect(screen.getByRole('status')).toHaveTextContent('3 changes proposed. Nothing changes until you confirm.');

    await userEvent.click(screen.getByRole('button', { name: 'Make these changes' }));
    expect(screen.getByRole('status')).toHaveTextContent("Rebuilding today's paper…");
    expect(bodyOf(fetchMock, 1)).toEqual({ changes: CHANGES });
    release(json({ edition: EDITION }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(`Done. Today's paper now leads with "${EDITION.leadHeadline}".`));
    expect(screen.getByRole('link', { name: "Read today's paper" })).toHaveAttribute('href', '/today');
    expect(onApplied).toHaveBeenCalledWith(EDITION);
  });

  it('works from the keyboard alone: Tab to the box, type, Tab to the button, Enter', async () => {
    const fetchMock = stubFetch();
    render(<TellYourEditor />);
    const user = userEvent.setup();
    await user.tab();
    expect(screen.getByRole('textbox')).toHaveFocus();
    await user.keyboard('more cricket');
    await user.tab();
    expect(screen.getByRole('button', { name: 'Propose changes' })).toHaveFocus();
    await user.keyboard('{Enter}');
    await screen.findByRole('heading', { name: 'Your editor proposes' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await user.tab();
    expect(screen.getByRole('button', { name: 'Make these changes' })).toHaveFocus();
  });

  it('Ctrl+Enter in the text box proposes too', async () => {
    const fetchMock = stubFetch();
    render(<TellYourEditor />);
    await userEvent.type(screen.getByRole('textbox'), 'more cricket{Control>}{Enter}{/Control}');
    await screen.findByRole('heading', { name: 'Your editor proposes' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a failed proposal is one calm line and the words stay', async () => {
    stubFetch({ tell: () => json({ error: 'unavailable' }, 503) });
    render(<TellYourEditor />);
    await userEvent.type(screen.getByRole('textbox'), 'more cricket');
    await userEvent.click(screen.getByRole('button', { name: 'Propose changes' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent("Your editor couldn't read that just now."));
    expect(screen.getByRole('textbox')).toHaveValue('more cricket');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('a failed rebuild keeps the proposal so the reader can try again', async () => {
    stubFetch({ apply: () => json({ error: 'unavailable' }, 503) });
    render(<TellYourEditor />);
    await userEvent.type(screen.getByRole('textbox'), TEXT);
    await userEvent.click(screen.getByRole('button', { name: 'Propose changes' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Make these changes' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent("Couldn't rebuild your paper just now."));
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Make these changes' })).toBeEnabled();
  });

  it('"Not now" drops the proposal, keeps the words, and returns focus to the text box', async () => {
    stubFetch();
    render(<TellYourEditor />);
    await userEvent.type(screen.getByRole('textbox'), TEXT);
    await userEvent.click(screen.getByRole('button', { name: 'Propose changes' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Not now' }));
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue(TEXT);
    expect(screen.getByRole('textbox')).toHaveFocus();
  });

  it('nothing matched: says so, quotes the words it could not place, and offers no apply button', async () => {
    stubFetch({ tell: () => json({ changes: [], unmatched: ['quilting'], provider: 'keyword' }) });
    render(<TellYourEditor />);
    await userEvent.type(screen.getByRole('textbox'), "I'm curious about quilting");
    await userEvent.click(screen.getByRole('button', { name: 'Propose changes' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Nothing to change yet.'));
    expect(screen.getByText(/couldn't place "quilting" yet/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Make these changes' })).not.toBeInTheDocument();
  });

  it('over 500 characters: a field error and no request', async () => {
    const fetchMock = stubFetch();
    render(<TellYourEditor />);
    const box = screen.getByRole('textbox');
    await userEvent.click(box);
    await userEvent.paste('a'.repeat(501));
    expect(screen.getByText(/Keep it under 500 characters/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Propose changes' })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('TellYourEditorEntry', () => {
  it('is one line and a button; the button opens the card with the text box focused, Close folds it back', async () => {
    stubFetch();
    render(<TellYourEditorEntry />);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tell your editor' }));
    expect(screen.getByRole('textbox', { name: 'What should change in your paper?' })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tell your editor' })).toHaveFocus();
  });
});
